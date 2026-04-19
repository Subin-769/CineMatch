import logging
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.db.models import Avg, Count, Q

from api.models import Movie, Rating, UserMoviePreference, Watchlist

_recommender_module = None


def _recommender():
    global _recommender_module
    if _recommender_module is None:
        from api.recommender import recommend as recommender_module

        _recommender_module = recommender_module
    return _recommender_module


MOOD_GENRE_MAP = {
    "feel-good": ["comedy", "romance", "family"],
    "emotional": ["drama", "romance"],
    "dark": ["crime", "horror", "thriller"],
    "mind-bending": ["sci-fi", "mystery", "thriller"],
    "exciting": ["action", "thriller", "adventure"],
    "relaxed": ["comedy", "family", "romance"],
    "inspiring": ["biography", "drama", "sport"],
}


def search_tmdb_for_person(name: str, role: str = "actor") -> tuple[list, str]:
    """Search TMDB for movies by actor or director name using the tmdb module helpers.
    Returns (list of tmdb_ids, person_name_found)."""
    try:
        from api.tmdb import search_person, get_person_movie_credits

        data = search_person(name, timeout=3)
        results = data.get("results", [])
        if not results:
            return [], name

        person = results[0]
        person_id = person["id"]
        person_name = person.get("name", name)

        credits = get_person_movie_credits(person_id, timeout=3)

        if role == "director":
            movies = credits.get("crew", [])
            movies = [m for m in movies if m.get("job") == "Director"]
        else:
            movies = credits.get("cast", [])

        # Sort by vote_count descending (most popular/well-known first)
        movies = sorted(movies, key=lambda x: x.get("vote_count", 0), reverse=True)
        return [m["id"] for m in movies[:20] if m.get("id")], person_name
    except Exception:
        return [], name


def search_tmdb_for_similar_movie(movie_title: str) -> tuple[list, str]:
    """Search TMDB for movies similar to a given title using multiple sources.
    Returns (deduplicated list of tmdb_ids, resolved movie title)."""
    try:
        from api.tmdb import discover_movies, get_similar_movies, get_recommendations

        search_data = discover_movies(query=movie_title, timeout=3)
        results = search_data.get("results", [])
        if not results:
            return [], movie_title

        movie = results[0]
        movie_id = movie["id"]
        resolved_title = movie.get("title", movie_title)

        # Fetch from multiple sources
        similar_ids = []
        reco_ids = []
        svd_ids = []

        try:
            similar_data = get_similar_movies(movie_id, timeout=3)
            similar_ids = [m["id"] for m in similar_data.get("results", [])[:20] if m.get("id")]
        except Exception:
            pass

        try:
            reco_data = get_recommendations(movie_id, timeout=3)
            reco_ids = [m["id"] for m in reco_data.get("results", [])[:20] if m.get("id")]
        except Exception:
            pass

        # Try local SVD model for content-based similar movies
        try:
            svd_result = _recommender().similar_movies_with_reason(movie_id, n=10)
            svd_ids = svd_result.get("tmdb_ids", []) if isinstance(svd_result, dict) else []
        except Exception:
            pass

        # Merge and deduplicate, prioritizing movies appearing in multiple sources
        from collections import Counter
        all_ids = similar_ids + reco_ids + svd_ids
        id_counts = Counter(all_ids)
        # Sort by frequency (multi-source first), then by order of appearance
        seen = set()
        deduped = []
        # First pass: multi-source movies
        for tmdb_id in all_ids:
            if tmdb_id == movie_id or tmdb_id in seen:
                continue
            if id_counts[tmdb_id] > 1:
                seen.add(tmdb_id)
                deduped.append(tmdb_id)
        # Second pass: single-source movies
        for tmdb_id in all_ids:
            if tmdb_id == movie_id or tmdb_id in seen:
                continue
            seen.add(tmdb_id)
            deduped.append(tmdb_id)

        return deduped[:20], resolved_title
    except Exception:
        return [], movie_title


