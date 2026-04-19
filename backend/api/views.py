# backend/api/views.py
import math
import time
from typing import Optional
from datetime import datetime, timedelta
from collections import Counter, defaultdict
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, ExpressionWrapper, F, FloatField, IntegerField, Max, Prefetch, Q, Value
from django.db.models.functions import Coalesce, Least
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import (
    ModelPredictionLog,
    RecommenderModel,
    Movie,
    ModelAccuracySnapshot,
    Rating,
    Watchlist,
    Review,
    UserActivity,
    WatchHistory,
    SearchHistory,
    UserMoviePreference,
    UserPreference,
    UserProfile,
)
from django.core.cache import cache
from .tmdb import (
    get_trending_movies,
    get_movie_details,
    get_movie_credits,
    get_similar_movies,
    get_movie_videos,
    get_movie_keywords,
    get_recommendations as tmdb_get_recommendations,
    discover_movies,
    bulk_get_movie_details,
    _format_movie_obj,
)
_recommender_module = None


def _recommender():
    global _recommender_module
    if _recommender_module is None:
        from .recommender import recommend as recommender_module

        _recommender_module = recommender_module
    return _recommender_module


def personalized_recommend(*args, **kwargs):
    return _recommender().personalized_recommend(*args, **kwargs)


def personalized_recommend_with_reasons(*args, **kwargs):
    return _recommender().personalized_recommend_with_reasons(*args, **kwargs)


def recommend_movies(*args, **kwargs):
    return _recommender().recommend_movies(*args, **kwargs)


def recommended_for_you(*args, **kwargs):
    return _recommender().recommended_for_you(*args, **kwargs)


def similar_movies(*args, **kwargs):
    return _recommender().similar_movies(*args, **kwargs)


def similar_movies_with_reason(*args, **kwargs):
    return _recommender().similar_movies_with_reason(*args, **kwargs)


def loved_movies_with_reason(*args, **kwargs):
    return _recommender().loved_movies_with_reason(*args, **kwargs)


def liked_movies_with_reason(*args, **kwargs):
    return _recommender().liked_movies_with_reason(*args, **kwargs)


def rated_movies_with_reason(*args, **kwargs):
    return _recommender().rated_movies_with_reason(*args, **kwargs)


def watchlist_movies_with_reason(*args, **kwargs):
    return _recommender().watchlist_movies_with_reason(*args, **kwargs)


def favorite_genres_profile(*args, **kwargs):
    return _recommender().favorite_genres_profile(*args, **kwargs)


def surprise_me(*args, **kwargs):
    return _recommender().surprise_me(*args, **kwargs)


def surprise_recommendations(*args, **kwargs):
    return _recommender().surprise_recommendations(*args, **kwargs)


def batched_personalized_sections(*args, **kwargs):
    return _recommender().batched_personalized_sections(*args, **kwargs)


def _invalidate_recs_for_user(user_id):
    """Drop this user's cached recommendations so the next request sees fresh
    results that reflect their new rating / preference / watchlist / onboarding."""
    try:
        _recommender().invalidate_user_recommendation_caches(user_id)
    except Exception:
        pass


# -----------------------
# Helpers
# -----------------------
def _error(message: str, status_code: int = 400, **extra):
    payload = {"detail": message}
    payload.update(extra)
    return Response(payload, status=status_code)


def _tmdb_poster_url(poster_path: Optional[str]) -> Optional[str]:
    if not poster_path:
        return None
    return f"https://image.tmdb.org/t/p/w500{poster_path}"


def _hydrate_payload(payload):
    """Add a 'movies' array of hydrated movie objects to a recommendation payload.

    The payload must contain a 'tmdb_ids' list. Returns the same payload dict
    with an added 'movies' key containing full movie card objects.
    """
    tmdb_ids = payload.get("tmdb_ids") or []
    if not tmdb_ids:
        payload.setdefault("movies", [])
        return payload
    payload["movies"] = bulk_get_movie_details(tmdb_ids)
    return payload


def _log_activity(user, action_type: str, movie: Movie | None = None, rating: int | None = None, **metadata):
    """
    Best-effort activity logging. Never block core flows if logging fails
    (e.g., migrations not applied yet).
    """
    try:
        UserActivity.objects.create(
            user=user,
            movie=movie,
            action_type=action_type,
            rating=rating,
            metadata=metadata or {},
        )
    except Exception:
        return


def _require_admin(request):
    if not request.user.is_staff:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
    return None


def _normalize_onboarding_frequency(value):
    if value in (None, ""):
        return ""
    normalized = str(value).strip().lower().replace("_", "-")
    mapping = {
        "casual": "casual",
        "casual viewer": "casual",
        "regular": "regular",
        "movie lover": "regular",
        "binge": "binge",
        "binge watcher": "binge",
        "cinephile": "cinephile",
    }
    return mapping.get(normalized, normalized)


def _normalize_onboarding_vibe(value):
    if value in (None, ""):
        return ""
    normalized = str(value).strip().lower().replace("_", "-")
    mapping = {
        "feel-good": "feel-good",
        "mind-bending": "mind-bending",
        "edge-of-seat": "edge-of-seat",
        "emotional": "emotional",
        "escapist": "escapist",
        "dark-gritty": "dark-gritty",
        "dark & gritty": "dark-gritty",
    }
    return mapping.get(normalized, normalized)


def _normalize_onboarding_genres(value):
    if value in (None, ""):
        return []
    if isinstance(value, str):
        raw_items = [part.strip() for part in value.split(",") if part.strip()]
    elif isinstance(value, (list, tuple, set)):
        raw_items = []
        for item in value:
            if item in (None, ""):
                continue
            raw_items.append(str(item).strip())
    else:
        raise ValueError("preferred_genres must be a list or comma-separated string")

    genres = []
    seen = set()
    for item in raw_items:
        normalized = item.lower()
        if normalized.isdigit():
            normalized = _recommender().TMDB_ID_TO_GENRE.get(int(normalized), normalized)
        if normalized in seen:
            continue
        seen.add(normalized)
        genres.append(normalized)
    return genres


def _serialize_onboarding_profile(profile):
    return {
        "watch_frequency": profile.watch_frequency or "",
        "preferred_genres": list(profile.preferred_genres or []),
        "preferred_vibe": profile.preferred_vibe or "",
        "onboarding_completed": bool(profile.onboarding_completed),
    }


def _sync_legacy_user_preferences(user, preferred_genres):
    genre_csv = ",".join(preferred_genres or [])
    pref, _ = UserPreference.objects.get_or_create(user=user)
    if pref.preferred_genres != genre_csv:
        pref.preferred_genres = genre_csv
        pref.save(update_fields=["preferred_genres", "updated_at"])


@api_view(["GET", "POST", "PATCH"])
@permission_classes([IsAuthenticated])
def onboarding_preferences(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)

    if request.method == "GET":
        return Response(_serialize_onboarding_profile(profile))

    try:
        preferred_genres = _normalize_onboarding_genres(
            request.data.get("preferred_genres", profile.preferred_genres)
        )
    except ValueError as exc:
        return _error(str(exc))

    watch_frequency = _normalize_onboarding_frequency(
        request.data.get("watch_frequency", profile.watch_frequency)
    )
    preferred_vibe = _normalize_onboarding_vibe(
        request.data.get("preferred_vibe", profile.preferred_vibe)
    )

    onboarding_completed = request.data.get("onboarding_completed", None)
    if onboarding_completed is None:
        onboarding_completed = bool(
            watch_frequency or preferred_genres or preferred_vibe or profile.onboarding_completed
        )

    profile.watch_frequency = watch_frequency
    profile.preferred_genres = preferred_genres
    profile.preferred_vibe = preferred_vibe
    profile.onboarding_completed = bool(onboarding_completed)
    profile.save(
        update_fields=[
            "watch_frequency",
            "preferred_genres",
            "preferred_vibe",
            "onboarding_completed",
            "updated_at",
        ]
    )

    _sync_legacy_user_preferences(request.user, preferred_genres)
    _invalidate_recs_for_user(request.user.id)
    return Response(_serialize_onboarding_profile(profile))


def _shift_month(dt: datetime, delta: int):
    month_index = dt.month - 1 + delta
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    return year, month


def _month_start(year: int, month: int):
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime(year, month, 1), tz)

def _safe_percent(value: float, total: float) -> float:
    if not total:
        return 0.0
    return round((value / total) * 100, 1)


def _format_requests(count):
    if count is None:
        return 0
    return int(count)


def _round_metric(value, digits: int = 2) -> float:
    if value is None:
        return 0.0
    return round(float(value), digits)


def _timing_meta(response_time_ms: float) -> dict:
    return {
        "response_time_ms": _round_metric(response_time_ms),
        "computed_at": datetime.utcnow().isoformat(),
    }


def _pagination_params(request, default_page_size: int = 50, max_page_size: int = 50):
    try:
        page = int(request.GET.get("page", 1))
    except Exception:
        page = 1
    try:
        page_size = int(request.GET.get("page_size", default_page_size))
    except Exception:
        page_size = default_page_size

    page = max(page, 1)
    page_size = max(1, min(page_size, max_page_size))
    return page, page_size


def _pagination_meta(page: int, page_size: int, total_count: int) -> dict:
    total_pages = math.ceil(total_count / page_size) if total_count else 0
    return {
        "page": page,
        "page_size": page_size,
        "total": total_count,
        "total_pages": total_pages,
        "has_previous": page > 1,
        "has_next": page < total_pages,
    }


def _user_status_queries(now):
    active_cutoff = now - timedelta(days=7)
    warm_cutoff = now - timedelta(days=30)
    recent_fields = (
        "recent_watch",
        "recent_rating",
        "recent_search",
        "recent_watchlist",
        "recent_preference",
        "recent_activity",
    )

    active_q = Q()
    warm_q = Q()
    for field in recent_fields:
        active_q |= Q(**{f"{field}__gte": active_cutoff})
        warm_q |= Q(**{f"{field}__gte": warm_cutoff, f"{field}__lt": active_cutoff})
    return active_q, warm_q


def _movie_status_queries(now):
    metadata_gap_q = Q(poster_url="") | Q(overview="") | Q(genres="")
    trending_q = Q(recent_watch_count__gte=3) | (Q(recent_watch_count__gte=2) & Q(avg_rating__gte=7.5))
    classic_q = Q(release_year__lte=now.year - 10) & Q(avg_rating__gte=7.5)
    popular_q = Q(interaction_count__gte=6) | Q(avg_rating__gte=8.0)
    fresh_q = Q(release_year__gte=now.year - 1)
    return {
        "needs_attention": metadata_gap_q,
        "trending": trending_q,
        "classic": classic_q,
        "popular": popular_q,
        "fresh": fresh_q,
    }


def _grouped_count_map(queryset, group_field: str = "user_id") -> dict:
    return {
        row[group_field]: row["total"]
        for row in queryset.values(group_field).annotate(total=Count("id")).order_by(group_field)
    }


def _grouped_max_map(queryset, value_field: str, group_field: str = "user_id") -> dict:
    return {
        row[group_field]: row["latest"]
        for row in queryset.values(group_field).annotate(latest=Max(value_field)).order_by(group_field)
    }


def _buffer_percentile(samples, percentile: float) -> float:
    values = sorted(float(sample) for sample in samples if sample is not None)
    if not values:
        return 0.0
    rank = max(math.ceil((percentile / 100.0) * len(values)) - 1, 0)
    return _round_metric(values[min(rank, len(values) - 1)])


