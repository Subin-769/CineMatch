import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import AppLayout from "../components/AppLayout";
import {
  Grid3X3,
  List,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Star,
  Trash2,
  Film,
  Bookmark,
  RefreshCw,
  Undo2,
  X,
  Lock,
} from "lucide-react";
import { API_BASE } from "../api/apiBase";

/* =========================
   PORTAL DROPDOWN (fixes z-index forever)
========================= */
function SortDropdownPortal({ open, anchorRef, options, value, onSelect, onClose }) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 192 });

  useEffect(() => {
    if (!open) return;

    const calc = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({
        top: Math.round(r.bottom + 8),
        left: Math.round(r.left),
        width: Math.round(r.width),
      });
    };

    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);

    return () => {
      window.removeEventListener("scroll", calc, true);
      window.removeEventListener("resize", calc);
    };
  }, [open, anchorRef]);

  if (!open) return null;

  return createPortal(
    <>
      {/* overlay */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
      />
      {/* menu */}
      <div
        className="fixed z-[9999] rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl overflow-hidden"
        style={{ top: pos.top, left: pos.left, width: 240 }}
        onClick={(e) => e.stopPropagation()}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(opt.value);
              onClose();
            }}
            className={`w-full px-4 py-3 text-left text-sm transition-colors ${
              value === opt.value
                ? "bg-[#FFC105]/10 text-[#FFC105]"
                : "text-white/80 hover:bg-white/5"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}

/* =========================
   TOOLBAR
========================= */
function WatchlistToolbar({
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  viewMode,
  setViewMode,
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef(null);

  const sortOptions = [
    { value: "added_at", label: "Recently Added" },
    { value: "title", label: "Title" },
  ];

  const currentSortLabel =
    sortOptions.find((o) => o.value === sortBy)?.label || "Recently Added";

  return (
    <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
      {/* Left: Sorting */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-white/50 hidden sm:inline">Sort</span>

        {/* Sort button */}
        <button
          ref={sortBtnRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSortOpen((s) => !s);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all duration-200"
        >
          <span className="text-sm font-medium">{currentSortLabel}</span>
          <ChevronDown
            className={`w-4 h-4 text-white/60 transition-transform duration-200 ${
              sortOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* ✅ Portal dropdown (always on top) */}
        <SortDropdownPortal
          open={sortOpen}
          anchorRef={sortBtnRef}
          options={sortOptions}
          value={sortBy}
          onSelect={setSortBy}
          onClose={() => setSortOpen(false)}
        />

        {/* Asc/Desc Toggle */}
        <button
          type="button"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all duration-200 group"
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
        >
          {sortOrder === "asc" ? (
            <ArrowUp className="w-4 h-4 text-[#FFC105]" />
          ) : (
            <ArrowDown className="w-4 h-4 text-[#FFC105]" />
          )}
          <span className="text-sm hidden sm:inline">
            {sortOrder === "asc" ? "Asc" : "Desc"}
          </span>
        </button>
      </div>

      {/* Right: View Toggle (default detailed first) */}
      <div className="flex items-center justify-end gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`p-2.5 rounded-lg transition-all duration-200 ${
            viewMode === "list"
              ? "bg-[#FFC105] text-black shadow-lg shadow-[#FFC105]/20"
              : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
          title="Detailed view"
        >
          <List className="w-4 h-4" />
        </button>

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
          <Grid3X3 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* =========================
   GRID CARD
========================= */
function GridCard({ movie, onRemove, onClick }) {
  const [imgLoaded, setImgLoaded] = useState(false);

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

        {movie.rating !== null && movie.rating !== undefined && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10">
            <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#FFC105] fill-[#FFC105]" />
            <span className="text-[10px] sm:text-xs font-bold text-white">
              {Number(movie.rating).toFixed(1)}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(movie);
            }}
            className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-red-200 hover:bg-red-500/15 transition inline-flex items-center gap-2"
            title="Remove from watchlist"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-semibold">Remove</span>
          </button>
        </div>
      </div>

      <div className="mt-2 sm:mt-3 px-1">
        <h3 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-[#FFC105] transition-colors">
          {movie.title}
        </h3>
        {movie.year && <p className="text-[10px] sm:text-xs text-white/50 mt-0.5">{movie.year}</p>}
      </div>
    </div>
  );
}

/* =========================
   DETAILED ROW
========================= */
function DetailedRow({ movie, onRemove, onClick }) {
  const [imgLoaded, setImgLoaded] = useState(false);

  const hasDesc = Boolean(movie.description && movie.description.trim());
  const hasDirector = Boolean(movie.director);
  const hasStars = Array.isArray(movie.stars) && movie.stars.length > 0;

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
            <button type="button" onClick={onClick} className="text-left min-w-0">
              <h3 className="text-lg sm:text-xl font-semibold text-white group-hover:text-[#FFC105] transition-colors line-clamp-1">
                {movie.title}
              </h3>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(movie);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-red-300 hover:text-red-200 bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition"
              title="Remove from watchlist"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-semibold hidden sm:inline">
                Remove from Watchlist
              </span>
              <span className="text-sm font-semibold sm:hidden">Remove</span>
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/55">
            {movie.year && <span>{movie.year}</span>}

            {movie.rating !== null && movie.rating !== undefined && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white">
                <Star className="w-4 h-4 text-[#FFC105] fill-[#FFC105]" />
                <span className="font-semibold">{Number(movie.rating).toFixed(1)}</span>
                <span className="text-white/50">/10</span>
              </span>
            )}
          </div>

          {hasDesc && (
            <p className="mt-3 text-sm text-white/70 leading-relaxed line-clamp-3">
              {movie.description}
            </p>
          )}

          {(hasDirector || hasStars) && (
            <div className="mt-4 space-y-1 text-sm">
              {hasDirector && (
                <p className="text-white/70">
                  <span className="text-white/50 font-semibold">Director:</span>{" "}
                  <span className="text-white">{movie.director}</span>
                </p>
              )}
              {hasStars && (
                <p className="text-white/70">
                  <span className="text-white/50 font-semibold">Stars:</span>{" "}
                  <span className="text-white">{movie.stars.slice(0, 4).join(", ")}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   LOADING
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

function DetailedSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-4 flex gap-4">
      <div className="w-24 h-36 rounded-xl bg-white/5 animate-pulse" />
      <div className="flex-1 space-y-3">
        <div className="h-5 w-1/2 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-full rounded bg-white/5 animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-white/5 animate-pulse" />
      </div>
    </div>
  );
}

function LoadingState({ viewMode }) {
  const count = 8;

  if (viewMode === "list") {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <DetailedSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <GridSkeleton key={i} />
      ))}
    </div>
  );
}