def _filter_exclude_genres(movies: list, exclude_genres: list) -> list:
    """Remove movies whose genres overlap with excluded genres."""
    if not exclude_genres:
        return movies
    excluded_set = {g.lower() for g in exclude_genres}

    def _is_excluded(movie):
        movie_genres = (movie.get("genres") or "").lower()
        return any(ex in movie_genres for ex in excluded_set)

    return [m for m in movies if not _is_excluded(m)]


def _add_reason(movies: list, reason: str) -> list:
    """Add a reason field to each movie dict if not already set."""
    for movie in movies:
        if not movie.get("reason"):
            movie["reason"] = reason
    return movies


def _normalize_genres(values):
    genres = []
    seen = set()
    for value in values or []:
        genre = str(value).strip().lower()
        if not genre or genre in seen:
            continue
        seen.add(genre)
        genres.append(genre)
    return genres


def _genre_query(genres):
    query = Q()
    for genre in genres:
        query |= Q(genres__icontains=genre)
    return query


def _release_year_from_value(value):
    if value in (None, ""):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _normalize_poster_url(value):
    poster_url = (value or "").strip()
    if poster_url.startswith("/"):
        return f"https://image.tmdb.org/t/p/w500{poster_url}"
    return poster_url


def _serialize_movie(movie):
    rating = getattr(movie, "rating", None)
    if rating is None:
        rating = getattr(movie, "vote_average", None)
    if rating is None:
        rating = getattr(movie, "chatbot_rating", None)
    return {
        "id": movie.id,
        "tmdb_id": movie.tmdb_id,
        "title": movie.title,
        "genres": movie.genres or "",
        "release_year": _release_year_from_value(getattr(movie, "release_year", None)),
        "original_language": getattr(movie, "original_language", "") or "",
        "poster_url": _normalize_poster_url(getattr(movie, "poster_url", "")),
        "rating": float(rating or 0),
    }


def _fetch_tmdb_movie_dicts(tmdb_ids: list) -> list[dict]:
    """Fetch movie details from TMDB in parallel for speed."""
    from api.tmdb import bulk_get_movie_details

    if not tmdb_ids:
        return []

    try:
        hydrated = bulk_get_movie_details(tmdb_ids, timeout=3)
        movies = []
        for m in hydrated:
            if not m or not m.get("id"):
                continue
            movies.append({
                "id": None,
                "tmdb_id": m.get("id"),
                "title": m.get("title", ""),
                "genres": m.get("genre", "Movie"),
                "release_year": m.get("release_year") or (int(m["year"]) if m.get("year", "").isdigit() else 0),
                "original_language": "",
                "poster_url": _normalize_poster_url(m.get("poster_url", "")),
                "rating": float(m.get("rating") or 0),
            })
        return movies
    except Exception:
        return []


def _movie_dict_matches_filters(movie: dict, intent: dict) -> bool:
    genres = _normalize_genres(intent.get("genres"))
    mood_genres = _normalize_genres(MOOD_GENRE_MAP.get(intent.get("mood"), []))
    language = (intent.get("language") or "").strip().lower()
    year_range = intent.get("year_range")
    runtime = intent.get("runtime")

    movie_genres = (movie.get("genres") or "").lower()
    movie_language = (movie.get("original_language") or "").strip().lower()
    movie_year = _release_year_from_value(movie.get("release_year"))

    if genres and not any(genre in movie_genres for genre in genres):
        return False
    if mood_genres and not any(genre in movie_genres for genre in mood_genres):
        return False
    if language and movie_language != language:
        return False
    if year_range:
        if not movie_year:
            return False
        if movie_year < year_range[0] or movie_year > year_range[1]:
            return False
    if runtime and runtime not in {"short", "long"}:
        return False
    return True


def _annotated_queryset(exclude_tmdb_ids):
    return (
        Movie.objects.exclude(tmdb_id__in=exclude_tmdb_ids)
        .annotate(chatbot_rating=Avg("user_ratings__rating"))
    )


