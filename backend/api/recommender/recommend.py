from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import random
import time

from django.core.cache import cache
from django.db.models import Avg, Count

from api.models import (
    Movie,
    Rating,
    UserMoviePreference,
    UserPreference,
    UserProfile,
    WatchHistory,
    Watchlist,
)
from api.tmdb import discover_movies, get_recommendations, get_similar_movies

from .model_loader import (
    map_movie_ids_to_tmdb_ids,
    map_movie_id_to_tmdb_id,
    map_tmdb_id_to_movie_id,
    recommend_for_user_tmdb,
    recommend_similar_tmdb,
    similar_movie_scores,
)

GENRE_TO_TMDB_ID = {
    "action": 28,
    "adventure": 12,
    "animation": 16,
    "comedy": 35,
    "crime": 80,
    "documentary": 99,
    "drama": 18,
    "family": 10751,
    "fantasy": 14,
    "history": 36,
    "horror": 27,
    "music": 10402,
    "mystery": 9648,
    "romance": 10749,
    "sci-fi": 878,
    "science fiction": 878,
    "thriller": 53,
    "war": 10752,
    "western": 37,
}

TMDB_ID_TO_GENRE = {v: k for k, v in GENRE_TO_TMDB_ID.items()}

RECOMMEND_WEIGHTS = {
    "liked": 2.5,
    "high_rated": 5.0,    # 5-star is the dominant signal
    "watchlist": 1.5,     # watchlist = interested but not yet watched
    "genre_bonus": 1.2,
}

SURPRISE_WEIGHTS = {
    "high_rated": 3.0,
    "watchlist": 2.0,
    "genre_bonus": 1.0,
    "recency_boost": 0.4,
    "popularity_boost": 0.3,
}
SURPRISE_MAX_POOL = 50
SURPRISE_CF_LIMIT = 10
SURPRISE_MIN_YEAR = 2010
SURPRISE_MIN_VOTE_COUNT = 200
SURPRISE_MIN_POPULARITY = 25
SURPRISE_MIN_VOTE_AVERAGE = 6.5
SURPRISE_PER_SEED_LIMIT = 25

HIGH_RATING_THRESHOLD = 8
LIKED_RATING_THRESHOLD = 4
RECENT_VIEWS_LIMIT = 10
RECOMMENDED_FOR_YOU_LIMIT = 6

RATING_SIGNAL_WEIGHTS = {
    5: 5.0,    # loved — maximum signal
    4: 3.0,    # liked — strong positive
    3: 0.3,    # meh — near neutral
    2: -1.0,   # disliked — moderate negative
    1: -3.0,   # hated — strong negative, suppresses similar movies
}
WATCHLIST_SIGNAL_WEIGHT = 1.5       # raised: watchlist = intentional interest
LANGUAGE_UNKNOWN_MULTIPLIER = 0.15  # raised from 0.05 — less extreme penalty
ONBOARDING_GENRE_WEIGHT = 2.0
ONBOARDING_VIBE_WEIGHT = 1.5
LOCAL_CANDIDATE_LIMIT = 100
DISCOVER_BACKFILL_LIMIT = 40
GLOBAL_POPULAR_MIN_RATING = 3.5
GLOBAL_POPULAR_MIN_COUNT = 3

ONBOARDING_VIBE_TO_GENRES = {
    "feel-good": {"comedy", "romance", "family"},
    "mind-bending": {"sci-fi", "science fiction", "mystery", "thriller"},
    "edge-of-seat": {"action", "thriller", "adventure"},
    "emotional": {"drama", "romance"},
    "escapist": {"fantasy", "adventure", "animation"},
    "dark-gritty": {"crime", "horror", "drama"},
}

FREQUENCY_SYNONYMS = {
    "casual viewer": "casual",
    "casual": "casual",
    "movie lover": "regular",
    "regular": "regular",
    "binge watcher": "binge",
    "binge": "binge",
    "cinephile": "cinephile",
}

VIBE_SYNONYMS = {
    "feel-good": "feel-good",
    "mind-bending": "mind-bending",
    "edge-of-seat": "edge-of-seat",
    "emotional": "emotional",
    "escapist": "escapist",
    "dark-gritty": "dark-gritty",
    "dark & gritty": "dark-gritty",
}


def _user_salt(user_id):
    """Deterministic per-user float in [0, 1) for breaking ties without randomness drift."""
    if user_id is None:
        return 0.0
    h = hashlib.sha256(f"cinematch-user-{user_id}".encode("utf-8")).hexdigest()
    return int(h[:8], 16) / float(0xFFFFFFFF)


def _user_rng(user_id, bucket=""):
    """Deterministic Random() seeded from (user_id, bucket). Same user always gets
    the same ordering; different users get different orderings even from the same pool."""
    seed = hashlib.sha256(f"cinematch-{user_id}-{bucket}".encode("utf-8")).digest()
    return random.Random(int.from_bytes(seed[:8], "big"))


def _deterministic_shuffle(user_id, bucket, items):
    """Return a new list shuffled deterministically per user."""
    if not items:
        return []
    items = list(items)
    _user_rng(user_id, bucket).shuffle(items)
    return items


def invalidate_user_recommendation_caches(user_id):
    """Mark a user's recommendation caches for refresh when their signals change.

    Strategy: clear the *fresh* cache so the next request falls through to
    compute, but KEEP the long-lived stale cache so the next hit returns
    instantly (stale) while the refresh runs in the background. Also schedules
    a background refresh immediately so the cache is warm by the time the user
    reloads the page.
    """
    if user_id is None:
        return
    keys = [f"interactions_{user_id}"]
    for n in (6, 10, 12, 20):
        # Clear fresh caches — recomputation will run on next request.
        keys.append(f"recommended_for_you:{user_id}:{n}")
        keys.append(f"recs_rfy_hydrated:{user_id}:{n}")
        keys.append(f"recs_batched_hydrated:{user_id}:{n}")
        keys.append(f"personalized_recommend:{user_id}:{n}:all")
        # Do NOT delete f"recommended_for_you_stale:{user_id}:{n}" — the stale
        # copy lets the next request return instantly while we rebuild.
    try:
        cache.delete_many(keys)
    except Exception:
        for k in keys:
            try:
                cache.delete(k)
            except Exception:
                pass

    # Kick off a background refresh of the most common n so the cache is warm
    # when the user reloads. This makes writes feel instant.
    try:
        _background_refresh_rfy(user_id, RECOMMENDED_FOR_YOU_LIMIT)
    except Exception:
        pass


def _prediction_signal(has_ratings, has_watchlist):
    if not has_ratings and not has_watchlist:
        return "cold_start"
    if has_ratings and has_watchlist:
        return "hybrid"
    if has_ratings:
        return "rating"
    return "watchlist"


def _normalize_frequency(value):
    if not value:
        return ""
    normalized = str(value).strip().lower().replace("_", "-")
    return FREQUENCY_SYNONYMS.get(normalized, normalized)


def _normalize_vibe(value):
    if not value:
        return ""
    normalized = str(value).strip().lower().replace("_", "-")
    return VIBE_SYNONYMS.get(normalized, normalized)


def _normalize_genre_token(value):
    if value in (None, ""):
        return ""
    normalized = str(value).strip().lower()
    if normalized.isdigit():
        normalized = TMDB_ID_TO_GENRE.get(int(normalized), normalized)
    if normalized == "science fiction":
        return "sci-fi"
    return normalized


def _user_onboarding_preferences(user_id):
    profile = UserProfile.objects.filter(user_id=user_id).first()
    legacy = UserPreference.objects.filter(user_id=user_id).first()

    preferred_genres = []
    if profile and profile.preferred_genres:
        raw_genres = profile.preferred_genres
        if isinstance(raw_genres, str):
            preferred_genres = [_normalize_genre_token(item) for item in raw_genres.split(",")]
        else:
            preferred_genres = [_normalize_genre_token(item) for item in raw_genres]
    elif legacy and legacy.preferred_genres:
        preferred_genres = [_normalize_genre_token(item) for item in legacy.preferred_genres.split(",")]

    deduped_genres = []
    seen = set()
    for genre in preferred_genres:
        if not genre or genre in seen:
            continue
        seen.add(genre)
        deduped_genres.append(genre)

    return {
        "watch_frequency": _normalize_frequency(getattr(profile, "watch_frequency", "")),
        "preferred_genres": deduped_genres,
        "preferred_vibe": _normalize_vibe(getattr(profile, "preferred_vibe", "")),
        "onboarding_completed": bool(getattr(profile, "onboarding_completed", False)),
    }


def _interaction_scores(user_id):
    cache_key = f"interactions_{user_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    scores = {}
    disliked = set()
    seen = set()

    prefs = (
        UserMoviePreference.objects.filter(user_id=user_id)
        .select_related("movie")
    )
    for pref in prefs:
        if not pref.movie or pref.movie.tmdb_id is None:
            continue
        tmdb_id = pref.movie.tmdb_id
        seen.add(tmdb_id)
        if pref.preference == "love":
            scores[tmdb_id] = max(scores.get(tmdb_id, 0), 5)
        elif pref.preference == "like":
            scores[tmdb_id] = max(scores.get(tmdb_id, 0), 4)
        elif pref.preference == "dislike":
            disliked.add(tmdb_id)

    ratings = (
        Rating.objects.filter(user_id=user_id)
        .select_related("movie")
    )
    for r in ratings:
        if not r.movie or r.movie.tmdb_id is None:
            continue
        tmdb_id = r.movie.tmdb_id
        seen.add(tmdb_id)
        rating_val = r.rating
        if rating_val > 5:
            rating_val = round(rating_val / 2)
        scores[tmdb_id] = max(scores.get(tmdb_id, 0), int(rating_val))

    watchlist = (
        Watchlist.objects.filter(user_id=user_id)
        .select_related("movie")
    )
    for w in watchlist:
        if not w.movie or w.movie.tmdb_id is None:
            continue
        tmdb_id = w.movie.tmdb_id
        seen.add(tmdb_id)
        scores[tmdb_id] = max(scores.get(tmdb_id, 0), 3)

    watched = (
        WatchHistory.objects.filter(user_id=user_id)
        .select_related("movie")
    )
    for w in watched:
        if not w.movie or w.movie.tmdb_id is None:
            continue
        tmdb_id = w.movie.tmdb_id
        seen.add(tmdb_id)
        scores[tmdb_id] = max(scores.get(tmdb_id, 0), 2)

    result = (scores, disliked, seen)
    cache.set(cache_key, result, timeout=120)
    return result


def _split_csv_field(value):
    if not value:
        return []
    return [v.strip().lower() for v in value.split(",") if v.strip()]


