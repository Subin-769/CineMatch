import axios from "axios";
import api from "./api";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_342 = "https://image.tmdb.org/t/p/w342";
const TMDB_IMG_780 = "https://image.tmdb.org/t/p/w780";

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_READ_TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN;

// Simple in-memory cache to avoid duplicate network requests within the same page load
const _cache = new Map();
const CACHE_TTL = 60_000; // 1 minute

function cachedFetch(key, fetcher) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return Promise.resolve(entry.data);
  }
  // Deduplicate in-flight requests
  if (entry?.promise) return entry.promise;
  const promise = fetcher().then((data) => {
    _cache.set(key, { data, ts: Date.now() });
    return data;
  }).catch((err) => {
    _cache.delete(key);
    throw err;
  });
  _cache.set(key, { promise, ts: Date.now() });
  return promise;
}

export function invalidateRecommendationCache(prefixes = []) {
  if (!Array.isArray(prefixes) || !prefixes.length) return;
  for (const key of _cache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      _cache.delete(key);
    }
  }
}

const tmdb = axios.create({
  baseURL: TMDB_BASE,
});

if (TMDB_READ_TOKEN) {
  tmdb.defaults.headers.common.Authorization = `Bearer ${TMDB_READ_TOKEN}`;
}

function hasClientTmdbAuth() {
  return Boolean(TMDB_READ_TOKEN || TMDB_API_KEY);
}

function tmdbParams(extra = {}) {
  const params = { language: "en-US", ...extra };
  if (!TMDB_READ_TOKEN && TMDB_API_KEY) {
    params.api_key = TMDB_API_KEY;
  }
  return params;
}

function mapTmdbMovieToCard(m) {
  const year = m.release_date ? m.release_date.slice(0, 4) : "";
  const rating =
    typeof m.vote_average === "number" ? Number(m.vote_average.toFixed(1)) : null;

  return {
    id: m.id,
    title: m.title || m.name || "Untitled",
    description: m.overview || "",
    year,
    release_year: year ? Number(year) : 0,
    genre: "Movie",
    duration: "",
    rating,
    poster_url: m.poster_path ? `${TMDB_IMG_342}${m.poster_path}` : "/placeholder.svg",
    backdrop_url: m.backdrop_path ? `${TMDB_IMG_780}${m.backdrop_path}` : "",
  };
}

function normalizeBackendMovie(m) {
  if (!m || typeof m !== "object") return null;
  const year = m.year || (m.release_date ? m.release_date.slice(0, 4) : "");
  const rating =
    typeof m.rating === "number"
      ? m.rating
      : typeof m.vote_average === "number"
        ? Number(m.vote_average.toFixed(1))
        : null;

  return {
    id: m.id || m.tmdb_id,
    title: m.title || m.name || "Untitled",
    description: m.description || m.overview || "",
    year,
    release_year: m.release_year || (year ? Number(year) : 0),
    genre: m.genre || "Movie",
    duration: m.duration || "",
    rating,
    poster_url:
      m.poster_url ||
      (m.poster_path ? `${TMDB_IMG_342}${m.poster_path}` : "/placeholder.svg"),
    backdrop_url:
      m.backdrop_url ||
      (m.backdrop_path ? `${TMDB_IMG_780}${m.backdrop_path}` : ""),
  };
}

// ---------------------------------------------------------------------------
// Hydration helpers
// ---------------------------------------------------------------------------

/**
 * If the API response contains a pre-hydrated `movies` array with objects that
 * have a title and poster info, normalise and return them directly.
 * Otherwise fall back to bulk endpoint or individual TMDB fetches.
 */
function extractHydratedMovies(data, limit = 12) {
  const movies = data?.movies;
  if (Array.isArray(movies) && movies.length && typeof movies[0] === "object" && movies[0].title) {
    return movies.slice(0, limit).map(normalizeBackendMovie).filter(Boolean);
  }
  return null;
}

function sanitizeIds(ids) {
  return (ids || []).filter((id) => typeof id === "number" && Number.isFinite(id));
}

async function fetchTmdbMoviesBulk(ids, limit = 12) {
  const uniqueIds = Array.from(new Set(sanitizeIds(ids))).slice(0, limit);
  if (!uniqueIds.length) return [];
  try {
    const res = await api.get("/tmdb/bulk/", { params: { ids: uniqueIds.join(",") } });
    const movies = res.data?.movies || [];
    return movies.map(normalizeBackendMovie).filter(Boolean);
  } catch {
    // Fall back to individual fetches with sanitized IDs
    return fetchTmdbMovies(uniqueIds, limit);
  }
}