def _apply_queryset_filters(queryset, intent):
    genres = _normalize_genres(intent.get("genres"))
    mood_genres = _normalize_genres(MOOD_GENRE_MAP.get(intent.get("mood"), []))
    language = (intent.get("language") or "").strip().lower()
    year_range = intent.get("year_range")

    if genres:
        queryset = queryset.filter(_genre_query(genres))
    if mood_genres:
        queryset = queryset.filter(_genre_query(mood_genres))
    if language:
        queryset = queryset.filter(original_language=language)
    if year_range:
        queryset = queryset.filter(release_year__gte=year_range[0], release_year__lte=year_range[1])
    return queryset


def _shuffle_and_serialize(candidates, n):
    candidates = list(candidates)
    random.shuffle(candidates)
    return [_serialize_movie(movie) for movie in candidates[:n]]


def _shuffle_movie_dicts(movies, n):
    movies = list(movies)
    random.shuffle(movies)
    return movies[:n]


def _seen_ids(history=None, seen_ids=None):
    merged = []
    seen = set()
    for tmdb_id in seen_ids or []:
        try:
            value = int(tmdb_id)
        except (TypeError, ValueError):
            continue
        if value in seen:
            continue
        seen.add(value)
        merged.append(value)

    for item in history or []:
        if item.get("role") != "assistant":
            continue
        for tmdb_id in item.get("movies") or []:
            try:
                value = int(tmdb_id)
            except (TypeError, ValueError):
                continue
            if value in seen:
                continue
            seen.add(value)
            merged.append(value)
    return merged


def _excluded_user_tmdb_ids(user_id):
    if user_id is None:
        return set()

    rated_ids = set(
        Rating.objects.filter(user_id=user_id)
        .values_list("movie__tmdb_id", flat=True)
    )
    watchlist_ids = set(
        Watchlist.objects.filter(user_id=user_id)
        .values_list("movie__tmdb_id", flat=True)
    )
    disliked_ids = set(
        UserMoviePreference.objects.filter(user_id=user_id, preference="dislike")
        .values_list("movie__tmdb_id", flat=True)
    )
    return {int(tmdb_id) for tmdb_id in rated_ids | watchlist_ids | disliked_ids if tmdb_id is not None}


def _user_preferred_genres(user_id):
    """Get genres from user's loved and liked movies for scoring."""
    if user_id is None:
        return set()
    genres = set()
    prefs = UserMoviePreference.objects.filter(
        user_id=user_id, preference__in=("love", "like")
    ).select_related("movie")
    for pref in prefs:
        if pref.movie and pref.movie.genres:
            for g in pref.movie.genres.split(","):
                g = g.strip().lower()
                if g:
                    genres.add(g)
    return genres


def _score_and_sort_movies(movies, user_id):
    """Re-rank movies by how well they match user's preference signals."""
    if not movies or user_id is None:
        return movies
    preferred_genres = _user_preferred_genres(user_id)
    if not preferred_genres:
        return movies

    def _score(movie):
        movie_genres = set(g.strip().lower() for g in (movie.get("genres") or "").split(",") if g.strip())
        genre_overlap = len(movie_genres & preferred_genres)
        rating = float(movie.get("rating") or 0)
        return genre_overlap * 2 + rating * 0.1

    return sorted(movies, key=_score, reverse=True)


def _ranked_personalized_ids(user_id, excluded_ids):
    if user_id is None:
        return []
    tmdb_ids = _recommender().personalized_recommend(user_id, n=50) or []
    if isinstance(tmdb_ids, dict):
        tmdb_ids = tmdb_ids.get("tmdb_ids") or []

    ordered = []
    seen = set()
    for tmdb_id in tmdb_ids:
        try:
            value = int(tmdb_id)
        except (TypeError, ValueError):
            continue
        if value in excluded_ids or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _combined_movies_for_tmdb_ids(tmdb_ids, excluded_ids):
    ordered_ids = []
    seen = set()
    for tmdb_id in tmdb_ids:
        if tmdb_id in excluded_ids or tmdb_id in seen:
            continue
        seen.add(tmdb_id)
        ordered_ids.append(tmdb_id)

    if not ordered_ids:
        return []

    db_movies = {
        movie.tmdb_id: _serialize_movie(movie)
        for movie in Movie.objects.filter(tmdb_id__in=ordered_ids)
    }
    missing_ids = [tmdb_id for tmdb_id in ordered_ids if tmdb_id not in db_movies]
    tmdb_movies = {
        movie["tmdb_id"]: movie
        for movie in _fetch_tmdb_movie_dicts(missing_ids)
        if movie.get("tmdb_id")
    }

    combined = []
    for tmdb_id in ordered_ids:
        if tmdb_id in db_movies:
            combined.append(db_movies[tmdb_id])
        elif tmdb_id in tmdb_movies:
            combined.append(tmdb_movies[tmdb_id])
    return combined