def _movie_genre_set(movie):
    return set(_split_csv_field(getattr(movie, "genres", "")))


def _movie_keyword_set(movie):
    return set(_split_csv_field(getattr(movie, "keywords", "")))


def _jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if inter == 0:
        return 0.0
    return inter / float(len(a | b))


def _content_similarity(seed_movie, candidate_movie):
    if not seed_movie or not candidate_movie:
        return 0.0
    seed_genres = _movie_genre_set(seed_movie)
    cand_genres = _movie_genre_set(candidate_movie)
    seed_keywords = _movie_keyword_set(seed_movie)
    cand_keywords = _movie_keyword_set(candidate_movie)
    genre_sim = _jaccard(seed_genres, cand_genres)
    keyword_sim = _jaccard(seed_keywords, cand_keywords)
    return (0.7 * genre_sim) + (0.3 * keyword_sim)


def _normalized_star_rating(value):
    rating_val = int(value or 0)
    if rating_val > 5:
        rating_val = round(rating_val / 2)
    return max(min(rating_val, 5), 1) if rating_val else 0


def _rating_weight_for_value(value):
    if hasattr(value, "preference"):
        return _rating_weight_for_value(getattr(value, "preference", None))
    if hasattr(value, "rating"):
        return _rating_weight_for_value(getattr(value, "rating", None))
    if isinstance(value, str):
        normalized = value.strip().lower()
        preference_weights = {
            "love": RATING_SIGNAL_WEIGHTS[5],
            "like": RATING_SIGNAL_WEIGHTS[4],
            "dislike": RATING_SIGNAL_WEIGHTS[1],
        }
        if normalized in preference_weights:
            return preference_weights[normalized]
    normalized = _normalized_star_rating(value)
    return RATING_SIGNAL_WEIGHTS.get(normalized, 0.0)


def _add_ranked_candidates(score_map, tmdb_ids, weight):
    total = max(len(tmdb_ids or []), 1)
    for idx, tmdb_id in enumerate(tmdb_ids or []):
        if not tmdb_id:
            continue
        score_map[tmdb_id] += weight * (1.0 - (idx / total))


def _local_candidate_movies(user_id, extra_exclude=None, limit=LOCAL_CANDIDATE_LIMIT):
    _, disliked, seen = _interaction_scores(user_id)
    exclude = set(seen) | set(disliked) | set(extra_exclude or [])
    qs = (
        Movie.objects.exclude(tmdb_id__isnull=True)
        .exclude(tmdb_id__in=exclude)
        .only("id", "tmdb_id", "title", "genres", "keywords", "original_language")
        .annotate(avg_rating=Avg("user_ratings__rating"), rating_count=Count("user_ratings"))
        .order_by("-rating_count", "-avg_rating", "title")
    )
    return list(qs[:limit])


def _language_weight_map(rating_rows, watchlist_rows):
    language_scores = defaultdict(float)
    for row in rating_rows:
        movie = getattr(row, "movie", None)
        lang = (getattr(movie, "original_language", "") or "").strip().lower()
        if not lang:
            continue
        # Weight by how much the user liked the movie in that language
        # A 5-star Hindi film contributes 5x more than a 1-star Hindi film
        if hasattr(row, "preference"):
            pref = getattr(row, "preference", "like")
            if pref == "love":
                lang_weight = 1.0
            elif pref == "like":
                lang_weight = 0.8
            else:
                lang_weight = 0.1  # dislike — don't boost this language
        else:
            rating_val = _normalized_star_rating(getattr(row, "rating", 3))
            lang_weight = float(rating_val) / 5.0  # 0.2 to 1.0
        language_scores[lang] += lang_weight

    for row in watchlist_rows:
        movie = getattr(row, "movie", None)
        lang = (getattr(movie, "original_language", "") or "").strip().lower()
        if not lang:
            continue
        language_scores[lang] += 0.4  # watchlist = moderate language signal

    total = sum(language_scores.values()) or 0.0
    if not total:
        return {}
    return {lang: (score / total) for lang, score in language_scores.items() if score > 0}


def _language_multiplier(candidate_movie, language_weights):
    if not language_weights:
        return 1.0
    lang = (getattr(candidate_movie, "original_language", "") or "").strip().lower()
    if not lang:
        return 1.0
    if lang in language_weights:
        # Never fully zero out a known language — floor at 0.3
        return max(language_weights[lang], 0.3)
    # Unknown language: penalise but don't hide completely
    # Was: min(min values, 0.05) — way too harsh
    return LANGUAGE_UNKNOWN_MULTIPLIER  # now 0.15


def _rating_signal_score(candidate_movie, rating_rows):
    if not candidate_movie:
        return 0.0
    score = 0.0
    for row in rating_rows:
        seed_movie = getattr(row, "movie", None)
        if not seed_movie or seed_movie.tmdb_id == candidate_movie.tmdb_id:
            continue
        similarity = _content_similarity(seed_movie, candidate_movie)
        if similarity <= 0:
            continue
        score += similarity * _rating_weight_for_value(row)
    return score


def _watchlist_signal_score(candidate_movie, watchlist_rows):
    if not candidate_movie:
        return 0.0
    score = 0.0
    for row in watchlist_rows:
        seed_movie = getattr(row, "movie", None)
        if not seed_movie or seed_movie.tmdb_id == candidate_movie.tmdb_id:
            continue
        similarity = _content_similarity(seed_movie, candidate_movie)
        if similarity <= 0:
            continue
        score += similarity * WATCHLIST_SIGNAL_WEIGHT
    return score


def _onboarding_genre_set(preferences):
    return {_normalize_genre_token(value) for value in preferences.get("preferred_genres", []) if value}


def _onboarding_vibe_genres(preferences):
    vibe = preferences.get("preferred_vibe") or ""
    return ONBOARDING_VIBE_TO_GENRES.get(vibe, set())


def _onboarding_boost(candidate_movie, preferences):
    if not candidate_movie:
        return 1.0

    candidate_genres = {_normalize_genre_token(value) for value in _movie_genre_set(candidate_movie)}
    genre_boost = ONBOARDING_GENRE_WEIGHT if candidate_genres & _onboarding_genre_set(preferences) else 1.0
    vibe_boost = ONBOARDING_VIBE_WEIGHT if candidate_genres & _onboarding_vibe_genres(preferences) else 1.0

    frequency = preferences.get("watch_frequency") or ""
    popularity_hint = float(getattr(candidate_movie, "rating_count", 0) or 0)
    avg_rating = float(getattr(candidate_movie, "avg_rating", 0) or 0)

    frequency_boost = 1.0
    if frequency == "regular":
        frequency_boost += min(popularity_hint / 50.0, 0.2)
    elif frequency == "binge":
        frequency_boost += min(len(candidate_genres) * 0.08, 0.25)
    elif frequency == "cinephile":
        frequency_boost += min((avg_rating / 5.0) * 0.35, 0.35)

    return genre_boost * vibe_boost * frequency_boost


def _score_local_candidate_base(candidate_movie, seed_movies):
    if not candidate_movie or not seed_movies:
        return 0.0
    best = 0.0
    for seed_movie, seed_weight in seed_movies:
        if not seed_movie or seed_movie.tmdb_id == candidate_movie.tmdb_id:
            continue
        similarity = _content_similarity(seed_movie, candidate_movie)
        if similarity <= 0:
            continue
        best = max(best, similarity * max(seed_weight, 0.2))
    return best


def _globally_popular_local_movies(exclude_tmdb_ids=None, limit=LOCAL_CANDIDATE_LIMIT):
    exclude_tmdb_ids = set(exclude_tmdb_ids or [])
    qs = (
        Movie.objects.exclude(tmdb_id__isnull=True)
        .exclude(tmdb_id__in=exclude_tmdb_ids)
        .annotate(avg_rating=Avg("user_ratings__rating"), rating_count=Count("user_ratings"))
        .order_by("-avg_rating", "-rating_count", "title")
    )
    popular = []
    for movie in qs:
        avg_rating = float(movie.avg_rating or 0.0)
        rating_count = int(movie.rating_count or 0)
        if avg_rating >= GLOBAL_POPULAR_MIN_RATING and rating_count >= GLOBAL_POPULAR_MIN_COUNT:
            popular.append(movie)
        if len(popular) >= limit:
            break
    return popular


