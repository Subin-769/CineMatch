import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Copy,
  Database,
  ExternalLink,
  Eye,
  Filter,
  Grid2x2,
  LayoutList,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import api from "../api/api";
import { useAuth } from "../auth/AuthContext";
import AdminShell from "../components/admin/AdminShell";
import AdminSummaryCard from "../components/admin/AdminSummaryCard";
import MeterBar from "../components/admin/MeterBar";
import StatusBadge from "../components/admin/StatusBadge";
import { formatCompact, formatNumber, getInitials } from "../components/admin/adminUtils";

const POLL_INTERVAL_MS = 10000;

const EMPTY_DATA = {
  summary: {
    total_movies: 0,
    ai_ready: 0,
    metadata_gaps: 0,
    total_views: 0,
  },
  genres: [],
  movies: [],
};

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "trending", label: "Trending" },
  { value: "popular", label: "Popular" },
  { value: "classic", label: "Classic" },
  { value: "fresh", label: "Fresh" },
  { value: "needs_attention", label: "Needs Attention" },
];

const sortOptions = [
  { value: "ai_score_desc", label: "Top AI score" },
  { value: "views_desc", label: "Most viewed" },
  { value: "rating_desc", label: "Highest rated" },
  { value: "release_desc", label: "Newest releases" },
];

function sortMovies(items, sortBy) {
  const rows = [...items];

  rows.sort((left, right) => {
    if (sortBy === "views_desc") {
      return (right.views || 0) - (left.views || 0);
    }
    if (sortBy === "rating_desc") {
      return (right.rating || 0) - (left.rating || 0);
    }
    if (sortBy === "release_desc") {
      return (right.release_year || 0) - (left.release_year || 0);
    }

    return (right.ai_score || 0) - (left.ai_score || 0);
  });

  return rows;
}

function PosterFallback({ title, year }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(246,192,0,0.28),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-sm font-semibold text-white">
        {getInitials(title)}
      </div>
      <div className="mt-3 line-clamp-2 text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs text-white/45">{year || "No year"}</div>
    </div>
  );
}

