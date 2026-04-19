import requests
from django.conf import settings


FALLBACK_RESPONSE = "Here are some movies you might enjoy based on your taste!"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# ── Speed Fix: Use fast 8B model instead of slow 70B ──────────────────
# The chatbot only generates 2-3 sentences. 8B-instant is 3-5x faster
# and produces equally good short conversational text.
FAST_MODEL = "llama-3.1-8b-instant"
FAST_TIMEOUT = 5  # was 10 — fail fast, don't hang


def _movie_summary_lines(movies):
    lines = []
    for movie in movies[:5]:
        title = (movie.get("title") or "").strip()
        year = movie.get("release_year")
        if not title:
            continue
        if year:
            lines.append(f"{title} ({year})")
        else:
            lines.append(title)
    return lines


def _build_system_prompt(user_context: dict) -> str:
    top_genres = ", ".join(user_context.get("top_genres") or []) or "not yet known"
    preferred_language = user_context.get("preferred_language") or "not specified"
    total_ratings = user_context.get("total_ratings", 0)

    loved = user_context.get("loved_movies") or []
    liked = user_context.get("liked_movies") or []
    disliked = user_context.get("disliked_movies") or []
    top_rated = user_context.get("top_rated_movies") or []
    watchlist = user_context.get("watchlist_movies") or []

    taste_lines = []
    if loved:
        taste_lines.append(f"Movies they LOVE: {', '.join(loved[:5])}")
    if liked:
        taste_lines.append(f"Movies they like: {', '.join(liked[:5])}")
    if top_rated:
        rated_strs = [f"{t} ({r}/10)" for t, r in top_rated[:5]]
        taste_lines.append(f"Highly rated: {', '.join(rated_strs)}")
    if disliked:
        taste_lines.append(f"Movies they DISLIKE (avoid similar): {', '.join(disliked[:5])}")
    if watchlist:
        taste_lines.append(f"On their watchlist: {', '.join(watchlist[:5])}")

    taste_profile = "\n".join(taste_lines) if taste_lines else "New user with no watch history yet."
    activity_level = "very active" if total_ratings > 20 else "active" if total_ratings > 5 else "new"

    return (
        "You are CineMatch AI Curator — a knowledgeable film buff friend who gives warm, "
        "personalized movie recommendations. Think of yourself as that friend who always "
        "knows the perfect movie for every situation.\n\n"
        "RULES:\n"
        "- Write 2-3 sentences max. Be warm, conversational, and specific.\n"
        "- Reference the user's specific taste when relevant (e.g., 'Since you loved Inception, "
        "you'll appreciate the mind-bending narrative of...').\n"
        "- Acknowledge the user's mood or context (e.g., 'Perfect for a cozy night in...' or "
        "'After a rough day, you need...').\n"
        "- Give brief, compelling reasons WHY each recommendation fits — don't just list titles.\n"
        "- If the user expressed a negative preference (genres to avoid), acknowledge it "
        "(e.g., 'Steering clear of horror as you asked...').\n"
        "- You may mention 1-2 of the shown movies by name with a brief reason why they stand out.\n"
        "- Do NOT exhaustively list all movie titles — the UI shows movie cards separately.\n"
        "- Keep under 100 words.\n"
        "- If the user asks something unrelated to movies, gently redirect: 'I'm your movie expert! "
        "I can't help with that, but I'd love to suggest a great film instead.'\n"
        "- When no movies match well, suggest alternatives: 'I couldn't find exactly that, "
        "but based on your taste for thrillers, you might enjoy...'\n"
        "- Match the user's energy — casual if they're casual, enthusiastic if they're excited.\n"
        "- Be warm but not cheesy — professional film recommendation tone.\n\n"
        f"USER PROFILE:\n"
        f"- Favorite genres: {top_genres}\n"
        f"- Preferred language: {preferred_language}\n"
        f"- Activity level: {activity_level} ({total_ratings} ratings)\n"
        f"- Taste profile:\n{taste_profile}\n"
    )


def _build_messages(
    user_message: str,
    movies: list[dict],
    intent: dict,
    user_context: dict,
    history: list[dict] | None = None,
) -> list[dict]:
    system_prompt = _build_system_prompt(user_context)

    messages = [{"role": "system", "content": system_prompt}]

    # ── Speed Fix: Only include last 4 history entries instead of 6 ──
    # Fewer tokens = faster LLM inference
    for entry in (history or [])[-4:]:
        role = entry.get("role", "user")
        content = entry.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    matched_titles = "; ".join(_movie_summary_lines(movies)) or "No matches found"
    requested_genres = ", ".join(intent.get("genres") or []) or "any"
    requested_mood = intent.get("mood") or "any"

    context_parts = [f"User says: {user_message}"]
    context_parts.append(f"Detected intent: genres={requested_genres}, mood={requested_mood}")

    if intent.get("actor"):
        context_parts.append(f"Looking for movies with: {intent['actor']}")
    if intent.get("director"):
        context_parts.append(f"Looking for movies by director: {intent['director']}")
    if intent.get("similar_to_movie"):
        context_parts.append(f"Wants movies similar to: {intent['similar_to_movie']}")
    if intent.get("language"):
        context_parts.append(f"Language preference: {intent['language']}")
    if intent.get("decade"):
        context_parts.append(f"Era preference: {intent['decade']}")
    if intent.get("special"):
        context_parts.append(f"Special request: {intent['special']}")
    if intent.get("exclude_genres"):
        context_parts.append(f"User wants to AVOID these genres: {', '.join(intent['exclude_genres'])}")

    context_parts.append(f"Movies being shown: {matched_titles}")

    messages.append({"role": "user", "content": "\n".join(context_parts)})

    return messages


def generate_response(
    user_message: str,
    movies: list[dict],
    intent: dict,
    user_context: dict,
    history: list[dict] | None = None,
) -> str:
    api_key = (
        (getattr(settings, "GROQ_API_KEY", "") or "").strip()
        or (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    )
    if not api_key or not movies:
        return FALLBACK_RESPONSE

    messages = _build_messages(user_message, movies, intent, user_context, history)
    payload = {
        "model": FAST_MODEL,
        "messages": messages,
        "max_tokens": 150,  # was 200 — 2-3 sentences never need 200
        "temperature": 0.7,
    }

    try:
        response = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=FAST_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"].strip()
        return text or FALLBACK_RESPONSE
    except Exception:
        return FALLBACK_RESPONSE