def _search_tmdb_award_winners(excluded_ids, n):
    """Fetch critically acclaimed / award-caliber movies from TMDB discover.
    Uses high vote_average + high vote_count as proxy for award-worthy films."""
    try:
        from api.tmdb import discover_movies
        # Fetch highly-rated, well-known movies (vote_average >= 8.0, vote_count >= 1000)
        data = discover_movies(
            sort_by="vote_average.desc",
            vote_count_gte="1000",
            timeout=3,
        )
        results = data.get("results", [])
        tmdb_ids = [m["id"] for m in results if m.get("id") and m["id"] not in excluded_ids]
        if tmdb_ids:
            return _combined_movies_for_tmdb_ids(tmdb_ids[:20], excluded_ids)
    except Exception:
        pass
    return []


def _search_tmdb_date_night(excluded_ids, n):
    """Fetch romantic/feel-good movies from TMDB discover for date night."""
    try:
        from api.tmdb import discover_movies
        # TMDB genre ID 10749 = Romance, 35 = Comedy
        data = discover_movies(
            sort_by="vote_average.desc",
            with_genres="10749,35",
            vote_count_gte="500",
            timeout=3,
        )
        results = data.get("results", [])
        tmdb_ids = [m["id"] for m in results if m.get("id") and m["id"] not in excluded_ids]
        if tmdb_ids:
            return _combined_movies_for_tmdb_ids(tmdb_ids[:20], excluded_ids)
    except Exception:
        pass
    return []


def _special_results(intent, excluded_ids, n, user_id=None):
    special = intent.get("special")
    if special == "hidden_gems":
        candidates = _annotated_queryset(excluded_ids).filter(
            chatbot_rating__gte=7.0,
            user_ratings__isnull=False,
        )[:30]
        results = _shuffle_and_serialize(candidates, n * 2)
        return _score_and_sort_movies(results, user_id)[:n]

    if special == "award_winning":
        # Try TMDB discover first for truly acclaimed movies
        tmdb_results = _search_tmdb_award_winners(excluded_ids, n)
        if tmdb_results:
            results = _score_and_sort_movies(tmdb_results, user_id)
            random.shuffle(results[:n * 2])
            return results[:n]
        # Fallback to local DB
        results = [
            _serialize_movie(movie)
            for movie in (
                _annotated_queryset(excluded_ids)
                .filter(chatbot_rating__gte=7.5)
                .order_by("-chatbot_rating", "title")[:n * 2]
            )
        ]
        return _score_and_sort_movies(results, user_id)[:n]

    if special == "date_night":
        # Try TMDB discover for romantic/feel-good movies
        tmdb_results = _search_tmdb_date_night(excluded_ids, n)
        if tmdb_results:
            results = _score_and_sort_movies(tmdb_results, user_id)
            random.shuffle(results[:n * 2])
            return results[:n]
        return []

    if special == "classic":
        results = [
            _serialize_movie(movie)
            for movie in (
                _annotated_queryset(excluded_ids)
                .filter(release_year__gte=1970, release_year__lte=2000, chatbot_rating__gte=7.0)
                .order_by("-chatbot_rating", "title")[:n * 2]
            )
        ]
        return _score_and_sort_movies(results, user_id)[:n]

    if special == "surprise":
        # Mix personalized + high-rated for a surprising but relevant selection
        personalized_ids = _ranked_personalized_ids(user_id, excluded_ids)
        if personalized_ids:
            results = _combined_movies_for_tmdb_ids(personalized_ids[:20], excluded_ids)
            random.shuffle(results)
            return results[:n]
        candidates = _annotated_queryset(excluded_ids).filter(
            chatbot_rating__gte=6.5,
        )[:30]
        return _shuffle_and_serialize(candidates, n)

    return []


