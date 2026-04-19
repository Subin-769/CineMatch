# backend/api/admin.py
from django.contrib import admin
from django.db.models import Avg

from .models import Movie, Rating, Watchlist, Review


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    # only real fields on Movie; do not reference rating/genre/release_date
    list_display = ("id", "title", "tmdb_id", "release_year", "avg_rating")
    search_fields = ("title", "genres", "tmdb_id")
    list_filter = ("release_year",)
    ordering = ("-release_year", "title")
    readonly_fields = ("tmdb_id",)

    def get_queryset(self, request):
        # annotate queryset with average rating to avoid n+1
        qs = super().get_queryset(request)
        return qs.annotate(_avg_rating=Avg("user_ratings__rating"))

    def avg_rating(self, obj):
        # show rounded average rating (or blank)
        val = getattr(obj, "_avg_rating", None)
        return round(val, 2) if val is not None else ""
    avg_rating.short_description = "Avg Rating"


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "movie", "rating", "created_at")
    search_fields = ("user__username", "movie__title")
    list_filter = ("rating",)
    ordering = ("-created_at",)


@admin.register(Watchlist)
class WatchlistAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "movie", "added_at")
    search_fields = ("user__username", "movie__title")
    ordering = ("-added_at",)


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "movie", "stars", "created_at")
    search_fields = ("user__username", "movie__title", "text")
    list_filter = ("stars",)
    ordering = ("-created_at",)
