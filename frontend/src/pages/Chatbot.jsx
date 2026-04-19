import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Send,
  Shuffle,
  Heart,
  Flame,
  Ghost,
  Laugh,
  Swords,
  Rocket,
  Drama,
  Baby,
  Music,
  Star,
  Play,
  Plus,
  ChevronRight,
  ChevronLeft,
  Film,
  User,
  MessageSquare,
  Trash2,
  Zap,
  Lightbulb,
  Compass,
  RefreshCw,
  Wand2,
  SlidersHorizontal,
  X,
  ArrowLeft,
  Menu,
} from "lucide-react";
import Topbar from "../components/Topbar";
import MovieCard from "../components/MovieCard";
import { AuthContext } from "../auth/AuthContext";
import api from "../api/api";

const genres = [
  { id: "action", label: "Action", icon: Swords, color: "from-red-500 to-orange-500" },
  { id: "comedy", label: "Comedy", icon: Laugh, color: "from-yellow-400 to-amber-500" },
  { id: "horror", label: "Horror", icon: Ghost, color: "from-purple-600 to-violet-800" },
  { id: "romance", label: "Romance", icon: Heart, color: "from-pink-400 to-rose-500" },
  { id: "scifi", label: "Sci-Fi", icon: Rocket, color: "from-cyan-400 to-blue-600" },
  { id: "thriller", label: "Thriller", icon: Flame, color: "from-orange-500 to-red-600" },
  { id: "drama", label: "Drama", icon: Drama, color: "from-indigo-400 to-purple-600" },
  { id: "family", label: "Family", icon: Baby, color: "from-green-400 to-emerald-500" },
  { id: "musical", label: "Musical", icon: Music, color: "from-fuchsia-400 to-pink-600" },
];

const moods = [
  { id: "relaxed", label: "Relaxed", description: "Easy watching" },
  { id: "excited", label: "Excited", description: "Action packed" },
  { id: "sad", label: "Need a good cry", description: "Emotional" },
  { id: "happy", label: "Feel good", description: "Uplifting" },
  { id: "scared", label: "Want to be scared", description: "Spine tingling" },
  { id: "curious", label: "Mind bending", description: "Thought provoking" },
];

const quickPrompts = [
  { id: "classic", label: "Classic must watch", icon: Film },
  { id: "hidden", label: "Hidden gems", icon: Lightbulb },
  { id: "weekend", label: "Perfect for weekend", icon: Compass },
  { id: "date", label: "Date night picks", icon: Heart },
  { id: "adrenaline", label: "Adrenaline rush", icon: Zap },
  { id: "oscar", label: "Oscar winners", icon: Star },
];

const LOADING_MESSAGES = {
  default: "Finding matches",
  actor: "Searching filmography",
  director: "Exploring director's work",
  similar: "Exploring similar titles",
  hidden_gems: "Curating hidden gems",
  trending: "Checking what's trending",
  classic: "Digging into the classics",
  surprise: "Picking something special",
  award_winning: "Browsing award winners",
  new_releases: "Checking new releases",
};

function getLoadingMessage(text) {
  if (!text) return LOADING_MESSAGES.default;
  const lower = text.toLowerCase();
  if (/\b(?:starring|with)\s+\w/i.test(lower) || /\bactor\b/i.test(lower)) return LOADING_MESSAGES.actor;
  if (/\bdirected?\s+by\b/i.test(lower) || /\bdirector\b/i.test(lower)) return LOADING_MESSAGES.director;
  if (/\b(?:like|similar|loved|enjoyed)\b/i.test(lower)) return LOADING_MESSAGES.similar;
  if (/\bhidden\s*gem/i.test(lower) || /\bunderrated\b/i.test(lower)) return LOADING_MESSAGES.hidden_gems;
  if (/\btrending\b/i.test(lower) || /\beveryone\s+watching\b/i.test(lower)) return LOADING_MESSAGES.trending;
  if (/\bclassic\b/i.test(lower) || /\ball\s+time\b/i.test(lower)) return LOADING_MESSAGES.classic;
  if (/\bsurprise\b/i.test(lower) || /\bjust\s+pick\b/i.test(lower) || /\bidk\b/i.test(lower)) return LOADING_MESSAGES.surprise;
  if (/\boscar\b/i.test(lower) || /\baward\b/i.test(lower)) return LOADING_MESSAGES.award_winning;
  if (/\bnew\s+release/i.test(lower) || /\blatest\b/i.test(lower)) return LOADING_MESSAGES.new_releases;
  return LOADING_MESSAGES.default;
}

