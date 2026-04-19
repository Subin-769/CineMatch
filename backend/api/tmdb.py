import hashlib
import json
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from django.conf import settings
from django.core.cache import cache

BASE_URL = "https://api.themoviedb.org/3"

# Global TMDB response cache. Identical (endpoint, params) → identical response,
# so caching here once replaces dozens of ad-hoc caches scattered through the
# recommender. 1h TTL — movie metadata changes slowly.
_TMDB_CACHE_TTL = 3600
_TMDB_NEGATIVE_CACHE_TTL = 60  # short TTL for 404 / empty so they self-heal


def _tmdb_cache_key(endpoint: str, params: dict) -> str:
    # Stable key: params sorted + JSON-encoded + hashed. Includes the endpoint.
    payload = json.dumps(params or {}, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha1(f"{endpoint}|{payload}".encode("utf-8")).hexdigest()[:16]
    return f"tmdb_raw:{digest}"


def tmdb_get(
    endpoint: str,
    params: dict | None = None,
    timeout: int | float = 1.5,
    cache_ttl: int | None = None,
):
    """Generic TMDB GET helper with universal response caching.

    Caches every successful (and 404/empty) response keyed by endpoint+params
    for cache_ttl seconds (default 1h). Subsequent identical queries return
    from cache without a network round-trip.

    Priority:
    1) TMDB_READ_TOKEN (Bearer)
    2) TMDB_API_KEY (v3 API key)
    """

    q = dict(params or {})
    # Strip the api_key from the cache key so tokens swapping via env don't
    # invalidate cache. Cache key depends on what TMDB actually serves.
    cache_params = {k: v for k, v in q.items() if k != "api_key"}
    key = _tmdb_cache_key(endpoint, cache_params)

    cached = cache.get(key)
    if cached is not None:
        return cached

    token = (getattr(settings, "TMDB_READ_TOKEN", "") or "").strip()
    api_key = (getattr(settings, "TMDB_API_KEY", "") or "").strip()

    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    elif api_key:
        q.setdefault("api_key", api_key)
    else:
        raise RuntimeError(
            "TMDB credentials missing. Set TMDB_READ_TOKEN (recommended) "
            "or TMDB_API_KEY in backend/.env"
        )

    try:
        response = requests.get(
            f"{BASE_URL}{endpoint}",
            headers=headers,
            params=q,
            timeout=timeout,
        )
    except requests.RequestException:
        # Network failure / timeout — briefly cache an empty result so we don't
        # hammer a downed TMDB on every request. The short TTL lets it recover.
        cache.set(key, {}, timeout=_TMDB_NEGATIVE_CACHE_TTL)
        return {}

    if response.status_code == 404:
        cache.set(key, {}, timeout=_TMDB_NEGATIVE_CACHE_TTL)
        return {}

    try:
        response.raise_for_status()
    except requests.HTTPError:
        cache.set(key, {}, timeout=_TMDB_NEGATIVE_CACHE_TTL)
        return {}

    try:
        data = response.json()
    except ValueError:
        cache.set(key, {}, timeout=_TMDB_NEGATIVE_CACHE_TTL)
        return {}

    ttl = cache_ttl if cache_ttl is not None else _TMDB_CACHE_TTL
    cache.set(key, data, timeout=ttl)
    return data


def get_trending_movies(timeout: int | float = 1.5):
    return tmdb_get("/trending/movie/week", timeout=timeout)


def get_movie_details(tmdb_id: int, timeout: int | float = 1.5):
    return tmdb_get(f"/movie/{tmdb_id}", params={"language": "en-US"}, timeout=timeout)


def get_movie_credits(tmdb_id: int, timeout: int | float = 1.5):
    return tmdb_get(f"/movie/{tmdb_id}/credits", params={"language": "en-US"}, timeout=timeout)


def get_similar_movies(tmdb_id: int, timeout: int | float = 1.5):
    return tmdb_get(
        f"/movie/{tmdb_id}/similar",
        params={"language": "en-US", "page": 1},
        timeout=timeout,
    )


def get_recommendations(tmdb_id: int, timeout: int | float = 1.5):
    return tmdb_get(
        f"/movie/{tmdb_id}/recommendations",
        params={"language": "en-US", "page": 1},
        timeout=timeout,
    )


def get_movie_keywords(tmdb_id: int, timeout: int | float = 1.5):
    return tmdb_get(f"/movie/{tmdb_id}/keywords", timeout=timeout)


def get_movie_videos(tmdb_id: int, timeout: int | float = 1.5):
    return tmdb_get(f"/movie/{tmdb_id}/videos", params={"language": "en-US"}, timeout=timeout)


def search_person(query: str, timeout: int | float = 1.5):
    """Search TMDB for a person (actor/director) by name."""
    return tmdb_get("/search/person", params={"language": "en-US", "query": query}, timeout=timeout)


def get_person_movie_credits(person_id: int, timeout: int | float = 1.5):
    """Get movie credits for a person by their TMDB person ID."""
    return tmdb_get(f"/person/{person_id}/movie_credits", params={"language": "en-US"}, timeout=timeout)


def discover_movies(
    page: int = 1,
    sort_by: str = "popularity.desc",
    with_genres: str = "",
    primary_release_year: str = "",
    query: str = "",
    with_original_language: str = "",
    region: str = "",
    vote_count_gte: str = "",
    release_date_gte: str = "",
    release_date_lte: str = "",
    timeout: int | float = 2,
):
    page = int(page or 1)

    if query and str(query).strip():
        q = {
            "language": "en-US",
            "page": page,
            "query": str(query).strip(),
            "include_adult": False,
        }
        if region:
            q["region"] = region
        return tmdb_get("/search/movie", params=q, timeout=timeout)

    q = {
        "language": "en-US",
        "sort_by": sort_by,
        "include_adult": False,
        "include_video": False,
        "page": page,
    }

    if with_genres:
        q["with_genres"] = with_genres
    if primary_release_year:
        q["primary_release_year"] = primary_release_year
    if with_original_language:
        q["with_original_language"] = with_original_language
    if region:
        q["region"] = region
    if vote_count_gte:
        q["vote_count.gte"] = vote_count_gte
    if release_date_gte:
        q["primary_release_date.gte"] = release_date_gte
    if release_date_lte:
        q["primary_release_date.lte"] = release_date_lte

    return tmdb_get("/discover/movie", params=q, timeout=timeout)


def _format_movie_obj(data):
    """Convert raw TMDB movie data dict to a standardized card-friendly dict."""
    if not data or not data.get("id"):
        return None
    poster_path = data.get("poster_path")
    backdrop_path = data.get("backdrop_path")
    release_date = data.get("release_date") or ""
    year = release_date[:4] if len(release_date) >= 4 else ""
    return {
        "id": data["id"],
        "title": data.get("title") or data.get("name") or "Untitled",
        "overview": data.get("overview") or "",
        "poster_url": f"https://image.tmdb.org/t/p/w342{poster_path}" if poster_path else None,
        "backdrop_url": f"https://image.tmdb.org/t/p/w780{backdrop_path}" if backdrop_path else None,
        "rating": round(float(data.get("vote_average") or 0), 1),
        "year": year,
        "release_year": int(year) if year.isdigit() else None,
        "genre": "Movie",
    }


def bulk_get_movie_details(tmdb_ids, timeout=1.5):
    """Fetch movie details for a list of TMDB IDs efficiently.

    1. Check Django cache for each ID.
    2. Check local Movie table for remaining IDs.
    3. Fetch remaining from TMDB in parallel (max 5 workers).
    4. Cache all results for 1 hour.

    Returns a list of formatted movie dicts (preserving input order).
    """
    from .models import Movie  # avoid circular import at module level

    if not tmdb_ids:
        return []

    unique_ids = list(dict.fromkeys(tmdb_ids))  # dedupe, preserve order
    results = {}

    # --- 1. Cache lookup ---
    cache_keys = {tid: f"tmdb_movie_{tid}" for tid in unique_ids}
    cached = cache.get_many(list(cache_keys.values()))
    # Reverse map: cache_key -> tmdb_id
    key_to_id = {v: k for k, v in cache_keys.items()}
    for ckey, cval in cached.items():
        tid = key_to_id.get(ckey)
        if tid and cval:
            results[tid] = cval

    remaining = [tid for tid in unique_ids if tid not in results]

    # --- 2. Local DB lookup ---
    if remaining:
        local_movies = Movie.objects.filter(tmdb_id__in=remaining, poster_url__gt="")
        for m in local_movies:
            obj = {
                "id": m.tmdb_id,
                "title": m.title,
                "overview": m.overview or "",
                "poster_url": m.poster_url,
                "backdrop_url": None,
                "rating": None,
                "year": str(m.release_year) if m.release_year else "",
                "release_year": m.release_year,
                "genre": "Movie",
            }
            results[m.tmdb_id] = obj
        remaining = [tid for tid in remaining if tid not in results]

    # --- 3. Parallel TMDB fetch for remaining ---
    if remaining:
        def _fetch_one(tid):
            try:
                data = get_movie_details(tid, timeout=timeout)
                return tid, _format_movie_obj(data)
            except Exception:
                return tid, None

        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(_fetch_one, tid): tid for tid in remaining}
            for future in as_completed(futures):
                tid, obj = future.result()
                if obj:
                    results[tid] = obj

    # --- 4. Cache all results ---
    to_cache = {}
    for tid, obj in results.items():
        if obj:
            to_cache[cache_keys[tid]] = obj
    if to_cache:
        cache.set_many(to_cache, timeout=3600)

    # Return in original order
    return [results[tid] for tid in tmdb_ids if tid in results]