def _search_tmdb_by_language(language, excluded_ids, n, genres=None):
    """Search TMDB discover for movies in a specific language."""
    try:
        from api.tmdb import discover_movies

        # TMDB genre name -> ID mapping for discover API
        TMDB_GENRE_IDS = {
            "action": 28, "adventure": 12, "animation": 16, "comedy": 35,
            "crime": 80, "documentary": 99, "drama": 18, "family": 10751,
            "fantasy": 14, "horror": 27, "mystery": 9648, "romance": 10749,
            "sci-fi": 878, "thriller": 53, "war": 10752, "western": 37,
            "music": 10402, "history": 36,
        }

        genre_ids = ""
        if genres:
            ids = [str(TMDB_GENRE_IDS[g]) for g in genres if g in TMDB_GENRE_IDS]
            genre_ids = ",".join(ids)

        data = discover_movies(
            sort_by="vote_average.desc",
            with_original_language=language,
            with_genres=genre_ids,
            vote_count_gte="50",
            timeout=3,
        )
        results = data.get("results", [])
        tmdb_ids = [m["id"] for m in results if m.get("id") and m["id"] not in excluded_ids]
        if tmdb_ids:
            return _combined_movies_for_tmdb_ids(tmdb_ids[:20], excluded_ids)
    except Exception:
        pass
    return []


def _language_hard_filter(intent, excluded_ids, n):
    language = (intent.get("language") or "").strip().lower()
    if not language:
        return []

    genres = _normalize_genres(intent.get("genres"))

    lang_movies = _annotated_queryset(excluded_ids).filter(original_language=language).order_by("-chatbot_rating", "title")[:50]
    candidates = list(lang_movies)

    if genres:
        for genre in genres:
            filtered = [movie for movie in candidates if genre in (movie.genres or "").lower()]
            if len(filtered) >= 3:
                candidates = filtered
                break

    if candidates:
        random.shuffle(candidates)
        return [_serialize_movie(movie) for movie in candidates[:n]]

    # Fallback: search TMDB discover for movies in this language
    tmdb_results = _search_tmdb_by_language(language, excluded_ids, n, genres=genres)
    if tmdb_results:
        return tmdb_results

    return []


def _genre_db_fallback(intent, excluded_ids, n):
    queryset = _annotated_queryset(excluded_ids)
    queryset = _apply_queryset_filters(queryset, intent)
    return [_serialize_movie(movie) for movie in queryset.order_by("-chatbot_rating", "title")[:n]]


def _guaranteed_fallback(excluded_ids, n):
    candidates = (
        _annotated_queryset(excluded_ids)
        .only("id", "tmdb_id", "title", "genres", "poster_url", "release_year", "original_language")[:50]
    )
    candidates = list(candidates)
    random.shuffle(candidates)
    return [_serialize_movie(movie) for movie in candidates[:n]]


