from pathlib import Path
import pickle
import threading

from django.core.cache import cache
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent

_lock = threading.Lock()
_loaded = False

_svd_model = None
_movie_similarity = None
_movie_sim_indices = None
_movie_sim_scores = None
_movie_index = None
_movie_mapping = None
_movie_id_to_tmdb = {}
_tmdb_to_movie_id = {}
_movie_ids_all = []
_index_to_movie_id = {}


def _load_similarity_files():
    global _movie_similarity, _movie_sim_indices, _movie_sim_scores
    import numpy as np

    sparse_idx_path = BASE_DIR / "movie_similarity_indices.npy"
    sparse_scr_path = BASE_DIR / "movie_similarity_scores.npy"

    if sparse_idx_path.exists() and sparse_scr_path.exists():
        _movie_sim_indices = np.load(sparse_idx_path)
        _movie_sim_scores = np.load(sparse_scr_path)
        _movie_similarity = None
    else:
        dense_path = BASE_DIR / "movie_similarity.npy"
        if dense_path.exists():
            _movie_similarity = np.load(dense_path)
        _movie_sim_indices = None
        _movie_sim_scores = None


def _ensure_loaded():
    global _loaded
    global _svd_model, _movie_similarity, _movie_sim_indices, _movie_sim_scores
    global _movie_index, _movie_mapping
    global _movie_id_to_tmdb, _tmdb_to_movie_id, _movie_ids_all, _index_to_movie_id

    if _loaded:
        return

    with _lock:
        if _loaded:
            return

        with open(BASE_DIR / "svd_movie_model.pkl", "rb") as f:
            _svd_model = pickle.load(f)

        _load_similarity_files()

        _movie_index = pd.read_csv(BASE_DIR / "movie_index.csv", index_col=0)
        _movie_index.index = _movie_index.index.astype(int)

        _movie_mapping = pd.read_csv(BASE_DIR / "tmdb_mapping.csv")
        _movie_mapping = _movie_mapping.dropna(subset=["tmdbId", "movieId"])
        _movie_mapping["movieId"] = _movie_mapping["movieId"].astype(int)
        _movie_mapping["tmdbId"] = _movie_mapping["tmdbId"].astype(int)

        _movie_id_to_tmdb = dict(zip(_movie_mapping["movieId"], _movie_mapping["tmdbId"]))
        _tmdb_to_movie_id = dict(zip(_movie_mapping["tmdbId"], _movie_mapping["movieId"]))

        _movie_ids_all = list(_movie_id_to_tmdb.keys())

        _index_to_movie_id = (
            _movie_index.reset_index()
            .set_index(_movie_index.columns[0])["movieId"]
            .to_dict()
        )

        _loaded = True


def recommend_for_user(user_id, movie_ids=None, n=10):
    _ensure_loaded()
    if movie_ids is None:
        movie_ids = _movie_ids_all

    predictions = []
    for movie_id in movie_ids:
        pred = _svd_model.predict(user_id, movie_id)
        predictions.append((movie_id, pred.est))

    predictions.sort(key=lambda x: x[1], reverse=True)
    return [i[0] for i in predictions[:n]]


def map_movie_ids_to_tmdb_ids(movie_ids):
    _ensure_loaded()
    return [
        _movie_id_to_tmdb[movie_id]
        for movie_id in movie_ids
        if movie_id in _movie_id_to_tmdb
    ]


def map_tmdb_id_to_movie_id(tmdb_id):
    _ensure_loaded()
    return _tmdb_to_movie_id.get(int(tmdb_id)) if tmdb_id is not None else None


def map_movie_id_to_tmdb_id(movie_id):
    _ensure_loaded()
    return _movie_id_to_tmdb.get(int(movie_id)) if movie_id is not None else None


