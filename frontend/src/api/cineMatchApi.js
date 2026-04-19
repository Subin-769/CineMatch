import { API_BASE } from "./apiBase";

/* -------------------------------
   INTERNAL: refresh + retry once
-------------------------------- */
async function fetchWithRefresh(url, options = {}) {
  const opts = { credentials: "include", ...options };
  let res = await fetch(url, opts);

  if (res.status === 401) {
    const r = await fetch(`${API_BASE}/auth/refresh/`, {
      method: "POST",
      credentials: "include",
    });
    if (r.ok) {
      res = await fetch(url, opts);
    }
  }

  return res;
}

async function jsonOrThrow(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || `HTTP ${res.status}`);
  }
  return data;
}

/* -------------------------------
   ✅ FETCH MOVIES (USED BY HOME)
-------------------------------- */
export async function fetchMovies() {
  const res = await fetch(`${API_BASE}/tmdb/trending/`);
  return jsonOrThrow(res);
}

/* -------------------------------
   ✅ WATCHLIST
-------------------------------- */
export async function toggleWatchlist(tmdbId) {
  const res = await fetchWithRefresh(`${API_BASE}/watchlist/toggle/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmdb_id: Number(tmdbId) }),
  });
  return jsonOrThrow(res);
}

/* -------------------------------
   ✅ RATING
-------------------------------- */
export async function rateMovie(tmdbId, rating) {
  const res = await fetchWithRefresh(`${API_BASE}/rating/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tmdb_id: Number(tmdbId),
      rating: Number(rating),
    }),
  });
  return jsonOrThrow(res);
}

export async function setPreference(tmdbId, preference) {
  const res = await fetchWithRefresh(`${API_BASE}/preference/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tmdb_id: Number(tmdbId),
      preference: preference || null,
    }),
  });
  return jsonOrThrow(res);
}

export async function getPreference(tmdbId) {
  const res = await fetchWithRefresh(`${API_BASE}/preference/${Number(tmdbId)}/`);
  return jsonOrThrow(res);
}

export async function fetchMyPreferences() {
  const res = await fetchWithRefresh(`${API_BASE}/preference/my/`);
  if (res.status === 401) {
    const err = new Error("HTTP 401");
    err.status = 401;
    throw err;
  }
  return jsonOrThrow(res);
}

export async function fetchDiscoverMovies(page = 1) {
  const res = await fetch(`${API_BASE}/tmdb/discover/?page=${page}`);
  return jsonOrThrow(res);
}
