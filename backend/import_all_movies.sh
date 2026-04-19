#!/bin/bash
# =============================================================
# CineMatch — 40-50k Full Catalog Import
# Save as: backend/import_all_movies.sh
# Run with: bash import_all_movies.sh
# =============================================================
# Estimated total: ~15,000–18,000 movies
# Estimated time: 20–40 minutes (TMDB rate limit is 40 req/10s)
# =============================================================

set -e
cd "$(dirname "$0")"
source ../venv/bin/activate

echo "================================================"
echo " CineMatch Full Catalog Import"
echo " Started: $(date)"
echo "================================================"

# ── English / Hollywood ──────────────────────────────────────
# 50 pages × 4 endpoints = ~4,000 movies
echo ""
echo "[1/10] English — Popular, Top Rated, Trending, Now Playing..."
python manage.py import_tmdb_movies --pages 50 --endpoint popular
python manage.py import_tmdb_movies --pages 50 --endpoint top_rated
python manage.py import_tmdb_movies --pages 50 --endpoint trending
python manage.py import_tmdb_movies --pages 30 --endpoint now_playing

# Discover by language to catch non-trending English films
echo "[1b/10] English — Discover (language-filtered)..."
python manage.py import_tmdb_movies --pages 50 --language en

# ── Hindi / Bollywood ────────────────────────────────────────
echo ""
echo "[2/10] Hindi (Bollywood)..."
python manage.py import_tmdb_movies --pages 50 --language hi

# ── Tamil ────────────────────────────────────────────────────
echo ""
echo "[3/10] Tamil..."
python manage.py import_tmdb_movies --pages 40 --language ta

# ── Telugu ───────────────────────────────────────────────────
echo ""
echo "[4/10] Telugu..."
python manage.py import_tmdb_movies --pages 40 --language te

# ── Malayalam ────────────────────────────────────────────────
echo ""
echo "[5/10] Malayalam..."
python manage.py import_tmdb_movies --pages 30 --language ml

# ── Kannada ──────────────────────────────────────────────────
echo ""
echo "[6/10] Kannada..."
python manage.py import_tmdb_movies --pages 20 --language kn

# ── Korean ───────────────────────────────────────────────────
echo ""
echo "[7/10] Korean..."
python manage.py import_tmdb_movies --pages 40 --language ko

# ── Spanish ──────────────────────────────────────────────────
echo ""
echo "[8/10] Spanish..."
python manage.py import_tmdb_movies --pages 40 --language es

# ── Nepali ───────────────────────────────────────────────────
echo ""
echo "[9/10] Nepali..."
python manage.py import_tmdb_movies --pages 20 --language ne

# ── Rebuild similarity matrix after full import ──────────────
echo ""
echo "[10/10] Retraining similarity matrix on new catalog..."
python manage.py shell < retrain_svd.py

# ── Clear cache ───────────────────────────────────────────────
echo ""
echo "Clearing recommendation cache..."
python manage.py shell -c "from django.core.cache import cache; cache.clear()"

echo ""
echo "================================================"
echo " Import complete: $(date)"
echo "================================================"
python manage.py shell -c "
from api.models import Movie
total = Movie.objects.count()
from django.db.models import Count
by_lang = Movie.objects.values('original_language').annotate(count=Count('id')).order_by('-count')[:12]
print(f'Total movies in catalog: {total}')
print('By language:')
for row in by_lang:
    print(f'  {row[\"original_language\"] or \"unknown\":>6}  {row[\"count\"]}')
"
