# CineMatch Personalization Notes

## Recommended For You Weights
The personalized recommender blends multiple signals in `backend/api/recommender/recommend.py`:

- `liked` similarity weight: `3.0`
- `high_rated` similarity weight: `2.0`
- `watchlist` similarity weight: `1.0`
- `genre_bonus` weight: `1.0`

Related thresholds:

- `HIGH_RATING_THRESHOLD`: `8`
- `LIKED_RATING_THRESHOLD`: `4`
- `RECENT_VIEWS_LIMIT`: `10`
- `RECOMMENDED_FOR_YOU_LIMIT`: `6`

## Backend Test
Run the unit test that validates “Recommended For You” exclusions:

```bash
cd backend
python manage.py test api.tests.RecommendedForYouTestCase
```