async function fetchTmdbMovie(tmdbId) {
  if (typeof tmdbId !== "number" || !Number.isFinite(tmdbId)) return null;
  if (hasClientTmdbAuth()) {
    const res = await tmdb.get(`/movie/${tmdbId}`, { params: tmdbParams() });
    return res.data && res.data.id ? res.data : null;
  }
  const res = await api.get(`/tmdb/movie/${tmdbId}/`);
  return res.data && res.data.id ? res.data : null;
}

async function fetchTmdbMovies(ids, limit = 12) {
  const uniqueIds = Array.from(new Set(sanitizeIds(ids))).slice(0, limit);
  const results = await Promise.allSettled(uniqueIds.map((id) => fetchTmdbMovie(id)));
  return results
    .filter((r) => r.status === "fulfilled" && r.value && r.value.id)
    .map((r) => mapTmdbMovieToCard(r.value));
}

/**
 * Smart hydration: prefer pre-hydrated movies array, then bulk endpoint, then N+1.
 */
async function hydrateFromResponse(data, limit = 12) {
  const hydrated = extractHydratedMovies(data, limit);
  if (hydrated) return hydrated;

  const ids = data?.tmdb_ids || [];
  if (!ids.length) return [];
  return fetchTmdbMoviesBulk(ids, limit);
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

export async function fetchPersonalizedMovies(n = 10) {
  const res = await api.get("/recs/personalized/", { params: { n } });
  const data = res.data;
  let movies = extractHydratedMovies(data, n) || [];
  if (!movies.length) {
    const ids = sanitizeIds(data?.tmdb_ids);
    if (ids.length) movies = await fetchTmdbMoviesBulk(ids, n);
  }
  const reason = data?.reason || "Based on your likes, ratings, and watchlist";
  return {
    movies,
    reason,
    items: data?.items || [],
    seed_title: data?.seed_title || null,
    seed_tmdb_id: data?.seed_tmdb_id || null,
  };
}

export async function fetchRecommendedForYou(userId, n = 6) {
  if (!userId) {
    return { movies: [], explanation: null, meta: null };
  }
  return cachedFetch(`rfy_${userId}_${n}`, async () => {
    const res = await api.get("/recs/recommended_for_you/", {
      params: { user_id: userId, n },
    });
    const data = res.data;
    let explanation = data?.explanation || null;
    let meta = data?.meta || null;

    // Prefer pre-hydrated movies from the backend (avoids N+1 TMDB fetches)
    let movies = extractHydratedMovies(data, n) || [];

    // Only fall back to client-side hydration if backend didn't return pre-hydrated movies
    if (!movies.length) {
      const ids = sanitizeIds(data?.tmdb_ids);
      if (ids.length) {
        movies = await fetchTmdbMoviesBulk(ids, n);
      }
    }

    if (!movies.length) {
      const fallback = await fetchPersonalizedMovies(n);
      movies = fallback.movies || [];
      explanation =
        explanation ||
        (fallback.reason ? { reason_text: fallback.reason } : null);
    }

    return { movies, explanation, meta };
  });
}

export async function logRecommendationTiming(payload) {
  const res = await api.post("/recs/log-timing/", payload);
  return res.data;
}

export async function fetchSimilarMovies(tmdbId, n = 10) {
  if (!tmdbId) return [];
  const res = await api.get(`/recs/similar/${tmdbId}/`, { params: { n } });
  const data = res.data;
  let movies = extractHydratedMovies(data, n) || [];
  if (!movies.length) {
    const ids = sanitizeIds(data?.tmdb_ids);
    if (ids.length) movies = await fetchTmdbMoviesBulk(ids, n);
  }
  return {
    movies,
    reason: data?.reason || "Because you watched this",
    seed_title: data?.seed_title || null,
    seed_tmdb_id: data?.seed_tmdb_id || tmdbId,
  };
}

export async function fetchLastWatchedTmdbId() {
  const res = await api.get("/watch-history/last/");
  return {
    tmdb_id: res.data?.tmdb_id || null,
    title: res.data?.title || null,
  };
}

export async function fetchTrendingMovies(n = 10) {
  return cachedFetch(`trending_${n}`, async () => {
    const res = await api.get("/recs/trending/");
    const data = res.data;

    if (Array.isArray(data)) {
      if (data.length && typeof data[0] === "object") {
        const normalized = data.map(normalizeBackendMovie).filter(Boolean);
        return normalized.slice(0, n);
      }
      return fetchTmdbMoviesBulk(data, n);
    }

    const ids = data?.tmdb_ids || data?.results?.map((m) => m?.id).filter(Boolean) || [];
    if (ids.length) {
      return fetchTmdbMoviesBulk(ids, n);
    }

    return [];
  });
}

export async function fetchSurpriseMovie(exclude = []) {
  const params = { n: 4 };
  if (exclude.length) {
    params.exclude = exclude.join(",");
  }
  const res = await api.get("/recs/surprise/", { params });
  const data = res.data;
  const items = data?.items || [];
  const reason = data?.reason || "Recommended for you";
  let movies = extractHydratedMovies(data, 4) || [];
  if (!movies.length) {
    const ids = sanitizeIds(data?.tmdb_ids);
    if (ids.length) movies = await fetchTmdbMoviesBulk(ids, 4);
  }
  const reasonMap = new Map(items.map((item) => [item.tmdb_id, item.reason]));
  const withReasons = movies.map((movie) => ({
    ...movie,
    reason: reasonMap.get(movie.id) || reason,
  }));
  return { movies: withReasons, reason };
}

export async function fetchBatchedPersonalized(userId, n = 12) {
  if (!userId) {
    return {
      loved: { movies: [], reason: null, seed_title: null, seed_tmdb_id: null, fallback: false },
      liked: { movies: [], reason: null, seed_title: null, seed_tmdb_id: null, fallback: false },
      rated: { movies: [], reason: null, seed_title: null, seed_tmdb_id: null, fallback: false },
      watchlist: { movies: [], reason: null, seed_title: null, seed_tmdb_id: null, fallback: false },
    };
  }
  return cachedFetch(`batched_normalized_${userId}_${n}`, async () => {
    const res = await api.get("/recs/batched/", { params: { n } });
    const data = res.data;

    function normalizeSection(section) {
      const movies = (section?.movies || []).map(normalizeBackendMovie).filter(Boolean);
      return {
        movies,
        reason: section?.reason || null,
        seed_title: section?.seed_title || null,
        seed_tmdb_id: section?.seed_tmdb_id || null,
        fallback: section?.fallback || false,
      };
    }

    return {
      loved: normalizeSection(data?.loved),
      liked: normalizeSection(data?.liked),
      rated: normalizeSection(data?.rated),
      watchlist: normalizeSection(data?.watchlist),
    };
  });
}

export async function fetchLovedMovies(n = 10) {
  const res = await api.get("/recs/loved/", { params: { n } });
  const data = res.data;
  let movies = extractHydratedMovies(data, n) || [];
  if (!movies.length) {
    const ids = sanitizeIds(data?.tmdb_ids);
    if (ids.length) movies = await fetchTmdbMoviesBulk(ids, n);
  }
  return {
    movies,
    reason: data?.reason || null,
    seed_title: data?.seed_title || null,
    seed_tmdb_id: data?.seed_tmdb_id || null,
    fallback: data?.fallback || false,
  };
}

export async function fetchLikedMovies(n = 10) {
  const res = await api.get("/recs/liked/", { params: { n } });
  const data = res.data;
  let movies = extractHydratedMovies(data, n) || [];
  if (!movies.length) {
    const ids = sanitizeIds(data?.tmdb_ids);
    if (ids.length) movies = await fetchTmdbMoviesBulk(ids, n);
  }
  return {
    movies,
    reason: data?.reason || null,
    seed_title: data?.seed_title || null,
    seed_tmdb_id: data?.seed_tmdb_id || null,
    fallback: data?.fallback || false,
  };
}

export async function fetchRatedMovies(n = 10) {
  const res = await api.get("/recs/rated/", { params: { n } });
  const data = res.data;
  let movies = extractHydratedMovies(data, n) || [];
  if (!movies.length) {
    const ids = sanitizeIds(data?.tmdb_ids);
    if (ids.length) movies = await fetchTmdbMoviesBulk(ids, n);
  }
  return {
    movies,
    reason: data?.reason || null,
    seed_title: data?.seed_title || null,
    seed_tmdb_id: data?.seed_tmdb_id || null,
    fallback: data?.fallback || false,
  };
}

export async function fetchWatchlistMovies(n = 10) {
  const res = await api.get("/recs/watchlist/", { params: { n } });
  const data = res.data;
  let movies = extractHydratedMovies(data, n) || [];
  if (!movies.length) {
    const ids = sanitizeIds(data?.tmdb_ids);
    if (ids.length) movies = await fetchTmdbMoviesBulk(ids, n);
  }
  return {
    movies,
    reason: data?.reason || null,
    seed_title: data?.seed_title || null,
    seed_tmdb_id: data?.seed_tmdb_id || null,
    fallback: data?.fallback || false,
  };
}

export async function fetchFavoriteGenres(n = 3) {
  const res = await api.get("/recs/genres/", { params: { n } });
  return res.data?.genre_ids || [];
}

export async function fetchDiscoverByGenre(genreId, sortBy = "popularity.desc") {
  const res = await api.get("/tmdb/discover/", {
    params: { with_genres: String(genreId), sort_by: sortBy },
  });
  const data = res.data;
  const list = Array.isArray(data?.results) ? data.results : [];
  return list.map((m) => (m?.poster_url || m?.backdrop_url ? normalizeBackendMovie(m) : mapTmdbMovieToCard(m))).filter(Boolean);
}

export async function fetchCriticallyAcclaimed() {
  return cachedFetch("critically_acclaimed", async () => {
    const res = await api.get("/tmdb/discover/", {
      params: { sort_by: "vote_average.desc", "vote_count.gte": 2000 },
    });
    const data = res.data;
    const list = Array.isArray(data?.results) ? data.results : [];
    return list.map((m) => (m?.poster_url || m?.backdrop_url ? normalizeBackendMovie(m) : mapTmdbMovieToCard(m))).filter(Boolean);
  });
}

export async function fetchNewReleases(n = 12) {
  return cachedFetch(`new_releases_${n}`, async () => {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 120);
    const release_date_gte = start.toISOString().slice(0, 10);
    const release_date_lte = now.toISOString().slice(0, 10);
    const res = await api.get("/tmdb/discover/", {
      params: {
        sort_by: "primary_release_date.desc",
        release_date_gte,
        release_date_lte,
      },
    });
    const data = res.data;
    const list = Array.isArray(data?.results) ? data.results : [];
    const withPosters = list.filter(
      (m) => m?.poster_url || m?.backdrop_url || m?.poster_path || m?.backdrop_path
    );
    return withPosters
      .slice(0, n)
      .map((m) => (m?.poster_url || m?.backdrop_url ? normalizeBackendMovie(m) : mapTmdbMovieToCard(m)))
      .filter(Boolean);
  });
}

