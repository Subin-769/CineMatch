from django.core.management.base import BaseCommand

from api.recommender.train_model import train_and_save_models


class Command(BaseCommand):
    help = "Retrain collaborative + content-based recommender artifacts."

    def handle(self, *args, **options):
        result = train_and_save_models()
        self.stdout.write(
            self.style.SUCCESS(
                "Recommender updated. Users={users} Movies={movies} "
                "ContentMovies={content_movies} Output={output_dir}".format(**result)
            )
        )
