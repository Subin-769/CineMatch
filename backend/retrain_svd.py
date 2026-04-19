"""
retrain_svd.py  — v2 (memory-safe for up to 50k movies)
=========================================================
Place at: backend/retrain_svd.py  (replace existing file)
Run with: python manage.py shell < retrain_svd.py

KEY CHANGE from v1:
- v1 built a DENSE (N×N) matrix → crashes at 50k (needs 10GB RAM)
- v2 builds a SPARSE top-50 matrix → stays under 200MB at 50k movies
  Only stores the 50 most similar movies per movie, not all N.
  Recommendations never need rank 40,000 anyway.
"""

import sys
import pickle
import numpy as np
import pandas as pd
from pathlib import Path

BASE_DIR = Path("/Users/subindulal/Desktop/CineMatch/backend/api/recommender")
TOP_K_SIMILAR = 50   # top-50 similar per movie is plenty
BATCH_SIZE = 200     # RAM-safe batch size

print(f"[retrain] Saving to: {BASE_DIR}")

# ── Step 1: Load interactions ─────────────────────────────────
print("\n[1/6] Loading interactions from database...")
from api.models import Movie, Rating, UserMoviePreference, Watchlist

interactions = []
for r in Rating.objects.select_related("movie").filter(movie__tmdb_id__isnull=False):
    v = max(1.0, min(5.0, float(r.rating) if r.rating <= 5 else round(float(r.rating) / 2, 1)))
    interactions.append((r.user_id, r.movie.tmdb_id, v))
print(f"  → {len(interactions)} star ratings")

pref_map = {"love": 5.0, "like": 4.0, "dislike": 1.5}
pc = 0
for p in UserMoviePreference.objects.select_related("movie").filter(movie__tmdb_id__isnull=False):
    s = pref_map.get(p.preference)
    if s:
        interactions.append((p.user_id, p.movie.tmdb_id, s))
        pc += 1
print(f"  → {pc} love/like/dislike signals")

wc = 0
for w in Watchlist.objects.select_related("movie").filter(movie__tmdb_id__isnull=False):
    interactions.append((w.user_id, w.movie.tmdb_id, 3.5))
    wc += 1
print(f"  → {wc} watchlist signals")
print(f"  → Total: {len(interactions)}")

if len(interactions) < 5:
    print("[ERROR] Need at least 5 interactions.")
    sys.exit(1)

# ── Step 2: Interaction DataFrame ────────────────────────────
print("\n[2/6] Building DataFrame...")
df = pd.DataFrame(interactions, columns=["user_id", "tmdb_id", "rating"])
df = df.groupby(["user_id", "tmdb_id"], as_index=False)["rating"].max()
print(f"  → {len(df)} pairs, {df['user_id'].nunique()} users, {df['tmdb_id'].nunique()} movies")

unique_tmdb = sorted(df["tmdb_id"].unique())
tmdb_to_int = {t: i + 1 for i, t in enumerate(unique_tmdb)}
df["movie_id"] = df["tmdb_id"].map(tmdb_to_int)

# ── Step 3: Train SVD ─────────────────────────────────────────
print("\n[3/6] Training SVD...")
from surprise import SVD, Dataset, Reader
from surprise.model_selection import cross_validate

reader = Reader(rating_scale=(1, 5))
sdf = df[["user_id", "movie_id", "rating"]].copy()
sdf.columns = ["userID", "itemID", "rating"]
data = Dataset.load_from_df(sdf, reader)
trainset = data.build_full_trainset()

svd = SVD(n_factors=50, n_epochs=30, lr_all=0.005, reg_all=0.1, random_state=42, verbose=False)
svd.fit(trainset)
print(f"  → {trainset.n_ratings} ratings, {trainset.n_users} users, {trainset.n_items} items")

