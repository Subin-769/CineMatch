import json
import logging
import re
from typing import Dict, Iterable, List, Optional, Set, Tuple

import requests

logger = logging.getLogger(__name__)


GENRE_KEYWORDS = {
    "action": {
        "action",
        "actions",
        "fight",
        "fighting",
        "martial arts",
        "combat",
        "explosive",
    },
    "adventure": {
        "adventure",
        "adventurous",
        "adventures",
        "journey",
        "quest",
        "expedition",
    },
    "animation": {
        "animation",
        "animated",
        "animations",
        "cartoon",
        "cartoons",
        "pixar",
        "disney",
    },
    "comedy": {
        "comedy",
        "comedies",
        "funny",
        "humor",
        "humorous",
        "laugh",
        "laughs",
    },
    "crime": {
        "crime",
        "crimes",
        "criminal",
        "criminals",
        "gangster",
        "gangsters",
        "mafia",
        "heist",
        "heists",
        "underworld",
    },
    "drama": {
        "drama",
        "dramas",
        "dramatic",
        "character-driven",
        "character driven",
        "serious",
    },
    "family": {
        "family",
        "kids",
        "children",
        "all ages",
        "family-friendly",
        "family friendly",
    },
    "fantasy": {
        "fantasy",
        "fantasies",
        "magical",
        "magic",
        "mythical",
        "fairy tale",
    },
    "horror": {
        "horror",
        "horrors",
        "scary",
        "terrifying",
        "frightening",
        "creepy",
    },
    "mystery": {
        "mystery",
        "mysteries",
        "mysterious",
        "detective",
        "detectives",
        "whodunit",
        "investigation",
    },
    "romance": {
        "romance",
        "romances",
        "romantic",
        "love",
        "lovestory",
        "love story",
    },
    "sci-fi": {
        "sci-fi",
        "scifi",
        "science fiction",
        "space",
        "futuristic",
        "alien",
        "aliens",
    },
    "thriller": {
        "thriller",
        "thrillers",
        "thrilling",
        "suspense",
        "suspenseful",
        "tense",
    },
    "documentary": {
        "documentary",
        "documentaries",
        "docu",
        "docuseries",
        "nonfiction",
        "real-life",
        "real life",
    },
}

MOOD_KEYWORDS = {
    "feel-good": {
        "feel good",
        "feel-good",
        "uplifting",
        "heartwarming",
        "funny",
        "laugh",
        "lighthearted",
        "cheerful",
    },
    "emotional": {
        "sad",
        "cry",
        "crying",
        "emotional",
        "tearjerker",
        "moving",
        "touching",
    },
    "dark": {
        "dark",
        "gritty",
        "disturbing",
        "bleak",
        "intense",
        "violent",
    },
    "exciting": {
        "exciting",
        "thrilling",
        "adrenaline",
        "fast-paced",
        "fast paced",
        "edge of your seat",
    },
    "mind-bending": {
        "mind-bending",
        "mind bending",
        "twist",
        "twisty",
        "confusing",
        "complex",
        "trippy",
        "psychological",
    },
}

DECADE_KEYWORDS = {
    "1950s": {"50s", "1950s", "fifties"},
    "1960s": {"60s", "1960s", "sixties"},
    "1970s": {"70s", "1970s", "seventies"},
    "1980s": {"80s", "1980s", "eighties"},
    "1990s": {"90s", "1990s", "nineties"},
    "2000s": {"00s", "2000s", "aughts", "two thousands"},
    "2010s": {"2010s", "10s", "tens", "twenty tens"},
    "2020s": {"2020s", "20s", "twenties"},
}

LANGUAGE_KEYWORDS = {
    "en": {"english", "hollywood", "american", "british", "america", "britain", "uk"},
    "hi": {"hindi", "bollywood", "indian", "india"},
    "ta": {"tamil", "kollywood"},
    "te": {"telugu", "tollywood"},
    "ml": {"malayalam", "mollywood"},
    "ko": {"korean", "k-movie", "k movie", "k-drama", "k drama", "south korean", "korea"},
    "ja": {"japanese", "anime", "j-movie", "japan"},
    "es": {"spanish", "latin", "mexican", "spain", "mexico"},
    "fr": {"french", "france"},
    "ne": {"nepali", "nepal"},
    "zh": {"chinese", "mandarin", "cantonese", "hong kong", "china"},
    "de": {"german", "germany"},
    "it": {"italian", "italy"},
    "pt": {"portuguese", "brazilian", "brazil", "portugal"},
    "tr": {"turkish", "turkey"},
    "th": {"thai", "thailand"},
    "kn": {"kannada", "sandalwood"},
    "bn": {"bengali", "bangladesh", "bangla"},
    "ar": {"arabic", "arab", "egyptian"},
    "ru": {"russian", "russia"},
    "sv": {"swedish", "sweden"},
    "da": {"danish", "denmark"},
    "no": {"norwegian", "norway"},
    "fi": {"finnish", "finland"},
    "pl": {"polish", "poland"},
    "id": {"indonesian", "indonesia"},
    "tl": {"filipino", "philippines", "tagalog"},
}