def _percent_change(current: float, previous: float) -> float:
    if not previous:
        return 0.0 if not current else 100.0
    return round(((current - previous) / previous) * 100, 1)


def _change_payload(current: float, previous: float, label: str = "vs previous 30 days"):
    delta = _percent_change(current, previous)
    return {
        "value": delta,
        "trend": "negative" if delta < 0 else "positive",
        "label": label,
    }


def _latest_timestamp(*values):
    valid_values = [value for value in values if value]
    return max(valid_values) if valid_values else None


def _calculate_engagement_score(
    watched_count: int = 0,
    rated_count: int = 0,
    watchlist_count: int = 0,
    search_count: int = 0,
    preference_count: int = 0,
    activity_count: int = 0,
):
    weighted_total = (
        (watched_count * 2.0)
        + (rated_count * 3.2)
        + (watchlist_count * 1.4)
        + (search_count * 0.6)
        + (preference_count * 2.3)
        + (activity_count * 0.9)
    )
    if weighted_total <= 0:
        return 0.0
    return round((1 - math.exp(-(weighted_total / 14))) * 100, 1)


def _user_status_payload(last_seen, now):
    if not last_seen:
        return {"key": "inactive", "label": "Inactive"}
    if last_seen >= now - timedelta(days=7):
        return {"key": "active", "label": "Active"}
    if last_seen >= now - timedelta(days=30):
        return {"key": "warm", "label": "Warming Up"}
    return {"key": "inactive", "label": "Inactive"}


def _movie_ai_score(avg_rating, interaction_count):
    rating_component = (avg_rating or 0) * 8.2
    momentum_component = min(interaction_count * 3.4, 30)
    return round(min(rating_component + momentum_component, 100.0), 1)


def _movie_status_payload(row, now, interaction_count):
    metadata_missing = not row.poster_url or not row.overview or not row.genres

    if metadata_missing:
        return {"key": "needs_attention", "label": "Needs Attention"}

    recent_views = getattr(row, "recent_watch_count", 0) or 0
    avg_rating = getattr(row, "avg_rating", 0) or 0
    release_year = row.release_year or now.year

    if recent_views >= 3 or (recent_views >= 2 and avg_rating >= 7.5):
        return {"key": "trending", "label": "Trending"}
    if release_year <= now.year - 10 and avg_rating >= 7.5:
        return {"key": "classic", "label": "Classic"}
    if interaction_count >= 6 or avg_rating >= 8.0:
        return {"key": "popular", "label": "Popular"}
    if release_year >= now.year - 1:
        return {"key": "fresh", "label": "Fresh"}
    return {"key": "steady", "label": "Steady"}


