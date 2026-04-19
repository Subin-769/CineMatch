from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from unittest.mock import patch

from api.models import Movie, Rating, Watchlist
from api.recommender.recommend import recommended_for_you


class RecommendedForYouTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pass1234")

        self.movie_a = Movie.objects.create(
            tmdb_id=1001,
            title="Movie A",
            genres="Action, Sci-Fi",
        )
        self.movie_b = Movie.objects.create(
            tmdb_id=1002,
            title="Movie B",
            genres="Action, Adventure",
        )
        self.movie_c = Movie.objects.create(
            tmdb_id=1003,
            title="Movie C",
            genres="Action, Sci-Fi",
        )
        self.movie_d = Movie.objects.create(
            tmdb_id=1004,
            title="Movie D",
            genres="Sci-Fi, Thriller",
        )
        self.movie_e = Movie.objects.create(
            tmdb_id=1005,
            title="Movie E",
            genres="Action, Sci-Fi",
        )
        self.movie_f = Movie.objects.create(
            tmdb_id=1006,
            title="Movie F",
            genres="Sci-Fi, Adventure",
        )

        Watchlist.objects.create(user=self.user, movie=self.movie_a)
        Watchlist.objects.create(user=self.user, movie=self.movie_b)
        Rating.objects.create(user=self.user, movie=self.movie_c, rating=5)
        Rating.objects.create(user=self.user, movie=self.movie_d, rating=4)

    @patch("api.recommender.recommend.discover_movies", return_value={"results": []})
    @patch("api.recommender.recommend._multi_seed_tmdb_pool", return_value=[1005, 1006, 1002])
    @patch("api.recommender.recommend.recommend_for_user_tmdb", return_value=[1005, 1006, 1001])
    def test_recommended_for_you_excludes_interactions(self, *_mocks):
        payload = recommended_for_you(self.user.id, n=6)
        tmdb_ids = payload["tmdb_ids"]

        self.assertIn(1005, tmdb_ids)
        self.assertIn(1006, tmdb_ids)
        for excluded in {1001, 1002, 1003, 1004}:
            self.assertNotIn(excluded, tmdb_ids)

        explanation = payload.get("explanation", {})
        self.assertIn(explanation.get("reason_type"), {"genre", "rating", "liked_movie"})
        self.assertTrue(explanation.get("reason_text"))


class ApiDocsSmokeTestCase(TestCase):
    def test_schema_endpoint_is_available(self):
        response = self.client.get(reverse("openapi-schema"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("openapi", response.content.decode())

    def test_swagger_ui_page_is_available(self):
        response = self.client.get(reverse("swagger-ui"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("SwaggerUIBundle", response.content.decode())
