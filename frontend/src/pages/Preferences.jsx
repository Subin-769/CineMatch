import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import AppLayout from "../components/AppLayout";
import {
  Heart,
  ThumbsUp,
  ThumbsDown,
  Film,
  RefreshCw,
  X,
  Lock,
  Trash2,
  Star,
  Undo2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { fetchMyPreferences, setPreference } from "../api/cineMatchApi";

/* =========================
   TABS
========================= */
const TABS = [
  { key: "love", label: "Loved", icon: Heart, color: "#EC4899", bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.25)" },
  { key: "like", label: "Liked", icon: ThumbsUp, color: "#FFC105", bg: "rgba(255,193,5,0.12)", border: "rgba(255,193,5,0.25)" },
  { key: "dislike", label: "Disliked", icon: ThumbsDown, color: "#EF4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.25)" },
];

/* =========================
   PREFERENCE CHANGE DROPDOWN
========================= */
function PreferenceDropdown({ current, onSelect, onClose, anchorRef }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const calc = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({
        top: Math.round(r.bottom + 6),
        left: Math.round(r.left),
      });
    };
    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);
    return () => {
      window.removeEventListener("scroll", calc, true);
      window.removeEventListener("resize", calc);
    };
  }, [anchorRef]);

  const options = TABS.filter((t) => t.key !== current);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl overflow-hidden min-w-[160px]"
        style={{ top: pos.top, left: pos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                onSelect(opt.key);
                onClose();
              }}
              className="w-full px-4 py-3 text-left text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-3"
            >
              <Icon className="w-4 h-4" style={{ color: opt.color }} />
              Move to {opt.label}
            </button>
          );
        })}
      </div>
    </>,
    document.body
  );
}