def _cold_start_onboarding_candidates(user_id, preferences, n):
    """Cold-start recommender driven purely by onboarding signals.

    Mixes the user's explicit genre picks with vibe-inferred genres, then pulls
    a large TMDB pool across several pages AND several sort orders so that two
    users who share onboarding prefs still get different orderings. A
    per-user deterministic shuffle breaks remaining ties — same user always
    gets the same list, different users get different lists.
    """
    _, disliked, seen = _interaction_scores(user_id)
    exclude = set(seen) | set(disliked)
    genre_preferences = _onboarding_genre_set(preferences)
    vibe_genres = _onboarding_vibe_genres(preferences)

    # Combine explicit genres with vibe-inferred genres so vibe actually steers picks.
    effective_genres = {g for g in (genre_preferences | vibe_genres) if g}
    effective_genre_ids = [GENRE_TO_TMDB_ID[g] for g in effective_genres if g in GENRE_TO_TMDB_ID]

    # --- 1) Local DB candidates matching onboarding genres ---
    local_movies = _local_candidate_movies(user_id, extra_exclude=exclude, limit=LOCAL_CANDIDATE_LIMIT)
    local_scored = []
    for movie in local_movies:
        movie_genres = {_normalize_genre_token(value) for value in _movie_genre_set(movie)}
        if effective_genres and not (movie_genres & effective_genres):
            continue
        popularity_score = float(getattr(movie, "avg_rating", 0.0) or 0.0) + min(
            float(getattr(movie, "rating_count", 0) or 0) / 10.0,
            2.5,
        )
        explicit_bonus = 1.25 if (movie_genres & genre_preferences) else 1.0
        movie_score = popularity_score * _onboarding_boost(movie, preferences) * explicit_bonus
        local_scored.append((movie.tmdb_id, movie_score))
    local_scored.sort(key=lambda item: item[1], reverse=True)

    # --- 2) Remote TMDB candidates (cached, parallel, timeout-budgeted) ---
    # If local already has plenty, skip the remote call entirely — the per-user
    # shuffle on the tail still gives variety between users.
    have_enough_local = len(local_scored) >= max(n * 3, n + 6)
    remote_pool = []

    def _discover_cached(with_genres, sort_by, page, vote_count_gte="200"):
        # Cache discover results for 10 min — identical TMDB query → identical response.
        # Two users with the same genres hit this cache instead of re-calling TMDB.
        key = f"discover:{with_genres}:{sort_by}:{page}:{vote_count_gte}"
        cached = cache.get(key)
        if cached is not None:
            return cached
        try:
            data = discover_movies(
                with_genres=with_genres,
                sort_by=sort_by,
                vote_count_gte=vote_count_gte,
                page=page,
                timeout=2,
            )
        except Exception:
            return []
        ids = [m.get("id") for m in (data.get("results") or []) if m.get("id")]
        cache.set(key, ids, timeout=600)
        return ids

    if effective_genre_ids and not have_enough_local:
        rng = _user_rng(user_id, "coldstart-pages")
        # Only 2 pages now (was 3) to cut TMDB round-trips in half.
        page_pool = [1, 2, 3, 4, 5]
        rng.shuffle(page_pool)
        pages = page_pool[:2]

        joined = ",".join(str(g) for g in effective_genre_ids)
        sort_orders = ["vote_average.desc", "popularity.desc", "vote_count.desc"]
        sort_order = sort_orders[int(_user_salt(user_id) * len(sort_orders)) % len(sort_orders)]

        # Cap at 2 remote jobs total. Local DB already provides diversity; remote
        # just needs one slice of the genre catalogue per user.
        fetch_jobs = [(joined, sort_order, pages[0], "500"), (joined, sort_order, pages[1], "500")]

        with ThreadPoolExecutor(max_workers=len(fetch_jobs)) as ex:
            futs = [ex.submit(_discover_cached, *job) for job in fetch_jobs]
            for fut in as_completed(futs, timeout=2.5):
                try:
                    remote_pool.extend(fut.result() or [])
                except Exception:
                    pass

    # --- 3) Merge local + remote pools, excluding already-seen/disliked ---
    # Local scored IDs first (ranked), then remote pool shuffled per-user so every user
    # sees a different slice as the primary candidates.
    remote_unique = []
    remote_seen = set()
    for tmdb_id in remote_pool:
        if not tmdb_id or tmdb_id in remote_seen or tmdb_id in exclude:
            continue
        remote_seen.add(tmdb_id)
        remote_unique.append(tmdb_id)
    remote_unique = _deterministic_shuffle(user_id, "coldstart-remote", remote_unique)

    picked = []
    picked_seen = set()

    def _add(tmdb_id):
        if not tmdb_id or tmdb_id in picked_seen or tmdb_id in exclude:
            return False
        picked.append(tmdb_id)
        picked_seen.add(tmdb_id)
        return True

    # Interleave local top picks and per-user-shuffled remote picks so the result is
    # neither "top global" nor "random" — it's ranked locally but diversified remotely.
    target = max(n * 3, n + 6)
    local_iter = iter(local_scored)
    remote_iter = iter(remote_unique)
    while len(picked) < target:
        progressed = False
        try:
            nxt = next(local_iter)
            if _add(nxt[0]):
                progressed = True
        except StopIteration:
            pass
        if len(picked) >= target:
            break
        for _ in range(2):  # 2 remote picks per 1 local so cold-start leans discovery-heavy
            try:
                rid = next(remote_iter)
                if _add(rid):
                    progressed = True
                    break
            except StopIteration:
                break
        if not progressed:
            break

    # --- 4) Final per-user shuffle among the top chunk for extra variety ---
    # Keep the strongest local matches near the top; shuffle the discovery tail.
    head = picked[: max(3, n // 2)]
    tail = _deterministic_shuffle(user_id, "coldstart-tail", picked[max(3, n // 2):])
    picked = head + tail

    # --- 5) Backfills if still short ---
    if len(picked) < n:
        for movie in _globally_popular_local_movies(
            exclude_tmdb_ids=exclude | picked_seen, limit=n * 4
        ):
            if _add(movie.tmdb_id) and len(picked) >= n:
                break

    if len(picked) < n:
        rng = _user_rng(user_id, "coldstart-fallback")
        fallback_page = rng.choice([1, 2, 3])
        fallback_sort = rng.choice(["popularity.desc", "vote_count.desc"])
        for tmdb_id in _discover_cached("", fallback_sort, fallback_page, vote_count_gte="500"):
            if _add(tmdb_id) and len(picked) >= n:
                break

    return picked[:n]


def _build_genre_profile_from_movies(movies_with_weights):
    counter = Counter()
    for movie, weight in movies_with_weights:
        if not movie or weight <= 0:
            continue
        for g in _movie_genre_set(movie):
            if g in GENRE_TO_TMDB_ID:
                counter[GENRE_TO_TMDB_ID[g]] += weight
    return counter


def _build_keyword_profile_from_movies(movies_with_weights):
    counter = Counter()
    for movie, weight in movies_with_weights:
        if not movie or weight <= 0:
            continue
        for kw in _movie_keyword_set(movie):
            counter[kw] += weight
    return counter


def _profile_from_user(user_id):
    ratings = (
        Rating.objects.filter(user_id=user_id)
        .select_related("movie")
        .order_by("-created_at")
    )
    watchlist = (
        Watchlist.objects.filter(user_id=user_id)
        .select_related("movie")
        .order_by("-added_at")
    )
    recent_views = (
        WatchHistory.objects.filter(user_id=user_id)
        .select_related("movie")
        .order_by("-viewed_at")[:RECENT_VIEWS_LIMIT]
    )

    rating_movies = []
    liked_movies = []
    high_rated_movies = []
    for row in ratings:
        if not row.movie:
            continue
        rating_val = _normalized_star_rating(row.rating)
        weight = max(min(rating_val, 5), 0) / 5.0
        rating_movies.append((row.movie, weight))
        if rating_val >= 4:
            liked_movies.append((row.movie, max(weight, 0.4)))
        if rating_val >= 5:
            # Extra seed weight: 5-star movies generate better TMDB neighbor pools
            high_rated_movies.append((row.movie, max(weight * 1.5, 0.9)))

    watchlist_movies = [(row.movie, 1.0) for row in watchlist if row.movie]
    recent_movies = [(row.movie, 0.6) for row in recent_views if row.movie]

    prefs = (
        UserMoviePreference.objects.filter(user_id=user_id)
        .select_related("movie")
    )
    pref_movies = []
    for pref in prefs:
        if not pref.movie:
            continue
        weight = 1.6 if pref.preference == "love" else 1.2 if pref.preference == "like" else -1.0
        pref_movies.append((pref.movie, weight))
        if pref.preference in {"love", "like"}:
            liked_movies.append((pref.movie, weight))

    all_weighted = rating_movies + watchlist_movies + recent_movies + pref_movies
    genre_profile = _build_genre_profile_from_movies(all_weighted)
    keyword_profile = _build_keyword_profile_from_movies(all_weighted)

    preferences = _user_onboarding_preferences(user_id)
    for g in preferences["preferred_genres"]:
        if g in GENRE_TO_TMDB_ID:
            genre_profile[GENRE_TO_TMDB_ID[g]] += 1.0

    return {
        "ratings": ratings,
        "preference_rows": prefs,
        "watchlist": watchlist,
        "recent_views": recent_views,
        "liked_movies": liked_movies,
        "high_rated_movies": high_rated_movies,
        "watchlist_movies": watchlist_movies,
        "recent_movies": recent_movies,
        "genre_profile": genre_profile,
        "keyword_profile": keyword_profile,
    }


def _candidate_movie_scores(user_id, limit=200, min_pref_score=2):
    scores, disliked, seen = _interaction_scores(user_id)
    if not scores:
        return [], seen, disliked

    candidate_scores = defaultdict(float)
    for tmdb_id, pref_score in scores.items():
        if pref_score < min_pref_score:
            continue
        movie_id = map_tmdb_id_to_movie_id(tmdb_id)
        if movie_id is None:
            continue
        weight = pref_score / 5.0
        for sim_movie_id, sim_score in similar_movie_scores(movie_id, n=50):
            if sim_movie_id is None:
                continue
            candidate_scores[sim_movie_id] += float(sim_score) * weight

    if not candidate_scores:
        return [], seen, disliked

    ranked = sorted(candidate_scores.items(), key=lambda x: x[1], reverse=True)
    ranked = ranked[:limit]
    return ranked, seen, disliked


def _rank_tmdb_candidates_with_scores(user_id, limit=200):
    ranked, seen, disliked = _candidate_movie_scores(user_id, limit=limit, min_pref_score=2)
    tmdb_scores = defaultdict(float)

    if ranked:
        movie_ids = [movie_id for movie_id, _ in ranked]
        tmdb_ids = map_movie_ids_to_tmdb_ids(movie_ids)
        for tmdb_id, (_, score) in zip(tmdb_ids, ranked):
            if not tmdb_id:
                continue
            tmdb_scores[tmdb_id] += float(score)

    svd_ids = recommend_for_user_tmdb(user_id, n=max(limit, 1))
    if svd_ids:
        total = max(len(svd_ids), 1)
        for idx, tmdb_id in enumerate(svd_ids):
            if not tmdb_id:
                continue
            tmdb_scores[tmdb_id] += 0.4 * (1.0 - (idx / total))

    genre_ids = favorite_genres_profile(user_id, top_n=2)
    if genre_ids:
        for genre_id in genre_ids:
            try:
                data = discover_movies(with_genres=str(genre_id), timeout=3)
                results = data.get("results", []) or []
            except Exception:
                results = []
            total = max(len(results), 1)
            for idx, movie in enumerate(results[:25]):
                tmdb_id = movie.get("id")
                if not tmdb_id:
                    continue
                tmdb_scores[tmdb_id] += 0.2 * (1.0 - (idx / total))

    if not tmdb_scores:
        return [], seen, disliked

    ranked_tmdb = sorted(tmdb_scores.items(), key=lambda x: x[1], reverse=True)
    return ranked_tmdb[:limit], seen, disliked


def _rank_tmdb_candidates(user_id, limit=200):
    ranked_tmdb, seen, disliked = _rank_tmdb_candidates_with_scores(user_id, limit=limit)
    tmdb_ids = [tmdb_id for tmdb_id, _ in ranked_tmdb]
    return tmdb_ids[:limit], seen, disliked


def _dedupe_seed_movies(seed_movies):
    best_by_tmdb = {}
    movie_by_tmdb = {}
    for movie, weight in seed_movies or []:
        if not movie or movie.tmdb_id is None:
            continue
        tmdb_id = movie.tmdb_id
        if tmdb_id not in best_by_tmdb or weight > best_by_tmdb[tmdb_id]:
            best_by_tmdb[tmdb_id] = weight
            movie_by_tmdb[tmdb_id] = movie
    return [(movie_by_tmdb[tmdb_id], best_by_tmdb[tmdb_id]) for tmdb_id in movie_by_tmdb]


def _similarity_lookup_for_seeds(seed_movies, per_seed=25):
    lookup = defaultdict(dict)
    for movie, _weight in _dedupe_seed_movies(seed_movies):
        if not movie or movie.tmdb_id is None:
            continue
        cache_key = f"seed_similarity_lookup:{movie.tmdb_id}:{per_seed}"
        cached = cache.get(cache_key)
        if cached is None:
            movie_id = map_tmdb_id_to_movie_id(movie.tmdb_id)
            if movie_id is None:
                continue
            scored = similar_movie_scores(movie_id, n=per_seed)
            if not scored:
                continue
            max_score = max((s for _, s in scored), default=0.0) or 1.0
            cached = {}
            for sim_movie_id, score in scored:
                tmdb_id = map_movie_id_to_tmdb_id(sim_movie_id)
                if not tmdb_id:
                    continue
                cached[tmdb_id] = float(score) / max_score
            cache.set(cache_key, cached, timeout=300)
        lookup[movie.tmdb_id].update(cached)
    return lookup


def _score_candidate(candidate_tmdb_id, candidate_movie, seed_movies, sim_lookup):
    best_score = 0.0
    for seed_movie, seed_weight in seed_movies:
        if not seed_movie or seed_weight <= 0:
            continue
        sim = 0.0
        sim_map = sim_lookup.get(seed_movie.tmdb_id, {})
        if candidate_tmdb_id in sim_map:
            sim = max(sim, sim_map[candidate_tmdb_id])
        sim = max(sim, _content_similarity(seed_movie, candidate_movie))
        best_score = max(best_score, sim * seed_weight)
    return best_score


def _genre_bonus(candidate_genre_ids, genre_profile):
    if not candidate_genre_ids or not genre_profile:
        return 0.0
    total = sum(genre_profile.values()) or 1.0
    bonus = sum(genre_profile.get(gid, 0.0) for gid in candidate_genre_ids)
    return bonus / total


# Background thread pool shared across requests so we don't spin up/tear down
# executors on every call. Capped small — this is for refresh jobs, not fanout.
_BACKGROUND_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="recs-refresh")
_REFRESHING = set()  # in-flight user_ids to avoid duplicate refreshes


def _background_refresh_rfy(user_id, n):
    """Kick off a refresh of recommended_for_you in the background. Safe to call
    repeatedly — duplicate refreshes for the same user are ignored."""
    key = (user_id, n)
    if key in _REFRESHING:
        return
    _REFRESHING.add(key)

    def _run():
        try:
            _compute_recommended_for_you(user_id, n)
        except Exception:
            pass
        finally:
            _REFRESHING.discard(key)

    try:
        _BACKGROUND_POOL.submit(_run)
    except Exception:
        _REFRESHING.discard(key)


def recommended_for_you(user_id, n=RECOMMENDED_FOR_YOU_LIMIT):
    """Fast, cache-first entry point. Returns cached result instantly when
    available; falls back to blocking compute only on true cache miss."""
    n = max(int(n or RECOMMENDED_FOR_YOU_LIMIT), 1)
    cache_key = f"recommended_for_you:{user_id}:{n}"
    stale_key = f"recommended_for_you_stale:{user_id}:{n}"

    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Fresh cache expired, but we may still have a recent stale copy that's
    # "good enough" to return immediately while we refresh in the background.
    stale = cache.get(stale_key)
    if stale is not None:
        _background_refresh_rfy(user_id, n)
        return stale

    # True cold path — compute inline, then serve.
    return _compute_recommended_for_you(user_id, n)


def _compute_recommended_for_you(user_id, n):
    cache_key = f"recommended_for_you:{user_id}:{n}"
    stale_key = f"recommended_for_you_stale:{user_id}:{n}"

    profile = _profile_from_user(user_id)
    liked_movies = profile["liked_movies"]
    high_rated_movies = profile["high_rated_movies"]
    watchlist_movies = profile["watchlist_movies"]
    recent_movies = profile["recent_movies"]
    genre_profile = profile["genre_profile"]
    onboarding_preferences = _user_onboarding_preferences(user_id)

    seeds = liked_movies + high_rated_movies + watchlist_movies + recent_movies
    seed_movies = _dedupe_seed_movies([(movie, weight) for movie, weight in seeds if movie])

    # ---- Cold-start short-circuit ----
    # No loved/liked/rated/watchlist/watched signals at all. If the user has onboarding
    # data we route through the onboarding cold-start path; otherwise fall through to
    # the standard discover-based fetch which will also shuffle per-user.
    has_any_signal = bool(seed_movies) or bool(profile["ratings"]) or bool(profile["preference_rows"])
    cold_start_via_onboarding = (
        not has_any_signal
        and (
            onboarding_preferences["preferred_genres"]
            or onboarding_preferences["preferred_vibe"]
            or onboarding_preferences["watch_frequency"]
        )
    )
    if cold_start_via_onboarding:
        top_tmdb_ids = _cold_start_onboarding_candidates(user_id, onboarding_preferences, n)
        top_tmdb_ids = _filter_out_interactions(user_id, top_tmdb_ids)[:n]
        explanation = _build_recommendation_explanation(user_id, profile, genre_profile)
        result = {"tmdb_ids": top_tmdb_ids, "explanation": explanation}
        cache.set(cache_key, result, timeout=300)
        cache.set(stale_key, result, timeout=86400)  # 24h stale fallback
        return result

    sim_lookup = _similarity_lookup_for_seeds(seed_movies)

    candidates = []
    candidate_meta = {}

    # Run all data fetches in parallel with a hard time budget so the endpoint
    # never hangs for minutes on cold cache — slower fetchers are skipped and
    # their results will populate the next request via the cache.
    seeds_for_tmdb = _seed_movies_for_personalized(user_id, limit=2)
    top_genre_ids = [gid for gid, _ in genre_profile.most_common(2)]

    # Per-user discover variety: page + sort chosen from a stable seed so users
    # sharing top genres still see different catalogue slices.
    discover_rng = _user_rng(user_id, "rfy-discover")
    discover_page = discover_rng.choice([1, 2, 3])
    discover_sort = discover_rng.choice(["popularity.desc", "vote_average.desc", "vote_count.desc"])

    def _fetch_cf():
        return recommend_for_user_tmdb(user_id, n=max(n * 4, 12))

    def _fetch_tmdb_seeds():
        return _multi_seed_tmdb_pool(seeds_for_tmdb, n=max(n * 2, 12))

    def _fetch_genre_discover():
        if not top_genre_ids:
            return []
        joined = ",".join(str(g) for g in top_genre_ids)
        # Cached at the tmdb_get layer now — this call is ~instant on repeat.
        try:
            data = discover_movies(
                with_genres=joined,
                sort_by=discover_sort,
                page=discover_page,
                vote_count_gte="200",
                timeout=1.5,
            )
            return (data.get("results") or [])[:40]
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=3) as executor:
        fut_cf = executor.submit(_fetch_cf)
        fut_tmdb = executor.submit(_fetch_tmdb_seeds)
        fut_genre = executor.submit(_fetch_genre_discover)

        try:
            candidates.extend(fut_cf.result(timeout=2.5))
        except Exception:
            pass
        try:
            candidates.extend(fut_tmdb.result(timeout=2.5))
        except Exception:
            pass
        try:
            for m in fut_genre.result(timeout=2):
                tmdb_id = m.get("id")
                if not tmdb_id:
                    continue
                candidate_meta[tmdb_id] = {"genre_ids": set(m.get("genre_ids") or [])}
                candidates.append(tmdb_id)
        except Exception:
            pass

    candidates = _filter_out_interactions(user_id, candidates)
    if not candidates:
        return {
            "tmdb_ids": [],
            "explanation": {
                "reason_type": "genre",
                "reason_text": "Recommended for you based on your preferences.",
            },
        }

    candidates = list(dict.fromkeys(candidates))
    db_movies = {
        m.tmdb_id: m
        for m in Movie.objects.filter(tmdb_id__in=candidates)
    }

    user_salt = _user_salt(user_id)
    scored = []
    for tmdb_id in candidates:
        candidate_movie = db_movies.get(tmdb_id)
        liked_sim = _score_candidate(tmdb_id, candidate_movie, liked_movies, sim_lookup)
        high_sim = _score_candidate(tmdb_id, candidate_movie, high_rated_movies, sim_lookup)
        watch_sim = _score_candidate(tmdb_id, candidate_movie, watchlist_movies, sim_lookup)
        recent_sim = _score_candidate(tmdb_id, candidate_movie, recent_movies, sim_lookup)

        genre_ids = None
        if tmdb_id in candidate_meta:
            genre_ids = candidate_meta[tmdb_id].get("genre_ids")
        elif candidate_movie:
            genre_ids = {GENRE_TO_TMDB_ID[g] for g in _movie_genre_set(candidate_movie) if g in GENRE_TO_TMDB_ID}

        bonus = _genre_bonus(genre_ids, genre_profile)

        base_score = (
            RECOMMEND_WEIGHTS["liked"] * liked_sim
            + RECOMMEND_WEIGHTS["high_rated"] * high_sim
            + RECOMMEND_WEIGHTS["watchlist"] * max(watch_sim, recent_sim * 0.6)
            + RECOMMEND_WEIGHTS["genre_bonus"] * bonus
        )

        # Apply onboarding boost so vibe + frequency affect the ranking even for
        # users with ratings — new users who just finished onboarding still see
        # genre/vibe-aligned picks rise to the top.
        onboarding_boost = _onboarding_boost(candidate_movie, onboarding_preferences)

        # Per-user deterministic jitter to diversify rankings when two users share
        # the same seed pool. Tiny offset per candidate — enough to reorder ties
        # without overriding genuine score differences.
        jitter_seed = hashlib.sha256(f"{user_id}-{tmdb_id}".encode("utf-8")).hexdigest()
        jitter = (int(jitter_seed[:8], 16) / float(0xFFFFFFFF)) * 0.05

        score = (base_score * onboarding_boost) + jitter + (user_salt * 0.01)
        scored.append((tmdb_id, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    top_tmdb_ids = [tmdb_id for tmdb_id, _ in scored[:n]]

    explanation = _build_recommendation_explanation(user_id, profile, genre_profile)
    result = {"tmdb_ids": top_tmdb_ids, "explanation": explanation}
    cache.set(cache_key, result, timeout=300)
    cache.set(stale_key, result, timeout=86400)  # 24h stale fallback
    return result


def _top_genre_names_from_high_ratings(profile, limit=2):
    counter = Counter()
    for row in profile["ratings"]:
        if not getattr(row, "movie", None):
            continue
        normalized_rating = _normalized_star_rating(row.rating)
        if normalized_rating < 4:
            continue
        for genre_name in _movie_genre_set(row.movie):
            if genre_name in GENRE_TO_TMDB_ID:
                counter[genre_name] += _rating_weight_for_value(row.rating)

    genre_names = []
    for genre_name, _score in counter.most_common(limit):
        if not genre_name:
            continue
        genre_names.append(genre_name.title())
    return genre_names


def _build_recommendation_explanation(user_id, profile, genre_profile):
    rating_genre_names = _top_genre_names_from_high_ratings(profile, limit=2)

    top_rating = None
    if profile["ratings"]:
        top_rating = max(profile["ratings"], key=lambda r: _normalized_star_rating(r.rating))

    if rating_genre_names:
        return {
            "reason_type": "genre",
            "reason_text": (
                f"Recommended for you based on your interest in {rating_genre_names[0]}"
                + (f" and {rating_genre_names[1]}." if len(rating_genre_names) > 1 else ".")
            ),
        }

    if not profile["ratings"]:
        onboarding_genres = _user_onboarding_preferences(user_id).get("preferred_genres", [])[:2]
        onboarding_genre_names = [genre_name.title() for genre_name in onboarding_genres if genre_name]
        if onboarding_genre_names:
            return {
                "reason_type": "genre",
                "reason_text": (
                    f"Recommended for you based on your interest in {onboarding_genre_names[0]}"
                    + (
                        f" and {onboarding_genre_names[1]}."
                        if len(onboarding_genre_names) > 1
                        else "."
                    )
                ),
            }

    if top_rating and top_rating.movie:
        return {
            "reason_type": "rating",
            "reason_text": f"Because you rated {top_rating.movie.title} {top_rating.rating}★.",
        }

    if profile["liked_movies"]:
        movie, _ = profile["liked_movies"][0]
        if movie:
            return {
                "reason_type": "liked_movie",
                "reason_text": f"Because you liked {movie.title}.",
            }

    return {
        "reason_type": "genre",
        "reason_text": "Recommended for you based on your preferences.",
    }


def _extract_release_year(meta):
    release_date = meta.get("release_date") if meta else None
    if release_date and len(release_date) >= 4:
        try:
            return int(release_date[:4])
        except Exception:
            return None
    return None


def _candidate_quality_bonus(meta, db_movie):
    bonus = 0.0
    year = None
    if meta:
        year = _extract_release_year(meta)
    if year is None and db_movie:
        year = db_movie.release_year

    if year:
        if year >= 2020:
            bonus += SURPRISE_WEIGHTS["recency_boost"]
        elif year >= 2015:
            bonus += SURPRISE_WEIGHTS["recency_boost"] * 0.5
        elif year < 1980:
            bonus -= 0.2

    popularity = None
    if meta and isinstance(meta.get("popularity"), (int, float)):
        popularity = meta.get("popularity")
    if popularity:
        bonus += min(popularity / 200.0, SURPRISE_WEIGHTS["popularity_boost"])

    return bonus


def _candidate_passes_quality(meta, db_movie):
    year = _extract_release_year(meta)
    if year is None and db_movie:
        year = db_movie.release_year
    if year and year < SURPRISE_MIN_YEAR:
        return False

    if meta:
        vote_count = meta.get("vote_count")
        popularity = meta.get("popularity")
        vote_average = meta.get("vote_average")
        if isinstance(vote_count, (int, float)) and vote_count < SURPRISE_MIN_VOTE_COUNT:
            return False
        if isinstance(popularity, (int, float)) and popularity < SURPRISE_MIN_POPULARITY:
            return False
        if isinstance(vote_average, (int, float)) and vote_average < SURPRISE_MIN_VOTE_AVERAGE:
            return False

    return True


def _latest_movie_from_queryset(qs):
    row = qs.select_related("movie").order_by("-id").first()
    if not row or not row.movie or row.movie.tmdb_id is None:
        return None
    return row.movie


def _collect_movies(qs):
    movies = []
    seen_ids = set()
    for row in qs.select_related("movie"):
        movie = getattr(row, "movie", None)
        if not movie or movie.tmdb_id is None:
            continue
        if movie.tmdb_id in seen_ids:
            continue
        seen_ids.add(movie.tmdb_id)
        movies.append(movie)
    return movies


def _seed_movies_by_genre(movies, limit=3):
    if not movies:
        return []

    genre_counter = Counter()
    movie_genres = {}
    for movie in movies:
        genres = [g.strip().lower() for g in (movie.genres or "").split(",") if g.strip()]
        movie_genres[movie.tmdb_id] = genres
        for g in genres:
            if g in GENRE_TO_TMDB_ID:
                genre_counter[g] += 1

    picked = []
    picked_ids = set()
    for genre, _ in genre_counter.most_common():
        for movie in movies:
            if movie.tmdb_id in picked_ids:
                continue
            if genre in movie_genres.get(movie.tmdb_id, []):
                picked.append(movie)
                picked_ids.add(movie.tmdb_id)
                break
        if len(picked) >= limit:
            return picked

    for movie in movies:
        if movie.tmdb_id in picked_ids:
            continue
        picked.append(movie)
        picked_ids.add(movie.tmdb_id)
        if len(picked) >= limit:
            break

    return picked


def _seed_movies_from_queryset(qs, limit=3, order_by=None, prefer_genre_diversity=True):
    if order_by:
        qs = qs.order_by(*order_by)
    else:
        qs = qs.order_by("movie__title")
    movies = _collect_movies(qs)
    if not movies:
        return []
    if prefer_genre_diversity:
        return _seed_movies_by_genre(movies, limit=limit)
    return movies[:limit]


def _multi_seed_similar(seed_movies, n=10):
    """Get similar movies for seed movies using SVD model + TMDB API fallback in parallel."""
    if not seed_movies:
        return []
    per_seed = max(int(n / max(len(seed_movies), 1)), 1)

    def _get_similar_for_seed(movie):
        # Try SVD model first
        results = recommend_similar_tmdb(movie.tmdb_id, n=per_seed * 2)
        if results:
            return results
        # Fallback to TMDB API (recommendations + similar endpoints)
        return _tmdb_recommendations_for_seed(movie.tmdb_id, per_seed=per_seed * 2)

    # Run all seeds in parallel
    pool = []
    with ThreadPoolExecutor(max_workers=min(len(seed_movies), 3)) as executor:
        futures = [executor.submit(_get_similar_for_seed, movie) for movie in seed_movies]
        for fut in as_completed(futures):
            pool.extend(fut.result())

    unique = []
    seen = set()
    for tmdb_id in pool:
        if not tmdb_id or tmdb_id in seen:
            continue
        seen.add(tmdb_id)
        unique.append(tmdb_id)
    return unique[:n]


def _interaction_counts(user_id):
    return {
        "loved": UserMoviePreference.objects.filter(user_id=user_id, preference="love").count(),
        "liked": UserMoviePreference.objects.filter(user_id=user_id, preference="like").count(),
        "rated": Rating.objects.filter(user_id=user_id).count(),
        "watchlist": Watchlist.objects.filter(user_id=user_id).count(),
        "watched": WatchHistory.objects.filter(user_id=user_id).count(),
    }


def _join_reason_parts(parts):
    if not parts:
        return "Recommended for you"
    if len(parts) == 1:
        return f"Based on your {parts[0]}"
    if len(parts) == 2:
        return f"Based on your {parts[0]} and {parts[1]}"
    return f"Based on your {', '.join(parts[:-1])}, and {parts[-1]}"


def _interaction_summary_reason(user_id):
    counts = _interaction_counts(user_id)
    parts = []
    if counts["loved"] or counts["liked"]:
        parts.append("likes")
    if counts["rated"]:
        parts.append("ratings")
    if counts["watchlist"]:
        parts.append("watchlist")
    if counts["watched"]:
        parts.append("watch history")
    return _join_reason_parts(parts)


def _filter_out_interactions(user_id, tmdb_ids, extra_exclude=None):
    _, disliked, seen = _interaction_scores(user_id)
    exclude = set(seen) | set(disliked) | set(extra_exclude or [])
    filtered = []
    for tmdb_id in tmdb_ids:
        if not tmdb_id or tmdb_id in exclude:
            continue
        if tmdb_id in filtered:
            continue
        filtered.append(tmdb_id)
    return filtered


def _tmdb_recommendations_for_seed(seed_tmdb_id, per_seed=20):
    tmdb_ids = []

    def _fetch_recs():
        try:
            recs = get_recommendations(seed_tmdb_id, timeout=3) or {}
            return [m.get("id") for m in (recs.get("results") or []) if m.get("id")]
        except Exception:
            return []

    def _fetch_similar():
        try:
            similar = get_similar_movies(seed_tmdb_id, timeout=3) or {}
            return [m.get("id") for m in (similar.get("results") or []) if m.get("id")]
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_recs = pool.submit(_fetch_recs)
        fut_sim = pool.submit(_fetch_similar)
        tmdb_ids.extend(fut_recs.result())
        tmdb_ids.extend(fut_sim.result())

    unique = []
    seen = set()
    for tmdb_id in tmdb_ids:
        if not tmdb_id or tmdb_id in seen:
            continue
        seen.add(tmdb_id)
        unique.append(tmdb_id)
        if len(unique) >= per_seed:
            break
    return unique


def _multi_seed_tmdb_pool(seed_movies, n=40, per_seed_limit=None):
    if not seed_movies:
        return []
    seed_movies = [m for m in list(seed_movies[:2]) if m and m.tmdb_id is not None]
    if not seed_movies:
        return []
    per_seed = max(int(n / max(len(seed_movies), 1)), 10)
    if per_seed_limit is not None:
        per_seed = min(per_seed, per_seed_limit)

    results = []
    with ThreadPoolExecutor(max_workers=len(seed_movies)) as executor:
        futures = {
            executor.submit(_tmdb_recommendations_for_seed, movie.tmdb_id, per_seed): movie
            for movie in seed_movies
        }
        for fut in as_completed(futures):
            results.extend(fut.result())

    unique = []
    seen = set()
    for tmdb_id in results:
        if not tmdb_id or tmdb_id in seen:
            continue
        seen.add(tmdb_id)
        unique.append(tmdb_id)
    return unique[:n]


def _seed_movies_for_personalized(user_id, limit=4):
    seeds = []
    seen = set()
    sources = [
        (UserMoviePreference.objects.filter(user_id=user_id, preference="love"), None),
        (UserMoviePreference.objects.filter(user_id=user_id, preference="like"), None),
        (Rating.objects.filter(user_id=user_id, rating__gte=4), ("-rating", "-id")),
        (Watchlist.objects.filter(user_id=user_id), ("-id",)),
        (WatchHistory.objects.filter(user_id=user_id), ("-id",)),
    ]
    for qs, order_by in sources:
        picked = _seed_movies_from_queryset(
            qs, limit=limit, order_by=order_by, prefer_genre_diversity=True
        )
        for movie in picked:
            if movie.tmdb_id in seen:
                continue
            seen.add(movie.tmdb_id)
            seeds.append(movie)
            if len(seeds) >= limit:
                return seeds
    return seeds


def _seed_reason(user_id):
    counts = _interaction_counts(user_id)
    total = sum(counts.values())
    if total <= 1:
        loved = _latest_movie_from_queryset(
            UserMoviePreference.objects.filter(user_id=user_id, preference="love")
        )
        if loved:
            return loved, f"Because you loved {loved.title}"

        liked = _latest_movie_from_queryset(
            UserMoviePreference.objects.filter(user_id=user_id, preference="like")
        )
        if liked:
            return liked, f"Because you liked {liked.title}"

        rated = _latest_movie_from_queryset(
            Rating.objects.filter(user_id=user_id, rating__gte=4)
        )
        if rated:
            return rated, f"Because you rated {rated.title}"

        watchlist = _latest_movie_from_queryset(
            Watchlist.objects.filter(user_id=user_id)
        )
        if watchlist:
            return watchlist, "Because it's in your watchlist"

        watched = _latest_movie_from_queryset(
            WatchHistory.objects.filter(user_id=user_id)
        )
        if watched:
            return watched, f"Because you watched {watched.title}"

    return None, _interaction_summary_reason(user_id)


def personalized_recommend(user_id, n=10, genre=None):
    started_at = time.time()
    n = max(int(n or 10), 1)
    cache_key = f"personalized_recommend:{user_id}:{n}:{genre or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    profile = _profile_from_user(user_id)
    explicit_rating_rows = list(profile["ratings"])
    rating_signal_rows = explicit_rating_rows + list(profile.get("preference_rows", []))
    watchlist_rows = list(profile["watchlist"])
    onboarding_preferences = _user_onboarding_preferences(user_id)

    has_ratings = bool(explicit_rating_rows)
    has_watchlist = bool(watchlist_rows)
    signal_used = _prediction_signal(has_ratings, has_watchlist)
    if not has_ratings and not has_watchlist and (
        onboarding_preferences["preferred_genres"]
        or onboarding_preferences["preferred_vibe"]
        or onboarding_preferences["watch_frequency"]
    ):
        top_tmdb_ids = _cold_start_onboarding_candidates(user_id, onboarding_preferences, n)
        if top_tmdb_ids:
            try:
                import time as _time
                from api.models import ModelPredictionLog, RecommenderModel

                _elapsed_ms = (_time.time() - started_at) * 1000.0
                active_models = RecommenderModel.objects.filter(status="active")
                for model_obj in active_models:
                    ModelPredictionLog.objects.create(
                        model=model_obj,
                        user_id=user_id,
                        recommended_tmdb_ids=top_tmdb_ids[:20],
                        signal_used=signal_used,
                        response_time_ms=round(_elapsed_ms, 2),
                    )
            except Exception as _log_err:
                import logging as _logging

                _logging.getLogger(__name__).warning(
                    "Prediction logging failed: %s", _log_err
                )
        cache.set(cache_key, top_tmdb_ids, timeout=300)
        return top_tmdb_ids

    base_scores = defaultdict(float)
    ranked_tmdb, _, _ = _rank_tmdb_candidates_with_scores(user_id, limit=max(n, 1) * 8)
    if ranked_tmdb:
        max_score = max((score for _, score in ranked_tmdb), default=0.0) or 1.0
        for tmdb_id, score in ranked_tmdb:
            if not tmdb_id:
                continue
            base_scores[tmdb_id] += float(score) / max_score

    seeds = _seed_movies_for_personalized(user_id, limit=4)
    if seeds:
        _add_ranked_candidates(
            base_scores,
            _multi_seed_tmdb_pool(seeds, n=max(n, 1) * 3),
            weight=0.35,
        )

    _add_ranked_candidates(
        base_scores,
        recommend_for_user_tmdb(user_id, n=max(n, 1) * 8),
        weight=0.15,  # SVD needs 500+ ratings to be reliable; content signals dominate for now
    )

    seed_movies = (
        profile["liked_movies"]
        + profile["high_rated_movies"]
        + profile["watchlist_movies"]
        + profile["recent_movies"]
    )
    local_candidates = _local_candidate_movies(user_id, extra_exclude=base_scores.keys(), limit=LOCAL_CANDIDATE_LIMIT)
    local_candidate_map = {}
    for movie in local_candidates:
        local_candidate_map[movie.tmdb_id] = movie
        local_score = _score_local_candidate_base(movie, seed_movies)
        if local_score > 0:
            base_scores[movie.tmdb_id] += 0.6 * local_score

    if len(base_scores) < n:
        for movie in _globally_popular_local_movies(
            exclude_tmdb_ids=set(base_scores.keys()),
            limit=max(n, 1) * 4,
        ):
            local_candidate_map[movie.tmdb_id] = movie
            base_scores[movie.tmdb_id] += 0.05

    candidate_ids = sorted(base_scores.keys(), key=lambda tmdb_id: base_scores[tmdb_id], reverse=True)
    candidate_ids = _filter_out_interactions(user_id, candidate_ids)
    if not candidate_ids:
        return []

    db_movies = {
        movie.tmdb_id: movie
        for movie in Movie.objects.filter(tmdb_id__in=candidate_ids)
        .annotate(avg_rating=Avg("user_ratings__rating"), rating_count=Count("user_ratings"))
    }
    db_movies.update(local_candidate_map)

    language_weights = _language_weight_map(explicit_rating_rows, watchlist_rows)
    scored = []
    for tmdb_id in candidate_ids:
        candidate_movie = db_movies.get(tmdb_id)
        base_similarity_score = float(base_scores.get(tmdb_id, 0.0))
        rating_signal_score = _rating_signal_score(candidate_movie, rating_signal_rows)
        watchlist_signal_score = _watchlist_signal_score(candidate_movie, watchlist_rows)
        language_weight = _language_multiplier(candidate_movie, language_weights)

        # FIX 1: onboarding_boost was hardcoded to 1.0 — now actually applied
        # This makes cold-start users (new registrations) get genre/vibe-aware recs
        onboarding_boost = _onboarding_boost(candidate_movie, onboarding_preferences)

        # FIX 2: rating_signal MULTIPLIES the base score instead of just adding
        # A 5-star signal now amplifies the candidate's score significantly
        # A dislike signal suppresses it — this is the "rating-first priority" behavior
        if rating_signal_score > 0:
            rating_multiplier = 1.0 + (rating_signal_score * 0.5)
        elif rating_signal_score < 0:
            rating_multiplier = max(0.1, 1.0 + rating_signal_score)
        else:
            rating_multiplier = 1.0

        final_score = (
            (base_similarity_score * rating_multiplier)
            + watchlist_signal_score
        ) * language_weight * onboarding_boost
        scored.append((tmdb_id, final_score, base_similarity_score))

    scored.sort(key=lambda item: (item[1], item[2]), reverse=True)
    top_tmdb_ids = [tmdb_id for tmdb_id, _, _ in scored[:n]]
    if len(top_tmdb_ids) < n:
        for tmdb_id in candidate_ids:
            if tmdb_id in top_tmdb_ids:
                continue
            top_tmdb_ids.append(tmdb_id)
            if len(top_tmdb_ids) >= n:
                break

    if top_tmdb_ids:
        try:
            import time as _time
            from api.models import ModelPredictionLog, RecommenderModel

            _elapsed_ms = (_time.time() - started_at) * 1000.0
            active_models = RecommenderModel.objects.filter(status="active")
            for model_obj in active_models:
                ModelPredictionLog.objects.create(
                    model=model_obj,
                    user_id=user_id,
                    recommended_tmdb_ids=top_tmdb_ids[:20],
                    signal_used=signal_used,
                    response_time_ms=round(_elapsed_ms, 2),
                )
        except Exception as _log_err:
            import logging as _logging

            _logging.getLogger(__name__).warning(
                "Prediction logging failed: %s", _log_err
            )
    result = top_tmdb_ids[:n]
    cache.set(cache_key, result, timeout=300)
    return result


def personalized_recommend_with_reasons(user_id, n=10):
    tmdb_ids = personalized_recommend(user_id, n=n)
    seed_movie, reason = _seed_reason(user_id)
    if seed_movie is None:
        if reason == "Recommended for you":
            genre_ids = favorite_genres_profile(user_id, top_n=1)
            if genre_ids:
                name = TMDB_ID_TO_GENRE.get(genre_ids[0], "your favorite")
                reason = f"Because you like {name.title()} movies"
    items = [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in tmdb_ids]
    return {
        "tmdb_ids": tmdb_ids,
        "items": items,
        "reason": reason,
        "seed_tmdb_id": seed_movie.tmdb_id if seed_movie else None,
        "seed_title": seed_movie.title if seed_movie else None,
    }


def recommend_movies(user_id, n=10):
    return personalized_recommend(user_id, n=n)


def similar_movies(tmdb_id, n=10):
    return recommend_similar_tmdb(tmdb_id, n=n)


def similar_movies_with_reason(seed_tmdb_id, n=10):
    tmdb_ids = recommend_similar_tmdb(seed_tmdb_id, n=n)
    seed_title = Movie.objects.filter(tmdb_id=seed_tmdb_id).values_list("title", flat=True).first()
    reason = f"Similar to {seed_title}" if seed_title else "Similar to your recent watch"
    items = [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in tmdb_ids]
    return {
        "tmdb_ids": tmdb_ids,
        "items": items,
        "reason": reason,
        "seed_tmdb_id": seed_tmdb_id,
        "seed_title": seed_title,
    }


def loved_movies_with_reason(user_id, n=10):
    loved = _seed_movies_from_queryset(
        UserMoviePreference.objects.filter(user_id=user_id, preference="love"),
        limit=3,
        prefer_genre_diversity=True,
    )
    if not loved:
        return {
            "tmdb_ids": [],
            "items": [],
            "reason": None,
            "seed_tmdb_id": None,
            "seed_title": None,
        }
    tmdb_ids = _multi_seed_similar(loved, n=n * 2)
    tmdb_ids = _filter_out_interactions(user_id, tmdb_ids)[:n]
    reason = (
        f"Because you loved {loved[0].title}"
        if len(loved) == 1
        else "Based on movies you loved"
    )
    items = [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in tmdb_ids]
    return {
        "tmdb_ids": tmdb_ids,
        "items": items,
        "reason": reason,
        "seed_tmdb_id": loved[0].tmdb_id if len(loved) == 1 else None,
        "seed_title": loved[0].title if len(loved) == 1 else None,
    }

def liked_movies_with_reason(user_id, n=10):
    liked = _seed_movies_from_queryset(
        UserMoviePreference.objects.filter(user_id=user_id, preference="like"),
        limit=3,
        prefer_genre_diversity=True,
    )
    if not liked:
        return {
            "tmdb_ids": [],
            "items": [],
            "reason": None,
            "seed_tmdb_id": None,
            "seed_title": None,
        }
    tmdb_ids = _multi_seed_similar(liked, n=n * 2)
    tmdb_ids = _filter_out_interactions(user_id, tmdb_ids)[:n]
    reason = (
        f"Because you liked {liked[0].title}"
        if len(liked) == 1
        else "Based on movies you liked"
    )
    items = [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in tmdb_ids]
    return {
        "tmdb_ids": tmdb_ids,
        "items": items,
        "reason": reason,
        "seed_tmdb_id": liked[0].tmdb_id if len(liked) == 1 else None,
        "seed_title": liked[0].title if len(liked) == 1 else None,
    }

def rated_movies_with_reason(user_id, n=10):
    rated = _seed_movies_from_queryset(
        Rating.objects.filter(user_id=user_id, rating__gte=4),
        limit=3,
        order_by=("-rating", "-id"),
        prefer_genre_diversity=True,
    )
    if not rated:
        return {
            "tmdb_ids": [],
            "items": [],
            "reason": None,
            "seed_tmdb_id": None,
            "seed_title": None,
        }
    tmdb_ids = _multi_seed_similar(rated, n=n * 2)
    tmdb_ids = _filter_out_interactions(user_id, tmdb_ids)[:n]
    reason = (
        f"Based on your rating for {rated[0].title}"
        if len(rated) == 1
        else "Based on movies you rated highly"
    )
    items = [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in tmdb_ids]
    return {
        "tmdb_ids": tmdb_ids,
        "items": items,
        "reason": reason,
        "seed_tmdb_id": rated[0].tmdb_id,
        "seed_title": rated[0].title,
    }


def watchlist_movies_with_reason(user_id, n=10):
    watchlisted = _seed_movies_from_queryset(
        Watchlist.objects.filter(user_id=user_id),
        limit=3,
        prefer_genre_diversity=True,
    )
    if not watchlisted:
        return {
            "tmdb_ids": [],
            "items": [],
            "reason": None,
            "seed_tmdb_id": None,
            "seed_title": None,
        }
    tmdb_ids = _multi_seed_similar(watchlisted, n=n * 2)
    tmdb_ids = _filter_out_interactions(user_id, tmdb_ids)[:n]
    reason = (
        f"Based on your watchlist: {watchlisted[0].title}"
        if len(watchlisted) == 1
        else "Based on items in your watchlist"
    )
    items = [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in tmdb_ids]
    return {
        "tmdb_ids": tmdb_ids,
        "items": items,
        "reason": reason,
        "seed_tmdb_id": watchlisted[0].tmdb_id,
        "seed_title": watchlisted[0].title,
    }


def _favorite_genre_ids(user_id, top_n=2):
    return favorite_genres_profile(user_id, top_n=top_n)


def favorite_genres_profile(user_id, top_n=3):
    counter = Counter()
    prefs = (
        UserMoviePreference.objects.filter(user_id=user_id)
        .select_related("movie")
    )
    for pref in prefs:
        if not pref.movie:
            continue
        weight = 2 if pref.preference == "love" else 1 if pref.preference == "like" else -1
        genres = (pref.movie.genres or "").split(",")
        for g in genres:
            g_norm = g.strip().lower()
            if g_norm in GENRE_TO_TMDB_ID:
                counter[GENRE_TO_TMDB_ID[g_norm]] += weight

    ratings = Rating.objects.filter(user_id=user_id).select_related("movie")
    for r in ratings:
        if not r.movie:
            continue
        normalized_rating = _normalized_star_rating(r.rating)
        weight = 1 if normalized_rating >= 4 else -1 if normalized_rating <= 2 else 0
        genres = (r.movie.genres or "").split(",")
        for g in genres:
            g_norm = g.strip().lower()
            if g_norm in GENRE_TO_TMDB_ID:
                counter[GENRE_TO_TMDB_ID[g_norm]] += weight

    watchlist = Watchlist.objects.filter(user_id=user_id).select_related("movie")
    for w in watchlist:
        if not w.movie:
            continue
        genres = (w.movie.genres or "").split(",")
        for g in genres:
            g_norm = g.strip().lower()
            if g_norm in GENRE_TO_TMDB_ID:
                counter[GENRE_TO_TMDB_ID[g_norm]] += 1

    preferences = _user_onboarding_preferences(user_id)
    for g in preferences["preferred_genres"]:
        if g in GENRE_TO_TMDB_ID:
            counter[GENRE_TO_TMDB_ID[g]] += 1

    return [gid for gid, _ in counter.most_common(top_n) if counter[gid] > 0]


def _genre_ids_from_movie(movie, top_n=2):
    if not movie or not movie.genres:
        return []
    counter = Counter()
    for g in movie.genres.split(","):
        g_norm = g.strip().lower()
        if g_norm in GENRE_TO_TMDB_ID:
            counter[GENRE_TO_TMDB_ID[g_norm]] += 1
    return [gid for gid, _ in counter.most_common(top_n)]


def surprise_me(user_id, pool_size=30):
    payload = surprise_recommendations(user_id, n=1)
    tmdb_ids = payload.get("tmdb_ids", []) or []
    return tmdb_ids[0] if tmdb_ids else None


def surprise_recommendations(user_id, n=4, exclude=None):
    n = max(int(n or 4), 1)
    exclude = {int(x) for x in (exclude or []) if x is not None}
    scores, disliked, seen = _interaction_scores(user_id)
    has_history = bool(seen or disliked)
    profile = _profile_from_user(user_id)
    seed_movie, _seed_reason_text = _seed_reason(user_id)

    high_rated = [
        (row.movie, max(_normalized_star_rating(row.rating) / 5.0, 0.6))
        for row in profile["ratings"]
        if row.movie and _normalized_star_rating(row.rating) >= 5
    ]
    watchlist_movies = profile["watchlist_movies"]
    genre_profile = profile["genre_profile"]

    reason = "Handpicked for you based on what you've enjoyed and saved"

    sim_seeds = high_rated + watchlist_movies
    sim_lookup = _similarity_lookup_for_seeds(sim_seeds, per_seed=30)

    candidate_meta = {}
    pool = []
    seen_set = set()

    def _extend_pool(candidates):
        for tmdb_id in candidates or []:
            if not tmdb_id:
                continue
            if tmdb_id in seen or tmdb_id in disliked or tmdb_id in exclude:
                continue
            if tmdb_id in seen_set:
                continue
            seen_set.add(tmdb_id)
            pool.append(tmdb_id)
            if len(pool) >= SURPRISE_MAX_POOL:
                return

    high_target = int(SURPRISE_MAX_POOL * 0.7)
    watch_target = int(SURPRISE_MAX_POOL * 0.25)

    if high_rated:
        seed_limit = min(SURPRISE_PER_SEED_LIMIT * max(len(high_rated), 1), max(high_target, n * 8))
        _extend_pool(
            _multi_seed_tmdb_pool(
                [m for m, _ in high_rated],
                n=seed_limit,
                per_seed_limit=SURPRISE_PER_SEED_LIMIT,
            )
        )
    if watchlist_movies and len(pool) < SURPRISE_MAX_POOL:
        seed_limit = min(SURPRISE_PER_SEED_LIMIT * max(len(watchlist_movies), 1), max(watch_target, n * 6))
        _extend_pool(
            _multi_seed_tmdb_pool(
                [m for m, _ in watchlist_movies],
                n=seed_limit,
                per_seed_limit=SURPRISE_PER_SEED_LIMIT,
            )
        )

    if len(pool) < SURPRISE_MAX_POOL:
        _extend_pool(recommend_for_user_tmdb(user_id, n=SURPRISE_CF_LIMIT))

    if len(pool) < max(n * 5, 20):
        genre_ids = [gid for gid, _ in genre_profile.most_common(1)]
        if genre_ids:
            try:
                data = discover_movies(
                    with_genres=",".join(str(g) for g in genre_ids),
                    sort_by="popularity.desc",
                    vote_count_gte=str(SURPRISE_MIN_VOTE_COUNT),
                    release_date_gte=f"{SURPRISE_MIN_YEAR}-01-01",
                    timeout=3,
                )
                results = data.get("results", []) or []
                for m in results[:20]:
                    tmdb_id = m.get("id")
                    if not tmdb_id:
                        continue
                    candidate_meta[tmdb_id] = {
                        "genre_ids": set(m.get("genre_ids") or []),
                        "release_date": m.get("release_date"),
                        "popularity": m.get("popularity"),
                        "vote_count": m.get("vote_count"),
                        "vote_average": m.get("vote_average"),
                    }
                    _extend_pool([tmdb_id])
            except Exception:
                pass

    if pool:
        db_movies = {
            m.tmdb_id: m
            for m in Movie.objects.filter(tmdb_id__in=pool)
        }

        filtered = []
        for tmdb_id in pool:
            meta = candidate_meta.get(tmdb_id)
            if meta is None:
                try:
                    meta = get_movie_details(tmdb_id, timeout=3) or {}
                except Exception:
                    meta = {}
            if meta and not meta.get("genre_ids") and meta.get("genres"):
                meta["genre_ids"] = [g.get("id") for g in meta.get("genres", []) if g.get("id")]
            candidate_meta[tmdb_id] = meta
            candidate_movie = db_movies.get(tmdb_id)
            if _candidate_passes_quality(meta, candidate_movie):
                filtered.append(tmdb_id)

        scored = []
        for tmdb_id in filtered:
            candidate_movie = db_movies.get(tmdb_id)
            high_sim = _score_candidate(tmdb_id, candidate_movie, high_rated, sim_lookup)
            watch_sim = _score_candidate(tmdb_id, candidate_movie, watchlist_movies, sim_lookup)

            if high_sim == 0 and watch_sim < 0.2:
                continue

            genre_ids = None
            if tmdb_id in candidate_meta:
                genre_ids = set(candidate_meta[tmdb_id].get("genre_ids") or [])
            elif candidate_movie:
                genre_ids = {GENRE_TO_TMDB_ID[g] for g in _movie_genre_set(candidate_movie) if g in GENRE_TO_TMDB_ID}
            genre_bonus = _genre_bonus(genre_ids, genre_profile)

            score = (
                SURPRISE_WEIGHTS["high_rated"] * high_sim
                + SURPRISE_WEIGHTS["watchlist"] * watch_sim
                + SURPRISE_WEIGHTS["genre_bonus"] * genre_bonus
                + _candidate_quality_bonus(candidate_meta.get(tmdb_id), candidate_movie)
            )
            scored.append((tmdb_id, score, high_sim, watch_sim, genre_bonus))

        scored.sort(key=lambda x: x[1], reverse=True)

        def _stable_shuffle(items, salt):
            def _key(tmdb_id):
                h = hashlib.sha256(f"{salt}:{tmdb_id}".encode("utf-8")).hexdigest()
                return h
            return sorted(items, key=_key)

        def _pick_from_band(band_items, used_genres, used_sources, band_salt):
            if not band_items:
                return None
            for tmdb_id, score, high_sim, watch_sim, genre_bonus in _stable_shuffle(band_items, band_salt):
                meta = candidate_meta.get(tmdb_id) or {}
                genre_ids = set(meta.get("genre_ids") or [])
                if not genre_ids and tmdb_id in db_movies:
                    genre_ids = {GENRE_TO_TMDB_ID[g] for g in _movie_genre_set(db_movies[tmdb_id]) if g in GENRE_TO_TMDB_ID}
                source = "high" if high_sim >= watch_sim else "watch"
                # Prefer genre and source diversity, but allow fallback.
                if (genre_ids - used_genres) or (source not in used_sources):
                    return (tmdb_id, score, high_sim, watch_sim, genre_bonus, genre_ids, source)
            # Fallback to first deterministic item
            tmdb_id, score, high_sim, watch_sim, genre_bonus = _stable_shuffle(band_items, band_salt)[0]
            meta = candidate_meta.get(tmdb_id) or {}
            genre_ids = set(meta.get("genre_ids") or [])
            if not genre_ids and tmdb_id in db_movies:
                genre_ids = {GENRE_TO_TMDB_ID[g] for g in _movie_genre_set(db_movies[tmdb_id]) if g in GENRE_TO_TMDB_ID}
            source = "high" if high_sim >= watch_sim else "watch"
            return (tmdb_id, score, high_sim, watch_sim, genre_bonus, genre_ids, source)

        # Controlled diversity: pick across ranked bands deterministically.
        band_sizes = [(0, 5), (5, 10), (10, 20), (20, 30)]
        band_pool = scored[: max(30, n * 5)]
        bands = [band_pool[start:end] for start, end in band_sizes]

        picks = []
        used_genres = set()
        used_sources = set()
        for idx, band in enumerate(bands):
            if len(picks) >= n:
                break
            picked = _pick_from_band(band, used_genres, used_sources, f"{user_id}:{idx}")
            if not picked:
                continue
            tmdb_id, score, high_sim, watch_sim, genre_bonus, genre_ids, source = picked
            picks.append((tmdb_id, score, high_sim, watch_sim, genre_bonus))
            used_genres.update(genre_ids)
            used_sources.add(source)

        # If still short, fill from remaining top-ranked, preserving determinism.
        if len(picks) < n:
            picked_ids = {tmdb_id for tmdb_id, *_ in picks}
            for row in band_pool:
                if row[0] in picked_ids:
                    continue
                picks.append(row)
                if len(picks) >= n:
                    break

        items = []
        for tmdb_id, _score, high_sim, watch_sim, _gb in picks:
            if high_sim >= watch_sim and high_sim > 0:
                item_reason = "Similar to a movie you rated highly"
            elif watch_sim > 0:
                item_reason = "Related to a movie in your watchlist"
            else:
                item_reason = "Matches your recent preferences"
            items.append({"tmdb_id": tmdb_id, "reason": item_reason})

        return {
            "tmdb_ids": [tmdb_id for tmdb_id, *_ in picks],
            "reason": reason,
            "items": items,
            "has_history": has_history,
        }

    # Fallback: TMDB recommendations for the latest seed (history-only)
    if has_history and seed_movie:
        tmdb_results = []
        try:
            recs = get_recommendations(seed_movie.tmdb_id, timeout=3) or {}
            tmdb_results = recs.get("results", []) or []
            if not tmdb_results:
                similar = get_similar_movies(seed_movie.tmdb_id, timeout=3) or {}
                tmdb_results = similar.get("results", []) or []
        except Exception:
            tmdb_results = []

        tmdb_ids = [
            m.get("id")
            for m in tmdb_results
            if m.get("id") and m.get("id") not in seen and m.get("id") not in disliked and m.get("id") not in exclude
        ]
        if tmdb_ids:
            picks = tmdb_ids[:n]
            return {
                "tmdb_ids": picks,
                "reason": reason,
                "items": [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in picks],
                "has_history": has_history,
            }

        # Last fallback with seed genres
        genre_ids = _genre_ids_from_movie(seed_movie, top_n=2)
        if genre_ids:
            try:
                data = discover_movies(with_genres=",".join(str(g) for g in genre_ids), timeout=3)
                results = data.get("results", []) or []
                tmdb_ids = [
                    m.get("id")
                    for m in results
                    if m.get("id") and m.get("id") not in seen and m.get("id") not in disliked and m.get("id") not in exclude
                ]
                if tmdb_ids:
                    picks = tmdb_ids[:n]
                    return {
                        "tmdb_ids": picks,
                        "reason": reason,
                        "items": [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in picks],
                        "has_history": has_history,
                    }
            except Exception:
                pass

    # Absolute fallback for history users: allow seen but not disliked
    if has_history:
        tmdb_ids = [tmdb_id for tmdb_id in pool if tmdb_id and tmdb_id not in disliked and tmdb_id not in exclude]
        if tmdb_ids:
            picks = tmdb_ids[:n]
            return {
                "tmdb_ids": picks,
                "reason": reason,
                "items": [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in picks],
                "has_history": has_history,
            }

    return {
        "tmdb_ids": [],
        "reason": "Add a few likes or ratings to personalize your picks",
        "items": [],
        "has_history": has_history,
    }


def batched_personalized_sections(user_id, n=12):
    """Compute loved/liked/rated/watchlist sections in parallel with cross-section dedup.

    Returns a dict with keys: loved, liked, rated, watchlist.
    Each section gets unique movies — no overlap between sections.
    Priority order: loved > rated > liked > watchlist.
    """
    cache_key = f"batched_personalized:{user_id}:{n}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Gather seed movies for each section in parallel
    def _get_loved_seeds():
        return _seed_movies_from_queryset(
            UserMoviePreference.objects.filter(user_id=user_id, preference="love"),
            limit=3, prefer_genre_diversity=True,
        )

    def _get_liked_seeds():
        return _seed_movies_from_queryset(
            UserMoviePreference.objects.filter(user_id=user_id, preference="like"),
            limit=3, prefer_genre_diversity=True,
        )

    def _get_rated_seeds():
        return _seed_movies_from_queryset(
            Rating.objects.filter(user_id=user_id, rating__gte=4),
            limit=3, order_by=("-rating", "-id"), prefer_genre_diversity=True,
        )

    def _get_watchlist_seeds():
        return _seed_movies_from_queryset(
            Watchlist.objects.filter(user_id=user_id),
            limit=3, prefer_genre_diversity=True,
        )

    with ThreadPoolExecutor(max_workers=4) as pool:
        fut_loved = pool.submit(_get_loved_seeds)
        fut_liked = pool.submit(_get_liked_seeds)
        fut_rated = pool.submit(_get_rated_seeds)
        fut_watchlist = pool.submit(_get_watchlist_seeds)

        loved_seeds = fut_loved.result()
        liked_seeds = fut_liked.result()
        rated_seeds = fut_rated.result()
        watchlist_seeds = fut_watchlist.result()

    # Generate candidate pools in parallel using TMDB similarity
    oversample = n * 3

    def _get_candidates(seeds):
        if not seeds:
            return []
        return _multi_seed_similar(seeds, n=oversample)

    with ThreadPoolExecutor(max_workers=4) as pool:
        fut_loved_c = pool.submit(_get_candidates, loved_seeds)
        fut_rated_c = pool.submit(_get_candidates, rated_seeds)
        fut_liked_c = pool.submit(_get_candidates, liked_seeds)
        fut_watchlist_c = pool.submit(_get_candidates, watchlist_seeds)

        loved_candidates = fut_loved_c.result()
        rated_candidates = fut_rated_c.result()
        liked_candidates = fut_liked_c.result()
        watchlist_candidates = fut_watchlist_c.result()

    # Filter out user interactions (watched, rated, loved, etc.)
    loved_candidates = _filter_out_interactions(user_id, loved_candidates)
    rated_candidates = _filter_out_interactions(user_id, rated_candidates)
    liked_candidates = _filter_out_interactions(user_id, liked_candidates)
    watchlist_candidates = _filter_out_interactions(user_id, watchlist_candidates)

    # Cross-section dedup: priority loved > rated > liked > watchlist
    global_seen = set()

    def _pick(candidates, limit):
        picked = []
        for tid in candidates:
            if tid in global_seen:
                continue
            global_seen.add(tid)
            picked.append(tid)
            if len(picked) >= limit:
                break
        return picked

    loved_ids = _pick(loved_candidates, n)
    rated_ids = _pick(rated_candidates, n)
    liked_ids = _pick(liked_candidates, n)
    watchlist_ids = _pick(watchlist_candidates, n)

    def _build_section(seeds, tmdb_ids, label_single, label_plural):
        if not tmdb_ids:
            return {
                "tmdb_ids": [], "items": [], "movies": [],
                "reason": None, "seed_tmdb_id": None, "seed_title": None,
            }
        reason = (
            label_single.format(seeds[0].title) if len(seeds) == 1
            else label_plural
        )
        return {
            "tmdb_ids": tmdb_ids,
            "items": [{"tmdb_id": tid, "reason": reason} for tid in tmdb_ids],
            "reason": reason,
            "seed_tmdb_id": seeds[0].tmdb_id if len(seeds) == 1 else None,
            "seed_title": seeds[0].title if len(seeds) == 1 else None,
        }

    result = {
        "loved": _build_section(loved_seeds, loved_ids,
                                "Because you loved {}", "Based on movies you loved"),
        "rated": _build_section(rated_seeds, rated_ids,
                                "Based on your rating for {}", "Based on movies you rated highly"),
        "liked": _build_section(liked_seeds, liked_ids,
                                "Because you liked {}", "Based on movies you liked"),
        "watchlist": _build_section(watchlist_seeds, watchlist_ids,
                                   "Based on your watchlist: {}", "Based on items in your watchlist"),
    }

    cache.set(cache_key, result, timeout=300)
    return result