/* =========================
   EMPTY / ERROR / LOGIN REQUIRED
========================= */
function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
          <Bookmark className="w-10 h-10 text-white/20" />
        </div>
      </div>

      <h3 className="text-xl font-semibold text-white mb-2">
        Your watchlist is empty
      </h3>
      <p className="text-white/50 text-center max-w-sm mb-6">
        Start adding movies you want to watch and they'll appear here.
      </p>

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

      <h3 className="text-xl font-semibold text-white mb-2">
        Something went wrong
      </h3>
      <p className="text-white/50 text-center max-w-sm mb-6">
        We couldn't load your watchlist. Please try again.
      </p>

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
      <p className="text-white/50 text-center max-w-sm mb-6">
        Please log in to view and manage your watchlist.
      </p>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem("redirectAfterLogin", "/watchlist");
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
   UNDO TOAST (fixed)
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onUndo();
        }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition hover:scale-105"
      >
        <Undo2 className="w-4 h-4" />
        Undo
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
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
export default function Watchlist() {
  const navigate = useNavigate();

  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  const [sortBy, setSortBy] = useState("added_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // default detailed view
  const [viewMode, setViewMode] = useState("list");

  const removedRef = useRef(null);
  const undoTimeoutRef = useRef(null);

  const [removedMovie, setRemovedMovie] = useState(null);
  const [undoProgress, setUndoProgress] = useState(100);

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNeedLogin(false);

    try {
      const res = await fetch(`${API_BASE}/watchlist/`, {
        credentials: "include",
      });

      if (res.status === 401) {
        setNeedLogin(true);
        setMovies([]);
        return;
      }

      if (!res.ok) throw new Error("Failed to fetch watchlist");

      const data = await res.json();
      setMovies(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Watchlist fetch error:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, [fetchWatchlist]);

  const sortedMovies = useMemo(() => {
    const list = [...movies];

    list.sort((a, b) => {
      let cmp = 0;

      if (sortBy === "added_at") {
        const A = Number(a.added_at || 0);
        const B = Number(b.added_at || 0);
        cmp = A - B;
      } else {
        cmp = String(a.title || "").localeCompare(String(b.title || ""));
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });

    return list;
  }, [movies, sortBy, sortOrder]);

  const commitRemoval = async (movie) => {
    try {
      await fetch(`${API_BASE}/watchlist/toggle/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdb_id: movie.tmdb_id }),
      });
    } catch (err) {
      console.error("Failed to remove from watchlist:", err);
    }
  };

  const handleRemove = (movie) => {
    // commit any pending removal immediately
    if (undoTimeoutRef.current && removedRef.current) {
      clearTimeout(undoTimeoutRef.current);
      commitRemoval(removedRef.current);
    }

    setMovies((prev) => prev.filter((m) => m.tmdb_id !== movie.tmdb_id));

    setRemovedMovie(movie);
    removedRef.current = movie;
    setUndoProgress(100);

    window.dispatchEvent(new Event("watchlist:changed"));

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
      setMovies((prev) => {
        // avoid duplicates
        if (prev.some((x) => x.tmdb_id === mv.tmdb_id)) return prev;
        return [...prev, mv];
      });
      window.dispatchEvent(new Event("watchlist:changed"));
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

  const handleMovieClick = (movie) => {
    navigate(`/movie/${movie.tmdb_id}`);
  };

  return (
    <AppLayout>
      <div className="pt-20 sm:pt-24 lg:pt-28 px-4 sm:px-6 lg:px-10 pb-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-5 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Your Watchlist</h1>
            <p className="text-sm sm:text-base text-white/50">
              Your Watchlist is the place to track the movies you want to watch.
            </p>
          </div>

          {!needLogin && !error && (
            <WatchlistToolbar
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              viewMode={viewMode}
              setViewMode={setViewMode}
            />
          )}

          <div className="mt-6">
            {loading ? (
              <LoadingState viewMode={viewMode} />
            ) : needLogin ? (
              <LoginRequired />
            ) : error ? (
              <ErrorState onRetry={fetchWatchlist} />
            ) : movies.length === 0 ? (
              <EmptyState />
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5">
                {sortedMovies.map((movie) => (
                  <GridCard
                    key={movie.tmdb_id}
                    movie={movie}
                    onRemove={handleRemove}
                    onClick={() => handleMovieClick(movie)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMovies.map((movie) => (
                  <DetailedRow
                    key={movie.tmdb_id}
                    movie={movie}
                    onRemove={handleRemove}
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
