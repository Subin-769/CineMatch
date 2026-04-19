from django.core.cache import cache
import uuid


CACHE_TIMEOUT = 3600
MAX_MESSAGES = 10


def _cache_key(session_id: str) -> str:
    return f"chatbot_session:{session_id}"


def get_history(session_id: str) -> list[dict]:
    history = cache.get(_cache_key(session_id))
    return history if isinstance(history, list) else []


def add_message(session_id: str, role: str, content: str, movies: list = None) -> None:
    history = get_history(session_id)
    history.append(
        {
            "role": role,
            "content": content,
            "movies": movies or [],
        }
    )
    cache.set(_cache_key(session_id), history[-MAX_MESSAGES:], timeout=CACHE_TIMEOUT)


def clear_history(session_id: str) -> None:
    cache.delete(_cache_key(session_id))


def generate_session_id() -> str:
    return str(uuid.uuid4())