if len(df) >= 10:
    try:
        cv = cross_validate(svd, data, measures=["RMSE", "MAE"], cv=min(3, len(df)//3), verbose=False)
        print(f"  → RMSE: {np.mean(cv['test_rmse']):.4f}  MAE: {np.mean(cv['test_mae']):.4f}")
    except Exception as e:
        print(f"  → Cross-val skipped: {e}")

# ── Step 4: Sparse similarity matrix ─────────────────────────
print(f"\n[4/6] Building sparse top-{TOP_K_SIMILAR} similarity matrix...")
all_movies = list(
    Movie.objects.filter(tmdb_id__isnull=False)
    .only("id", "tmdb_id", "genres", "keywords", "original_language")
)
n = len(all_movies)
print(f"  → {n} movies")

# Build vocab
vocab = {}
for m in all_movies:
    toks = []
    if m.genres:
        toks += [f"g:{x.strip().lower()}" for x in m.genres.split(",") if x.strip()]
    if m.keywords:
        toks += [f"k:{x.strip().lower()}" for x in m.keywords.split(",") if x.strip()]
    if m.original_language:
        toks.append(f"l:{m.original_language.strip().lower()}")
    for t in toks:
        if t not in vocab:
            vocab[t] = len(vocab)
print(f"  → Vocab: {len(vocab)} features")

# Feature matrix (sparse)
from scipy.sparse import lil_matrix, csr_matrix
from sklearn.preprocessing import normalize

feat = lil_matrix((n, len(vocab)), dtype=np.float32)
tmdb_list = []
for i, m in enumerate(all_movies):
    toks = []
    if m.genres:
        toks += [f"g:{x.strip().lower()}" for x in m.genres.split(",") if x.strip()]
    if m.keywords:
        toks += [f"k:{x.strip().lower()}" for x in m.keywords.split(",") if x.strip()]
    if m.original_language:
        toks.append(f"l:{m.original_language.strip().lower()}")
    for t in toks:
        if t in vocab:
            feat[i, vocab[t]] = 1.0
    tmdb_list.append(m.tmdb_id)

feat = normalize(csr_matrix(feat), norm="l2")

# Top-K similarity in batches — peak RAM = BATCH_SIZE × n × 4 bytes
# At BATCH_SIZE=200, n=50k: 200 × 50000 × 4 = 40MB peak. Safe.
K = min(TOP_K_SIMILAR, n - 1)
top_idx = np.zeros((n, K), dtype=np.int32)
top_scr = np.zeros((n, K), dtype=np.float16)

print(f"  → Computing in batches of {BATCH_SIZE}...")
for start in range(0, n, BATCH_SIZE):
    end = min(start + BATCH_SIZE, n)
    sims = (feat[start:end] @ feat.T).toarray()  # (batch, n)
    for li, gi in enumerate(range(start, end)):
        row = sims[li]
        row[gi] = -1  # exclude self
        if n - 1 <= K:
            ki = np.argsort(row)[::-1][:K]
        else:
            ki = np.argpartition(row, -K)[-K:]
            ki = ki[np.argsort(row[ki])[::-1]]
        top_idx[gi] = ki
        top_scr[gi] = row[ki].astype(np.float16)
    if start % 5000 == 0:
        print(f"    ... {start}/{n}")

mem_mb = (top_idx.nbytes + top_scr.nbytes) / 1024 / 1024
print(f"  → Done. Memory: {mem_mb:.1f} MB (vs {n*n*4/1024/1024:.0f} MB for dense)")

# ── Step 5: Index files ───────────────────────────────────────
print("\n[5/6] Building index files...")
movie_index_df = pd.DataFrame(
    [{"movieId": tid, "index": i} for i, tid in enumerate(tmdb_list)]
).set_index("movieId")

tmdb_mapping_df = pd.DataFrame([
    {"movieId": mid, "tmdbId": tid} for tid, mid in tmdb_to_int.items()
])
print(f"  → movie_index: {len(movie_index_df)}, tmdb_mapping: {len(tmdb_mapping_df)}")

# ── Step 6: Save ──────────────────────────────────────────────
print("\n[6/6] Saving files...")
with open(BASE_DIR / "svd_movie_model.pkl", "wb") as f:
    pickle.dump(svd, f)
print("  ✓ svd_movie_model.pkl")

np.save(BASE_DIR / "movie_similarity_indices.npy", top_idx)
np.save(BASE_DIR / "movie_similarity_scores.npy", top_scr)
# Placeholder so old code doesn't crash before you apply model_loader patch
np.save(BASE_DIR / "movie_similarity.npy", np.zeros((2, 2), dtype=np.float16))
print("  ✓ movie_similarity_indices.npy + movie_similarity_scores.npy")

movie_index_df.to_csv(BASE_DIR / "movie_index.csv")
tmdb_mapping_df.to_csv(BASE_DIR / "tmdb_mapping.csv", index=False)
print("  ✓ movie_index.csv + tmdb_mapping.csv")

# Reset loader
from api.recommender import model_loader
for attr in ["_loaded","_svd_model","_movie_similarity","_movie_index",
             "_movie_mapping","_movie_id_to_tmdb","_tmdb_to_movie_id",
             "_movie_ids_all","_index_to_movie_id"]:
    setattr(model_loader, attr, {} if "map" in attr or "id" in attr.split("_")[-1] else
            (False if attr == "_loaded" else None))
model_loader._movie_id_to_tmdb = {}
model_loader._tmdb_to_movie_id = {}
model_loader._movie_ids_all = []
model_loader._index_to_movie_id = {}
model_loader._loaded = False
model_loader._ensure_loaded()

print("\n── Verification ─────────────────────────────────────────")
from api.models import Movie as M
db = set(M.objects.values_list("tmdb_id", flat=True))
svd_map = set(model_loader._tmdb_to_movie_id.keys())
print(f"DB movies:        {len(db)}")
print(f"SVD mapping:      {len(svd_map)} (your rated movies)")
print(f"Sparse sim:       {top_idx.shape}  {mem_mb:.0f} MB")
print(f"Movie index:      {len(movie_index_df)} entries")
print("""
✅ Retrain complete!

IMPORTANT — apply model_loader_patch.py next so the app uses
the new sparse format. Then restart Django + clear cache.
""")