/* =========================
   GRID CARD
========================= */
function PreferenceGridCard({ movie, tabConfig, onRemove, onChange, onClick }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const changeBtnRef = useRef(null);

  return (
    <div className="group relative cursor-pointer" onClick={onClick}>
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/10 transition-all duration-300 group-hover:scale-[1.02] group-hover:border-white/20 group-hover:shadow-2xl group-hover:shadow-black/40">
        {movie.poster_url ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-white/5 animate-pulse" />
            )}
            <img
              src={movie.poster_url}
              alt={movie.title}
              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                imgLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setImgLoaded(true)}
              loading="lazy"
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02]">
            <Film className="w-12 h-12 text-white/20" />
          </div>
        )}

        {/* Preference badge */}
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10">
          <div
            className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg backdrop-blur-sm border"
            style={{ background: tabConfig.bg, borderColor: tabConfig.border }}
          >
            <tabConfig.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: tabConfig.color, fill: tabConfig.key === "love" ? tabConfig.color : "none" }} />
            <span className="text-[10px] sm:text-xs font-semibold" style={{ color: tabConfig.color }}>{tabConfig.label}</span>
          </div>
        </div>

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-3 gap-2">
          <button
            ref={changeBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen(true);
            }}
            className="px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/15 transition inline-flex items-center gap-2 text-sm font-medium backdrop-blur-sm"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            Change
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(movie);
            }}
            className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-200 hover:bg-red-500/15 transition inline-flex items-center gap-2 text-sm font-medium backdrop-blur-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>
      </div>

      <div className="mt-2 sm:mt-3 px-1">
        <h3 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-[#FFC105] transition-colors">
          {movie.title}
        </h3>
        {movie.year && <p className="text-[10px] sm:text-xs text-white/50 mt-0.5">{movie.year}</p>}
      </div>

      {dropdownOpen && (
        <PreferenceDropdown
          current={movie.preference}
          anchorRef={changeBtnRef}
          onSelect={(newPref) => onChange(movie, newPref)}
          onClose={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
}

/* =========================
   LIST ROW
========================= */
function PreferenceRow({ movie, tabConfig, onRemove, onChange, onClick }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const changeBtnRef = useRef(null);

  return (
    <div className="group rounded-2xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all">
      <div className="p-4 sm:p-5 flex gap-4 sm:gap-5 items-start">
        <button
          type="button"
          onClick={onClick}
          className="relative w-20 h-28 sm:w-24 sm:h-36 flex-shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/10"
        >
          {movie.poster_url ? (
            <>
              {!imgLoaded && (
                <div className="absolute inset-0 bg-white/5 animate-pulse" />
              )}
              <img
                src={movie.poster_url}
                alt={movie.title}
                className={`w-full h-full object-cover transition ${
                  imgLoaded ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setImgLoaded(true)}
                loading="lazy"
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-6 h-6 text-white/20" />
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={onClick} className="text-left">
                <h3 className="text-lg sm:text-xl font-semibold text-white group-hover:text-[#FFC105] transition-colors line-clamp-1">
                  {movie.title}
                </h3>
              </button>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold"
                  style={{ background: tabConfig.bg, borderColor: tabConfig.border, color: tabConfig.color }}
                >
                  <tabConfig.icon className="w-3.5 h-3.5" style={{ fill: tabConfig.key === "love" ? tabConfig.color : "none" }} />
                  {tabConfig.label}
                </div>
                {movie.year && <span className="text-sm text-white/50">{movie.year}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                ref={changeBtnRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-white/70 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm font-medium"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Change</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove(movie);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-red-300 hover:text-red-200 bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Remove</span>
              </button>
            </div>
          </div>

          {movie.overview && (
            <p className="mt-3 text-sm text-white/70 leading-relaxed line-clamp-2">
              {movie.overview}
            </p>
          )}
        </div>
      </div>

      {dropdownOpen && (
        <PreferenceDropdown
          current={movie.preference}
          anchorRef={changeBtnRef}
          onSelect={(newPref) => onChange(movie, newPref)}
          onClose={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
}

/* =========================
   LOADING SKELETONS
========================= */
function GridSkeleton() {
  return (
    <div className="space-y-3">
      <div className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />
      <div className="space-y-2 px-1">
        <div className="h-4 bg-white/5 rounded-lg w-3/4 animate-pulse" />
        <div className="h-3 bg-white/5 rounded-lg w-1/2 animate-pulse" />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-4 flex gap-4">
      <div className="w-24 h-36 rounded-xl bg-white/5 animate-pulse" />
      <div className="flex-1 space-y-3">
        <div className="h-5 w-1/2 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-full rounded bg-white/5 animate-pulse" />
      </div>
    </div>
  );
}

function LoadingState({ viewMode }) {
  const count = 8;
  if (viewMode === "list") {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => <ListSkeleton key={i} />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
      {Array.from({ length: count }).map((_, i) => <GridSkeleton key={i} />)}
    </div>
  );
}

/* =========================
   EMPTY STATES
========================= */
function TabEmptyState({ tab }) {
  const navigate = useNavigate();
  const config = TABS.find((t) => t.key === tab);
  const Icon = config.icon;

  const messages = {
    love: { title: "No loved movies yet", desc: "Movies you absolutely love will show up here. Start exploring and mark your favorites!" },
    like: { title: "No liked movies yet", desc: "Movies you enjoy will appear here. Browse and like the ones you appreciate!" },
    dislike: { title: "No disliked movies yet", desc: "Movies you didn't enjoy will be listed here. This helps us improve your recommendations." },
  };

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="relative mb-6">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center border"
          style={{ background: config.bg, borderColor: config.border }}
        >
          <Icon className="w-10 h-10" style={{ color: config.color, fill: tab === "love" ? config.color : "none" }} />
        </div>
      </div>

      <h3 className="text-xl font-semibold text-white mb-2">{messages[tab].title}</h3>
      <p className="text-white/50 text-center max-w-sm mb-6">{messages[tab].desc}</p>

      <button
        type="button"
        onClick={() => navigate("/movies")}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition hover:scale-105"
      >
        <Film className="w-5 h-5" />
        Browse Movies
      </button>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
        <X className="w-8 h-8 text-red-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Something went wrong</h3>
      <p className="text-white/50 text-center max-w-sm mb-6">We couldn't load your preferences. Please try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 border border-white/10 text-white font-medium hover:bg-white/15 transition"
      >
        <RefreshCw className="w-5 h-5" />
        Try Again
      </button>
    </div>
  );
}

function LoginRequired() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
        <Lock className="w-8 h-8 text-[#FFC105]" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Login required</h3>
      <p className="text-white/50 text-center max-w-sm mb-6">Please log in to view and manage your preferences.</p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("redirectAfterLogin", "/preferences");
          navigate("/login");
        }}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition hover:scale-105"
      >
        Login
      </button>
    </div>
  );
}

/* =========================
   UNDO TOAST
========================= */
function UndoToast({ movie, onUndo, onClose, progress }) {
  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[9999] flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 rounded-b-2xl overflow-hidden">
        <div
          className="h-full bg-[#FFC105] transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex-1">
        <p className="text-sm text-white">
          <span className="font-medium">{movie.title}</span> removed
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUndo(); }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition hover:scale-105"
      >
        <Undo2 className="w-4 h-4" />
        Undo
      </button>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/* =========================
   MAIN PAGE
========================= */
export default function Preferences() {
  const navigate = useNavigate();

  const [allMovies, setAllMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [activeTab, setActiveTab] = useState("love");
  const [viewMode, setViewMode] = useState("grid");

  const removedRef = useRef(null);
  const undoTimeoutRef = useRef(null);
  const [removedMovie, setRemovedMovie] = useState(null);
  const [undoProgress, setUndoProgress] = useState(100);

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNeedLogin(false);

    try {
      const data = await fetchMyPreferences();
      setAllMovies(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.status === 401 || err.message?.includes("401")) {
        setNeedLogin(true);
        setAllMovies([]);
      } else {
        console.error("Preferences fetch error:", err);
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, [fetchPreferences]);

  const counts = useMemo(() => ({
    love: allMovies.filter((m) => m.preference === "love").length,
    like: allMovies.filter((m) => m.preference === "like").length,
    dislike: allMovies.filter((m) => m.preference === "dislike").length,
  }), [allMovies]);

  const filteredMovies = useMemo(
    () => allMovies.filter((m) => m.preference === activeTab),
    [allMovies, activeTab]
  );

  const commitRemoval = async (movie) => {
    try {
      await setPreference(movie.tmdb_id, null);
    } catch (err) {
      console.error("Failed to remove preference:", err);
    }
  };

  const handleRemove = (movie) => {
    if (undoTimeoutRef.current && removedRef.current) {
      clearTimeout(undoTimeoutRef.current);
      commitRemoval(removedRef.current);
    }

    setAllMovies((prev) => prev.filter((m) => m.tmdb_id !== movie.tmdb_id));
    setRemovedMovie(movie);
    removedRef.current = movie;
    setUndoProgress(100);

    const start = Date.now();
    const duration = 5000;
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setUndoProgress(pct);
      if (pct > 0 && removedRef.current) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    undoTimeoutRef.current = setTimeout(() => {
      if (removedRef.current) commitRemoval(removedRef.current);
      setRemovedMovie(null);
      removedRef.current = null;
      undoTimeoutRef.current = null;
    }, duration);
  };

  const handleUndo = () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    const mv = removedRef.current;
    if (mv) {
      setAllMovies((prev) => {
        if (prev.some((x) => x.tmdb_id === mv.tmdb_id)) return prev;
        return [...prev, mv];
      });
    }
    setRemovedMovie(null);
    removedRef.current = null;
    undoTimeoutRef.current = null;
  };

  const handleCloseToast = () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    if (removedRef.current) commitRemoval(removedRef.current);
    setRemovedMovie(null);
    removedRef.current = null;
    undoTimeoutRef.current = null;
  };

  const handleChange = async (movie, newPref) => {
    setAllMovies((prev) =>
      prev.map((m) => (m.tmdb_id === movie.tmdb_id ? { ...m, preference: newPref } : m))
    );
    try {
      await setPreference(movie.tmdb_id, newPref);
    } catch (err) {
      console.error("Failed to change preference:", err);
      setAllMovies((prev) =>
        prev.map((m) => (m.tmdb_id === movie.tmdb_id ? { ...m, preference: movie.preference } : m))
      );
    }
  };

  const handleMovieClick = (movie) => {
    navigate(`/movie/${movie.tmdb_id}`);
  };

  const currentTabConfig = TABS.find((t) => t.key === activeTab);

  return (
    <AppLayout>
      <div className="pt-20 sm:pt-24 lg:pt-28 px-4 sm:px-6 lg:px-10 pb-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-3 mb-1 sm:mb-2">
              <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#FFC105]/15 border border-[#FFC105]/25">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFC105]" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">My Preferences</h1>
            </div>
            <p className="text-sm sm:text-base text-white/50 ml-12 sm:ml-[52px]">
              Your curated collection of movies you've loved, liked, and disliked.
            </p>
          </div>

          {!needLogin && !error && !loading && (
            <>
              {/* Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
                <div className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-2xl bg-white/[0.03] border border-white/10 overflow-x-auto scrollbar-hide">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                          isActive
                            ? "text-white shadow-lg"
                            : "text-white/50 hover:text-white/70 hover:bg-white/5"
                        }`}
                        style={isActive ? { background: tab.bg, boxShadow: `0 4px 20px ${tab.border}` } : {}}
                      >
                        <Icon
                          className="w-4 h-4"
                          style={{
                            color: isActive ? tab.color : undefined,
                            fill: tab.key === "love" && isActive ? tab.color : "none",
                          }}
                        />
                        {tab.label}
                        <span
                          className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                            isActive ? "bg-white/15" : "bg-white/5"
                          }`}
                          style={isActive ? { color: tab.color } : {}}
                        >
                          {counts[tab.key]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* View toggle */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-2.5 rounded-lg transition-all duration-200 ${
                      viewMode === "grid"
                        ? "bg-[#FFC105] text-black shadow-lg shadow-[#FFC105]/20"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                    title="Grid view"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`p-2.5 rounded-lg transition-all duration-200 ${
                      viewMode === "list"
                        ? "bg-[#FFC105] text-black shadow-lg shadow-[#FFC105]/20"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                    title="List view"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Summary stats bar */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 mb-5 sm:mb-6 px-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <div key={tab.key} className="flex items-center gap-2 text-sm text-white/40">
                      <Icon className="w-3.5 h-3.5" style={{ color: tab.color, fill: tab.key === "love" ? tab.color : "none" }} />
                      <span>
                        <span className="font-semibold text-white/70">{counts[tab.key]}</span> {tab.label.toLowerCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Content */}
          <div className="mt-2">
            {loading ? (
              <LoadingState viewMode={viewMode} />
            ) : needLogin ? (
              <LoginRequired />
            ) : error ? (
              <ErrorState onRetry={fetchPreferences} />
            ) : filteredMovies.length === 0 ? (
              <TabEmptyState tab={activeTab} />
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
                {filteredMovies.map((movie) => (
                  <PreferenceGridCard
                    key={movie.tmdb_id}
                    movie={movie}
                    tabConfig={currentTabConfig}
                    onRemove={handleRemove}
                    onChange={handleChange}
                    onClick={() => handleMovieClick(movie)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMovies.map((movie) => (
                  <PreferenceRow
                    key={movie.tmdb_id}
                    movie={movie}
                    tabConfig={currentTabConfig}
                    onRemove={handleRemove}
                    onChange={handleChange}
                    onClick={() => handleMovieClick(movie)}
                  />
                ))}
              </div>
            )}
          </div>

          {removedMovie && (
            <UndoToast
              movie={removedMovie}
              onUndo={handleUndo}
              onClose={handleCloseToast}
              progress={undoProgress}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
