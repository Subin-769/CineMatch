# backend/api/serializers.py
from rest_framework import serializers
from .models import Movie, Rating, Watchlist
from django.contrib.auth.models import User

class MovieSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movie
        fields = ["id", "tmdb_id", "title", "overview", "genres", "poster_url", "release_date"]

class RatingSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(write_only=True, required=True)
    movie_id = serializers.IntegerField(write_only=True, required=True)

    class Meta:
        model = Rating
        fields = ["id", "user_id", "movie_id", "rating", "created_at"]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        user_id = validated_data.pop("user_id")
        movie_id = validated_data.pop("movie_id")
        user = User.objects.get(id=user_id)
        movie = Movie.objects.get(id=movie_id)
        obj, created = Rating.objects.update_or_create(user=user, movie=movie, defaults={"rating": validated_data["rating"]})
        return obj

class WatchlistSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(write_only=True, required=True)
    movie_id = serializers.IntegerField(write_only=True, required=True)
    movie = MovieSerializer(read_only=True)

    class Meta:
        model = Watchlist
        fields = ["id", "user_id", "movie_id", "movie", "added_at"]
        read_only_fields = ["id", "added_at"]
