import re
from concurrent.futures import ThreadPoolExecutor
from django.core.cache import cache
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import ChatMessage, ChatSession, Rating, UserMoviePreference, Watchlist

_chatbot_module = None
_recommender_module = None


def _chatbot():
    global _chatbot_module
    if _chatbot_module is None:
        from api.chatbot import gemini_client, intent_parser, query_engine

        _chatbot_module = (gemini_client, intent_parser, query_engine)
    return _chatbot_module


def _recommender():
    global _recommender_module
    if _recommender_module is None:
        from api.recommender import recommend as recommender_module

        _recommender_module = recommender_module
    return _recommender_module


def _extract_titles_from_llm_text(text):
    """Extract movie titles mentioned by the LLM in its response text.
    Looks for patterns like 'Title (Year)' which the LLM commonly uses."""
    titles = []
    seen = set()

    def _add(t):
        t = t.strip(" .,;:–—'\"")
        if t and len(t) > 2 and t.lower() not in seen:
            seen.add(t.lower())
            titles.append(t)

    # Match "Title (Year)" — capture only up to 8 words before the year
    for m in re.finditer(r"((?:[A-Z][\w'-]*[\s:]+){0,7}[A-Z][\w'-]*)\s*\((\d{4})\)", text):
        _add(m.group(1))

    # Match bold/italic titles: **Title** or *Title*
    for m in re.finditer(r"\*\*([^*]+?)\*\*|\*([^*]+?)\*", text):
        _add(m.group(1) or m.group(2))

    return titles


def _search_and_normalize_title(title):
    """Search TMDB for a movie title and return a normalized movie dict."""
    try:
        from api.tmdb import discover_movies
        data = discover_movies(query=title, timeout=3)
        results = data.get("results") or []
        if not results:
            return None
        m = results[0]
        poster_url = (m.get("poster_path") or "")
        if poster_url.startswith("/"):
            poster_url = f"https://image.tmdb.org/t/p/w500{poster_url}"
        release_year = 0
        rd = m.get("release_date") or ""
        if len(rd) >= 4:
            try:
                release_year = int(rd[:4])
            except ValueError:
                pass
        genre_names = ""
        genre_ids = m.get("genre_ids") or []
        if genre_ids:
            from api.recommender.recommend import TMDB_ID_TO_GENRE
            genre_names = ", ".join(
                TMDB_ID_TO_GENRE.get(gid, "").title()
                for gid in genre_ids if gid in TMDB_ID_TO_GENRE
            )
        return {
            "tmdb_id": int(m.get("id") or 0),
            "title": str(m.get("title") or ""),
            "poster_url": poster_url,
            "rating": float(m.get("vote_average") or 0),
            "genres": genre_names or "Movie",
            "release_year": release_year,
            "id": None,
            "original_language": m.get("original_language") or "",
            "reason": "Mentioned in recommendation",
        }
    except Exception:
        return None


def _serialize_message(message):
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "movies": message.movies or [],
        "created_at": message.created_at.isoformat(),
    }


def _build_history(session):
    history = []
    for message in session.messages.all():
        history_entry = {
            "role": message.role,
            "content": message.content,
        }
        if message.role == "assistant":
            history_entry["movies"] = [
                movie.get("tmdb_id")
                for movie in (message.movies or [])
                if isinstance(movie, dict) and movie.get("tmdb_id")
            ]
        history.append(history_entry)
    return history


def _session_title_from_message(message):
    cleaned = (message or "").strip()
    if not cleaned:
        return "New Conversation"
    snippet = cleaned[:40].strip()
    if not snippet:
        return "New Conversation"
    return snippet[0].upper() + snippet[1:]


def _serialize_session(session):
    last_user_message = (
        session.messages.filter(role="user")
        .order_by("-created_at")
        .values_list("content", flat=True)
        .first()
        or ""
    )
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
        "last_message": last_user_message[:50],
    }


def _get_owned_session(user, session_id):
    return get_object_or_404(
        ChatSession.objects.all(),
        id=session_id,
        user=user,
    )