function MovieOptionsMenu({ movie, onOpenDetails, onCopyTitle, onClose, onToast }) {
  const hasPoster = Boolean(movie.poster_url);

  return (
    <div
      className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-white/10 bg-[#121212] p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95)]"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onOpenDetails(movie);
          onClose();
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.05] hover:text-white"
      >
        <Eye className="h-4 w-4" />
        <span>View details</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onCopyTitle(movie.title);
          onClose();
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.05] hover:text-white"
      >
        <Copy className="h-4 w-4" />
        <span>Copy title</span>
      </button>

      <a
        href={hasPoster ? movie.poster_url : undefined}
        target={hasPoster ? "_blank" : undefined}
        rel={hasPoster ? "noreferrer" : undefined}
        onClick={() => {
          if (!hasPoster) {
            onToast("No poster available");
          }
          onClose();
        }}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
          hasPoster ? "text-white/80 hover:bg-white/[0.05] hover:text-white" : "cursor-not-allowed text-white/25"
        }`}
      >
        <ExternalLink className="h-4 w-4" />
        <span>Open poster</span>
      </a>

      <div className="mt-2 border-t border-white/5 pt-2">
        <button
          type="button"
          disabled
          className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-400/45"
        >
          <BarChart3 className="h-4 w-4" />
          <span>Archive movie</span>
        </button>
      </div>
    </div>
  );
}

function MovieDetailsPanel({ movie, onClose }) {
  if (!movie) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0d0d0d] p-6 shadow-[0_32px_100px_-32px_rgba(0,0,0,0.98)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{movie.title}</h2>
            <p className="mt-1 text-sm text-white/45">{movie.release_year || "Year unknown"}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="aspect-[3/4] overflow-hidden">
            {movie.poster_url ? (
              <img src={movie.poster_url} alt={movie.title} className="h-full w-full object-cover" />
            ) : (
              <PosterFallback title={movie.title} year={movie.release_year} />
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(movie.genres?.length ? movie.genres : [movie.genre]).slice(0, 4).map((genre) => (
            <span
              key={`${movie.id}-${genre}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60"
            >
              {genre}
            </span>
          ))}
          <StatusBadge label={movie.status?.label || "Steady"} tone={movie.status?.key || "steady"} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Rating</div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
              <Star className="h-4 w-4 text-[#f6c000]" />
              <span>{movie.rating ? movie.rating.toFixed(1) : "--"}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Views</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatCompact(movie.views)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Interactions</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatCompact(movie.interactions)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Watchlist</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatCompact(movie.watchlist_count)}</div>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">AI score</h3>
              <p className="mt-1 text-sm text-white/45">Composite signal from ratings, views, and interactions.</p>
            </div>
            <div className="text-2xl font-semibold text-white">{movie.ai_score}%</div>
          </div>

          <div className="mt-4">
            <MeterBar value={movie.ai_score} />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f6c000] px-4 py-3 text-sm font-medium text-black transition hover:bg-[#ffd54d]"
          >
            <Eye className="h-4 w-4" />
            <span>Done</span>
          </button>
          <a
            href={movie.poster_url || undefined}
            target={movie.poster_url ? "_blank" : undefined}
            rel={movie.poster_url ? "noreferrer" : undefined}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium ${
              movie.poster_url ? "text-white/80 hover:text-white" : "cursor-not-allowed text-white/30"
            }`}
          >
            <ExternalLink className="h-4 w-4" />
            <span>Poster</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AdminMovies() {
  const { user } = useAuth();
  const hasLoadedOnceRef = useRef(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [sortBy, setSortBy] = useState("ai_score_desc");
  const [viewMode, setViewMode] = useState("table");
  const [showFilters, setShowFilters] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    if (!user?.is_staff) return undefined;

    let isMounted = true;

    const loadMovies = async (initialLoad = false) => {
      if (initialLoad) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const response = await api.get("/admin/movies/", {
          params: {
            q: deferredQuery.trim() || undefined,
            status: statusFilter !== "all" ? statusFilter : undefined,
            genre: genreFilter !== "all" ? genreFilter : undefined,
          },
        });

        if (!isMounted) return;
        setData(response.data || EMPTY_DATA);
        setLastUpdatedAt(response.data?.updated_at || new Date().toISOString());
        setLoadError("");
        hasLoadedOnceRef.current = true;
      } catch {
        if (!isMounted) return;
        setLoadError("Movie catalog analytics are temporarily unavailable.");
        if (!hasLoadedOnceRef.current) {
          setData(EMPTY_DATA);
        }
      } finally {
        if (!isMounted) return;
        setLoading(false);
        setIsRefreshing(false);
      }
    };

    void loadMovies(true);
    const intervalId = window.setInterval(() => {
      void loadMovies(false);
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [deferredQuery, genreFilter, statusFilter, user]);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const summaryCards = useMemo(
    () => [
      {
        title: "Total Movies",
        value: formatNumber(data.summary?.total_movies),
        description: "Movies in the catalog",
        icon: Database,
        accent: "gold",
      },
      {
        title: "AI Ready",
        value: formatNumber(data.summary?.ai_ready),
        description: "Enough metadata for recommendations",
        icon: Sparkles,
        accent: "emerald",
      },
      {
        title: "Metadata Gaps",
        value: formatNumber(data.summary?.metadata_gaps),
        description: "Missing poster, overview, or genres",
        icon: BarChart3,
        accent: "rose",
      },
      {
        title: "Total Views",
        value: formatCompact(data.summary?.total_views),
        description: "Watch history signals",
        icon: LayoutList,
        accent: "blue",
      },
    ],
    [data.summary]
  );

  const visibleMovies = useMemo(() => sortMovies(data.movies || [], sortBy), [data.movies, sortBy]);

  const filterSummary = useMemo(() => {
    const items = [];

    if (statusFilter !== "all") {
      items.push(statusOptions.find((option) => option.value === statusFilter)?.label || statusFilter);
    }
    if (genreFilter !== "all") {
      items.push(genreFilter);
    }

    items.push(sortOptions.find((option) => option.value === sortBy)?.label || "Top AI score");
    return items;
  }, [genreFilter, sortBy, statusFilter]);

  const handleCopyTitle = async (title) => {
    if (!title) return;

    try {
      await navigator.clipboard.writeText(title);
      setToastMessage("Movie title copied");
    } catch {
      setToastMessage("Could not copy title");
    }
  };

  return (
    <AdminShell
      title="Movies"
      subtitle="Track catalog readiness, recommendation strength, and live title momentum across your project."
      lastUpdatedAt={lastUpdatedAt}
      isRefreshing={isRefreshing}
    >
      <div
        className="space-y-6"
        onClick={() => {
          setActiveMenuId(null);
        }}
      >
        {loadError ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {loadError}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <AdminSummaryCard key={card.title} {...card} loading={loading} />
          ))}
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.03))]">
          <div className="border-b border-white/8 px-4 py-4 md:px-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex w-full flex-col gap-3 lg:flex-row">
                <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-white/70">
                  <Search className="h-4 w-4 text-white/35" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search movies..."
                    className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowFilters((current) => !current);
                  }}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    showFilters || statusFilter !== "all" || genreFilter !== "all"
                      ? "border-[#f6c000]/25 bg-[#f6c000]/10 text-[#ffd54d]"
                      : "border-white/10 bg-[#141414] text-white/70 hover:text-white"
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </button>

                <Link
                  to="/admin/movies/new"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#f6c000] px-4 py-3 text-sm font-medium text-black transition hover:bg-[#ffd54d]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Movie</span>
                </Link>
              </div>

              <div className="flex items-center gap-3 self-start xl:self-auto">
                <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`rounded-xl px-4 py-2 text-sm transition ${viewMode === "table" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <LayoutList className="h-4 w-4" />
                      Table
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`rounded-xl px-4 py-2 text-sm transition ${viewMode === "grid" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Grid2x2 className="h-4 w-4" />
                      Grid
                    </span>
                  </button>
                </div>

                <div className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300">
                  {isRefreshing ? "Refreshing catalog" : `${visibleMovies.length} movies shown`}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center gap-2">
              {filterSummary.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/55"
                >
                  {item}
                </span>
              ))}
            </div>

            {showFilters ? (
              <div
                className="grid gap-3 rounded-2xl border border-white/10 bg-[#111111] p-3 md:grid-cols-3"
                onClick={(event) => event.stopPropagation()}
              >
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-white/35">Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white/70 outline-none"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-white/35">Genre</span>
                  <select
                    value={genreFilter}
                    onChange={(event) => setGenreFilter(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white/70 outline-none"
                  >
                    <option value="all">All genres</option>
                    {data.genres.map((genre) => (
                      <option key={genre} value={genre}>
                        {genre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-white/35">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white/70 outline-none"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </section>

        {viewMode === "table" ? (
          <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.03))]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/40">
                    <th className="px-5 py-4">Movie</th>
                    <th className="px-5 py-4">Genre</th>
                    <th className="px-5 py-4">Rating</th>
                    <th className="px-5 py-4">AI Score</th>
                    <th className="px-5 py-4">Views</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Options</th>
                  </tr>
                </thead>
                <tbody className="text-white/85">
                  {!loading && visibleMovies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-white/45">
                        No movies matched the current filters.
                      </td>
                    </tr>
                  ) : null}

                  {visibleMovies.map((movie) => (
                    <tr
                      key={movie.id}
                      className="border-b border-white/5 transition hover:bg-[linear-gradient(90deg,rgba(246,192,0,0.04),rgba(255,255,255,0.02))] last:border-b-0"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="h-16 w-12 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-[0_14px_36px_-24px_rgba(0,0,0,0.95)]">
                            {movie.poster_url ? (
                              <img src={movie.poster_url} alt={movie.title} className="h-full w-full object-cover" />
                            ) : (
                              <PosterFallback title={movie.title} year={movie.release_year} />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-white">{movie.title}</div>
                            <div className="text-white/45">{movie.release_year || "Year unknown"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/65">
                          {movie.genre}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-white/85">
                          <Star className="h-4 w-4 text-[#f6c000]" />
                          <span>{movie.rating ? movie.rating.toFixed(1) : "--"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <MeterBar value={movie.ai_score} compact />
                      </td>
                      <td className="px-5 py-4">{formatCompact(movie.views)}</td>
                      <td className="px-5 py-4">
                        <StatusBadge label={movie.status?.label || "Steady"} tone={movie.status?.key || "steady"} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setActiveMenuId((current) => (current === movie.id ? null : movie.id))}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:border-white/20 hover:text-white"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>

                          {activeMenuId === movie.id ? (
                            <MovieOptionsMenu
                              movie={movie}
                              onOpenDetails={setSelectedMovie}
                              onCopyTitle={handleCopyTitle}
                              onClose={() => setActiveMenuId(null)}
                              onToast={setToastMessage}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {!loading && visibleMovies.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-12 text-center text-white/45">
                No movies matched the current filters.
              </div>
            ) : null}

            {visibleMovies.map((movie) => (
              <article
                key={movie.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] shadow-[0_18px_60px_-42px_rgba(0,0,0,0.98)]"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-white/[0.03]">
                  {movie.poster_url ? (
                    <img src={movie.poster_url} alt={movie.title} className="h-full w-full object-cover" />
                  ) : (
                    <PosterFallback title={movie.title} year={movie.release_year} />
                  )}

                  <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                    <StatusBadge label={movie.status?.label || "Steady"} tone={movie.status?.key || "steady"} />

                    <div className="relative" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setActiveMenuId((current) => (current === movie.id ? null : movie.id))}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/75 backdrop-blur-sm transition hover:text-white"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {activeMenuId === movie.id ? (
                        <MovieOptionsMenu
                          movie={movie}
                          onOpenDetails={setSelectedMovie}
                          onCopyTitle={handleCopyTitle}
                          onClose={() => setActiveMenuId(null)}
                          onToast={setToastMessage}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{movie.title}</h3>
                      <p className="mt-1 text-sm text-white/45">{movie.release_year || "Year unknown"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMovie(movie)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65 transition hover:text-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Open</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(movie.genres?.length ? movie.genres : [movie.genre]).slice(0, 3).map((genre) => (
                      <span
                        key={`${movie.id}-${genre}`}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                      <div className="text-white/40">Rating</div>
                      <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-white">
                        <Star className="h-4 w-4 text-[#f6c000]" />
                        <span>{movie.rating ? movie.rating.toFixed(1) : "--"}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                      <div className="text-white/40">Views</div>
                      <div className="mt-1 text-lg font-semibold text-white">{formatCompact(movie.views)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                      <div className="text-white/40">Signals</div>
                      <div className="mt-1 text-lg font-semibold text-white">{formatCompact(movie.interactions)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm text-white/45">AI score</div>
                    <MeterBar value={movie.ai_score} />
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {selectedMovie ? <MovieDetailsPanel movie={selectedMovie} onClose={() => setSelectedMovie(null)} /> : null}

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-full border border-white/10 bg-[#111111] px-4 py-2 text-sm text-white shadow-[0_20px_60px_-30px_rgba(0,0,0,0.95)]">
          {toastMessage}
        </div>
      ) : null}
    </AdminShell>
  );
}