DECADE_TO_YEAR_RANGE = {
    "1950s": (1950, 1959),
    "1960s": (1960, 1969),
    "1970s": (1970, 1979),
    "1980s": (1980, 1989),
    "1990s": (1990, 1999),
    "2000s": (2000, 2009),
    "2010s": (2010, 2019),
    "2020s": (2020, 2029),
}

STOPWORDS = {
    "a",
    "an",
    "and",
    "any",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "give",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "kind",
    "like",
    "me",
    "movie",
    "movies",
    "of",
    "on",
    "or",
    "please",
    "recommend",
    "recommendations",
    "similar",
    "something",
    "show",
    "than",
    "that",
    "the",
    "these",
    "this",
    "to",
    "want",
    "watch",
    "with",
}

SIMILAR_PATTERNS = (
    re.compile(r"\b(?:similar to|like)\s+['\"]?([^,.!?;:\n]+?)['\"]?(?:\s+(?:but|with|from|in)\b|$)", re.IGNORECASE),
    re.compile(r"\bin the vein of\s+['\"]?([^,.!?;:\n]+?)['\"]?(?:\s+(?:but|with|from|in)\b|$)", re.IGNORECASE),
)

ACTOR_PATTERNS = (
    re.compile(r"\b(?:movies|films)\s+with\s+([a-z][a-z .'-]{1,80}?)(?:\s+(?:from|in|that|but)\b|[,.!?;:]|$)", re.IGNORECASE),
    re.compile(r"\bstarring\s+([a-z][a-z .'-]{1,80}?)(?:\s+(?:from|in|that|but)\b|[,.!?;:]|$)", re.IGNORECASE),
    re.compile(r"^([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){1,3})\s+(?:movies|films)\s*$", re.IGNORECASE),
    re.compile(r"\b(?:movies|films)\s+(?:of|from|featuring)\s+([a-z][a-z .'-]{1,80}?)(?:\s+(?:from|in|that|but)\b|[,.!?;:]|$)", re.IGNORECASE),
    re.compile(
        r"(?:(?:show|suggest|recommend|give|find|get)\s+me\s+some"
        r"|(?:show|suggest|recommend|give|find|get)\s+me"
        r"|(?:show|suggest|recommend|give|find|get))"
        r"\s+([a-z][a-z'-]+\s+[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){0,2})"
        r"\s+(?:movies|films)\b",
        re.IGNORECASE,
    ),
    re.compile(r"(?:show|suggest|recommend|give|find|get)\s+(?:me\s+)?(?:some\s+)?(?:movies|films)\s+(?:of|from|by|with|featuring)\s+([a-z][a-z .'-]{1,80}?)(?:\s+(?:from|in|that|but)\b|[,.!?;:]|$)", re.IGNORECASE),
)

DIRECTOR_PATTERNS = (
    re.compile(r"\bdirected by\s+([a-z][a-z .'-]{1,80}?)(?:\s+(?:from|in|that|but)\b|[,.!?;:]|$)", re.IGNORECASE),
    re.compile(r"\b(?:movies|films)\s+by\s+([a-z][a-z .'-]{1,80}?)(?:\s+(?:from|in|that|but)\b|[,.!?;:]|$)", re.IGNORECASE),
    re.compile(r"(?:show|suggest|recommend|give|find|get)\s+(?:me\s+)?(?:some\s+)?(?:movies|films)\s+by\s+([a-z][a-z .'-]{1,80}?)(?:\s+(?:from|in|that|but)\b|[,.!?;:]|$)", re.IGNORECASE),
)