export async function fetchGuestRecommendations(n = 12) {
  try {
    const trending = await fetchTrendingMovies(n);
    if (trending.length) {
      return trending;
    }
  } catch {
    // Fall back to discover if trending is unavailable.
  }

  const res = await api.get("/tmdb/discover/", {
    params: { sort_by: "popularity.desc", vote_count_gte: 500 },
  });
  const data = res.data;
  const list = Array.isArray(data?.results) ? data.results : [];
  return list
    .slice(0, n)
    .map((m) => (m?.poster_url || m?.backdrop_url ? normalizeBackendMovie(m) : mapTmdbMovieToCard(m)))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// New section fetchers
// ---------------------------------------------------------------------------

export async function fetchTrendingInGenre(userId) {
  if (!userId) {
    return { movies: [], genre_name: null };
  }
  return cachedFetch(`trending_in_genre_${userId}`, async () => {
    const res = await api.get("/recs/trending-genre/");
    const data = res.data;
    const movies = (data?.movies || []).map(normalizeBackendMovie).filter(Boolean);
    return {
      movies,
      genre_name: data?.genre_name || null,
    };
  });
}

export async function fetchHiddenGems(userId, n = 12) {
  return cachedFetch(`hidden_gems_${userId || "guest"}_${n}`, async () => {
    const res = await api.get("/recs/hidden-gems/");
    const data = res.data;
    const movies = (data?.movies || []).slice(0, n).map(normalizeBackendMovie).filter(Boolean);
    return { movies };
  });
}

export async function fetchContinueJourney(userId) {
  if (!userId) {
    return { movies: [], seed_title: null };
  }
  return cachedFetch(`continue_journey_${userId}`, async () => {
    const res = await api.get("/recs/continue/");
    const data = res.data;
    const movies = (data?.movies || []).map(normalizeBackendMovie).filter(Boolean);
    return {
      movies,
      seed_title: data?.seed_title || null,
    };
  });
}
