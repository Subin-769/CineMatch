from django.core.management.base import BaseCommand

from api.models import RecommenderModel


MODEL_DEFINITIONS = [
    {
        "name": "ContentFilter",
        "model_type": "content_based",
        "description": (
            "Finds movies similar to what you loved by comparing genres, "
            "mood, and keywords. The more you rate, the sharper it gets."
        ),
        "status": "active",
        "version": "1.0.0",
    },
    {
        "name": "CollabSVD",
        "model_type": "collaborative",
        "description": (
            "Learns hidden taste patterns from all users' ratings. "
            "Trained using SVD matrix factorization — if users like you "
            "enjoyed a movie, it surfaces that movie for you too."
        ),
        "status": "active",
        "version": "1.0.0",
    },
    {
        "name": "HybridScorer",
        "model_type": "hybrid",
        "description": (
            "The final decision engine. Blends content similarity and "
            "collaborative patterns, then applies your personal rating "
            "weights: loved=3x boost, liked=2x, disliked=-1.5x penalty."
        ),
        "status": "active",
        "version": "1.0.0",
    },
    {
        "name": "LangWeighter",
        "model_type": "language",
        "description": (
            "Tracks which languages you watch most from your ratings "
            "and watchlist. Automatically boosts films in your preferred "
            "languages — Bollywood, Hollywood, Korean cinema, etc."
        ),
        "status": "active",
        "version": "1.0.0",
    },
    {
        "name": "OnboardingSeeder",
        "model_type": "cold_start",
        "description": (
            "Powers recommendations for brand new users who have no "
            "ratings yet. Uses your genre picks and vibe from signup "
            "to seed your first recommendations."
        ),
        "status": "active",
        "version": "1.0.0",
    },
]


class Command(BaseCommand):
    help = "Seed the recommender model registry with the live CineMatch models."

    def handle(self, *args, **options):
        for definition in MODEL_DEFINITIONS:
            model, created = RecommenderModel.objects.update_or_create(
                name=definition["name"],
                defaults={
                    "model_type": definition["model_type"],
                    "description": definition["description"],
                    "status": definition["status"],
                    "version": definition["version"],
                },
            )
            action = "Created" if created else "Updated"
            self.stdout.write(f"{action}: {model.name} [{model.model_type}]")