def recommend_similar(movie_id, n=10):
    _ensure_loaded()
    import numpy as np

    if movie_id not in _movie_index.index:
        return []

    idx = int(_movie_index.loc[movie_id].iloc[0])
    n = max(int(n or 10), 1)

    # ── Sparse path (used after retrain with 50k movies) ──────
    if _movie_sim_indices is not None:
        if idx < 0 or idx >= len(_movie_sim_indices):
            return []
        k_indices = _movie_sim_indices[idx]
        movie_ids = []
        for i in k_indices:
            if int(i) == idx:
                continue
            mid = _index_to_movie_id.get(int(i))
            if mid is not None:
                movie_ids.append(int(mid))
            if len(movie_ids) >= n:
                break
        return movie_ids

    # ── Dense path (fallback for current 6k catalog) ──────────
    if _movie_similarity is None:
        return []
    if idx < 0 or idx >= len(_movie_similarity):
        return []

    row_scores = _movie_similarity[idx]
    limit = min(max(n, 1) + 1, len(row_scores))
    candidate_indexes = np.argpartition(row_scores, -limit)[-limit:]
    candidate_indexes = candidate_indexes[np.argsort(row_scores[candidate_indexes])[::-1]]

    movie_ids = []
    for i in candidate_indexes:
        if int(i) == idx:
            continue
        mid = _index_to_movie_id.get(int(i))
        if mid is not None:
            movie_ids.append(int(mid))
        if len(movie_ids) >= n:
            break
    return movie_ids


def similar_movie_scores(movie_id, n=20):
    _ensure_loaded()
    import numpy as np

    if movie_id not in _movie_index.index:
        return []

    idx = int(_movie_index.loc[movie_id].iloc[0])
    n = max(int(n or 20), 1)

    # ── Sparse path ───────────────────────────────────────────
    if _movie_sim_indices is not None:
        if idx < 0 or idx >= len(_movie_sim_indices):
            return []
        k_indices = _movie_sim_indices[idx]
        k_scores = _movie_sim_scores[idx]
        scored = []
        for i, s in zip(k_indices, k_scores):
            i = int(i)
            if i == idx:
                continue
            mid = _index_to_movie_id.get(i)
            if mid is not None:
                scored.append((int(mid), float(s)))
            if len(scored) >= n:
                break
        return scored

    # ── Dense path (fallback) ─────────────────────────────────
    if _movie_similarity is None:
        return []
    if idx < 0 or idx >= len(_movie_similarity):
        return []

    row_scores = _movie_similarity[idx]
    limit = min(max(n, 1) + 1, len(row_scores))
    candidate_indexes = np.argpartition(row_scores, -limit)[-limit:]
    candidate_indexes = candidate_indexes[np.argsort(row_scores[candidate_indexes])[::-1]]

    scored = []
    for i in candidate_indexes:
        i = int(i)
        if i == idx:
            continue
        mid = _index_to_movie_id.get(i)
        if mid is not None:
            scored.append((int(mid), float(row_scores[i])))
        if len(scored) >= n:
            break
    return scored


def recommend_for_user_tmdb(user_id, n=10):
    _ensure_loaded()
    n = max(int(n or 10), 1)
    cache_key = f"svd_recs_user_{user_id}_n_{n}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    movie_ids = recommend_for_user(user_id, _movie_ids_all, n=max(n, 1) * 5)
    tmdb_ids = map_movie_ids_to_tmdb_ids(movie_ids)
    result = tmdb_ids[:n]
    cache.set(cache_key, result, timeout=300)
    return result


def recommend_similar_tmdb(tmdb_id, n=10):
    _ensure_loaded()
    movie_id = map_tmdb_id_to_movie_id(tmdb_id)
    if movie_id is None:
        return []
    movie_ids = recommend_similar(movie_id, n=max(n, 1) * 2)
    tmdb_ids = map_movie_ids_to_tmdb_ids(movie_ids)
    return tmdb_ids[:n]


def predict_score(user_id, movie_id):
    try:
        return float(_svd_model.predict(user_id, movie_id).est)
    except Exception:
        return 0.0
