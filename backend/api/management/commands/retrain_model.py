from django.core.management.base import BaseCommand

from api.recommender.train_model import train_and_save_models


class Command(BaseCommand):
    help = "Retrain collaborative filtering models from live database ratings."

    def handle(self, *args, **options):
        result = train_and_save_models()
        self.stdout.write(
            self.style.SUCCESS(
                f"Models updated. Users={result['users']} Movies={result['movies']} "
                f"Output={result['output_dir']}"
            )
        )