function normalizeChatMovies(data) {
  const rawMovies = Array.isArray(data?.movies)
    ? data.movies
    : Array.isArray(data?.results)
      ? data.results
      : [];

  return rawMovies
    .filter((movie) => movie && (movie.tmdb_id || movie.id))
    .map((movie) => ({
      id: movie.tmdb_id || movie.id,
      tmdb_id: movie.tmdb_id || movie.id,
      title: movie.title || "Recommended",
      year: movie.release_year || movie.release_date?.slice?.(0, 4) || "",
      rating: movie.rating ?? null,
      poster_url: movie.poster_url || "",
      genre: movie.genres || movie.genre || "Recommended",
      reason: movie.reason || "",
    }));
}

function createWelcomeMessage() {
  return {
    id: "welcome",
    type: "ai",
    role: "assistant",
    content:
      "Welcome to AI Curator. Tell me what you want to watch, pick a genre, or hit Surprise Me.",
    timestamp: new Date(),
    movies: [],
  };
}

function normalizeStoredMovies(movies) {
  return Array.isArray(movies)
    ? movies
        .filter((movie) => movie && (movie.tmdb_id || movie.id))
        .map((movie) => ({
          id: movie.tmdb_id || movie.id,
          tmdb_id: movie.tmdb_id || movie.id,
          title: movie.title || "Recommended",
          year: movie.release_year || movie.release_date?.slice?.(0, 4) || movie.year || "",
          rating: movie.rating ?? null,
          poster_url: movie.poster_url || movie.poster || "",
          genre: movie.genres || movie.genre || "Recommended",
          reason: movie.reason || "",
        }))
    : [];
}

function normalizeStoredMessage(message) {
  return {
    id: String(message.id),
    type: message.role === "user" ? "user" : "ai",
    role: message.role,
    content: message.content || "",
    timestamp: message.created_at ? new Date(message.created_at) : new Date(),
    movies: message.role === "assistant" ? normalizeStoredMovies(message.movies) : [],
  };
}