def query_movies(intent: dict, user_id=None, n=8, seen_ids=None, history=None) -> list[dict]:
    try:
        n = max(int(n or 8), 1)
        exclude_seen = set(_seen_ids(history=history, seen_ids=seen_ids or []))
        excluded_ids = exclude_seen | _excluded_user_tmdb_ids(user_id)
        exclude_genres = intent.get("exclude_genres") or []

        special = intent.get("special")
        special_results = _special_results(intent, excluded_ids, n, user_id=user_id)
        if special_results:
            reason_map = {
                "hidden_gems": "Hidden gem with great ratings",
                "award_winning": "Award-worthy critically acclaimed film",
                "date_night": "Perfect for a romantic evening",
                "classic": "Timeless classic",
                "surprise": "A surprise pick just for you",
            }
            _add_reason(special_results, reason_map.get(special, "Recommended for you"))
            return _filter_exclude_genres(special_results, exclude_genres)[:n]

        actor = intent.get("actor")
        if actor:
            tmdb_ids, person_name = search_tmdb_for_person(actor, "actor")
            results = _combined_movies_for_tmdb_ids(tmdb_ids, excluded_ids)
            if results:
                results = _score_and_sort_movies(results, user_id)
                _add_reason(results, f"Stars {person_name}")
                return _filter_exclude_genres(results, exclude_genres)[:n]

        director = intent.get("director")
        if director:
            tmdb_ids, person_name = search_tmdb_for_person(director, "director")
            results = _combined_movies_for_tmdb_ids(tmdb_ids, excluded_ids)
            if results:
                results = _score_and_sort_movies(results, user_id)
                _add_reason(results, f"Directed by {person_name}")
                return _filter_exclude_genres(results, exclude_genres)[:n]

        similar_to_movie = intent.get("similar_to_movie")
        if similar_to_movie:
            similar_ids, resolved_title = search_tmdb_for_similar_movie(similar_to_movie)
            personalized_ids = _ranked_personalized_ids(user_id, excluded_ids)
            # Prioritize movies that are both similar AND in personalized list
            similar_set = set(similar_ids)
            ranked = [tmdb_id for tmdb_id in personalized_ids if tmdb_id in similar_set]
            # Then add remaining similar movies
            ranked_set = set(ranked)
            for tmdb_id in similar_ids:
                if tmdb_id not in ranked_set:
                    ranked.append(tmdb_id)
            results = _combined_movies_for_tmdb_ids(ranked, excluded_ids)
            if results:
                results = _score_and_sort_movies(results, user_id)
                _add_reason(results, f"Because you liked {resolved_title}")
                return _filter_exclude_genres(results, exclude_genres)[:n]

        language_results = _language_hard_filter(intent, excluded_ids, n * 2)
        if language_results:
            lang = (intent.get("language") or "").upper()
            _add_reason(language_results, f"Matches your {lang} language preference" if lang else "Matches your language preference")
            results = _score_and_sort_movies(language_results, user_id)
            return _filter_exclude_genres(results, exclude_genres)[:n]

        personalized_ids = _ranked_personalized_ids(user_id, excluded_ids)
        if personalized_ids:
            personalized_movies = _combined_movies_for_tmdb_ids(personalized_ids, excluded_ids)
            filtered = [movie for movie in personalized_movies if _movie_dict_matches_filters(movie, intent)]
            if len(filtered) >= 3:
                _add_reason(filtered, "Personalized pick based on your taste")
                return _filter_exclude_genres(filtered, exclude_genres)[:n]

            if intent.get("genres") or intent.get("language"):
                direct = _genre_db_fallback(intent, excluded_ids, n)
                if direct:
                    genre_label = ", ".join(intent.get("genres") or []).title() or "your preferences"
                    _add_reason(direct, f"Matches {genre_label}")
                    return _filter_exclude_genres(direct, exclude_genres)[:n]

            if not any(intent.get(key) for key in ("genres", "language", "mood", "year_range", "special")):
                _add_reason(personalized_movies, "Personalized pick based on your taste")
                return _filter_exclude_genres(_shuffle_movie_dicts(personalized_movies, n), exclude_genres)

        mood = intent.get("mood")
        direct = _genre_db_fallback(intent, excluded_ids, n)
        if direct:
            if mood:
                _add_reason(direct, f"Matches your {mood} mood")
            else:
                genre_label = ", ".join(intent.get("genres") or []).title()
                _add_reason(direct, f"Matches {genre_label}" if genre_label else "Recommended for you")
            return _filter_exclude_genres(direct, exclude_genres)[:n]

        fallback = _guaranteed_fallback(excluded_ids, n)
        _add_reason(fallback, "Recommended for you")
        return _filter_exclude_genres(fallback, exclude_genres)
    except Exception as e:
        logging.getLogger(__name__).error("query_movies error: %s", e, exc_info=True)
        return [
            _serialize_movie(movie)
            for movie in Movie.objects.all().only(
                "id",
                "tmdb_id",
                "title",
                "genres",
                "poster_url",
                "release_year",
                "original_language",
            )[:8]
        ]