def _active_user_count(start, end):
    user_ids = set(
        UserActivity.objects.filter(timestamp__gte=start, timestamp__lt=end).values_list("user_id", flat=True)
    )
    user_ids.update(Rating.objects.filter(created_at__gte=start, created_at__lt=end).values_list("user_id", flat=True))
    user_ids.update(
        WatchHistory.objects.filter(viewed_at__gte=start, viewed_at__lt=end).values_list("user_id", flat=True)
    )
    user_ids.update(
        SearchHistory.objects.filter(created_at__gte=start, created_at__lt=end).values_list("user_id", flat=True)
    )
    user_ids.update(
        Watchlist.objects.filter(added_at__gte=start, added_at__lt=end).values_list("user_id", flat=True)
    )
    user_ids.update(
        UserMoviePreference.objects.filter(created_at__gte=start, created_at__lt=end).values_list("user_id", flat=True)
    )
    user_ids.discard(None)
    return len(user_ids)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_stats(request):
    guard = _require_admin(request)
    if guard:
        return guard

    now = timezone.now()
    current_window_start = now - timedelta(days=30)
    previous_window_start = current_window_start - timedelta(days=30)

    User = get_user_model()
    total_users = User.objects.count()
    movies_indexed = Movie.objects.count()

    current_new_users = User.objects.filter(date_joined__gte=current_window_start).count()
    previous_new_users = User.objects.filter(
        date_joined__gte=previous_window_start,
        date_joined__lt=current_window_start,
    ).count()

    current_new_movies = Movie.objects.filter(created_at__gte=current_window_start).count()
    previous_new_movies = Movie.objects.filter(
        created_at__gte=previous_window_start,
        created_at__lt=current_window_start,
    ).count()

    overall_avg_rating = Rating.objects.aggregate(avg=Avg("rating")).get("avg") or 0
    current_avg_rating = Rating.objects.filter(created_at__gte=current_window_start).aggregate(avg=Avg("rating")).get("avg")
    previous_avg_rating = Rating.objects.filter(
        created_at__gte=previous_window_start,
        created_at__lt=current_window_start,
    ).aggregate(avg=Avg("rating")).get("avg")

    accuracy_source = current_avg_rating if current_avg_rating is not None else overall_avg_rating
    previous_accuracy_source = previous_avg_rating if previous_avg_rating is not None else overall_avg_rating
    ai_accuracy = round((accuracy_source / 10) * 100, 1) if accuracy_source else 0.0
    previous_ai_accuracy = round((previous_accuracy_source / 10) * 100, 1) if previous_accuracy_source else 0.0

    active_users = _active_user_count(current_window_start, now)
    previous_active_users = _active_user_count(previous_window_start, current_window_start)
    engagement_rate = _safe_percent(active_users, total_users)
    previous_engagement_rate = _safe_percent(previous_active_users, total_users)

    return Response(
        {
            "total_users": total_users,
            "movies_indexed": movies_indexed,
            "ai_accuracy": ai_accuracy,
            "engagement_rate": engagement_rate,
            "changes": {
                "total_users": _change_payload(current_new_users, previous_new_users),
                "movies_indexed": _change_payload(current_new_movies, previous_new_movies),
                "ai_accuracy": _change_payload(ai_accuracy, previous_ai_accuracy),
                "engagement_rate": _change_payload(engagement_rate, previous_engagement_rate),
            },
            "updated_at": now.isoformat(),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_recommendations(request):
    guard = _require_admin(request)
    if guard:
        return guard

    now = timezone.now()
    trends = []

    for offset in range(-7, 1):
        year, month = _shift_month(now, offset)
        start = _month_start(year, month)
        next_year, next_month = _shift_month(datetime(year, month, 1), 1)
        end = _month_start(next_year, next_month)

        activity_count = UserActivity.objects.filter(timestamp__gte=start, timestamp__lt=end).count()
        rating_count = Rating.objects.filter(created_at__gte=start, created_at__lt=end).count()
        avg_rating = Rating.objects.filter(created_at__gte=start, created_at__lt=end).aggregate(avg=Avg("rating")).get("avg")
        accuracy = round((avg_rating / 10) * 100, 1) if avg_rating else 0

        trends.append(
            {
                "month": start.strftime("%b"),
                "recommendations": activity_count + rating_count,
                "accuracy": accuracy,
            }
        )

    top_recommended = []
    top_movie_rows = (
        Movie.objects.only("id", "title", "genres")
        .annotate(
            avg_rating=Avg("user_ratings__rating"),
            rating_count=Count("user_ratings", distinct=True),
            watch_count=Count("watch_history", distinct=True),
            watchlist_count=Count("watchlisted_by", distinct=True),
            activity_count=Count("activities", distinct=True),
            preference_count=Count("movie_preferences", distinct=True),
        )
        .annotate(
            interaction_count=ExpressionWrapper(
                Coalesce(F("rating_count"), Value(0))
                + Coalesce(F("watch_count"), Value(0))
                + Coalesce(F("watchlist_count"), Value(0))
                + Coalesce(F("activity_count"), Value(0))
                + Coalesce(F("preference_count"), Value(0)),
                output_field=IntegerField(),
            ),
        )
        .filter(Q(interaction_count__gt=0) | Q(avg_rating__isnull=False))
        .annotate(
            score_metric=ExpressionWrapper(
                (Coalesce(F("avg_rating"), Value(0.0)) * Value(10.0))
                + Least(
                    ExpressionWrapper(F("interaction_count") * Value(1.5), output_field=FloatField()),
                    Value(20.0),
                ),
                output_field=FloatField(),
            ),
        )
        .order_by("-score_metric", "-interaction_count", "title", "id")[:5]
    )

    for row in top_movie_rows:
        interaction_count = row.interaction_count or 0
        genre = (row.genres or "").split(",")[0].strip() or "Other"
        score = min(round(((row.avg_rating or 0) * 10) + min(interaction_count * 1.5, 20), 1), 100.0)
        trend = "up" if (row.avg_rating or 0) >= 7 or interaction_count >= 5 else "down"
        top_recommended.append(
            {
                "id": row.id,
                "title": row.title,
                "genre": genre,
                "score": score,
                "recs": interaction_count,
                "trend": trend,
            }
        )

    return Response({"trends": trends, "top_recommended": top_recommended[:5], "updated_at": now.isoformat()})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_genres(request):
    guard = _require_admin(request)
    if guard:
        return guard

    genre_counts = Counter()
    for movie in Movie.objects.only("genres").exclude(genres="").order_by("id").iterator(chunk_size=100):
        for genre in (movie.genres or "").split(","):
            genre = genre.strip()
            if genre:
                genre_counts[genre] += 1

    if not genre_counts:
        return Response({"genres": [], "updated_at": timezone.now().isoformat()})

    total = sum(genre_counts.values())
    top = genre_counts.most_common(5)
    top_total = sum(count for _, count in top)
    other = total - top_total

    genres = []
    for name, count in top:
        percent = round((count / total) * 100)
        genres.append({"name": name, "value": count, "percent": percent})

    if other > 0:
        percent = round((other / total) * 100)
        genres.append({"name": "Other", "value": other, "percent": percent})

    return Response({"genres": genres, "updated_at": timezone.now().isoformat()})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_activity(request):
    guard = _require_admin(request)
    if guard:
        return guard

    rows = (
        UserActivity.objects.select_related("user", "movie")
        .only(
            "id",
            "action_type",
            "rating",
            "metadata",
            "timestamp",
            "user__username",
            "movie__title",
        )
        .order_by("-timestamp", "-id")[:6]
    )

    def build_message(activity):
        action = activity.action_type
        movie_title = activity.movie.title if activity.movie else None
        meta = activity.metadata or {}
        query = (meta.get("query") or meta.get("prompt") or meta.get("message") or "").strip()

        if action == "rated":
            rating = activity.rating or meta.get("rating_value")
            if movie_title:
                return f"rated {movie_title} {rating} stars" if rating else f"rated {movie_title}"
            return "rated a movie"
        if action == "watched":
            return f"watched {movie_title}" if movie_title else "watched a movie"
        if action == "added_watchlist":
            return f"added {movie_title} to watchlist" if movie_title else "added a movie to watchlist"
        if action == "removed_watchlist":
            return f"removed {movie_title} from watchlist" if movie_title else "removed a movie from watchlist"
        if action == "searched":
            return f"searched for {query}" if query else "searched for movies"
        if action == "chatbot_query":
            return f"asked AI for recommendations about {query}" if query else "asked AI for recommendations"
        if action == "liked":
            return f"liked {movie_title}" if movie_title else "liked a movie"
        if action == "loved":
            return f"loved {movie_title}" if movie_title else "loved a movie"
        if action == "disliked":
            return f"disliked {movie_title}" if movie_title else "disliked a movie"
        if movie_title:
            return f"explored {movie_title}"
        return "explored the catalog"

    payload = []
    for row in rows:
        payload.append(
            {
                "id": row.id,
                "user": getattr(row.user, "username", "User"),
                "message": build_message(row),
                "timestamp": row.timestamp.isoformat(),
            }
        )

    return Response({"activity": payload, "updated_at": timezone.now().isoformat()})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_realtime_pulse(request):
    guard = _require_admin(request)
    if guard:
        return guard

    now = timezone.now()
    today_start = timezone.make_aware(
        datetime.combine(timezone.localdate(), datetime.min.time()),
        timezone.get_current_timezone(),
    )
    last_hour = now - timedelta(hours=1)

    User = get_user_model()
    signups_today = User.objects.filter(date_joined__gte=today_start).count()
    ratings_today = Rating.objects.filter(created_at__gte=today_start).count()
    chatbot_queries_today = UserActivity.objects.filter(
        action_type="chatbot_query", timestamp__gte=today_start,
    ).count()
    searches_today = SearchHistory.objects.filter(created_at__gte=today_start).count()
    watchlist_adds_today = Watchlist.objects.filter(added_at__gte=today_start).count()
    views_today = WatchHistory.objects.filter(viewed_at__gte=today_start).count()

    # Active users in the last hour (across all interaction tables)
    active_user_ids = set()
    active_user_ids.update(
        UserActivity.objects.filter(timestamp__gte=last_hour).values_list("user_id", flat=True)
    )
    active_user_ids.update(
        Rating.objects.filter(created_at__gte=last_hour).values_list("user_id", flat=True)
    )
    active_user_ids.update(
        WatchHistory.objects.filter(viewed_at__gte=last_hour).values_list("user_id", flat=True)
    )
    active_user_ids.update(
        SearchHistory.objects.filter(created_at__gte=last_hour).values_list("user_id", flat=True)
    )
    active_user_ids.discard(None)
    active_now = len(active_user_ids)

    # Peak hour today: bucket activity timestamps into hours, find the busiest
    hour_buckets = Counter()
    for ts in UserActivity.objects.filter(timestamp__gte=today_start).values_list("timestamp", flat=True):
        hour_buckets[ts.hour] += 1
    for ts in Rating.objects.filter(created_at__gte=today_start).values_list("created_at", flat=True):
        hour_buckets[ts.hour] += 1
    for ts in WatchHistory.objects.filter(viewed_at__gte=today_start).values_list("viewed_at", flat=True):
        hour_buckets[ts.hour] += 1

    peak_hour = None
    peak_count = 0
    if hour_buckets:
        peak_hour, peak_count = hour_buckets.most_common(1)[0]

    # Recommendations served today
    recs_today = ModelPredictionLog.objects.filter(created_at__gte=today_start).count()

    return Response({
        "signups_today": signups_today,
        "ratings_today": ratings_today,
        "chatbot_queries_today": chatbot_queries_today,
        "searches_today": searches_today,
        "watchlist_adds_today": watchlist_adds_today,
        "views_today": views_today,
        "active_now": active_now,
        "recs_served_today": recs_today,
        "peak_hour": f"{peak_hour}:00" if peak_hour is not None else None,
        "peak_hour_count": peak_count,
        "updated_at": now.isoformat(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_rating_distribution(request):
    guard = _require_admin(request)
    if guard:
        return guard

    distribution = (
        Rating.objects.values("rating")
        .annotate(count=Count("id"))
        .order_by("rating")
    )
    buckets = {i: 0 for i in range(1, 11)}
    for row in distribution:
        buckets[row["rating"]] = row["count"]

    return Response({
        "distribution": [{"rating": k, "count": v} for k, v in sorted(buckets.items())],
        "total_ratings": sum(buckets.values()),
        "avg_rating": round(
            Rating.objects.aggregate(avg=Avg("rating")).get("avg") or 0, 1
        ),
        "updated_at": timezone.now().isoformat(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_user_growth(request):
    guard = _require_admin(request)
    if guard:
        return guard

    User = get_user_model()
    now = timezone.now()
    days = int(request.GET.get("days", 14))
    days = min(max(days, 7), 90)

    daily = []
    for offset in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = User.objects.filter(date_joined__gte=day_start, date_joined__lt=day_end).count()
        daily.append({
            "date": day_start.strftime("%b %d"),
            "signups": count,
        })

    return Response({
        "daily": daily,
        "total_period": sum(d["signups"] for d in daily),
        "updated_at": now.isoformat(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_model_metrics(request):
    guard = _require_admin(request)
    if guard:
        return guard

    now = timezone.now()
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)
    today_start = timezone.make_aware(
        datetime.combine(timezone.localdate(), datetime.min.time()),
        timezone.get_current_timezone(),
    )

    models = list(
        RecommenderModel.objects.only(
            "id",
            "name",
            "model_type",
            "status",
            "version",
            "description",
        )
        .order_by("name", "id")
        .prefetch_related(
            Prefetch(
                "accuracy_snapshots",
                queryset=ModelAccuracySnapshot.objects.only(
                    "id",
                    "model_id",
                    "accuracy",
                    "metric_type",
                    "note",
                    "computed_at",
                    "total_recommendations",
                    "total_positives",
                ).order_by("-computed_at"),
            )
        )
    )
    model_ids = [model.id for model in models]
    log_aggregates = {
        row["model_id"]: row
        for row in ModelPredictionLog.objects.filter(model_id__in=model_ids)
        .values("model_id")
        .annotate(
            total_predictions=Count("id"),
            predictions_last_24h=Count("id", filter=Q(created_at__gte=last_24h)),
            predictions_last_7d=Count("id", filter=Q(created_at__gte=last_7d)),
            avg_response_time_ms=Avg("response_time_ms"),
            last_used=Max("created_at"),
        )
        .order_by("model_id")
    } if model_ids else {}
    latest_accuracy_values = []
    models_payload = []

    for model in models:
        snapshots = list(model.accuracy_snapshots.all())
        latest_snapshot = snapshots[0] if snapshots else None
        trend_rows = list(snapshots[:7])
        trend_rows.reverse()
        log_stats = log_aggregates.get(model.id, {})

        latest_accuracy = round(latest_snapshot.accuracy, 1) if latest_snapshot else None
        if latest_accuracy is not None:
            latest_accuracy_values.append(latest_accuracy)

        models_payload.append(
            {
                "id": model.id,
                "name": model.name,
                "model_type": model.model_type,
                "display_type": model.get_model_type_display(),
                "status": model.status,
                "version": model.version,
                "description": model.description,
                "latest_accuracy": latest_accuracy,
                "latest_accuracy_metric_type": latest_snapshot.metric_type if latest_snapshot else None,
                "latest_accuracy_note": latest_snapshot.note if latest_snapshot else "",
                "total_predictions": log_stats.get("total_predictions", 0),
                "predictions_last_24h": log_stats.get("predictions_last_24h", 0),
                "predictions_last_7d": log_stats.get("predictions_last_7d", 0),
                "avg_response_time_ms": round(log_stats["avg_response_time_ms"], 1)
                if log_stats.get("avg_response_time_ms") is not None
                else None,
                "last_used": log_stats["last_used"].isoformat() if log_stats.get("last_used") else None,
                "accuracy_trend": [
                    {
                        "date": snapshot.computed_at.date().isoformat(),
                        "computed_at": snapshot.computed_at.isoformat(),
                        "accuracy": round(snapshot.accuracy, 1),
                        "metric_type": snapshot.metric_type,
                        "note": snapshot.note,
                        "total_recommendations": snapshot.total_recommendations,
                        "total_positives": snapshot.total_positives,
                    }
                    for snapshot in trend_rows
                ],
            }
        )

    overall_avg_latency = (
        ModelPredictionLog.objects.exclude(response_time_ms__isnull=True)
        .aggregate(avg=Avg("response_time_ms"))
        .get("avg")
    )
    overall_avg_frontend_render = (
        ModelPredictionLog.objects.exclude(frontend_render_ms__isnull=True)
        .aggregate(avg=Avg("frontend_render_ms"))
        .get("avg")
    )
    timed_logs = list(
        ModelPredictionLog.objects.exclude(response_time_ms__isnull=True)
        .exclude(frontend_render_ms__isnull=True)
        .only("response_time_ms", "frontend_render_ms", "created_at")
        .order_by("-created_at", "-id")
        .values_list("response_time_ms", "frontend_render_ms")[:100]
    )
    total_buffer_samples = [
        _round_metric(recommendation_ms + frontend_ms)
        for recommendation_ms, frontend_ms in timed_logs
    ]
    avg_total_buffer = (
        sum(total_buffer_samples) / len(total_buffer_samples)
        if total_buffer_samples
        else 0.0
    )

    return Response(
        {
            "models": models_payload,
            "summary": {
                "total_models": len(models),
                "active_models": sum(1 for model in models if model.status == "active"),
                "avg_accuracy": round(sum(latest_accuracy_values) / len(latest_accuracy_values), 1)
                if latest_accuracy_values
                else 0.0,
                "avg_response_time_ms": round(overall_avg_latency, 1) if overall_avg_latency is not None else 0.0,
                "avg_recommendation_time_ms": _round_metric(overall_avg_latency),
                "avg_frontend_render_ms": _round_metric(overall_avg_frontend_render),
                "avg_total_buffer_ms": _round_metric(avg_total_buffer),
                "p95_buffer_ms": _buffer_percentile(total_buffer_samples, 95),
                "fastest_ms": _round_metric(min(total_buffer_samples)) if total_buffer_samples else 0.0,
                "slowest_ms": _round_metric(max(total_buffer_samples)) if total_buffer_samples else 0.0,
                "total_predictions_today": ModelPredictionLog.objects.filter(created_at__gte=today_start).count(),
                "total_users": ModelPredictionLog.objects.exclude(user__isnull=True)
                .values("user_id")
                .distinct()
                .count(),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_users(request):
    guard = _require_admin(request)
    if guard:
        return guard

    now = timezone.now()
    month_start = _month_start(now.year, now.month)
    page, page_size = _pagination_params(request, default_page_size=50, max_page_size=50)
    q = (request.GET.get("q") or "").strip().lower()
    status_filter = (request.GET.get("status") or "all").strip().lower()
    role_filter = (request.GET.get("role") or "all").strip().lower()

    User = get_user_model()
    total_users = User.objects.count()
    new_this_month = User.objects.filter(date_joined__gte=month_start).count()
    active_this_month = _active_user_count(month_start, now)
    onboarded_users = User.objects.filter(profile__onboarding_completed=True).count()
    admin_users_count = User.objects.filter(is_staff=True).count()

    users_qs = User.objects.select_related("profile").only(
        "id",
        "username",
        "email",
        "date_joined",
        "is_staff",
        "profile__onboarding_completed",
    )

    if q:
        users_qs = users_qs.filter(Q(username__icontains=q) | Q(email__icontains=q))

    if role_filter == "admin":
        users_qs = users_qs.filter(is_staff=True)
    elif role_filter == "member":
        users_qs = users_qs.filter(is_staff=False)

    users = list(users_qs.order_by("-date_joined", "username", "id"))
    user_ids = [user.id for user in users]

    watched_counts = {}
    rated_counts = {}
    watchlist_counts = {}
    search_counts = {}
    preference_counts = {}
    activity_counts = {}
    recent_watch_map = {}
    recent_rating_map = {}
    recent_search_map = {}
    recent_watchlist_map = {}
    recent_preference_map = {}
    recent_activity_map = {}

    if user_ids:
        watched_counts = _grouped_count_map(WatchHistory.objects.filter(user_id__in=user_ids))
        rated_counts = _grouped_count_map(Rating.objects.filter(user_id__in=user_ids))
        watchlist_counts = _grouped_count_map(Watchlist.objects.filter(user_id__in=user_ids))
        search_counts = _grouped_count_map(SearchHistory.objects.filter(user_id__in=user_ids))
        preference_counts = _grouped_count_map(UserMoviePreference.objects.filter(user_id__in=user_ids))
        activity_counts = _grouped_count_map(UserActivity.objects.filter(user_id__in=user_ids))

        recent_watch_map = _grouped_max_map(WatchHistory.objects.filter(user_id__in=user_ids), "viewed_at")
        recent_rating_map = _grouped_max_map(Rating.objects.filter(user_id__in=user_ids), "created_at")
        recent_search_map = _grouped_max_map(SearchHistory.objects.filter(user_id__in=user_ids), "created_at")
        recent_watchlist_map = _grouped_max_map(Watchlist.objects.filter(user_id__in=user_ids), "added_at")
        recent_preference_map = _grouped_max_map(UserMoviePreference.objects.filter(user_id__in=user_ids), "created_at")
        recent_activity_map = _grouped_max_map(UserActivity.objects.filter(user_id__in=user_ids), "timestamp")

    rows = []
    engagement_values = []
    for user_obj in users:
        user_id = user_obj.id
        watched = watched_counts.get(user_id, 0)
        rated = rated_counts.get(user_id, 0)
        watchlist = watchlist_counts.get(user_id, 0)
        searches = search_counts.get(user_id, 0)
        preferences = preference_counts.get(user_id, 0)
        activity = activity_counts.get(user_id, 0)

        last_seen = _latest_timestamp(
            recent_watch_map.get(user_id),
            recent_rating_map.get(user_id),
            recent_search_map.get(user_id),
            recent_watchlist_map.get(user_id),
            recent_preference_map.get(user_id),
            recent_activity_map.get(user_id),
        )
        status_payload = _user_status_payload(last_seen, now)
        if status_filter != "all" and status_payload["key"] != status_filter:
            continue

        engagement = _calculate_engagement_score(
            watched_count=watched,
            rated_count=rated,
            watchlist_count=watchlist,
            search_count=searches,
            preference_count=preferences,
            activity_count=activity,
        )
        engagement_values.append(engagement)

        rows.append(
            {
                "id": user_id,
                "username": user_obj.username,
                "email": user_obj.email,
                "joined": user_obj.date_joined.isoformat(),
                "watched": watched,
                "rated": rated,
                "watchlist": watchlist,
                "searches": searches,
                "preferences": preferences,
                "engagement": engagement,
                "role": "Admin" if user_obj.is_staff else "Member",
                "onboarding_completed": bool(getattr(getattr(user_obj, "profile", None), "onboarding_completed", False)),
                "status": status_payload,
                "last_seen": last_seen.isoformat() if last_seen else None,
            }
        )

    rows.sort(
        key=lambda item: (
            item["engagement"],
            item["watched"] + item["rated"] + item["watchlist"] + item["searches"],
            item["joined"],
        ),
        reverse=True,
    )

    total_filtered = len(rows)
    avg_engagement = round(sum(engagement_values) / len(engagement_values), 1) if engagement_values else 0.0
    start = (page - 1) * page_size
    end = start + page_size
    rows = rows[start:end]

    return Response(
        {
            "summary": {
                "total_users": total_users,
                "new_this_month": new_this_month,
                "avg_engagement": avg_engagement,
                "active_this_month": active_this_month,
                "onboarded_users": onboarded_users,
                "admin_users": admin_users_count,
            },
            "users": rows,
            "pagination": _pagination_meta(page, page_size, total_filtered),
            "updated_at": now.isoformat(),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_movies(request):
    guard = _require_admin(request)
    if guard:
        return guard

    now = timezone.now()
    current_window_start = now - timedelta(days=30)
    page, page_size = _pagination_params(request, default_page_size=50, max_page_size=50)
    q = (request.GET.get("q") or "").strip()
    status_filter = (request.GET.get("status") or "all").strip().lower()
    genre_filter = (request.GET.get("genre") or "all").strip()

    ai_ready_query = (
        Q(tmdb_id__isnull=False)
        | ~Q(genres="")
        | ~Q(keywords="")
        | ~Q(overview="")
    )
    metadata_gap_query = Q(poster_url="") | Q(overview="") | Q(genres="")

    total_movies = Movie.objects.count()
    ai_ready = Movie.objects.filter(ai_ready_query).distinct().count()
    metadata_gaps = Movie.objects.filter(metadata_gap_query).distinct().count()
    total_views = WatchHistory.objects.count()

    movies_qs = (
        Movie.objects.only(
            "id",
            "tmdb_id",
            "title",
            "genres",
            "poster_url",
            "overview",
            "release_year",
            "original_language",
        )
        .annotate(
            avg_rating=Avg("user_ratings__rating"),
            rating_count=Count("user_ratings", distinct=True),
            watch_count=Count("watch_history", distinct=True),
            watchlist_count=Count("watchlisted_by", distinct=True),
            activity_count=Count("activities", distinct=True),
            preference_count=Count("movie_preferences", distinct=True),
            recent_watch_count=Count(
                "watch_history",
                filter=Q(watch_history__viewed_at__gte=current_window_start),
                distinct=True,
            ),
        )
        .annotate(
            interaction_count=ExpressionWrapper(
                Coalesce(F("rating_count"), Value(0))
                + Coalesce(F("watch_count"), Value(0))
                + Coalesce(F("watchlist_count"), Value(0))
                + Coalesce(F("activity_count"), Value(0))
                + Coalesce(F("preference_count"), Value(0)),
                output_field=IntegerField(),
            ),
        )
        .annotate(
            ai_score_value=ExpressionWrapper(
                (Coalesce(F("avg_rating"), Value(0.0)) * Value(8.2))
                + Least(
                    ExpressionWrapper(F("interaction_count") * Value(3.4), output_field=FloatField()),
                    Value(30.0),
                ),
                output_field=FloatField(),
            ),
        )
    )

    if q:
        movies_qs = movies_qs.filter(
            Q(title__icontains=q) | Q(genres__icontains=q) | Q(keywords__icontains=q)
        )

    if genre_filter and genre_filter.lower() != "all":
        movies_qs = movies_qs.filter(genres__icontains=genre_filter)

    movie_status_queries = _movie_status_queries(now)
    if status_filter != "all":
        status_query = movie_status_queries.get(status_filter)
        if status_query is not None:
            movies_qs = movies_qs.filter(status_query)

    movies_qs = movies_qs.order_by("-ai_score_value", "-watch_count", "-rating_count", "title", "id")
    total_filtered = movies_qs.count()
    start = (page - 1) * page_size
    end = start + page_size

    rows = []
    for row in movies_qs[start:end]:
        interaction_count = row.interaction_count or 0
        status_payload = _movie_status_payload(row, now, interaction_count)

        primary_genre = next((part.strip() for part in (row.genres or "").split(",") if part.strip()), "Uncategorized")
        rows.append(
            {
                "id": row.id,
                "tmdb_id": row.tmdb_id,
                "title": row.title,
                "poster_url": row.poster_url,
                "release_year": row.release_year,
                "original_language": row.original_language,
                "genre": primary_genre,
                "genres": [part.strip() for part in (row.genres or "").split(",") if part.strip()],
                "rating": round(row.avg_rating or 0, 1),
                "rating_count": row.rating_count or 0,
                "ai_score": _movie_ai_score(row.avg_rating or 0, interaction_count),
                "views": row.watch_count or 0,
                "watchlist_count": row.watchlist_count or 0,
                "interactions": interaction_count,
                "status": status_payload,
            }
        )

    genre_values = set()
    for movie in Movie.objects.only("genres").exclude(genres="").order_by("id").iterator(chunk_size=100):
        for genre in (movie.genres or "").split(","):
            cleaned = genre.strip()
            if cleaned:
                genre_values.add(cleaned)

    return Response(
        {
            "summary": {
                "total_movies": total_movies,
                "ai_ready": ai_ready,
                "metadata_gaps": metadata_gaps,
                "total_views": total_views,
            },
            "genres": sorted(genre_values),
            "movies": rows,
            "pagination": _pagination_meta(page, page_size, total_filtered),
            "updated_at": now.isoformat(),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_system_info(request):
    guard = _require_admin(request)
    if guard:
        return guard

    import django
    import sys
    from django.conf import settings as django_settings
    from django.db import connection

    now = timezone.now()
    User = get_user_model()

    # Database stats
    db_engine = connection.settings_dict.get("ENGINE", "").rsplit(".", 1)[-1]
    db_name = connection.settings_dict.get("NAME", "")
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db_status = "connected"
    except Exception:
        db_status = "error"

    # API integration status
    tmdb_key = bool(getattr(django_settings, "TMDB_READ_TOKEN", "") or getattr(django_settings, "TMDB_API_KEY", ""))
    groq_key = bool(getattr(django_settings, "GROQ_API_KEY", ""))
    gemini_key = bool(getattr(django_settings, "GEMINI_API_KEY", ""))
    google_id = bool(getattr(django_settings, "GOOGLE_CLIENT_ID", ""))

    integrations = [
        {
            "name": "TMDB API",
            "description": "Movie metadata, posters, and discovery",
            "status": "connected" if tmdb_key else "not_configured",
        },
        {
            "name": "Groq (AI Chat)",
            "description": "LLM-powered chatbot responses",
            "status": "connected" if groq_key else "not_configured",
        },
        {
            "name": "Gemini API",
            "description": "Fallback AI provider",
            "status": "connected" if gemini_key else "not_configured",
        },
        {
            "name": "Google OAuth",
            "description": "Social login with Google",
            "status": "connected" if google_id else "not_configured",
        },
    ]

    # Cache status
    cache_backend = django_settings.CACHES.get("default", {}).get("BACKEND", "")
    cache_type = cache_backend.rsplit(".", 1)[-1] if cache_backend else "unknown"
    cache_timeout = django_settings.CACHES.get("default", {}).get("TIMEOUT", 0)

    # Recommender info
    from api.recommender.recommend import (
        RECOMMEND_WEIGHTS,
        HIGH_RATING_THRESHOLD,
        LIKED_RATING_THRESHOLD,
        RECENT_VIEWS_LIMIT,
        RECOMMENDED_FOR_YOU_LIMIT,
        LANGUAGE_UNKNOWN_MULTIPLIER,
        ONBOARDING_GENRE_WEIGHT,
        ONBOARDING_VIBE_WEIGHT,
        LOCAL_CANDIDATE_LIMIT,
        DISCOVER_BACKFILL_LIMIT,
    )

    recommender_models = RecommenderModel.objects.count()
    active_models = RecommenderModel.objects.filter(status="active").count()

    recommender_config = {
        "weights": RECOMMEND_WEIGHTS,
        "high_rating_threshold": HIGH_RATING_THRESHOLD,
        "liked_rating_threshold": LIKED_RATING_THRESHOLD,
        "recent_views_limit": RECENT_VIEWS_LIMIT,
        "recommended_for_you_limit": RECOMMENDED_FOR_YOU_LIMIT,
        "language_unknown_multiplier": LANGUAGE_UNKNOWN_MULTIPLIER,
        "onboarding_genre_weight": ONBOARDING_GENRE_WEIGHT,
        "onboarding_vibe_weight": ONBOARDING_VIBE_WEIGHT,
        "local_candidate_limit": LOCAL_CANDIDATE_LIMIT,
        "discover_backfill_limit": DISCOVER_BACKFILL_LIMIT,
        "total_models": recommender_models,
        "active_models": active_models,
    }

    # Platform overview counts
    total_users = User.objects.count()
    admin_count = User.objects.filter(is_staff=True).count()
    total_movies = Movie.objects.count()
    total_ratings = Rating.objects.count()
    total_reviews = Review.objects.count()
    total_activities = UserActivity.objects.count()
    from api.models import ChatSession, ChatMessage
    total_chat_sessions = ChatSession.objects.count()
    total_chat_messages = ChatMessage.objects.count()

    return Response({
        "platform": {
            "name": "CineMatch",
            "version": "1.0.0",
            "django_version": django.get_version(),
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "debug_mode": django_settings.DEBUG,
        },
        "database": {
            "engine": db_engine,
            "name": str(db_name).rsplit("/", 1)[-1] if "/" in str(db_name) else str(db_name),
            "status": db_status,
        },
        "cache": {
            "backend": cache_type,
            "timeout_seconds": cache_timeout,
        },
        "integrations": integrations,
        "recommender": recommender_config,
        "data_summary": {
            "total_users": total_users,
            "admin_users": admin_count,
            "total_movies": total_movies,
            "total_ratings": total_ratings,
            "total_reviews": total_reviews,
            "total_activities": total_activities,
            "total_chat_sessions": total_chat_sessions,
            "total_chat_messages": total_chat_messages,
        },
        "updated_at": now.isoformat(),
    })


# -----------------------
# TMDB endpoints (Public)
# -----------------------
def _format_trending_payload(data):
    results = data.get("results", []) or []
    movies = []

    for m in results:
        movies.append(
            {
                "id": m.get("id"),
                "title": m.get("title") or m.get("name"),
                "description": m.get("overview") or "",
                "poster_url": _tmdb_poster_url(m.get("poster_path")),
                "backdrop_url": (
                    f"https://image.tmdb.org/t/p/original{m['backdrop_path']}"
                    if m.get("backdrop_path")
                    else None
                ),
                "rating": round(float(m.get("vote_average") or 0), 1),
                "year": (m.get("release_date") or "")[:4] or None,
                "genre": "Movie",
                "duration": None,
            }
        )

    return movies


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_trending(request):
    cached = cache.get("tmdb_trending_payload")
    if cached is not None:
        return Response(cached)
    try:
        data = get_trending_movies()
    except Exception as e:
        return _error("TMDB trending fetch failed", status_code=500, error=str(e))
    payload = _format_trending_payload(data)
    cache.set("tmdb_trending_payload", payload, timeout=300)
    return Response(payload)


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_movie_details(request, tmdb_id):
    try:
        data = get_movie_details(tmdb_id)
        if request.user.is_authenticated:
            movie = get_or_create_movie_from_tmdb(tmdb_id)
            WatchHistory.objects.create(user=request.user, movie=movie)
            _log_activity(
                request.user,
                "watched",
                movie=movie,
                source="tmdb_movie_details",
            )
        return Response(data)
    except Exception as e:
        return _error("TMDB movie details fetch failed", status_code=500, error=str(e))


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_movie_credits(request, tmdb_id):
    try:
        data = get_movie_credits(tmdb_id)
        return Response(data)
    except Exception as e:
        return _error("Failed to fetch credits", status_code=500, error=str(e))


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_movie_similar(request, tmdb_id):
    try:
        data = get_similar_movies(tmdb_id)
        return Response(data)
    except Exception as e:
        return _error("Failed to fetch similar movies", status_code=500, error=str(e))


@api_view(["GET"])
@permission_classes([AllowAny])
def recommendations_for_user(request, user_id):
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10

    try:
        tmdb_ids = recommend_movies(user_id, n=n)
        return Response(
            {
                "user_id": user_id,
                "tmdb_ids": tmdb_ids,
            }
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    

@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_movie_videos(request, tmdb_id):
    try:
        data = get_movie_videos(tmdb_id)
        return Response(data)
    except Exception as e:
        return _error("Failed to fetch videos", status_code=500, error=str(e))


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_movie_keywords(request, tmdb_id):
    try:
        data = get_movie_keywords(tmdb_id)
        return Response(data)
    except Exception as e:
        return _error("Failed to fetch keywords", status_code=500, error=str(e))


@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_movie_recommendations(request, tmdb_id):
    try:
        data = tmdb_get_recommendations(tmdb_id)
        return Response(data)
    except Exception as e:
        return _error("Failed to fetch recommendations", status_code=500, error=str(e))


# -----------------------
# SVD Recommender endpoints
# -----------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_personalized(request):
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10

    start_time = time.time()
    payload = personalized_recommend_with_reasons(user_id=request.user.id, n=n)
    elapsed_ms = round((time.time() - start_time) * 1000, 2)
    _hydrate_payload(payload)
    return Response({**payload, "meta": _timing_meta(elapsed_ms)})


@api_view(["GET"])
@permission_classes([AllowAny])
def recs_similar(request, tmdb_id):
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10

    payload = similar_movies_with_reason(tmdb_id, n=n)
    _hydrate_payload(payload)
    return Response(payload)


@api_view(["GET"])
@permission_classes([AllowAny])
def recs_trending(request):
    cached = cache.get("recs_trending_payload")
    if cached is not None:
        return Response(cached)
    try:
        data = get_trending_movies()
    except Exception as e:
        return _error("TMDB trending fetch failed", status_code=500, error=str(e))
    payload = _format_trending_payload(data)
    cache.set("recs_trending_payload", payload, timeout=300)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_surprise(request):
    n = request.GET.get("n", 4)
    exclude_raw = request.GET.get("exclude", "")
    try:
        n = int(n)
    except Exception:
        n = 4
    exclude = []
    if exclude_raw:
        for part in str(exclude_raw).split(","):
            part = part.strip()
            if not part:
                continue
            try:
                exclude.append(int(part))
            except Exception:
                continue

    payload = surprise_recommendations(request.user.id, n=n, exclude=exclude)
    if payload.get("tmdb_ids"):
        _hydrate_payload(payload)
        return Response(payload)

    if not payload.get("has_history"):
        try:
            data = get_trending_movies(timeout=3)
            results = data.get("results", []) or []
            tmdb_ids = [m.get("id") for m in results[:n] if m.get("id")]
            reason = "Trending right now"
            fallback = {
                "tmdb_ids": tmdb_ids,
                "reason": reason,
                "items": [{"tmdb_id": tmdb_id, "reason": reason} for tmdb_id in tmdb_ids],
            }
            _hydrate_payload(fallback)
            return Response(fallback)
        except Exception:
            return Response({"tmdb_ids": [], "movies": [], "reason": "Recommended for you", "items": []})

    return Response(payload)


def _fallback_discover(n, sort_by="popularity.desc", extra_params=None):
    """Return a fallback payload from TMDB discover when the user has no interaction data."""
    try:
        params = {"sort_by": sort_by}
        if extra_params:
            params.update(extra_params)
        data = discover_movies(**params, timeout=3)
        results = (data.get("results") or [])[:n]
        movies = [_format_movie_obj(m) for m in results if m.get("id")]
        movies = [m for m in movies if m]
        tmdb_ids = [m["id"] for m in movies]
        return {"tmdb_ids": tmdb_ids, "movies": movies}
    except Exception:
        return {"tmdb_ids": [], "movies": []}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_loved(request):
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10
    payload = loved_movies_with_reason(request.user.id, n=n)
    _hydrate_payload(payload)
    if not payload.get("tmdb_ids"):
        fb = _fallback_discover(n, sort_by="vote_average.desc", extra_params={"vote_count_gte": "1000"})
        fb["reason"] = "Movies you might love"
        fb["seed_title"] = None
        fb["seed_tmdb_id"] = None
        fb["fallback"] = True
        return Response(fb)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_liked(request):
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10
    payload = liked_movies_with_reason(request.user.id, n=n)
    _hydrate_payload(payload)
    if not payload.get("tmdb_ids"):
        fb = _fallback_discover(n, sort_by="popularity.desc", extra_params={"vote_count_gte": "500"})
        fb["reason"] = "Popular movies you might like"
        fb["seed_title"] = None
        fb["seed_tmdb_id"] = None
        fb["fallback"] = True
        return Response(fb)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_rated(request):
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10
    payload = rated_movies_with_reason(request.user.id, n=n)
    _hydrate_payload(payload)
    if not payload.get("tmdb_ids"):
        fb = _fallback_discover(n, sort_by="vote_average.desc", extra_params={"vote_count_gte": "2000"})
        fb["reason"] = "Top rated picks"
        fb["seed_title"] = None
        fb["seed_tmdb_id"] = None
        fb["fallback"] = True
        return Response(fb)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_watchlist(request):
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10
    payload = watchlist_movies_with_reason(request.user.id, n=n)
    _hydrate_payload(payload)
    if not payload.get("tmdb_ids"):
        fb = _fallback_discover(n, sort_by="popularity.desc")
        fb["reason"] = "Worth adding to your watchlist"
        fb["seed_title"] = None
        fb["seed_tmdb_id"] = None
        fb["fallback"] = True
        return Response(fb)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_batched(request):
    """Return loved/liked/rated/watchlist sections in a single response with cross-section dedup."""
    n = request.GET.get("n", 12)
    try:
        n = int(n)
    except Exception:
        n = 12

    # Check for cached hydrated response
    batched_cache_key = f"recs_batched_hydrated:{request.user.id}:{n}"
    cached_response = cache.get(batched_cache_key)
    if cached_response is not None:
        return Response(cached_response)

    sections = batched_personalized_sections(request.user.id, n=n)

    # Hydrate all sections, apply fallback where empty
    fallback_configs = {
        "loved": {"sort_by": "vote_average.desc", "extra": {"vote_count_gte": "1000"},
                  "reason": "Movies you might love"},
        "liked": {"sort_by": "popularity.desc", "extra": {"vote_count_gte": "500"},
                  "reason": "Popular movies you might like"},
        "rated": {"sort_by": "vote_average.desc", "extra": {"vote_count_gte": "2000"},
                  "reason": "Top rated picks"},
        "watchlist": {"sort_by": "popularity.desc", "extra": None,
                      "reason": "Worth adding to your watchlist"},
    }

    # Collect all tmdb_ids across sections for a single bulk hydration
    all_ids = []
    for key in ("loved", "rated", "liked", "watchlist"):
        all_ids.extend(sections[key].get("tmdb_ids", []))

    # Bulk hydrate once
    if all_ids:
        hydrated_map = {}
        for movie in bulk_get_movie_details(list(dict.fromkeys(all_ids))):
            if movie and movie.get("id"):
                hydrated_map[movie["id"]] = movie

        for key in ("loved", "rated", "liked", "watchlist"):
            section = sections[key]
            section["movies"] = [hydrated_map[tid] for tid in section.get("tmdb_ids", []) if tid in hydrated_map]

    # Apply fallbacks for empty sections
    for key, cfg in fallback_configs.items():
        section = sections[key]
        if not section.get("tmdb_ids"):
            fb = _fallback_discover(n, sort_by=cfg["sort_by"], extra_params=cfg["extra"])
            fb["reason"] = cfg["reason"]
            fb["seed_title"] = None
            fb["seed_tmdb_id"] = None
            fb["fallback"] = True
            sections[key] = fb

    cache.set(batched_cache_key, sections, timeout=300)
    return Response(sections)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_genres(request):
    top_n = request.GET.get("n", 3)
    try:
        top_n = int(top_n)
    except Exception:
        top_n = 3
    genre_ids = favorite_genres_profile(request.user.id, top_n=top_n)
    return Response({"genre_ids": genre_ids})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_recommended_for_you(request):
    user_id = request.GET.get("user_id")
    if user_id is not None:
        try:
            user_id = int(user_id)
        except Exception:
            return _error("user_id must be an integer")
        if user_id != request.user.id and not request.user.is_staff:
            return _error("Forbidden", status_code=403)

    n = request.GET.get("n", 6)
    try:
        n = int(n)
    except Exception:
        n = 6

    target_user_id = user_id if user_id is not None else request.user.id

    # Check for cached hydrated response. This is the fast path.
    hydrated_cache_key = f"recs_rfy_hydrated:{target_user_id}:{n}"
    cached_response = cache.get(hydrated_cache_key)
    if cached_response is not None:
        return Response(cached_response)

    # recommended_for_you is now cache-first with stale-while-revalidate, so
    # it returns almost instantly. We keep a modest safety timeout but drop
    # the nested ThreadPoolExecutor — it added overhead without real value.
    start_time = time.time()
    try:
        payload = recommended_for_you(target_user_id, n)
    except Exception:
        payload = {"tmdb_ids": [], "explanation": {
            "reason_type": "trending",
            "reason_text": "Here are some trending favorites.",
        }}
    elapsed_ms = round((time.time() - start_time) * 1000, 2)
    recommended_ids = payload.get("tmdb_ids", [])

    if not recommended_ids:
        try:
            trending = get_trending_movies(timeout=1.5)
            recommended_ids = [m.get("id") for m in (trending.get("results") or [])[:n] if m.get("id")]
        except Exception:
            pass

    # Prediction logging is a DB write that blocks the response. Only log on
    # *fresh* computes (not on cache hits from within the same request cycle)
    # and skip entirely for very fast responses which are almost certainly
    # cache hits. Keeps the hot path DB-write-free.
    if recommended_ids and elapsed_ms >= 50:
        try:
            active_models = list(RecommenderModel.objects.filter(status="active").only("id"))
            if active_models:
                ModelPredictionLog.objects.bulk_create([
                    ModelPredictionLog(
                        model=model,
                        user_id=target_user_id,
                        recommended_tmdb_ids=recommended_ids[:20],
                        signal_used="recommended_for_you",
                        response_time_ms=elapsed_ms,
                    )
                    for model in active_models
                ])
        except Exception:
            pass

    hydrated = bulk_get_movie_details(recommended_ids) if recommended_ids else []
    response_data = {
        "tmdb_ids": recommended_ids,
        "movies": hydrated,
        "explanation": payload.get("explanation", {}),
        "meta": _timing_meta(elapsed_ms),
    }
    cache.set(hydrated_cache_key, response_data, timeout=300)
    return Response(response_data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def recs_log_timing(request):
    def _parse_timing_value(field_name: str) -> float:
        raw_value = request.data.get(field_name)
        try:
            parsed = float(raw_value)
        except (TypeError, ValueError):
            raise ValueError(f"{field_name} must be a number")
        return round(parsed, 2)

    try:
        recommendation_time_ms = _parse_timing_value("recommendation_time_ms")
        frontend_render_ms = _parse_timing_value("frontend_render_ms")
        total_buffer_ms = _parse_timing_value("total_buffer_ms")
    except ValueError as exc:
        return _error(str(exc))

    latest_log = (
        ModelPredictionLog.objects.filter(user=request.user)
        .order_by("-created_at", "-id")
        .first()
    )
    if not latest_log:
        return _error("No prediction log found for this user", status_code=404)

    latest_log.response_time_ms = recommendation_time_ms
    latest_log.frontend_render_ms = frontend_render_ms
    latest_log.save(update_fields=["response_time_ms", "frontend_render_ms"])

    return Response(
        {
            "message": "Timing logged",
            "meta": {
                "recommendation_time_ms": recommendation_time_ms,
                "frontend_render_ms": frontend_render_ms,
                "total_buffer_ms": total_buffer_ms,
            },
        }
    )


# -----------------------
# Helper: Create/Update local Movie from TMDB
# -----------------------
def get_or_create_movie_from_tmdb(tmdb_id: int) -> Movie:
    # Do not fail watchlist/rating just because TMDB is unavailable.
    try:
        data = get_movie_details(tmdb_id) or {}
    except Exception:
        data = {}

    title = data.get("title") or data.get("original_title") or f"TMDB {tmdb_id}"
    overview = data.get("overview") or ""
    genres = ", ".join([g.get("name", "") for g in data.get("genres", [])]) if data.get("genres") else ""
    poster_path = data.get("poster_path")
    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else ""
    original_language = data.get("original_language") or ""
    keywords = ""
    try:
        keyword_payload = get_movie_keywords(tmdb_id) or {}
        keywords_list = keyword_payload.get("keywords") or keyword_payload.get("results") or []
        keywords = ", ".join([k.get("name", "") for k in keywords_list if k.get("name")])
    except Exception:
        keywords = ""

    release_year = None
    release_date = data.get("release_date")
    if release_date and len(release_date) >= 4:
        try:
            release_year = int(release_date[:4])
        except Exception:
            release_year = None

    defaults = {
        "title": title,
        "overview": overview,
        "genres": genres,
        "keywords": keywords,
        "poster_url": poster_url,
        "release_year": release_year,
        "original_language": original_language,
    }

    movie, created = Movie.objects.get_or_create(
        tmdb_id=tmdb_id,
        defaults=defaults,
    )

    if not created:
        updated = False
        for k, v in defaults.items():
            if getattr(movie, k, None) != v:
                setattr(movie, k, v)
                updated = True
        if updated:
            movie.save()

    return movie


# -----------------------
# Watchlist (AUTH required)
# -----------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_watchlist(request):
    tmdb_id = request.data.get("tmdb_id")
    if tmdb_id is None:
        return _error("Missing field: tmdb_id")

    try:
        tmdb_id = int(tmdb_id)
    except Exception:
        return _error("tmdb_id must be an integer")

    movie = get_or_create_movie_from_tmdb(tmdb_id)

    try:
        obj, created = Watchlist.objects.get_or_create(user=request.user, movie=movie)
    except Exception as e:
        return _error("Watchlist update failed", status_code=500, error=str(e))

    if not created:
        obj.delete()
        _log_activity(
            request.user,
            "removed_watchlist",
            movie=movie,
            tmdb_id=tmdb_id,
        )
        _invalidate_recs_for_user(request.user.id)
        return Response({"message": "Removed from watchlist", "in_watchlist": False})

    _log_activity(
        request.user,
        "added_watchlist",
        movie=movie,
        tmdb_id=tmdb_id,
    )
    _invalidate_recs_for_user(request.user.id)
    return Response({"message": "Added to watchlist", "in_watchlist": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def watchlist_count(request):
    count = Watchlist.objects.filter(user=request.user).count()
    return Response({"count": count})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def watchlist_status(request, tmdb_id):
    movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
    if not movie:
        return Response({"tmdb_id": tmdb_id, "in_watchlist": False})
    exists = Watchlist.objects.filter(user=request.user, movie=movie).exists()
    return Response({"tmdb_id": tmdb_id, "in_watchlist": exists})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def last_watched(request):
    row = (
        WatchHistory.objects.filter(user=request.user)
        .select_related("movie")
        .order_by("-id")
        .first()
    )
    if row and row.movie and row.movie.tmdb_id is not None:
        return Response({"tmdb_id": row.movie.tmdb_id, "title": row.movie.title})

    pref = (
        UserMoviePreference.objects.filter(
            user=request.user,
            preference__in=["love", "like"],
        )
        .select_related("movie")
        .order_by("-id")
        .first()
    )
    if pref and pref.movie and pref.movie.tmdb_id is not None:
        return Response({"tmdb_id": pref.movie.tmdb_id, "title": pref.movie.title})

    return Response({}, status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_watchlist(request):
    items = (
        Watchlist.objects.filter(user=request.user)
        .select_related("movie")
        .order_by("-id")
    )

    data = []
    for w in items:
        tmdb_id = w.movie.tmdb_id if getattr(w.movie, "tmdb_id", None) is not None else None

        poster_url = None
        year = None
        rating = None
        description = ""
        director = None
        stars = []

        if tmdb_id is not None:
            try:
                details = get_movie_details(tmdb_id) or {}
                poster_path = details.get("poster_path")
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
                year = (details.get("release_date") or "")[:4] or None
                rating = round(float(details.get("vote_average") or 0), 1)
                description = (details.get("overview") or "").strip()
            except Exception:
                pass

            try:
                credits = get_movie_credits(tmdb_id) or {}
                crew = credits.get("crew", []) or []
                cast = credits.get("cast", []) or []
                d = next((c for c in crew if c.get("job") == "Director"), None)
                director = d.get("name") if d else None
                stars = [c.get("name") for c in cast[:4] if c.get("name")]
            except Exception:
                pass

        data.append(
            {
                "tmdb_id": tmdb_id,
                "title": getattr(w.movie, "title", None),
                "poster_url": poster_url,
                "year": year,
                "rating": rating,
                "genres": getattr(w.movie, "genres", "") or "",
                "description": description,
                "director": director,
                "stars": stars,
                "added_at": w.added_at,
            }
        )

    return Response(data)


# -----------------------
# Rating (AUTH required)
# -----------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_rating(request):
    tmdb_id = request.data.get("tmdb_id")
    rating_value = request.data.get("rating")

    if tmdb_id is None:
        return _error("Missing field: tmdb_id")
    if rating_value is None:
        return _error("Missing field: rating")

    try:
        tmdb_id = int(tmdb_id)
        rating_value = int(rating_value)
    except Exception:
        return _error("tmdb_id and rating must be integers")

    if rating_value < 1 or rating_value > 5:
        return _error("rating must be between 1 and 5")

    movie = get_or_create_movie_from_tmdb(tmdb_id)

    try:
        Rating.objects.update_or_create(
            user=request.user,
            movie=movie,
            defaults={"rating": rating_value},
        )
    except Exception as e:
        return _error("Failed to save rating", status_code=500, error=str(e))

    _log_activity(
        request.user,
        "rated",
        movie=movie,
        rating=rating_value,
        rating_value=rating_value,
    )
    _invalidate_recs_for_user(request.user.id)
    return Response({"message": "Rating saved", "rating": rating_value})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_rating(request, tmdb_id):
    movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
    if not movie:
        return Response({"tmdb_id": tmdb_id, "rating": 0})
    r = Rating.objects.filter(user=request.user, movie=movie).first()
    return Response({"tmdb_id": tmdb_id, "rating": r.rating if r else 0})


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_rating(request, tmdb_id):
    movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
    if not movie:
        return Response({"tmdb_id": tmdb_id, "rating": 0})
    Rating.objects.filter(user=request.user, movie=movie).delete()
    _invalidate_recs_for_user(request.user.id)
    return Response({"message": "Rating removed", "rating": 0})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_preference(request, tmdb_id):
    movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
    if not movie:
        return Response({"tmdb_id": tmdb_id, "preference": None})
    pref = UserMoviePreference.objects.filter(user=request.user, movie=movie).first()
    return Response({"tmdb_id": tmdb_id, "preference": pref.preference if pref else None})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_preference(request):
    tmdb_id = request.data.get("tmdb_id")
    preference = request.data.get("preference")
    preference_map = {
        "love": "love",
        "like": "like",
        "dislike": "dislike",
    }

    if tmdb_id is None:
        return _error("Missing field: tmdb_id")
    try:
        tmdb_id = int(tmdb_id)
    except Exception:
        return _error("tmdb_id must be an integer")

    if preference in (None, "", "null"):
        movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
        if not movie:
            return Response({"tmdb_id": tmdb_id, "preference": None})
        UserMoviePreference.objects.filter(user=request.user, movie=movie).delete()
        _invalidate_recs_for_user(request.user.id)
        return Response({"tmdb_id": tmdb_id, "preference": None})

    preference = preference_map.get(str(preference).strip().lower())
    if preference not in {"love", "like", "dislike"}:
        return _error("preference must be love, like, or dislike")

    movie = get_or_create_movie_from_tmdb(tmdb_id)
    UserMoviePreference.objects.update_or_create(
        user=request.user,
        movie=movie,
        defaults={"preference": preference},
    )
    _log_activity(
        request.user,
        "loved" if preference == "love" else "liked" if preference == "like" else "disliked",
        movie=movie,
        preference=preference,
    )
    _invalidate_recs_for_user(request.user.id)
    return Response({"tmdb_id": tmdb_id, "preference": preference})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_ratings(request):
    rows = (
        Rating.objects.filter(user=request.user)
        .select_related("movie")
        .order_by("-created_at")
    )

    data = []
    for row in rows:
        movie = row.movie
        data.append(
            {
                "tmdb_id": movie.tmdb_id,
                "title": movie.title,
                "poster_url": movie.poster_url or None,
                "year": movie.release_year,
                "genres": movie.genres or "",
                "overview": movie.overview or "",
                "rating": row.rating,
                "rated_at": row.created_at,
            }
        )

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_preferences(request):
    rows = (
        UserMoviePreference.objects.filter(user=request.user)
        .select_related("movie")
        .order_by("-created_at")
    )

    data = []
    for row in rows:
        movie = row.movie
        data.append(
            {
                "tmdb_id": movie.tmdb_id,
                "title": movie.title,
                "poster_url": movie.poster_url or None,
                "year": movie.release_year,
                "genres": movie.genres or "",
                "overview": movie.overview or "",
                "preference": row.preference,
                "created_at": row.created_at,
            }
        )

    return Response(data)


# -----------------------
# Reviews
# -----------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_review_tmdb(request):
    tmdb_id = request.data.get("tmdb_id")
    text = request.data.get("text")
    stars = request.data.get("stars")

    if tmdb_id is None:
        return _error("Missing field: tmdb_id")
    if text is None or str(text).strip() == "":
        return _error("Missing field: text")
    if stars is None:
        return _error("Missing field: stars")

    try:
        tmdb_id = int(tmdb_id)
        stars = int(stars)
    except Exception:
        return _error("tmdb_id and stars must be integers")

    if stars < 1 or stars > 5:
        return _error("stars must be between 1 and 5")

    movie = get_or_create_movie_from_tmdb(tmdb_id)

    try:
        review = Review.objects.create(
            user=request.user,
            movie=movie,
            text=str(text),
            stars=stars,
        )
    except Exception as e:
        return _error("Failed to add review", status_code=500, error=str(e))

    return Response({"message": "Review added", "review_id": review.id})


@api_view(["GET"])
@permission_classes([AllowAny])
def list_reviews_tmdb(request, tmdb_id):
    movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
    if not movie:
        return Response([], status=status.HTTP_200_OK)

    reviews = (
        Review.objects.filter(movie=movie)
        .select_related("user")
        .order_by("-created_at")[:20]
    )

    data = [
        {
            "id": r.id,
            "user": getattr(r.user, "username", None),
            "text": r.text,
            "stars": r.stars,
            "created_at": r.created_at.isoformat(),
        }
        for r in reviews
    ]
    return Response(data)


# -----------------------
# Legacy / Local Movie endpoints (optional)
# -----------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def movie_list(request):
    qs = Movie.objects.all().values()
    return Response(list(qs))


# -----------------------
# TMDB Discover (Public)
# -----------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_discover(request):
    try:
        page = int(request.GET.get("page", 1))
    except Exception:
        page = 1

    sort_by = request.GET.get("sort_by", "popularity.desc")
    with_genres = request.GET.get("with_genres", "")

    primary_release_year = request.GET.get("primary_release_year") or request.GET.get("year", "")
    with_original_language = request.GET.get("with_original_language") or request.GET.get("lang", "")
    vote_count_gte = request.GET.get("vote_count_gte") or request.GET.get("vote_count.gte", "")
    release_date_gte = request.GET.get("release_date_gte") or request.GET.get("primary_release_date.gte", "")
    release_date_lte = request.GET.get("release_date_lte") or request.GET.get("primary_release_date.lte", "")

    region = request.GET.get("region", "")
    query = request.GET.get("q", "")

    if request.user.is_authenticated and query and str(query).strip():
        SearchHistory.objects.create(user=request.user, query=str(query).strip())
        _log_activity(
            request.user,
            "searched",
            query=str(query).strip(),
        )

    # Cache non-search discover requests for 5 minutes
    discover_cache_key = None
    if not query:
        discover_cache_key = f"tmdb_discover:{sort_by}:{with_genres}:{primary_release_year}:{with_original_language}:{vote_count_gte}:{release_date_gte}:{release_date_lte}:{page}"
        cached = cache.get(discover_cache_key)
        if cached is not None:
            return Response(cached)

    try:
        data = discover_movies(
            page=page,
            sort_by=sort_by,
            with_genres=with_genres,
            primary_release_year=primary_release_year,
            query=query,
            with_original_language=with_original_language,
            region=region,
            vote_count_gte=vote_count_gte,
            release_date_gte=release_date_gte,
            release_date_lte=release_date_lte,
        )
    except Exception as e:
        return _error("TMDB discover fetch failed", status_code=500, error=str(e))

    results = data.get("results", []) or []
    movies = []

    for m in results:
        movies.append(
            {
                "id": m.get("id"),
                "title": m.get("title") or m.get("name"),
                "description": m.get("overview") or "",
                "poster_url": _tmdb_poster_url(m.get("poster_path")),
                "backdrop_url": (
                    f"https://image.tmdb.org/t/p/original{m['backdrop_path']}"
                    if m.get("backdrop_path")
                    else None
                ),
                "rating": round(float(m.get("vote_average") or 0), 1),
                "year": (m.get("release_date") or "")[:4] or None,
            }
        )

    response_data = {
        "page": data.get("page"),
        "total_pages": data.get("total_pages"),
        "total_results": data.get("total_results"),
        "results": movies,
    }
    if discover_cache_key:
        cache.set(discover_cache_key, response_data, timeout=300)
    return Response(response_data)


# -----------------------
# AI Recommender (Public)
# -----------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_recommend(request):
    message = request.GET.get("movie", "") or request.GET.get("message", "")

    def extract_genre_intent(text: str) -> str | None:
        text = (text or "").lower()
        genre_map = {
            "action": ["action", "fight", "war", "battle"],
            "romance": ["romance", "love", "romantic"],
            "thriller": ["thriller", "suspense", "mystery"],
            "horror": ["horror", "scary", "ghost", "haunted"],
            "comedy": ["comedy", "funny", "humor"],
            "drama": ["drama", "emotional"],
            "sci-fi": ["sci-fi", "scifi", "science fiction", "space"],
            "family": ["family", "kids", "children"],
            "animation": ["animation", "animated"],
            "crime": ["crime", "detective", "investigation"],
        }
        for genre, keywords in genre_map.items():
            if any(k in text for k in keywords):
                return genre
        return None

    def extract_decade(text: str):
        text = (text or "").lower()
        if "2000s" in text:
            return ("2000-01-01", "2009-12-31")
        if "2010s" in text:
            return ("2010-01-01", "2019-12-31")
        if "1990s" in text:
            return ("1990-01-01", "1999-12-31")
        return (None, None)

    def extract_intent(text: str):
        text = (text or "").lower()
        if "hidden gem" in text or "underrated" in text:
            return "hidden_gem"
        if "best" in text or "top" in text or "greatest" in text:
            return "best"
        return None

    genre_to_id = {
        "action": 28,
        "adventure": 12,
        "animation": 16,
        "comedy": 35,
        "crime": 80,
        "drama": 18,
        "family": 10751,
        "fantasy": 14,
        "horror": 27,
        "music": 10402,
        "mystery": 9648,
        "romance": 10749,
        "sci-fi": 878,
        "thriller": 53,
        "war": 10752,
        "western": 37,
    }

    user_id = request.user.id

    genre = extract_genre_intent(message)
    intent = extract_intent(message)
    release_date_gte, release_date_lte = extract_decade(message)

    try:
        n = request.GET.get("n", 8)
        try:
            n = int(n)
        except Exception:
            n = 8

        recommendations = []
        if genre or intent or release_date_gte:
            with_genres = ""
            if genre and genre in genre_to_id:
                with_genres = str(genre_to_id[genre])
            sort_by = "popularity.desc"
            vote_count_gte = ""
            if intent == "best":
                sort_by = "vote_average.desc"
                vote_count_gte = "2000"
            elif intent == "hidden_gem":
                sort_by = "vote_average.desc"
                vote_count_gte = "200"
            try:
                data = discover_movies(
                    with_genres=with_genres,
                    sort_by=sort_by,
                    vote_count_gte=vote_count_gte,
                    release_date_gte=release_date_gte or "",
                    release_date_lte=release_date_lte or "",
                )
                results = (data.get("results") or [])[:n]
                for m in results:
                    recommendations.append(
                        {
                            "title": m.get("title") or m.get("name") or "Untitled",
                            "poster": _tmdb_poster_url(m.get("poster_path")),
                            "tmdb_id": m.get("id"),
                            "rating": round(float(m.get("vote_average") or 0), 1),
                            "year": (m.get("release_date") or "")[:4] or None,
                            "reason": "Curated from your query",
                        }
                    )
            except Exception:
                recommendations = []
        else:
            payload = personalized_recommend_with_reasons(user_id=user_id, n=n)
            tmdb_ids = payload.get("tmdb_ids", [])
            reason = payload.get("reason") or "Recommended for you"
            for tmdb_id in tmdb_ids:
                try:
                    details = get_movie_details(tmdb_id) or {}
                except Exception:
                    details = {}

                recommendations.append(
                    {
                        "title": details.get("title") or details.get("name") or f"TMDB {tmdb_id}",
                        "poster": _tmdb_poster_url(details.get("poster_path")),
                        "tmdb_id": tmdb_id,
                        "rating": round(float(details.get("vote_average") or 0), 1)
                        if details.get("vote_average") is not None
                        else None,
                        "year": (details.get("release_date") or "")[:4] or None,
                        "reason": reason,
                    }
                )
    except Exception as e:
        return _error("Recommendation failed", status_code=500, error=str(e))

    if request.user.is_authenticated and message:
        _log_activity(
            request.user,
            "chatbot_query",
            message=message,
            genre=genre,
            intent=intent,
            decade=release_date_gte,
        )

    return Response(recommendations)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recommendations(request):
    user_id = request.user.id
    n = request.GET.get("n", 10)
    try:
        n = int(n)
    except Exception:
        n = 10

    tmdb_ids = recommend_movies(user_id=user_id, n=n)
    include_details = str(request.GET.get("include_details", "")).lower() in {"1", "true", "yes"}
    if not include_details:
        return Response({"tmdb_ids": tmdb_ids})

    payload = []
    for tmdb_id in tmdb_ids:
        try:
            details = get_movie_details(tmdb_id) or {}
        except Exception:
            details = {}
        payload.append(
            {
                "title": details.get("title") or details.get("name") or f"TMDB {tmdb_id}",
                "poster": _tmdb_poster_url(details.get("poster_path")),
                "tmdb_id": tmdb_id,
                "rating": round(float(details.get("vote_average") or 0), 1)
                if details.get("vote_average") is not None
                else None,
                "year": (details.get("release_date") or "")[:4] or None,
            }
        )
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def surprise(request):
    tmdb_id = surprise_me(request.user.id)
    if not tmdb_id:
        return Response({}, status=status.HTTP_204_NO_CONTENT)

    try:
        details = get_movie_details(tmdb_id, timeout=3) or {}
    except Exception:
        details = {}

    return Response(
        {
            "title": details.get("title") or details.get("name") or f"TMDB {tmdb_id}",
            "poster": _tmdb_poster_url(details.get("poster_path")),
            "tmdb_id": tmdb_id,
            "rating": round(float(details.get("vote_average") or 0), 1)
            if details.get("vote_average") is not None
            else None,
            "year": (details.get("release_date") or "")[:4] or None,
        }
    )


# Alias endpoint name for chatbot integrations.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def chatbot_recommend(request):
    return ai_recommend(request)


# -----------------------
# Bulk TMDB hydration endpoint
# -----------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def tmdb_bulk(request):
    """Return hydrated movie objects for a list of TMDB IDs.

    Usage: GET /api/tmdb/bulk/?ids=123,456,789
    """
    ids_raw = request.GET.get("ids", "")
    tmdb_ids = []
    for part in ids_raw.split(","):
        part = part.strip()
        if part:
            try:
                tmdb_ids.append(int(part))
            except ValueError:
                continue
    if not tmdb_ids:
        return Response({"movies": []})
    movies = bulk_get_movie_details(tmdb_ids[:50])  # cap at 50
    return Response({"movies": movies})


# -----------------------
# New recommendation sections
# -----------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_trending_genre(request):
    """Trending movies in the user's top genre."""
    cache_key = f"recs_trending_genre_{request.user.id}"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    genre_ids = favorite_genres_profile(request.user.id, top_n=1)
    if not genre_ids:
        return Response({"movies": [], "tmdb_ids": [], "genre_name": None})

    genre_id = genre_ids[0]

    # Map common genre IDs to names
    GENRE_MAP = {
        28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
        80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
        14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
        9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
        53: "Thriller", 10752: "War", 37: "Western",
    }
    genre_name = GENRE_MAP.get(genre_id, "Your Favorite Genre")

    try:
        data = discover_movies(
            with_genres=str(genre_id),
            sort_by="popularity.desc",
        )
        results = data.get("results", []) or []
        tmdb_ids = [m.get("id") for m in results[:12] if m.get("id")]
        movies = [_format_movie_obj(m) for m in results[:12] if m.get("id")]
        movies = [m for m in movies if m]
    except Exception:
        tmdb_ids = []
        movies = []

    payload = {"movies": movies, "tmdb_ids": tmdb_ids, "genre_name": genre_name}
    cache.set(cache_key, payload, timeout=300)
    return Response(payload)


@api_view(["GET"])
@permission_classes([AllowAny])
def recs_hidden_gems(request):
    """Critically acclaimed films with moderate popularity (hidden gems)."""
    cache_key = "recs_hidden_gems_global"
    if request.user.is_authenticated:
        cache_key = f"recs_hidden_gems_{request.user.id}"

    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    try:
        data = discover_movies(
            sort_by="vote_average.desc",
            vote_count_gte="200",
        )
        results = data.get("results", []) or []
        # Filter to movies with moderate vote count (hidden, not blockbusters)
        hidden = [m for m in results if 200 <= (m.get("vote_count") or 0) <= 2000]
        if not hidden:
            hidden = results[:12]

        # If user is authenticated, prioritize their genre preferences
        if request.user.is_authenticated:
            user_genres = set(favorite_genres_profile(request.user.id, top_n=3))
            if user_genres:
                def _genre_score(m):
                    movie_genres = set(m.get("genre_ids") or [])
                    return len(movie_genres & user_genres)
                hidden.sort(key=_genre_score, reverse=True)

        tmdb_ids = [m.get("id") for m in hidden[:12] if m.get("id")]
        movies = [_format_movie_obj(m) for m in hidden[:12] if m.get("id")]
        movies = [m for m in movies if m]
    except Exception:
        tmdb_ids = []
        movies = []

    payload = {"movies": movies, "tmdb_ids": tmdb_ids}
    cache.set(cache_key, payload, timeout=900)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recs_continue(request):
    """Recommendations based on user's recently viewed movies."""
    cache_key = f"recs_continue_{request.user.id}"
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    # Fetch more history rows so we can deduplicate to unique movies
    recent = (
        WatchHistory.objects.filter(user=request.user)
        .select_related("movie")
        .order_by("-viewed_at")[:30]
    )
    if not recent:
        return Response({"movies": [], "tmdb_ids": [], "seed_title": None})

    # Deduplicate: keep only the first (most recent) occurrence of each movie
    seen_seeds = set()
    seed_movies = []
    seed_title = None
    for wh in recent:
        if not wh.movie or not wh.movie.tmdb_id:
            continue
        if wh.movie.tmdb_id in seen_seeds:
            continue
        seen_seeds.add(wh.movie.tmdb_id)
        if seed_title is None:
            seed_title = wh.movie.title
        seed_movies.append(wh.movie.tmdb_id)
        if len(seed_movies) >= 5:
            break

    if not seed_movies:
        return Response({"movies": [], "tmdb_ids": [], "seed_title": None})

    # Fetch similar movies for all seeds in parallel using both
    # the precomputed similarity matrix and TMDB API
    from concurrent.futures import ThreadPoolExecutor, as_completed

    MIN_VOTE_COUNT = 50  # filter out obscure movies with almost no votes

    def _fetch_similar(tmdb_id):
        seen_local = set()
        ids = []

        def _add(mid):
            if mid and mid not in seen_local:
                seen_local.add(mid)
                ids.append(mid)

        # Source 1: precomputed similarity matrix (already quality-filtered)
        try:
            for mid in similar_movies_with_reason(tmdb_id, n=8).get("tmdb_ids", []):
                _add(mid)
        except Exception:
            pass

        # Source 2: TMDB Recommendations API (best quality — uses user behavior data)
        try:
            rec_data = tmdb_get_recommendations(tmdb_id, timeout=3) or {}
            for m in (rec_data.get("results") or []):
                mid = m.get("id")
                if mid and (m.get("vote_count") or 0) >= MIN_VOTE_COUNT:
                    _add(mid)
        except Exception:
            pass

        # Source 3: TMDB Similar Movies API (genre/keyword match — filter junk)
        try:
            similar_data = get_similar_movies(tmdb_id, timeout=3) or {}
            for m in (similar_data.get("results") or []):
                mid = m.get("id")
                if mid and (m.get("vote_count") or 0) >= MIN_VOTE_COUNT:
                    _add(mid)
        except Exception:
            pass

        return ids

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_fetch_similar, tid): tid for tid in seed_movies}
        results_map = {}
        for future in as_completed(futures):
            tid = futures[future]
            results_map[tid] = future.result()

    # Interleave results from each seed for diversity instead of
    # exhausting all results from seed 1 before moving to seed 2
    per_seed_results = [results_map.get(tid, []) for tid in seed_movies]
    all_ids = []
    seen_ids = set(seed_movies)  # exclude the seed movies themselves
    max_len = max((len(r) for r in per_seed_results), default=0)
    for i in range(max_len):
        for results in per_seed_results:
            if i < len(results):
                rid = results[i]
                if rid not in seen_ids:
                    seen_ids.add(rid)
                    all_ids.append(rid)

    # Filter out movies the user has already rated, watchlisted, or loved/liked
    all_ids = _recommender()._filter_out_interactions(request.user.id, all_ids)
    all_ids = all_ids[:12]

    movies = bulk_get_movie_details(all_ids) if all_ids else []

    payload = {
        "movies": movies,
        "tmdb_ids": all_ids,
        "seed_title": seed_title,
    }
    cache.set(cache_key, payload, timeout=180)
    return Response(payload)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_create_user(request):
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email
    from django.contrib.auth.password_validation import validate_password

    guard = _require_admin(request)
    if guard:
        return guard

    User = get_user_model()

    username = (request.data.get("username") or "").strip()
    email = (request.data.get("email") or "").strip()
    role = (request.data.get("role") or "member").strip().lower()
    status_val = (request.data.get("status") or "active").strip().lower()
    onboarding = (request.data.get("onboarding") or "completed").strip().lower()
    welcome_note = (request.data.get("welcome_note") or request.data.get("welcomeNote") or "").strip()
    password = request.data.get("password") or ""

    if not username:
        return Response({"detail": "username is required"}, status=status.HTTP_400_BAD_REQUEST)
    if not email:
        return Response({"detail": "email is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_email(email)
    except ValidationError:
        return Response({"detail": "invalid email"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username__iexact=username).exists():
        return Response({"detail": "username taken"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email__iexact=email).exists():
        return Response({"detail": "email already in use"}, status=status.HTTP_400_BAD_REQUEST)

    generated_password = False
    if not password:
        from django.utils.crypto import get_random_string
        password = get_random_string(12)
        generated_password = True

    try:
        validate_password(password)
    except ValidationError as e:
        return Response({"detail": "; ".join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, email=email, password=password)
    if role == "admin":
        user.is_staff = True
        user.save(update_fields=["is_staff"])

    if status_val == "inactive":
        user.is_active = False
        user.save(update_fields=["is_active"])

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.onboarding_completed = onboarding == "completed"
    update_fields = ["onboarding_completed"]
    if welcome_note and hasattr(profile, "welcome_note"):
        profile.welcome_note = welcome_note
        update_fields.append("welcome_note")
    profile.save(update_fields=update_fields)

    payload = {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_staff": user.is_staff,
            "is_active": user.is_active,
            "onboarding_completed": profile.onboarding_completed,
            "date_joined": user.date_joined,
        },
    }
    if generated_password:
        payload["generated_password"] = password
    return Response(payload, status=status.HTTP_201_CREATED)