export default function Chatbot() {
  const { user, loading } = useContext(AuthContext);
  const navigate = useNavigate();
  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [sessionId, setSessionId] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedMood, setSelectedMood] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES.default);
  const [error, setError] = useState(null);

  // Mobile drawer states
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (loading || !user) return;

    const loadSessions = async () => {
      try {
        const res = await api.get("/chat/sessions/");
        const sessions = Array.isArray(res.data) ? res.data : [];
        setChatSessions(sessions);

        if (sessions.length > 0) {
          const firstSessionId = sessions[0].id;
          setSessionId(firstSessionId);
          const messagesRes = await api.get(`/chat/sessions/${firstSessionId}/messages/`);
          const loadedMessages = Array.isArray(messagesRes.data)
            ? messagesRes.data.map(normalizeStoredMessage)
            : [];
          setMessages(loadedMessages.length > 0 ? loadedMessages : [createWelcomeMessage()]);
        } else {
          setMessages([createWelcomeMessage()]);
          setSessionId(null);
        }
      } catch (err) {
        setError(err?.message || "Failed to load conversations");
      }
    };

    loadSessions();
  }, [user, loading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Close drawers on route change or resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1280) setLeftDrawerOpen(false);
      if (window.innerWidth >= 1024) setRightDrawerOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const upsertSession = (session) => {
    setChatSessions((prev) => {
      const filtered = prev.filter((item) => item.id !== session.id);
      return [session, ...filtered];
    });
  };

  const loadSession = async (targetSessionId) => {
    setError(null);
    try {
      const res = await api.get(`/chat/sessions/${targetSessionId}/messages/`);
      const loadedMessages = Array.isArray(res.data)
        ? res.data.map(normalizeStoredMessage)
        : [];
      setSessionId(targetSessionId);
      setMessages(loadedMessages.length > 0 ? loadedMessages : [createWelcomeMessage()]);
      setLeftDrawerOpen(false);
    } catch (err) {
      setError(err?.message || "Failed to load messages");
    }
  };

  const createSession = async () => {
    setError(null);
    const res = await api.post("/chat/sessions/");
    const newSession = res.data;
    setSessionId(newSession.id);
    setMessages([createWelcomeMessage()]);
    setInput("");
    setSelectedGenres([]);
    setSelectedMood(null);
    setEditingSessionId(null);
    setEditingTitle("");
    upsertSession({ ...newSession, updated_at: newSession.created_at, last_message: "" });
    return newSession;
  };

  const beginRenameSession = (session, event) => {
    event.stopPropagation();
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const submitSessionRename = async (targetSessionId) => {
    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle) {
      setEditingSessionId(null);
      setEditingTitle("");
      return;
    }

    try {
      const res = await api.patch(`/chat/sessions/${targetSessionId}/`, {
        title: trimmedTitle,
      });
      upsertSession(res.data);
    } catch (err) {
      setError(err?.message || "Failed to rename conversation");
    } finally {
      setEditingSessionId(null);
      setEditingTitle("");
    }
  };

  const deleteSession = async (targetSessionId, event) => {
    event.stopPropagation();
    try {
      const remainingSessions = chatSessions.filter((session) => session.id !== targetSessionId);
      await api.delete(`/chat/sessions/${targetSessionId}/`);
      setChatSessions(remainingSessions);

      if (sessionId === targetSessionId) {
        if (remainingSessions.length > 0) {
          await loadSession(remainingSessions[0].id);
        } else {
          setSessionId(null);
          setMessages([createWelcomeMessage()]);
        }
      }
    } catch (err) {
      setError(err?.message || "Failed to delete conversation");
    }
  };

  const toggleGenre = (genreId) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId)
        ? prev.filter((g) => g !== genreId)
        : [...prev, genreId]
    );
  };

  const resolveMessageText = (customMessage) => {
    if (customMessage) return customMessage;
    if (input.trim()) return input.trim();
    if (selectedGenres.length > 0) {
      const labels = selectedGenres
        .map((g) => genres.find((genre) => genre.id === g)?.label)
        .filter(Boolean)
        .join(", ");
      return `Looking for ${labels} movies`;
    }
    if (selectedMood) {
      const label = moods.find((m) => m.id === selectedMood)?.label;
      return label ? `I am feeling ${label}` : "I want a recommendation";
    }
    return "";
  };

  const handleSend = async (customMessage) => {
    if (!user) {
      setError("Login required to use AI Curator.");
      navigate("/login", { replace: true });
      return;
    }
    const messageText = resolveMessageText(customMessage);
    if (!messageText) return;

    const userMessage = {
      id: Date.now().toString(),
      type: "user",
      role: "user",
      content: messageText,
      timestamp: new Date(),
      movies: [],
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoadingText(getLoadingMessage(messageText));
    setIsTyping(true);
    setError(null);
    setRightDrawerOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "48px";
    }

    try {
      const res = await api.post("/chat/", {
        message: messageText,
        session_id: sessionId,
      });
      const data = res.data || {};
      const cards = normalizeChatMovies(data);

      const aiMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        role: "assistant",
        content:
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : cards.length > 0
              ? "Here are some tailored picks based on your request."
              : "I could not find strong matches. Try a specific movie title.",
        movies: cards,
        timestamp: new Date(),
      };

      const resolvedSessionId = data.session_id || sessionId;
      setSessionId(resolvedSessionId);
      setMessages((prev) => [...prev, aiMessage]);
      upsertSession({
        id: resolvedSessionId,
        title: data.title || "New Conversation",
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
        last_message: messageText.slice(0, 50),
      });
    } catch (err) {
      setError(err?.message || "Failed to get recommendations");
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: "ai",
          role: "assistant",
          content:
            "I could not reach the recommender. Please try again in a moment.",
          timestamp: new Date(),
          movies: [],
        },
      ]);
    } finally {
      setIsTyping(false);
      setSelectedGenres([]);
      setSelectedMood(null);
    }
  };

  const handleSurpriseMe = () => {
    handleSend("Surprise me with something great");
  };

  const handleQuickPrompt = (prompt) => {
    handleSend(prompt);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    createSession().catch((err) => {
      setError(err?.message || "Failed to create conversation");
    });
  };

  const isWelcome = messages.length <= 1 && messages[0]?.id === "welcome";
  const hasFilters = selectedGenres.length > 0 || selectedMood;

  // ── Shared sidebar content ──────────────────────────────────────────

  const leftSidebarContent = (
    <>
      <div className="shrink-0 px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#FFC105] flex items-center justify-center shrink-0 shadow-[0_10px_30px_rgba(255,193,5,0.20)]">
            <Film className="h-5 w-5 text-black" />
          </div>
          <div>
            <span className="font-bold text-lg text-[#FFC105] tracking-tight uppercase">
              CineMatch
            </span>
            <p className="text-[10px] text-white/55 -mt-0.5">AI Curator</p>
          </div>
        </div>
      </div>

      <div className="shrink-0 p-4 space-y-2 border-b border-white/10">
        <Link to="/">
          <div className="w-full text-left px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 flex items-center gap-2 transition">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </div>
        </Link>
        <button
          className="w-full h-11 rounded-xl bg-[#FFC105] text-black font-semibold flex items-center gap-3 px-4 hover:bg-[#ffd24d] transition"
          onClick={() => { handleSurpriseMe(); setLeftDrawerOpen(false); }}
        >
          <Shuffle className="w-5 h-5" />
          Surprise Me
        </button>
        <button
          className="w-full h-10 rounded-xl bg-white/10 text-white/80 flex items-center gap-3 px-4 hover:bg-white/15 transition"
          onClick={() => { clearChat(); setLeftDrawerOpen(false); }}
        >
          <RefreshCw className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
            Recent Chats
          </h3>
        </div>
        <div className="px-2 space-y-1 pb-4">
          {chatSessions.length === 0 && (
            <p className="px-3 py-4 text-xs text-white/30 text-center">No conversations yet</p>
          )}
          {chatSessions.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => loadSession(chat.id)}
              className={`w-full flex flex-col gap-1 px-3 py-2.5 rounded-xl text-left transition-colors group ${
                sessionId === chat.id ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                {editingSessionId === chat.id ? (
                  <input
                    value={editingTitle}
                    autoFocus
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => submitSessionRename(chat.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitSessionRename(chat.id);
                      }
                    }}
                    className="flex-1 bg-transparent text-sm font-medium truncate pr-2 outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="text-sm font-medium truncate pr-2"
                    onClick={(e) => beginRenameSession(chat, e)}
                  >
                    {chat.title}
                  </span>
                )}
                <Trash2
                  className="w-3.5 h-3.5 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => deleteSession(chat.id, e)}
                />
              </div>
              <span className="text-xs text-white/40 truncate">
                {chat.last_message || "No messages yet"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FFC105] to-orange-600 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-black" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.username || "Movie Enthusiast"}
            </p>
            <p className="text-xs text-white/50">AI Curator</p>
          </div>
        </div>
      </div>
    </>
  );

  const rightPanelContent = (
    <div className="p-5 space-y-6">
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
          <Film className="w-4 h-4" />
          Pick Genres
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {genres.map((genre) => {
            const Icon = genre.icon;
            const isSelected = selectedGenres.includes(genre.id);
            return (
              <button
                key={genre.id}
                onClick={() => toggleGenre(genre.id)}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all duration-200 ${
                  isSelected
                    ? `bg-gradient-to-br ${genre.color} text-white shadow-lg scale-[1.02]`
                    : "bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium">{genre.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
          <Heart className="w-4 h-4" />
          Current Mood
        </h3>
        <div className="space-y-1.5">
          {moods.map((mood) => (
            <button
              key={mood.id}
              onClick={() =>
                setSelectedMood(selectedMood === mood.id ? null : mood.id)
              }
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200 text-left ${
                selectedMood === mood.id
                  ? "bg-[#FFC105] text-black"
                  : "bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
              }`}
            >
              <span className="text-sm font-medium">{mood.label}</span>
              <span className="text-xs opacity-60">{mood.description}</span>
            </button>
          ))}
        </div>
      </div>

      {hasFilters && (
        <button
          className="w-full h-11 rounded-xl bg-[#FFC105] text-black font-semibold hover:bg-[#ffd24d] transition flex items-center justify-center gap-2"
          onClick={() => { handleSend(); setRightDrawerOpen(false); }}
        >
          Find Movies
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="h-screen bg-[var(--bg)] text-foreground overflow-hidden flex flex-col">
      <Topbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      <div className="flex-1 flex min-h-0 pt-16">
        {/* ── Left Sidebar (desktop) ──────────────────────────────── */}
        <aside className="hidden xl:flex w-72 shrink-0 border-r border-white/10 bg-black/30 flex-col h-full min-h-0 overflow-hidden">
          {leftSidebarContent}
        </aside>

        {/* ── Left Drawer (mobile/tablet) ─────────────────────────── */}
        {leftDrawerOpen && (
          <div className="fixed inset-0 z-[100] xl:hidden" onClick={() => setLeftDrawerOpen(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <aside
              className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0a0a] border-r border-white/10 flex flex-col animate-slide-in-left"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition z-10"
                onClick={() => setLeftDrawerOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
              {leftSidebarContent}
            </aside>
          </div>
        )}

        {/* ── Main Chat Area ──────────────────────────────────────── */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Header */}
          <header className="h-14 shrink-0 border-b border-white/10 flex items-center justify-between px-4 sm:px-6 bg-black/30">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                className="xl:hidden w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition"
                onClick={() => setLeftDrawerOpen(true)}
              >
                <Menu className="w-4 h-4" />
              </button>
              <Wand2 className="w-5 h-5 text-[#FFC105] hidden sm:block" />
              <h1 className="font-bold text-base sm:text-lg">AI Curator</h1>
              <span className="px-2 py-0.5 rounded-full bg-[#FFC105]/20 text-[#FFC105] text-[10px] sm:text-xs font-semibold">
                AI
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40 hidden sm:flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                {messages.length}
              </span>
              <button
                className="lg:hidden w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition"
                onClick={() => setRightDrawerOpen(true)}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Chat + Right panel */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Messages area */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6" ref={scrollRef}>
                <div className="max-w-4xl mx-auto w-full space-y-5">
                  {/* Welcome state */}
                  {isWelcome && (
                    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 sm:gap-8">
                      <div className="text-center space-y-3">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-[#FFC105] to-orange-600 flex items-center justify-center mx-auto shadow-lg shadow-[#FFC105]/20">
                          <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-black" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold">
                          Hey {user?.username || "there"}, what are you in the mood for?
                        </h2>
                        <p className="text-white/50 text-sm max-w-md mx-auto">
                          Tell me what you want to watch, pick a genre, or try one of these.
                        </p>
                      </div>

                      {/* Quick action cards */}
                      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full max-w-lg">
                        {[
                          { label: "Surprise me", icon: Shuffle, color: "from-[#FFC105] to-orange-500" },
                          { label: "Hidden gems", icon: Lightbulb, color: "from-purple-500 to-indigo-600" },
                          { label: "Date night picks", icon: Heart, color: "from-pink-500 to-rose-600" },
                          { label: "Classic must watch", icon: Star, color: "from-amber-500 to-yellow-600" },
                        ].map((card) => {
                          const Icon = card.icon;
                          return (
                            <button
                              key={card.label}
                              onClick={() => handleSend(card.label)}
                              className={`flex items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-3.5 sm:py-4 rounded-xl bg-gradient-to-br ${card.color} text-black font-semibold text-xs sm:text-sm hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg`}
                            >
                              <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                              <span className="text-left">{card.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Mobile genre chips */}
                      <div className="lg:hidden w-full max-w-lg">
                        <p className="text-xs text-white/40 mb-2.5 text-center uppercase tracking-wider font-semibold">Or pick a genre</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {genres.slice(0, 6).map((genre) => {
                            const Icon = genre.icon;
                            const isSelected = selectedGenres.includes(genre.id);
                            return (
                              <button
                                key={genre.id}
                                onClick={() => toggleGenre(genre.id)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${
                                  isSelected
                                    ? `bg-gradient-to-r ${genre.color} text-white shadow-md`
                                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {genre.label}
                              </button>
                            );
                          })}
                        </div>
                        {hasFilters && (
                          <button
                            className="mt-3 mx-auto block px-6 py-2.5 rounded-xl bg-[#FFC105] text-black font-semibold text-sm"
                            onClick={() => handleSend()}
                          >
                            Find Movies
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  {!isWelcome && messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.type === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.type === "ai" && (
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#FFC105] to-orange-600 flex items-center justify-center shrink-0 shadow-lg mt-1">
                          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
                        </div>
                      )}
                      <div className={`max-w-[85%] sm:max-w-2xl ${message.type === "user" ? "order-first" : ""}`}>
                        <div
                          className={`px-4 py-3 rounded-2xl ${
                            message.type === "user"
                              ? "bg-[#FFC105] text-black rounded-br-md"
                              : "bg-white/5 border border-white/10 rounded-bl-md"
                          }`}
                        >
                          <p className="text-sm leading-relaxed font-medium whitespace-pre-wrap">
                            {message.content}
                          </p>
                        </div>

                        {message.movies && message.movies.length > 0 && (
                          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {message.movies
                              .filter((movie) => movie && movie.id)
                              .map((movie) => (
                                <div key={movie.id} className="w-32 sm:w-36 shrink-0">
                                  <MovieCard
                                    movie={movie}
                                    onToast={() => {}}
                                    user={user}
                                    requireAuth={() => true}
                                    showPlay={false}
                                  />
                                </div>
                              ))}
                          </div>
                        )}

                        <p className={`text-[10px] text-white/30 mt-1.5 ${
                          message.type === "user" ? "text-right" : "text-left"
                        }`}>
                          {message.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {message.type === "user" && (
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 mt-1">
                          <span className="text-[10px] sm:text-xs font-bold">You</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#FFC105] to-orange-600 flex items-center justify-center shadow-lg mt-1">
                        <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
                      </div>
                      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white/5 border border-white/10">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white/60">{loadingText}</span>
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFC105] animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFC105] animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFC105] animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Input area ────────────────────────────────────── */}
              <div className="shrink-0 border-t border-white/10 bg-[var(--bg)]">
                {/* Quick prompts */}
                {!isWelcome && (
                  <div className="px-4 sm:px-6 py-2 border-b border-white/10">
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                      <span className="text-[10px] text-white/35 shrink-0">Try:</span>
                      {quickPrompts.map((prompt) => {
                        const Icon = prompt.icon;
                        return (
                          <button
                            key={prompt.id}
                            onClick={() => handleQuickPrompt(prompt.label)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[10px] sm:text-xs text-white/50 hover:text-white transition-colors shrink-0"
                          >
                            <Icon className="w-3 h-3" />
                            {prompt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="p-3 sm:p-4">
                  <div className="max-w-4xl mx-auto flex gap-2 sm:gap-3 items-end">
                    <div className="flex-1 relative">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value);
                          const el = e.target;
                          el.style.height = "44px";
                          el.style.height = Math.min(el.scrollHeight, 120) + "px";
                        }}
                        onKeyDown={handleKeyPress}
                        placeholder="Describe what you want to watch..."
                        rows={1}
                        className="w-full min-h-[44px] max-h-[120px] px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-[#FFC105]/50 outline-none text-sm resize-none overflow-y-auto transition-colors"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={!input.trim() && !hasFilters}
                      className="h-[44px] w-[44px] shrink-0 rounded-xl bg-[#FFC105] text-black font-semibold disabled:opacity-40 hover:bg-[#ffd24d] transition flex items-center justify-center"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  {error && (
                    <p className="text-xs text-red-400 mt-2 max-w-4xl mx-auto">{error}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right Panel (desktop) ─────────────────────────── */}
            <aside className="hidden lg:flex w-72 xl:w-80 shrink-0 min-h-0 flex-col border-l border-white/10 bg-black/20 overflow-y-auto">
              {rightPanelContent}
            </aside>
          </div>
        </main>

        {/* ── Right Drawer (mobile/tablet) ──────────────────────── */}
        {rightDrawerOpen && (
          <div className="fixed inset-0 z-[100] lg:hidden" onClick={() => setRightDrawerOpen(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <aside
              className="absolute right-0 top-0 bottom-0 w-72 bg-[#0a0a0a] border-l border-white/10 flex flex-col overflow-y-auto animate-slide-in-right"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-sm font-semibold">Filters</h3>
                <button
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
                  onClick={() => setRightDrawerOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {rightPanelContent}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