# ── Speed Fix: Cached + parallelized user context ──────────────────────
def _get_user_context(user):
    """Gather all user preference signals in parallel with caching."""
    cache_key = f"chat_user_context:{user.id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    rec = _recommender()

    def _get_top_genres():
        top_genre_ids = rec.favorite_genres_profile(user.id, top_n=5)
        return [
            rec.TMDB_ID_TO_GENRE[gid]
            for gid in top_genre_ids
            if gid in rec.TMDB_ID_TO_GENRE
        ]

    def _get_onboarding():
        return rec._user_onboarding_preferences(user.id)

    def _get_loved():
        return list(
            UserMoviePreference.objects.filter(user=user, preference="love")
            .values_list("movie__title", flat=True)[:5]
        )

    def _get_liked():
        return list(
            UserMoviePreference.objects.filter(user=user, preference="like")
            .values_list("movie__title", flat=True)[:5]
        )

    def _get_disliked():
        return list(
            UserMoviePreference.objects.filter(user=user, preference="dislike")
            .values_list("movie__title", flat=True)[:5]
        )

    def _get_top_rated():
        return list(
            Rating.objects.filter(user=user, rating__gte=4)
            .order_by("-rating")
            .values_list("movie__title", "rating")[:5]
        )

    def _get_watchlist():
        return list(
            Watchlist.objects.filter(user=user)
            .values_list("movie__title", flat=True)[:5]
        )

    def _get_total_ratings():
        return Rating.objects.filter(user=user).count()

    # Run ALL queries in parallel — they are independent
    with ThreadPoolExecutor(max_workers=8) as pool:
        fut_genres = pool.submit(_get_top_genres)
        fut_onboarding = pool.submit(_get_onboarding)
        fut_loved = pool.submit(_get_loved)
        fut_liked = pool.submit(_get_liked)
        fut_disliked = pool.submit(_get_disliked)
        fut_top_rated = pool.submit(_get_top_rated)
        fut_watchlist = pool.submit(_get_watchlist)
        fut_total = pool.submit(_get_total_ratings)

    onboarding = fut_onboarding.result()
    user_context = {
        "top_genres": fut_genres.result(),
        "preferred_language": onboarding.get("preferred_language"),
        "total_ratings": fut_total.result(),
        "loved_movies": [t for t in fut_loved.result() if t],
        "liked_movies": [t for t in fut_liked.result() if t],
        "disliked_movies": [t for t in fut_disliked.result() if t],
        "top_rated_movies": [(t, r) for t, r in fut_top_rated.result() if t],
        "watchlist_movies": [t for t in fut_watchlist.result() if t],
    }

    # Cache for 60 seconds — user prefs don't change mid-conversation
    cache.set(cache_key, user_context, timeout=60)
    return user_context


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def chat_sessions_view(request):
    if request.method == "GET":
        sessions = ChatSession.objects.filter(user=request.user).prefetch_related("messages")
        return Response([_serialize_session(session) for session in sessions])

    session = ChatSession.objects.create(user=request.user)
    return Response(
        {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at.isoformat(),
        },
        status=201,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def chat_session_messages_view(request, session_id):
    session = _get_owned_session(request.user, session_id)
    return Response([_serialize_message(message) for message in session.messages.all()])


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def chat_session_detail_view(request, session_id):
    session = _get_owned_session(request.user, session_id)

    if request.method == "DELETE":
        session.delete()
        return Response(status=204)

    title = (request.data.get("title") or "").strip()
    if not title:
        return Response({"error": "Title is required"}, status=400)

    session.title = title[:100]
    session.save(update_fields=["title", "updated_at"])
    return Response(_serialize_session(session))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chat_view(request):
    session = None
    try:
        message = (request.data.get("message") or "").strip()
        session_id = request.data.get("session_id")

        if not message:
            return Response({"error": "Message is required"}, status=400)

        if session_id:
            session = _get_owned_session(request.user, session_id)
        else:
            session = ChatSession.objects.create(user=request.user)

        # ── Speed Fix: Run intent parsing + user context + history in parallel ──
        with ThreadPoolExecutor(max_workers=3) as pool:
            fut_intent = pool.submit(_chatbot()[1].parse_intent, message)
            fut_context = pool.submit(_get_user_context, request.user)
            fut_history = pool.submit(_build_history, session)

        intent = fut_intent.result()
        user_context = fut_context.result()
        history = fut_history.result()

        shown_tmdb_ids = []
        for history_item in history:
            if history_item.get("role") != "assistant":
                continue
            shown_tmdb_ids.extend(history_item.get("movies") or [])

        movies = _chatbot()[2].query_movies(
            intent,
            user_id=request.user.id,
            n=8,
            seen_ids=shown_tmdb_ids,
            history=history,
        )
        normalized_movies = []
        for movie in movies:
            poster_url = (movie.get("poster_url") or "").strip()
            if poster_url.startswith("/"):
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_url}"

            release_year = movie.get("release_year")
            if not release_year:
                raw_release = movie.get("release_date")
                release_year = int(str(raw_release)[:4]) if raw_release else 0

            normalized_movies.append(
                {
                    "tmdb_id": int(movie.get("tmdb_id") or 0),
                    "title": str(movie.get("title") or ""),
                    "poster_url": poster_url if poster_url else "",
                    "rating": float(movie.get("rating") or 0),
                    "genres": str(movie.get("genres") or ""),
                    "release_year": int(release_year or 0),
                    "id": movie.get("id"),
                    "original_language": movie.get("original_language") or "",
                    "reason": movie.get("reason") or "",
                }
            )

        text = _chatbot()[0].generate_response(message, normalized_movies, intent, user_context, history=history)

        # Extract movie titles the LLM mentioned in its text and ensure
        # they appear as cards — this fixes the mismatch between the text
        # recommending e.g. "The Princess Bride" while cards show unrelated movies.
        existing_titles = {m["title"].lower() for m in normalized_movies if m.get("title")}
        existing_ids = {m["tmdb_id"] for m in normalized_movies if m.get("tmdb_id")}
        mentioned_titles = _extract_titles_from_llm_text(text)
        llm_movies = []
        for title in mentioned_titles:
            if title.lower() in existing_titles:
                continue
            movie = _search_and_normalize_title(title)
            if movie and movie["tmdb_id"] and movie["tmdb_id"] not in existing_ids:
                existing_ids.add(movie["tmdb_id"])
                existing_titles.add(movie["title"].lower())
                llm_movies.append(movie)

        if llm_movies:
            # Put LLM-mentioned movies first, then the query_movies results
            normalized_movies = llm_movies + normalized_movies

        with transaction.atomic():
            if not session.messages.filter(role="user").exists():
                session.title = _session_title_from_message(message)
                session.save(update_fields=["title", "updated_at"])

            ChatMessage.objects.create(
                session=session,
                role="user",
                content=message,
                movies=[],
            )
            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=text,
                movies=normalized_movies,
            )
            session.save(update_fields=["updated_at"])

        return Response(
            {
                "session_id": session.id,
                "title": session.title,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
                "message": text,
                "movies": normalized_movies,
                "intent": intent,
                "history": _build_history(session),
            }
        )
    except Exception:
        return Response(
            {
                "message": "Here are some picks for you!",
                "movies": [],
                "session_id": session.id if session else None,
                "title": session.title if session else "New Conversation",
                "created_at": session.created_at.isoformat() if session else None,
                "updated_at": session.updated_at.isoformat() if session else None,
            },
            status=200,
        )