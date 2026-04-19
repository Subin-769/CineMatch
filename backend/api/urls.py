# backend/api/urls.py
from django.urls import path, include
from . import views
from . import views_auth as auth_views
from .views import recommendations_for_user
from .views_chatbot import (
    chat_session_detail_view,
    chat_session_messages_view,
    chat_sessions_view,
    chat_view,
)
from .views_auth import GoogleLogin


urlpatterns = [
    # movie and tmdb
    path("movies/", views.movie_list, name="movies-list"),

    # watchlist
    path("watchlist/toggle/", views.toggle_watchlist, name="watchlist-toggle"),
    path("watchlist/", views.get_watchlist, name="watchlist-get"),
    path("watchlist/count/", views.watchlist_count, name="watchlist-count"),
    path("watchlist/status/<int:tmdb_id>/", views.watchlist_status, name="watchlist-status"),
    path("watch-history/last/", views.last_watched, name="watch-history-last"),
    path("onboarding/", views.onboarding_preferences, name="onboarding-preferences"),
    path("onboarding/preferences/", views.onboarding_preferences, name="onboarding-preferences-detail"),

    path("auth/google/", GoogleLogin.as_view(), name="google-login"),

    # ratings
    path("rating/", views.add_rating, name="rating-add"),
    path("rating/<int:tmdb_id>/", views.get_rating, name="rating-get"),
    path("rating/<int:tmdb_id>/delete/", views.delete_rating, name="rating-delete"),
    path("rating/my/", views.my_ratings, name="rating-my"),
    path("preference/", views.set_preference, name="preference-set"),
    path("preference/my/", views.my_preferences, name="preference-my"),
    path("preference/<int:tmdb_id>/", views.get_preference, name="preference-get"),

    # tmdb proxied endpoints
    path("tmdb/trending/", views.tmdb_trending, name="tmdb-trending"),
    path("tmdb/movie/<int:tmdb_id>/", views.tmdb_movie_details, name="tmdb-movie-details"),
    path("tmdb/movie/<int:tmdb_id>/credits/", views.tmdb_movie_credits, name="tmdb-movie-credits"),
    path("tmdb/movie/<int:tmdb_id>/similar/", views.tmdb_movie_similar, name="tmdb-movie-similar"),
    path("tmdb/movie/<int:tmdb_id>/videos/", views.tmdb_movie_videos, name="tmdb-movie-videos"),
    path("tmdb/movie/<int:tmdb_id>/keywords/", views.tmdb_movie_keywords, name="tmdb-movie-keywords"),
    path("tmdb/movie/<int:tmdb_id>/recommendations/", views.tmdb_movie_recommendations, name="tmdb-movie-recommendations"),
    path("tmdb/discover/", views.tmdb_discover, name="tmdb-discover"),
    path("tmdb/bulk/", views.tmdb_bulk, name="tmdb-bulk"),

    # ai recommender
    path("ai-recommend/", views.ai_recommend, name="ai-recommend"),
    path("recommendations/", views.recommendations, name="recommendations"),
    path("surprise/", views.surprise, name="surprise"),
    path("recs/personalized/", views.recs_personalized, name="recs-personalized"),
    path("recs/similar/<int:tmdb_id>/", views.recs_similar, name="recs-similar"),
    path("recs/trending/", views.recs_trending, name="recs-trending"),
    path("recs/surprise/", views.recs_surprise, name="recs-surprise"),
    path("recs/loved/", views.recs_loved, name="recs-loved"),
    path("recs/liked/", views.recs_liked, name="recs-liked"),
    path("recs/rated/", views.recs_rated, name="recs-rated"),
    path("recs/watchlist/", views.recs_watchlist, name="recs-watchlist"),
    path("recs/batched/", views.recs_batched, name="recs-batched"),
    path("recs/genres/", views.recs_genres, name="recs-genres"),
    path("recs/recommended_for_you/", views.recs_recommended_for_you, name="recs-recommended-for-you"),
    path("recs/trending-genre/", views.recs_trending_genre, name="recs-trending-genre"),
    path("recs/hidden-gems/", views.recs_hidden_gems, name="recs-hidden-gems"),
    path("recs/continue/", views.recs_continue, name="recs-continue"),
    path("recs/log-timing/", views.recs_log_timing, name="recs-log-timing"),
    path("chat/sessions/", chat_sessions_view, name="chat-sessions"),
    path("chat/sessions/<int:session_id>/", chat_session_detail_view, name="chat-session-detail"),
    path("chat/sessions/<int:session_id>/messages/", chat_session_messages_view, name="chat-session-messages"),
    path("chat/", chat_view, name="chat"),

    # reviews
    path("tmdb/reviews/<int:tmdb_id>/", views.list_reviews_tmdb, name="tmdb-reviews-list"),
    path("tmdb/reviews/add/", views.add_review_tmdb, name="tmdb-reviews-add"),

    # auth endpoints from views_auth module
    # note: import uses alias auth_views to avoid shadowing builtin names
    path("auth/register/", auth_views.register, name="auth-register"),
    path("auth/login/", auth_views.login, name="auth-login"),
    path("auth/logout/", auth_views.logout, name="auth-logout"),
    path("auth/me/", auth_views.me, name="auth-me"),
    path("auth/refresh/", auth_views.refresh, name="auth-refresh"),

    path("recommendations/<int:user_id>/", recommendations_for_user),

    # admin dashboard
    path("admin/stats/", views.admin_stats, name="admin-stats"),
    path("admin/recommendations/", views.admin_recommendations, name="admin-recommendations"),
    path("admin/genres/", views.admin_genres, name="admin-genres"),
    path("admin/activity/", views.admin_activity, name="admin-activity"),
    path("admin/model-metrics/", views.admin_model_metrics, name="admin-model-metrics"),
    path("admin/realtime-pulse/", views.admin_realtime_pulse, name="admin-realtime-pulse"),
    path("admin/rating-distribution/", views.admin_rating_distribution, name="admin-rating-distribution"),
    path("admin/user-growth/", views.admin_user_growth, name="admin-user-growth"),
    path("admin/system-info/", views.admin_system_info, name="admin-system-info"),
    path("admin/users/", views.admin_users, name="admin-users"),
    path("admin/users/create/", views.admin_create_user, name="admin-users-create"),
    path("admin/movies/", views.admin_movies, name="admin-movies"),
]
