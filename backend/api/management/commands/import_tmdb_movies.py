from datetime import date

import requests
from django.apps import apps
from django.conf import settings
from django.core.exceptions import FieldDoesNotExist
from django.core.management.base import BaseCommand

from api.models import Movie


POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500"
TMDB_BASE_URL = "https://api.themoviedb.org/3"
ENDPOINTS = {
    "popular": "/movie/popular",
    "top_rated": "/movie/top_rated",
    "now_playing": "/movie/now_playing",
    "trending": "/trending/movie/week",
}
DISCOVER_ENDPOINT = "/discover/movie"
GENRE_LIST_ENDPOINT = "/genre/movie/list"


class Command(BaseCommand):
    help = "Import movies from TMDB into the Movie model."

    def add_arguments(self, parser):
        parser.add_argument(
            "--pages",
            type=int,
            default=10,
            help="Number of pages to fetch from each endpoint (default: 10, max: 50).",
        )
        parser.add_argument(
            "--endpoint",
            choices=sorted(ENDPOINTS.keys()),
            help="Optional single endpoint to import: popular, top_rated, now_playing, or trending.",
        )
        parser.add_argument(
            "--language",
            type=str,
            help="Import movies by language code e.g. hi, ko, ja, es, fr",
        )
        parser.add_argument(
            "--sort",
            type=str,
            default="popularity.desc",
            help="Sort order: popularity.desc, vote_count.desc, vote_average.desc, revenue.desc",
        )

    def handle(self, *args, **options):
        api_key = (getattr(settings, "TMDB_API_KEY", "") or "").strip()
        if not api_key:
            self.stderr.write("TMDB_API_KEY is empty in Django settings.")
            return

        pages = max(1, min(int(options["pages"] or 10), 50))
        language = (options.get("language") or "").strip().lower()
        if language and options.get("endpoint"):
            self.stderr.write("Cannot use --language and --endpoint together.")
            return
        endpoint_names = [options["endpoint"]] if options.get("endpoint") else list(ENDPOINTS.keys())

        self.movie_field_names = {field.name for field in Movie._meta.get_fields()}
        self.movie_genres_field = self._get_movie_genres_field()
        self.genre_model = self._get_genre_model()
        self.genre_lookup_field = self._get_genre_lookup_field()
        self.genre_name_field = self._get_genre_name_field()
        self.genre_name_map = self._load_genre_name_map(api_key)

        if not self.genre_model:
            self.stdout.write("No Genre model found. Storing genres in Movie.genres.")

        processed = 0
        total_new = 0
        total_existing = 0

        if language:
            self.stdout.write(f"Importing {language} language movies...")
            processed, total_new, total_existing = self._import_from_source(
                api_key=api_key,
                endpoint_path=DISCOVER_ENDPOINT,
                pages=pages,
                processed=processed,
                total_new=total_new,
                total_existing=total_existing,
                extra_params={
                    "with_original_language": language,
                    "sort_by": options.get("sort", "popularity.desc"),
                },
            )
        else:
            for endpoint_name in endpoint_names:
                endpoint_path = ENDPOINTS[endpoint_name]
                self.stdout.write(f"Importing {endpoint_name} movies...")
                processed, total_new, total_existing = self._import_from_source(
                    api_key=api_key,
                    endpoint_path=endpoint_path,
                    pages=pages,
                    processed=processed,
                    total_new=total_new,
                    total_existing=total_existing,
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Total new: {total_new}, Total existing: {total_existing}"
            )
        )

    def _import_from_source(
        self,
        *,
        api_key,
        endpoint_path,
        pages,
        processed,
        total_new,
        total_existing,
        extra_params=None,
    ):
        for page in range(1, pages + 1):
            params = {"page": page}
            params.update(extra_params or {})
            payload = self._fetch_json(api_key, endpoint_path, params)
            if not payload:
                continue

            for movie_payload in payload.get("results", []) or []:
                processed += 1
                try:
                    created = self._import_movie(movie_payload)
                except Exception as exc:
                    movie_id = movie_payload.get("id") or "unknown"
                    self.stderr.write(f"Failed to import movie {movie_id}: {exc}")
                    continue

                if created:
                    total_new += 1
                else:
                    total_existing += 1

                if processed % 50 == 0:
                    self.stdout.write(
                        f"Processed {processed} movies: {total_new} new, {total_existing} existing"
                    )

        return processed, total_new, total_existing

    def _get_movie_genres_field(self):
        try:
            return Movie._meta.get_field("genres")
        except FieldDoesNotExist:
            return None

    def _get_genre_model(self):
        try:
            return apps.get_model("api", "Genre")
        except LookupError:
            return None

    def _get_genre_lookup_field(self):
        if not self.genre_model:
            return None
        field_names = {field.name for field in self.genre_model._meta.get_fields()}
        for candidate in ("tmdb_genre_id", "tmdb_id", "external_id", "genre_id", "id"):
            if candidate in field_names:
                return candidate
        return None

    def _get_genre_name_field(self):
        if not self.genre_model:
            return None
        field_names = {field.name for field in self.genre_model._meta.get_fields()}
        for candidate in ("name", "title"):
            if candidate in field_names:
                return candidate
        return None

    def _fetch_json(self, api_key, endpoint_path, params=None):
        query = {"api_key": api_key}
        query.update(params or {})
        try:
            response = requests.get(
                f"{TMDB_BASE_URL}{endpoint_path}",
                params=query,
                timeout=20,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            self.stderr.write(f"Failed to fetch {endpoint_path} with params {query}: {exc}")
            return None

    def _load_genre_name_map(self, api_key):
        payload = self._fetch_json(api_key, GENRE_LIST_ENDPOINT, {"language": "en-US"})
        if not payload:
            return {}
        return {
            int(item["id"]): item.get("name", "").strip()
            for item in payload.get("genres", []) or []
            if item.get("id") is not None and item.get("name")
        }

    def _parse_release_date(self, value):
        if not value:
            return None
        try:
            return date.fromisoformat(str(value))
        except Exception:
            return None

    def _genre_names_for_movie(self, movie_payload):
        names = []
        seen = set()
        for genre_id in movie_payload.get("genre_ids", []) or []:
            try:
                genre_id = int(genre_id)
            except Exception:
                continue
            name = (self.genre_name_map.get(genre_id) or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            names.append(name)
        return names

    def _genre_objects_for_names(self, genre_names):
        if not self.genre_model or not self.genre_lookup_field or not self.genre_name_field:
            return []

        genre_objects = []
        name_to_id = {name: genre_id for genre_id, name in self.genre_name_map.items()}
        for genre_name in genre_names:
            genre_id = name_to_id.get(genre_name)
            if genre_id is None:
                continue
            defaults = {self.genre_name_field: genre_name}
            genre_obj, _ = self.genre_model.objects.get_or_create(
                **{self.genre_lookup_field: genre_id},
                defaults=defaults,
            )

            changed = False
            if getattr(genre_obj, self.genre_name_field, "") != genre_name:
                setattr(genre_obj, self.genre_name_field, genre_name)
                changed = True
            if changed:
                genre_obj.save(update_fields=[self.genre_name_field])

            genre_objects.append(genre_obj)
        return genre_objects

    def _movie_defaults(self, movie_payload, genre_names):
        release_dt = self._parse_release_date(movie_payload.get("release_date"))
        defaults = {
            "title": movie_payload.get("title") or movie_payload.get("name") or "Untitled",
            "overview": movie_payload.get("overview") or "",
            "poster_url": (
                f"{POSTER_BASE_URL}{movie_payload.get('poster_path')}"
                if movie_payload.get("poster_path")
                else ""
            ),
        }

        if "release_date" in self.movie_field_names and release_dt is not None:
            defaults["release_date"] = release_dt
        elif "release_year" in self.movie_field_names and release_dt is not None:
            defaults["release_year"] = release_dt.year

        if "rating" in self.movie_field_names and movie_payload.get("vote_average") is not None:
            defaults["rating"] = movie_payload.get("vote_average")

        if "original_language" in self.movie_field_names:
            defaults["original_language"] = movie_payload.get("original_language") or ""

        if self.movie_genres_field and not getattr(self.movie_genres_field, "many_to_many", False):
            defaults["genres"] = ", ".join(genre_names)

        return defaults

    def _import_movie(self, movie_payload):
        tmdb_id = movie_payload.get("id")
        if tmdb_id is None:
            raise ValueError("Movie payload missing id")

        genre_names = self._genre_names_for_movie(movie_payload)
        genre_objects = self._genre_objects_for_names(genre_names)
        defaults = self._movie_defaults(movie_payload, genre_names)

        movie, created = Movie.objects.get_or_create(
            tmdb_id=tmdb_id,
            defaults=defaults,
        )

        changed_fields = []
        if not created:
            for field_name, value in defaults.items():
                if getattr(movie, field_name, None) != value:
                    setattr(movie, field_name, value)
                    changed_fields.append(field_name)
            if changed_fields:
                movie.save(update_fields=changed_fields)

        if self.movie_genres_field and getattr(self.movie_genres_field, "many_to_many", False):
            if genre_objects:
                getattr(movie, "genres").set(genre_objects)

        return created
