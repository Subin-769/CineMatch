# backend/api/models.py
from django.conf import settings
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db.models.signals import post_save
from django.dispatch import receiver


class Movie(models.Model):

    tmdb_id = models.IntegerField(
        unique=True,
        db_index=True,
        null=True,
        blank=True,
        help_text="TMDB movie ID for external reference"
    )

    title = models.CharField(max_length=255)
    overview = models.TextField(blank=True, default="")
    genres = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Comma-separated genres (e.g. Drama,Comedy)"
    )
    keywords = models.TextField(
        blank=True,
        default="",
        help_text="Comma-separated keywords for content-based similarity"
    )

    poster_url = models.URLField(blank=True, default="")
    release_year = models.IntegerField(null=True, blank=True)
    original_language = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="Original language code (e.g. en, hi)"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]
        indexes = [
            models.Index(fields=["tmdb_id"]),
            models.Index(fields=["title"]),
        ]

    def __str__(self):
        return self.title


class Rating(models.Model):

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="ratings",
        db_index=True,
    )

    movie = models.ForeignKey(
        Movie,
        on_delete=models.CASCADE,
        related_name="user_ratings"
    )

    rating = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="Rating value (1–10)"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "movie")
        indexes = [
            models.Index(fields=["user", "movie"]),
            models.Index(fields=["movie"]),
        ]

    def __str__(self):
        return f"{self.user.username} rated {self.movie.title}: {self.rating}"


class Watchlist(models.Model):

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="watchlist_items"
    )

    movie = models.ForeignKey(
        Movie,
        on_delete=models.CASCADE,
        related_name="watchlisted_by"
    )

    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "movie")
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["movie"]),
        ]

    def __str__(self):
        return f"{self.user.username} added {self.movie.title} to watchlist"


class Review(models.Model):

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="reviews"
    )

    movie = models.ForeignKey(
        Movie,
        on_delete=models.CASCADE,
        related_name="reviews"
    )

    text = models.TextField()
    stars = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Star rating (1–5)"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} review on {self.movie.title}"


class UserActivity(models.Model):

    ACTION_CHOICES = [
        ("watched", "Watched"),
        ("rated", "Rated"),
        ("searched", "Searched"),
        ("added_watchlist", "Added Watchlist"),
        ("removed_watchlist", "Removed Watchlist"),
        ("chatbot_query", "Chatbot Query"),
        ("liked", "Liked"),
        ("loved", "Loved"),
        ("disliked", "Disliked"),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="activities"
    )
    movie = models.ForeignKey(
        Movie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities"
    )
    action_type = models.CharField(max_length=32, choices=ACTION_CHOICES)
    rating = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(blank=True, default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)
    # Deprecated fields kept for backward compatibility with existing data.
    action = models.CharField(max_length=32, choices=ACTION_CHOICES, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "action_type"]),
            models.Index(fields=["timestamp"]),
        ]

    def __str__(self):
        return f"{self.user.username} {self.action_type}"


class UserMoviePreference(models.Model):

    PREFERENCE_CHOICES = [
        ("love", "Love"),
        ("like", "Like"),
        ("dislike", "Dislike"),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="movie_preferences",
    )
    movie = models.ForeignKey(
        Movie,
        on_delete=models.CASCADE,
        related_name="movie_preferences",
    )
    preference = models.CharField(max_length=16, choices=PREFERENCE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "movie")
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["movie"]),
            models.Index(fields=["preference"]),
        ]

    def __str__(self):
        return f"{self.user.username} {self.preference} {self.movie.title}"


class WatchHistory(models.Model):

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="watch_history"
    )
    movie = models.ForeignKey(
        Movie,
        on_delete=models.CASCADE,
        related_name="watch_history"
    )
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["movie"]),
            models.Index(fields=["viewed_at"]),
        ]

    def __str__(self):
        return f"{self.user.username} viewed {self.movie.title}"


class SearchHistory(models.Model):

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="search_history"
    )
    query = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.user.username} searched '{self.query}'"


class UserPreference(models.Model):

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="preference",
    )
    preferred_genres = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Comma-separated genres"
    )
    preferred_industry = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="e.g. bollywood, hollywood"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} preferences"


class UserProfile(models.Model):

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    onboarding_completed = models.BooleanField(default=False)
    watch_frequency = models.CharField(
        max_length=32,
        blank=True,
        default="",
        help_text="Onboarding watch frequency preference",
    )
    preferred_genres = models.JSONField(
        blank=True,
        default=list,
        help_text="Onboarding preferred genres as names or ids",
    )
    preferred_vibe = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="Onboarding vibe preference",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} profile"


class ChatSession(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_sessions",
    )
    title = models.CharField(max_length=100, default="New Conversation")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user.username} - {self.title}"


class ChatMessage(models.Model):
    ROLE_CHOICES = [("user", "User"), ("assistant", "Assistant")]

    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    movies = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class RecommenderModel(models.Model):
    MODEL_TYPES = [
        ("content_based", "Content-Based Filtering"),
        ("collaborative", "Collaborative Filtering"),
        ("hybrid", "Hybrid Scoring"),
        ("language", "Language Preference"),
        ("cold_start", "Cold Start / Onboarding"),
    ]
    STATUS_CHOICES = [
        ("active", "Active"),
        ("training", "Training"),
        ("inactive", "Inactive"),
    ]

    name = models.CharField(max_length=100)
    model_type = models.CharField(max_length=50, choices=MODEL_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    version = models.CharField(max_length=20, default="1.0.0")
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["model_type"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.model_type})"


class ModelPredictionLog(models.Model):
    model = models.ForeignKey(
        RecommenderModel,
        on_delete=models.CASCADE,
        related_name="prediction_logs",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    recommended_tmdb_ids = models.JSONField(default=list)
    signal_used = models.CharField(max_length=50, blank=True)
    response_time_ms = models.FloatField(null=True, blank=True)
    frontend_render_ms = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["model", "created_at"]),
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["signal_used"]),
        ]


class ModelAccuracySnapshot(models.Model):
    METRIC_TYPES = [
        ("prediction_accuracy", "Prediction Accuracy"),
        ("catalog_quality", "Catalog Quality"),
    ]

    model = models.ForeignKey(
        RecommenderModel,
        on_delete=models.CASCADE,
        related_name="accuracy_snapshots",
    )
    accuracy = models.FloatField()
    metric_type = models.CharField(
        max_length=32,
        choices=METRIC_TYPES,
        default="prediction_accuracy",
    )
    note = models.CharField(max_length=255, blank=True, default="")
    total_recommendations = models.IntegerField(default=0)
    total_positives = models.IntegerField(default=0)
    computed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["model", "computed_at"]),
        ]


@receiver(post_save, sender=User)
def _ensure_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