KNOWN_DIRECTORS = {
    "alfred hitchcock",
    "bong joon ho",
    "christopher nolan",
    "david fincher",
    "denis villeneuve",
    "francis ford coppola",
    "greta gerwig",
    "guillermo del toro",
    "hayao miyazaki",
    "james cameron",
    "martin scorsese",
    "quentin tarantino",
    "ridley scott",
    "robert zemeckis",
    "sanjay leela bhansali",
    "satyajit ray",
    "sofia coppola",
    "spielberg",
    "stanley kubrick",
    "steven spielberg",
    "wes anderson",
    "david lynch",
    "coen brothers",
    "joel coen",
    "peter jackson",
    "tim burton",
    "woody allen",
    "clint eastwood",
    "spike lee",
    "darren aronofsky",
    "paul thomas anderson",
    "anurag kashyap",
    "s.s. rajamouli",
    "ss rajamouli",
    "rajkumar hirani",
    "park chan-wook",
    "park chan wook",
    "akira kurosawa",
    "wong kar wai",
    "wong kar-wai",
    "zack snyder",
    "jordan peele",
    "taika waititi",
    "guy ritchie",
    "danny boyle",
    "ang lee",
    "alejandro gonzalez inarritu",
}

EXACT_PROMPT_INTENTS = {
    "hidden gems": {
        "genres": [],
        "mood": "hidden_gems",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "hidden_gems",
    },
    "date night picks": {
        "genres": ["romance", "comedy"],
        "mood": "feel-good",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "date_night",
    },
    "perfect for weekend": {
        "genres": ["action", "adventure", "comedy"],
        "mood": "exciting",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "classic must watch": {
        "genres": [],
        "mood": None,
        "decade": "classic",
        "language": None,
        "year_range": (1970, 2000),
        "special": "classic",
    },
    "oscar winners": {
        "genres": ["drama"],
        "mood": None,
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "award_winning",
    },
    "adrenaline rush": {
        "genres": ["action", "thriller"],
        "mood": "exciting",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "date night": {
        "genres": ["romance", "comedy"],
        "mood": "feel-good",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "date_night",
    },
    "romantic evening": {
        "genres": ["romance", "comedy"],
        "mood": "feel-good",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "date_night",
    },
    "weekend": {
        "genres": ["action", "adventure", "comedy"],
        "mood": "exciting",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "friday night": {
        "genres": ["action", "adventure", "comedy"],
        "mood": "exciting",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "saturday night": {
        "genres": ["action", "adventure", "comedy"],
        "mood": "exciting",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "all time great": {
        "genres": [],
        "mood": None,
        "decade": "classic",
        "language": None,
        "year_range": (1970, 2000),
        "special": "classic",
    },
    "surprise me": {
        "genres": [],
        "mood": None,
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "surprise",
    },
    "surprise me with something great": {
        "genres": [],
        "mood": None,
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "surprise",
    },
    "what should i watch": {
        "genres": [],
        "mood": None,
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "what should i watch tonight": {
        "genres": [],
        "mood": "relaxed",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "i'm bored": {
        "genres": ["action", "comedy", "thriller"],
        "mood": "exciting",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "im bored": {
        "genres": ["action", "comedy", "thriller"],
        "mood": "exciting",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "family movie night": {
        "genres": ["family", "animation", "comedy"],
        "mood": "feel-good",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "something light": {
        "genres": ["comedy", "romance"],
        "mood": "feel-good",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "something dark": {
        "genres": ["crime", "thriller", "horror"],
        "mood": "dark",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "something deep": {
        "genres": ["drama", "sci-fi"],
        "mood": "mind-bending",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "mind blowing movies": {
        "genres": ["sci-fi", "thriller"],
        "mood": "mind-bending",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "feel good movies": {
        "genres": ["comedy", "romance", "family"],
        "mood": "feel-good",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "movies that will make me cry": {
        "genres": ["drama", "romance"],
        "mood": "emotional",
        "decade": None,
        "language": None,
        "year_range": None,
        "special": None,
    },
    "underrated movies": {
        "genres": [],
        "mood": None,
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "hidden_gems",
    },
    "best movies of all time": {
        "genres": [],
        "mood": None,
        "decade": None,
        "language": None,
        "year_range": None,
        "special": "award_winning",
    },
    "new releases": {
        "genres": [],
        "mood": None,
        "decade": "recent",
        "language": None,
        "year_range": (2024, 2026),
        "special": None,
    },
    "latest movies": {
        "genres": [],
        "mood": None,
        "decade": "recent",
        "language": None,
        "year_range": (2024, 2026),
        "special": None,
    },
}

EXPANDED_GENRE_KEYWORDS = {
    "action": {"action"},
    "comedy": {"comedy", "funny", "humor"},
    "horror": {"horror", "scary", "frightening"},
    "romance": {"romance", "romantic", "love story"},
    "sci-fi": {"sci-fi", "science fiction", "space", "futuristic"},
    "thriller": {"thriller", "suspense", "tense"},
    "drama": {"drama"},
    "fantasy": {"fantasy", "magical", "fairy tale"},
    "mystery": {"mystery", "detective", "whodunit"},
    "adventure": {"adventure", "quest", "journey"},
    "animation": {"animation", "animated", "cartoon"},
    "documentary": {"documentary", "real life", "true story"},
    "biography": {"biography", "biopic", "based on true"},
    "musical": {"musical", "music", "singing"},
    "western": {"western"},
    "war": {"war", "military", "battle"},
    "crime": {"crime", "gangster", "heist", "mafia"},
    "family": {"family", "kids", "children"},
    "sport": {"sport", "sports", "athlete"},
}

EXPANDED_LANGUAGE_KEYWORDS = {
    "ja": {"anime", "japanese animation", "manga"},
    "hi": {"bollywood", "hindi movie", "indian movie"},
    "ko": {"korean", "k-drama", "k-movie", "kdrama"},
    "fr": {"french film", "french movie"},
    "es": {"spanish", "spanish movie"},
    "ne": {"nepali", "nepali movie", "nepal movie"},
    "ta": {"tamil", "tollywood"},
    "te": {"telugu"},
    "ar": {"arabic movie", "egyptian movie"},
    "ru": {"russian movie", "russian film"},
    "bn": {"bengali movie", "bangla movie"},
}

EXPANDED_MOOD_KEYWORDS = {
    "feel-good": {
        "keywords": {"feel good", "cheer me up", "happy", "uplifting"},
        "genres": ["comedy", "romance"],
    },
    "emotional": {
        "keywords": {"sad", "cry", "emotional", "tearjerker"},
        "genres": ["drama", "romance"],
    },
    "dark": {
        "keywords": {"dark", "gritty", "disturbing"},
        "genres": ["crime", "horror", "thriller"],
    },
    "mind-bending": {
        "keywords": {"mind blowing", "mind bending", "twist ending", "unpredictable", "complex"},
        "genres": ["sci-fi", "mystery", "thriller"],
    },
    "exciting": {
        "keywords": {"exciting", "excited", "thrilling", "edge of seat", "intense", "pumped"},
        "genres": ["action", "thriller"],
    },
    "relaxed": {
        "keywords": {"relaxing", "chill", "light"},
        "genres": ["comedy", "family", "romance"],
    },
    "inspiring": {
        "keywords": {"inspiring", "motivating", "uplifting"},
        "genres": ["biography", "drama", "sport"],
    },
}

EXPANDED_SPECIAL_KEYWORDS = {
    "hidden_gems": {"hidden gems"},
    "award_winning": {"oscar", "award", "acclaimed", "oscar winner", "academy award"},
    "classic": {"classic", "must watch", "all time great"},
    "date_night": {"date night", "romantic evening", "valentines", "valentine"},
}

EXPANDED_RUNTIME_KEYWORDS = {
    "short": {"short", "quick watch"},
    "long": {"long", "epic"},
}

EXPANDED_ERA_KEYWORDS = {
    "1990s": {"90s", "1990s", "nineties"},
    "1980s": {"80s", "1980s", "eighties"},
    "2000s": {"2000s", "early 2000"},
    "recent": {"recent", "new", "latest", "2020s"},
    "classic": {"old", "classic", "vintage", "timeless"},
}


EXCLUDE_GENRE_PATTERNS = [
    re.compile(r"\b(?:no|not|without|skip|hate|avoid|nothing)\s+(" + "|".join(
        kw for keywords in GENRE_KEYWORDS.values() for kw in keywords
    ) + r")\b", re.IGNORECASE),
    re.compile(r"\b(?:no|not|without|skip|hate|avoid|nothing)\s+(?:anything\s+)?(" + "|".join(
        kw for keywords in GENRE_KEYWORDS.values() for kw in keywords
    ) + r")\b", re.IGNORECASE),
]

# Reverse lookup: keyword -> canonical genre name
_KEYWORD_TO_GENRE = {}
for _genre, _keywords in GENRE_KEYWORDS.items():
    for _kw in _keywords:
        _KEYWORD_TO_GENRE[_kw.lower()] = _genre


SIMILAR_TO_PATTERNS_EXTENDED = [
    re.compile(r"\bi\s+(?:loved|enjoyed|liked|really liked)\s+['\"]?([^,.!?;:\n]+?)['\"]?\s*[,.]?\s*(?:give|show|suggest|recommend|more|find|get)", re.IGNORECASE),
    re.compile(r"\bi\s+(?:loved|enjoyed|liked|really liked)\s+['\"]?([^,.!?;:\n]+?)['\"]?\s*$", re.IGNORECASE),
    re.compile(r"\bmore\s+like\s+['\"]?([^,.!?;:\n]+?)['\"]?(?:\s|$)", re.IGNORECASE),
    re.compile(r"\bmovies?\s+like\s+['\"]?([^,.!?;:\n]+?)['\"]?(?:\s|$)", re.IGNORECASE),
]


def _extract_exclude_genres(text: str) -> List[str]:
    """Extract genres the user wants to exclude (e.g., 'no horror', 'skip action')."""
    normalized = text.lower()
    excluded = set()
    for pattern in EXCLUDE_GENRE_PATTERNS:
        for match in pattern.finditer(normalized):
            keyword = match.group(1).strip().lower()
            genre = _KEYWORD_TO_GENRE.get(keyword)
            if genre:
                excluded.add(genre)
    # Also detect "not in the mood for anything heavy" -> exclude drama, war
    if re.search(r"\bnot\s+(?:in\s+the\s+mood\s+for\s+)?(?:anything\s+)?heavy\b", normalized):
        excluded.update(["drama", "documentary"])
    return list(excluded)


def _extract_similar_to_extended(message: str) -> Optional[str]:
    """Extended similar-to extraction for conversational patterns like 'I loved Parasite'."""
    for pattern in SIMILAR_TO_PATTERNS_EXTENDED:
        match = pattern.search(message)
        if match:
            title = match.group(1).strip(" '\"")
            title = re.sub(r"\s+", " ", title).strip()
            # Filter out overly generic matches
            if title and len(title) > 1 and title.lower() not in STOPWORDS:
                return title
    return None


def _intent_is_mostly_empty(intent: dict) -> bool:
    """Check if the rule-based parser returned a mostly empty intent."""
    populated = 0
    if intent.get("genres"):
        populated += 1
    if intent.get("mood"):
        populated += 1
    if intent.get("actor"):
        populated += 1
    if intent.get("director"):
        populated += 1
    if intent.get("language"):
        populated += 1
    if intent.get("similar_to_movie"):
        populated += 1
    if intent.get("special"):
        populated += 1
    if intent.get("decade"):
        populated += 1
    return populated < 2


def parse_intent_with_llm(message: str):
    """Use Groq LLM as a fallback to parse freeform conversational messages into structured intent.
 
    SPEED FIX: Uses llama-3.1-8b-instant (was 70b-versatile) with 2s timeout (was 3s).
    """
    import json
    import logging
    import re
 
    import requests
    from django.conf import settings
 
    logger = logging.getLogger(__name__)
 
    api_key = (
        (getattr(settings, "GROQ_API_KEY", "") or "").strip()
        or (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    )
    if not api_key:
        return None
 
    system_prompt = (
        "You are a movie intent parser. Extract movie search intent from the user's message. "
        "Even if the message is long, rambling, or conversational, scan the ENTIRE text for movie-related signals. "
        "Return ONLY valid JSON (no markdown, no explanation) with these fields:\n"
        '- "genres": list of strings (e.g. ["comedy", "romance"]). Valid genres: action, adventure, animation, comedy, crime, drama, family, fantasy, horror, mystery, romance, sci-fi, thriller, documentary. '
        "Extract ALL genres mentioned anywhere in the text, even if embedded in conversation.\n"
        '- "mood": string or null. Valid moods: feel-good, emotional, dark, exciting, mind-bending, relaxed, inspiring\n'
        '- "language": ISO 639-1 code or null. IMPORTANT: Map country names to their language codes: '
        "Nepal->ne, India->hi, Korea->ko, Japan->ja, France->fr, Spain->es, Germany->de, Italy->it, "
        "China->zh, Brazil->pt, Turkey->tr, Thailand->th, Russia->ru, Mexico->es, Egypt->ar, "
        "Bangladesh->bn, Philippines->tl, Sweden->sv, Norway->no, Denmark->da, Finland->fi, Poland->pl, Indonesia->id. "
        "If a country or nationality is mentioned ANYWHERE in the text, set the language code.\n"
        '- "actor": string or null\n'
        '- "director": string or null\n'
        '- "similar_to_movie": movie title string or null\n'
        '- "decade": string like "1990s" or null\n'
        '- "exclude_genres": list of genre strings the user wants to AVOID\n'
        '- "special": one of "trending", "hidden_gems", "classic", "surprise", "award_winning", "date_night", "new_releases" or null\n'
        '- "runtime_preference": "short" or "long" or null\n'
        '- "age_appropriate": "kids", "teens", "family" or null\n\n'
        "IMPORTANT RULES:\n"
        "1. Country names = language filter. 'Nepal' means nepali movies (language: 'ne'). 'Korea' means korean movies (language: 'ko').\n"
        "2. Extract the DOMINANT or most prominent signal from long text. If someone talks about Nepal and horror genres, return both language AND genres.\n"
        "3. For date-related contexts (date night, romantic evening, valentines), set mood to 'feel-good' and genres to ['romance', 'comedy'].\n"
        "4. For award/oscar contexts, set special to 'award_winning'.\n"
        "5. Genre keywords embedded in conversation count: 'horror movie genres' -> genres: ['horror'], 'comedy genres' -> genres: ['comedy'].\n"
        "6. If multiple genres are discussed (e.g., horror, comedy, action, thriller, indie), include ALL of them.\n\n"
        "Examples:\n"
        '- "I just got dumped" -> mood: "emotional", genres: ["drama", "romance"]\n'
        '- "date night movie" -> mood: "feel-good", genres: ["romance", "comedy"]\n'
        '- "Nepal" -> language: "ne"\n'
        '- "show me korean movies" -> language: "ko"\n'
        '- "something my 10 year old would love" -> age_appropriate: "kids", genres: ["animation", "family"]\n'
        '- "idk just pick something" -> special: "surprise"\n'
        '- "oscar winning movies" -> special: "award_winning"\n'
        '- "In Nepal people argued about horror and comedy genres" -> language: "ne", genres: ["horror", "comedy"]\n'
    )
 
    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.1-8b-instant",  # ← SPEED FIX (was llama-3.3-70b-versatile)
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message},
                ],
                "max_tokens": 200,  # ← SPEED FIX (was 300)
                "temperature": 0.1,
            },
            timeout=2,  # ← SPEED FIX (was 3)
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"].strip()
 
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
 
        parsed = json.loads(text)
 
        llm_intent = {}
        if parsed.get("genres") and isinstance(parsed["genres"], list):
            llm_intent["genres"] = [g.lower().strip() for g in parsed["genres"] if isinstance(g, str)]
        if parsed.get("mood") and isinstance(parsed["mood"], str):
            llm_intent["mood"] = parsed["mood"].strip()
        if parsed.get("language") and isinstance(parsed["language"], str):
            llm_intent["language"] = parsed["language"].strip().lower()
        if parsed.get("actor") and isinstance(parsed["actor"], str):
            llm_intent["actor"] = parsed["actor"].strip()
        if parsed.get("director") and isinstance(parsed["director"], str):
            llm_intent["director"] = parsed["director"].strip()
        if parsed.get("similar_to_movie") and isinstance(parsed["similar_to_movie"], str):
            llm_intent["similar_to_movie"] = parsed["similar_to_movie"].strip()
        if parsed.get("decade") and isinstance(parsed["decade"], str):
            llm_intent["decade"] = parsed["decade"].strip()
        if parsed.get("exclude_genres") and isinstance(parsed["exclude_genres"], list):
            llm_intent["exclude_genres"] = [g.lower().strip() for g in parsed["exclude_genres"] if isinstance(g, str)]
        if parsed.get("special") and isinstance(parsed["special"], str):
            llm_intent["special"] = parsed["special"].strip()
        if parsed.get("runtime_preference") and isinstance(parsed["runtime_preference"], str):
            llm_intent["runtime"] = parsed["runtime_preference"].strip()
        if parsed.get("age_appropriate") and isinstance(parsed["age_appropriate"], str):
            age = parsed["age_appropriate"].strip().lower()
            if age in ("kids", "family"):
                llm_intent.setdefault("genres", [])
                for g in ["family", "animation"]:
                    if g not in llm_intent["genres"]:
                        llm_intent["genres"].append(g)
 
        return llm_intent
    except Exception as exc:
        logger.debug("LLM intent fallback failed: %s", exc)
        return None

def _normalize_text(text: str) -> str:
    lowered = text.lower()
    lowered = re.sub(r"[^\w\s-]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def _contains_keyword(text: str, keyword: str) -> bool:
    pattern = r"(?<!\w)" + re.escape(keyword) + r"(?!\w)"
    return bool(re.search(pattern, text))


def _find_matches(text: str, mapping: Dict[str, Set[str]]) -> Tuple[List[str], Set[str]]:
    matches: List[str] = []
    consumed: Set[str] = set()

    for canonical, keywords in mapping.items():
        for keyword in sorted(keywords, key=len, reverse=True):
            pattern = r"(?<!\w)" + re.escape(keyword) + r"(?!\w)"
            if re.search(pattern, text):
                matches.append(canonical)
                consumed.update(re.findall(r"[a-z0-9]+", keyword.lower()))
                break

    return matches, consumed


def _extract_similar_to(message: str) -> Optional[str]:
    for pattern in SIMILAR_PATTERNS:
        match = pattern.search(message)
        if match:
            title = match.group(1).strip(" '\"")
            title = re.sub(r"\s+", " ", title).strip()
            if title:
                return title
    return None


def _clean_extracted_name(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" '\"")
    return cleaned if cleaned else None


_ALL_GENRE_WORDS = {kw for keywords in GENRE_KEYWORDS.values() for kw in keywords}
_ALL_GENRE_WORDS.update(GENRE_KEYWORDS.keys())

_COMMAND_VERBS = {"show", "suggest", "recommend", "give", "find", "get", "list", "tell"}


def _extract_actor(message: str) -> Optional[str]:
    for pattern in ACTOR_PATTERNS:
        match = pattern.search(message.strip())
        if match:
            name = _clean_extracted_name(match.group(1))
            if not name:
                continue
            # Don't treat genre words as actor names (e.g., "action movies")
            if name.lower() in _ALL_GENRE_WORDS:
                continue
            if name.lower() in STOPWORDS:
                continue
            # Reject if name starts with a command verb (bad regex capture)
            first_word = name.split()[0].lower()
            if first_word in _COMMAND_VERBS or first_word in STOPWORDS:
                continue
            return name
    return None


def _extract_director(message: str) -> Optional[str]:
    stripped = message.strip()
    for pattern in DIRECTOR_PATTERNS:
        match = pattern.search(stripped)
        if match:
            return _clean_extracted_name(match.group(1))

    direct_name_match = re.match(r"^\s*([a-z][a-z .'-]{1,80})\s+movies\s*$", stripped, re.IGNORECASE)
    if direct_name_match:
        candidate = _clean_extracted_name(direct_name_match.group(1))
        if candidate and candidate.lower() in KNOWN_DIRECTORS:
            return candidate
    return None


def _detect_name_only_request(
    message: str,
    genres: List[str],
    moods: List[str],
    decades: List[str],
    languages: List[str],
) -> Tuple[Optional[str], Optional[str]]:
    normalized = re.sub(r"[^a-zA-Z .'-]", " ", message)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        return None, None

    words = normalized.split()
    if len(words) < 1 or len(words) > 3:
        return None, None
    if genres or moods or decades or languages:
        return None, None

    if normalized.lower() in KNOWN_DIRECTORS:
        return None, normalized
    return normalized, None


def _extract_keywords(normalized_text: str, consumed_terms: Iterable[str], similar_to: Optional[str]) -> List[str]:
    consumed = set(consumed_terms)
    if similar_to:
        consumed.update(re.findall(r"[a-z0-9]+", similar_to.lower()))

    keywords: List[str] = []
    seen: Set[str] = set()

    for token in re.findall(r"[a-z0-9]+", normalized_text):
        if token in STOPWORDS or token in consumed or token.isdigit():
            continue
        if len(token) <= 2:
            continue
        if token not in seen:
            seen.add(token)
            keywords.append(token)

    return keywords


def _merge_unique(values: Iterable[str], extra: Iterable[str]) -> List[str]:
    merged = list(values)
    seen = set(merged)
    for value in extra:
        if not value or value in seen:
            continue
        seen.add(value)
        merged.append(value)
    return merged


def parse_intent(message: str) -> dict:
    exact_match = EXACT_PROMPT_INTENTS.get(message.strip().lower())
    if exact_match:
        return {
            "genres": list(exact_match["genres"]),
            "mood": exact_match["mood"],
            "decade": exact_match["decade"],
            "language": exact_match["language"],
            "year_range": exact_match["year_range"],
            "similar_to": None,
            "actor": None,
            "director": None,
            "similar_to_movie": None,
            "special": exact_match["special"],
            "runtime": None,
            "keywords": [],
            "exclude_genres": [],
        }

    normalized = _normalize_text(message)

    genres, genre_terms = _find_matches(normalized, GENRE_KEYWORDS)
    moods, mood_terms = _find_matches(normalized, MOOD_KEYWORDS)
    decades, decade_terms = _find_matches(normalized, DECADE_KEYWORDS)
    languages, language_terms = _find_matches(normalized, LANGUAGE_KEYWORDS)

    expanded_genres = []
    for canonical, keywords in EXPANDED_GENRE_KEYWORDS.items():
        if any(_contains_keyword(normalized, keyword) for keyword in keywords):
            expanded_genres.append(canonical)

    expanded_language = None
    for canonical, keywords in EXPANDED_LANGUAGE_KEYWORDS.items():
        if any(_contains_keyword(normalized, keyword) for keyword in keywords):
            expanded_language = canonical
            break

    expanded_mood = None
    expanded_mood_genres = []
    for canonical, payload in EXPANDED_MOOD_KEYWORDS.items():
        if any(_contains_keyword(normalized, keyword) for keyword in payload["keywords"]):
            expanded_mood = canonical
            expanded_mood_genres = payload["genres"]
            break

    special = None
    for canonical, keywords in EXPANDED_SPECIAL_KEYWORDS.items():
        if any(_contains_keyword(normalized, keyword) for keyword in keywords):
            special = canonical
            break

    runtime = None
    for canonical, keywords in EXPANDED_RUNTIME_KEYWORDS.items():
        if any(_contains_keyword(normalized, keyword) for keyword in keywords):
            runtime = canonical
            break

    expanded_decade = None
    expanded_year_range = None
    for canonical, keywords in EXPANDED_ERA_KEYWORDS.items():
        if any(_contains_keyword(normalized, keyword) for keyword in keywords):
            expanded_decade = canonical
            if canonical == "1990s":
                expanded_year_range = (1990, 1999)
            elif canonical == "1980s":
                expanded_year_range = (1980, 1989)
            elif canonical == "2000s":
                expanded_year_range = (2000, 2009)
            elif canonical == "recent":
                expanded_year_range = (2020, 2026)
            elif canonical == "classic":
                expanded_year_range = (1970, 2000)
                special = special or "classic"
            break

    genres = _merge_unique(genres, expanded_genres)
    genres = _merge_unique(genres, expanded_mood_genres)

    mood = expanded_mood or (moods[0] if moods else None)
    decade = expanded_decade or (decades[0] if decades else None)
    language = expanded_language or (languages[0] if languages else None)
    year_range = expanded_year_range or DECADE_TO_YEAR_RANGE.get(decade)
    similar_to = _extract_similar_to(message)
    similar_to_movie = similar_to
    actor = _extract_actor(message)
    director = _extract_director(message)

    if not actor and not director and not similar_to_movie:
        fallback_actor, fallback_director = _detect_name_only_request(
            message,
            genres,
            moods,
            decades,
            languages,
        )
        actor = fallback_actor
        director = fallback_director

    # Extract genre exclusions
    exclude_genres = _extract_exclude_genres(message)

    # Try extended similar-to patterns if basic extraction missed it
    if not similar_to_movie:
        similar_to_movie = _extract_similar_to_extended(message)
        similar_to = similar_to_movie

    consumed_terms = genre_terms | mood_terms | decade_terms | language_terms
    keywords = _extract_keywords(normalized, consumed_terms, similar_to)

    # Remove excluded genres from the positive genre list
    if exclude_genres:
        genres = [g for g in genres if g not in exclude_genres]

    intent = {
        "genres": genres,
        "mood": mood,
        "decade": decade,
        "language": language,
        "year_range": year_range,
        "similar_to": similar_to,
        "actor": actor,
        "director": director,
        "similar_to_movie": similar_to_movie,
        "special": special,
        "runtime": runtime,
        "keywords": keywords,
        "exclude_genres": exclude_genres,
    }

    # LLM fallback: if rule-based parsing returned mostly empty, ask Groq
    if _intent_is_mostly_empty(intent):
        llm_result = parse_intent_with_llm(message)
        if llm_result:
            # Merge LLM results into empty fields only
            if not intent["genres"] and llm_result.get("genres"):
                intent["genres"] = llm_result["genres"]
            if not intent["mood"] and llm_result.get("mood"):
                intent["mood"] = llm_result["mood"]
            if not intent["language"] and llm_result.get("language"):
                intent["language"] = llm_result["language"]
            if not intent["actor"] and llm_result.get("actor"):
                intent["actor"] = llm_result["actor"]
            if not intent["director"] and llm_result.get("director"):
                intent["director"] = llm_result["director"]
            if not intent["similar_to_movie"] and llm_result.get("similar_to_movie"):
                intent["similar_to_movie"] = llm_result["similar_to_movie"]
                intent["similar_to"] = llm_result["similar_to_movie"]
            if not intent["decade"] and llm_result.get("decade"):
                intent["decade"] = llm_result["decade"]
                intent["year_range"] = DECADE_TO_YEAR_RANGE.get(llm_result["decade"])
            if not intent["exclude_genres"] and llm_result.get("exclude_genres"):
                intent["exclude_genres"] = llm_result["exclude_genres"]
            if not intent["special"] and llm_result.get("special"):
                intent["special"] = llm_result["special"]
            if not intent["runtime"] and llm_result.get("runtime"):
                intent["runtime"] = llm_result["runtime"]

    return intent
