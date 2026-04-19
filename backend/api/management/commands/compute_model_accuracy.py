from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Avg, Q
from django.utils import timezone

from api.models import (
    Movie,
    ModelAccuracySnapshot,
    ModelPredictionLog,
    Rating,
    RecommenderModel,
    UserMoviePreference,
    UserPreference,
    UserProfile,
    WatchHistory,
    Watchlist,
)


def _is_positive_rating(value):
    try:
        rating_value = int(value or 0)
    except (TypeError, ValueError):
        return False

    if rating_value > 5:
        rating_value = round(rating_value / 2)
    return rating_value >= 4


def _normalize_tmdb_ids(values):
    normalized = []
    seen = set()
    for value in values or []:
        try:
            normalized_value = int(value)
        except (TypeError, ValueError):
            continue
        if normalized_value in seen:
            continue
        seen.add(normalized_value)
        normalized.append(normalized_value)
    return normalized


def _normalize_catalog_score(value):
    try:
        score = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    if score > 5:
        score = score / 2.0
    return score


def _split_csv(value):
    if not value:
        return []
    return [part.strip().lower() for part in str(value).split(",") if part.strip()]


def _normalize_genres(values):
    genres = []
    seen = set()
    for value in values or []:
        normalized = str(value or "").strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        genres.append(normalized)
    return genres


def _top_genres_for_user(user_id):
    profile = UserProfile.objects.filter(user_id=user_id).first()
    if profile and profile.preferred_genres:
        profile_genres = profile.preferred_genres
        if isinstance(profile_genres, str):
            genres = _split_csv(profile_genres)
        else:
            genres = _normalize_genres(profile_genres)
        if genres:
            return genres[:3]

    legacy = UserPreference.objects.filter(user_id=user_id).first()
    if legacy and legacy.preferred_genres:
        genres = _split_csv(legacy.preferred_genres)
        if genres:
            return genres[:3]

    genre_counts = {}

    def _add_movie_genres(movie):
        for genre in _split_csv(getattr(movie, "genres", "")):
            genre_counts[genre] = genre_counts.get(genre, 0) + 1

    for rating in (
        Rating.objects.filter(user_id=user_id)
        .select_related("movie")
        .order_by("-created_at")[:25]
    ):
        if rating.movie and _is_positive_rating(rating.rating):
            _add_movie_genres(rating.movie)

    for pref in (
        UserMoviePreference.objects.filter(user_id=user_id, preference__in=["love", "like"])
        .select_related("movie")
        .order_by("-created_at")[:25]
    ):
        if pref.movie:
            _add_movie_genres(pref.movie)

    for watchlist in (
        Watchlist.objects.filter(user_id=user_id)
        .select_related("movie")
        .order_by("-added_at")[:25]
    ):
        if watchlist.movie:
            _add_movie_genres(watchlist.movie)

    for watched in (
        WatchHistory.objects.filter(user_id=user_id)
        .select_related("movie")
        .order_by("-viewed_at")[:25]
    ):
        if watched.movie:
            _add_movie_genres(watched.movie)

    return [
        genre
        for genre, _ in sorted(
            genre_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )[:3]
    ]


def _catalog_quality_snapshot():
    note = "Based on catalog quality - improves with more user ratings"
    user_ids = set(UserProfile.objects.values_list("user_id", flat=True))
    user_ids.update(UserPreference.objects.values_list("user_id", flat=True))
    user_ids.update(Rating.objects.values_list("user_id", flat=True))
    user_ids.update(UserMoviePreference.objects.values_list("user_id", flat=True))
    user_ids.update(Watchlist.objects.values_list("user_id", flat=True))
    user_ids.update(WatchHistory.objects.values_list("user_id", flat=True))
    user_ids.discard(None)

    total_recommendations = 0
    total_positives = 0

    for user_id in sorted(user_ids):
        top_genres = _top_genres_for_user(user_id)
        if not top_genres:
            continue

        genre_query = Q()
        for genre in top_genres:
            genre_query |= Q(genres__icontains=genre)

        matched_movies = list(
            Movie.objects.filter(genre_query)
            .annotate(avg_rating=Avg("user_ratings__rating"))
            .only("id")
        )
        if not matched_movies:
            continue

        total_recommendations += len(matched_movies)
        total_positives += sum(
            1
            for movie in matched_movies
            if _normalize_catalog_score(getattr(movie, "avg_rating", None)) >= 4.0
        )

    if total_recommendations == 0:
        catalog_movies = list(
            Movie.objects.annotate(avg_rating=Avg("user_ratings__rating")).only("id")
        )
        total_recommendations = len(catalog_movies)
        total_positives = sum(
            1
            for movie in catalog_movies
            if _normalize_catalog_score(getattr(movie, "avg_rating", None)) >= 4.0
        )

    accuracy = round(
        (total_positives / total_recommendations) * 100.0,
        1,
    ) if total_recommendations else 0.0

    return {
        "accuracy": accuracy,
        "metric_type": "catalog_quality",
        "note": note,
        "total_recommendations": total_recommendations,
        "total_positives": total_positives,
    }


class Command(BaseCommand):
    help = "Compute 30-day recommender accuracy snapshots from real prediction logs."

    def handle(self, *args, **options):
        window_start = timezone.now() - timedelta(days=30)
        fallback_snapshot = _catalog_quality_snapshot()

        for model in RecommenderModel.objects.order_by("id"):
            logs = (
                ModelPredictionLog.objects.filter(
                    model=model,
                    created_at__gte=window_start,
                )
                .exclude(user__isnull=True)
                .order_by("created_at")
            )

            if logs.exists():
                recommended_pairs = set()
                positive_pairs = set()

                for log in logs.iterator():
                    recommended_ids = _normalize_tmdb_ids(log.recommended_tmdb_ids)
                    if not recommended_ids:
                        continue

                    rating_rows = (
                        Rating.objects.filter(
                            user_id=log.user_id,
                            movie__tmdb_id__in=recommended_ids,
                            created_at__gt=log.created_at,
                        )
                        .select_related("movie")
                    )
                    positive_ids = {
                        rating.movie.tmdb_id
                        for rating in rating_rows
                        if rating.movie and _is_positive_rating(rating.rating)
                    }
                    positive_ids.update(
                        UserMoviePreference.objects.filter(
                            user_id=log.user_id,
                            movie__tmdb_id__in=recommended_ids,
                            preference="love",
                            created_at__gt=log.created_at,
                        ).values_list("movie__tmdb_id", flat=True)
                    )

                    for tmdb_id in recommended_ids:
                        pair = (log.user_id, tmdb_id)
                        recommended_pairs.add(pair)
                        if tmdb_id in positive_ids:
                            positive_pairs.add(pair)

                total_recommendations = len(recommended_pairs)
                total_positives = len(positive_pairs)
                accuracy = round(
                    (total_positives / total_recommendations) * 100.0,
                    1,
                ) if total_recommendations else 0.0
                metric_type = "prediction_accuracy"
                note = ""
            else:
                total_recommendations = fallback_snapshot["total_recommendations"]
                total_positives = fallback_snapshot["total_positives"]
                accuracy = fallback_snapshot["accuracy"]
                metric_type = fallback_snapshot["metric_type"]
                note = fallback_snapshot["note"]

            ModelAccuracySnapshot.objects.create(
                model=model,
                accuracy=accuracy,
                metric_type=metric_type,
                note=note,
                total_recommendations=total_recommendations,
                total_positives=total_positives,
            )

            self.stdout.write(
                f"{model.name} {metric_type}: {accuracy}% "
                f"({total_positives}/{total_recommendations} recommendations)"
            )
