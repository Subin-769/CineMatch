import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import AppLayout from "../components/AppLayout";
import MovieCard from "../components/MovieCard";
import { AuthContext } from "../auth/AuthContext";
import { useToast } from "../context/ToastContext";
import { API_BASE } from "../api/apiBase";
import {
  Search,
  Film,
  SlidersHorizontal,
  X,
  ChevronDown,
  Loader2,
  Popcorn,
  AlertCircle,
} from "lucide-react";

/* =========================
   DATA
========================= */
const GENRES = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "primary_release_date.desc", label: "Newest First" },
  { value: "original_title.asc", label: "A \u2192 Z" },
];

const YEAR_MIN = 1950;
const YEAR_MAX = new Date().getFullYear();

const LANGUAGES = [
  { code: "", name: "All Languages" },
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "ko", name: "Korean" },
  { code: "ja", name: "Japanese" },
  { code: "it", name: "Italian" },
  { code: "de", name: "German" },
];

/* =========================
   PORTAL DROPDOWN
========================= */
function DropdownPortal({ open, anchorRef, children, onClose }) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 });

  useEffect(() => {
    if (!open) return;
    const calc = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuWidth = 240;
      const leftPos = Math.min(r.left, window.innerWidth - menuWidth - 16);
      setPos({
        top: Math.round(r.bottom + 8),
        left: Math.max(8, Math.round(leftPos)),
        width: menuWidth,
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
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl overflow-hidden max-h-72 overflow-y-auto"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

/* =========================
   FILTER PILL
========================= */
function FilterPill({ label, active, icon: Icon, onClick, btnRef }) {
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 border ${
        active
          ? "bg-[#FFC105]/12 border-[#FFC105]/30 text-[#FFC105]"
          : "bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white/80"
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${active ? "rotate-180" : ""}`} />
    </button>
  );
}

/* =========================
   DROPDOWN OPTION
========================= */
function DropdownOption({ label, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
        selected
          ? "bg-[#FFC105]/10 text-[#FFC105]"
          : "text-white/80 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

/* =========================
   YEAR RANGE SELECTOR
========================= */
function YearRangeDropdown({ yearFrom, yearTo, onChange, onClose }) {
  const decades = [];
  for (let d = YEAR_MAX - (YEAR_MAX % 10); d >= YEAR_MIN; d -= 10) {
    decades.push(d);
  }

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider px-1">Year Range</p>
      <div className="flex items-center gap-2">
        <select
          value={yearFrom}
          onChange={(e) => onChange("yearFrom", e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm appearance-none cursor-pointer focus:outline-none focus:border-[#FFC105]/30"
        >
          <option value="">From</option>
          {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MAX - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-white/30 text-sm">&ndash;</span>
        <select
          value={yearTo}
          onChange={(e) => onChange("yearTo", e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm appearance-none cursor-pointer focus:outline-none focus:border-[#FFC105]/30"
        >
          <option value="">To</option>
          {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MAX - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {decades.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              onChange("yearFrom", String(d));
              onChange("yearTo", String(Math.min(d + 9, YEAR_MAX)));
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              Number(yearFrom) === d
                ? "bg-[#FFC105]/15 text-[#FFC105] border border-[#FFC105]/25"
                : "bg-white/5 text-white/60 hover:bg-white/10 border border-transparent"
            }`}
          >
            {d}s
          </button>
        ))}
      </div>
      {(yearFrom || yearTo) && (
        <button
          type="button"
          onClick={() => { onChange("yearFrom", ""); onChange("yearTo", ""); onClose(); }}
          className="w-full px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Clear Year Filter
        </button>
      )}
    </div>
  );
}

/* =========================
   FILTERS BAR
========================= */
function FiltersBar({ filters, onFilterChange, onClearFilters, activeCount, searchQuery, onSearchChange }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const genreRef = useRef(null);
  const yearRef = useRef(null);
  const langRef = useRef(null);
  const sortRef = useRef(null);

  const toggle = (key) => setOpenDropdown((prev) => (prev === key ? null : key));
  const close = () => setOpenDropdown(null);

  const genreName = GENRES.find((g) => String(g.id) === String(filters.genre))?.name;
  const sortLabel = SORT_OPTIONS.find((s) => s.value === filters.sort)?.label || "Most Popular";
  const langName = LANGUAGES.find((l) => l.code === filters.lang)?.name;
  const yearLabel = filters.yearFrom || filters.yearTo
    ? `${filters.yearFrom || "..."}\u2013${filters.yearTo || "..."}`
    : null;

  return (
    <div className="space-y-3">
      {/* Search + toggle row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search movies..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm placeholder:text-white/35 focus:outline-none focus:border-[#FFC105]/30 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFiltersExpanded((s) => !s)}
          className={`lg:hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
            activeCount > 0
              ? "bg-[#FFC105]/12 border-[#FFC105]/30 text-[#FFC105]"
              : "bg-white/[0.04] border-white/10 text-white/60"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 flex items-center justify-center w-5 h-5 rounded-full bg-[#FFC105] text-black text-xs font-bold">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter pills — always visible on lg, toggle on mobile */}
      <div className={`${filtersExpanded ? "flex" : "hidden lg:flex"} items-center gap-2 overflow-x-auto pb-1 scrollbar-hide`}>
        {/* Genre */}
        <FilterPill
          btnRef={genreRef}
          label={genreName || "Genre"}
          active={!!filters.genre}
          icon={Film}
          onClick={() => toggle("genre")}
        />
        <DropdownPortal open={openDropdown === "genre"} anchorRef={genreRef} onClose={close}>
          <DropdownOption label="All Genres" selected={!filters.genre} onClick={() => { onFilterChange("genre", ""); close(); }} />
          {GENRES.map((g) => (
            <DropdownOption
              key={g.id}
              label={g.name}
              selected={String(g.id) === String(filters.genre)}
              onClick={() => { onFilterChange("genre", g.id); close(); }}
            />
          ))}
        </DropdownPortal>

        {/* Year Range */}
        <FilterPill
          btnRef={yearRef}
          label={yearLabel || "Year"}
          active={!!(filters.yearFrom || filters.yearTo)}
          onClick={() => toggle("year")}
        />
        <DropdownPortal open={openDropdown === "year"} anchorRef={yearRef} onClose={close}>
          <YearRangeDropdown
            yearFrom={filters.yearFrom}
            yearTo={filters.yearTo}
            onChange={onFilterChange}
            onClose={close}
          />
        </DropdownPortal>

        {/* Language */}
        <FilterPill
          btnRef={langRef}
          label={langName && filters.lang ? langName : "Language"}
          active={!!filters.lang}
          onClick={() => toggle("lang")}
        />
        <DropdownPortal open={openDropdown === "lang"} anchorRef={langRef} onClose={close}>
          {LANGUAGES.map((l) => (
            <DropdownOption
              key={l.code}
              label={l.name}
              selected={l.code === filters.lang}
              onClick={() => { onFilterChange("lang", l.code); close(); }}
            />
          ))}
        </DropdownPortal>

        {/* Sort */}
        <FilterPill
          btnRef={sortRef}
          label={sortLabel}
          active={filters.sort !== "popularity.desc"}
          onClick={() => toggle("sort")}
        />
        <DropdownPortal open={openDropdown === "sort"} anchorRef={sortRef} onClose={close}>
          {SORT_OPTIONS.map((s) => (
            <DropdownOption
              key={s.value}
              label={s.label}
              selected={s.value === filters.sort}
              onClick={() => { onFilterChange("sort", s.value); close(); }}
            />
          ))}
        </DropdownPortal>

        {/* Clear */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.genre && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFC105]/10 border border-[#FFC105]/20 text-[#FFC105] text-xs font-medium">
              {genreName}
              <button type="button" onClick={() => onFilterChange("genre", "")} className="hover:text-white transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}
          {yearLabel && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium">
              {yearLabel}
              <button type="button" onClick={() => { onFilterChange("yearFrom", ""); onFilterChange("yearTo", ""); }} className="hover:text-white transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}
          {filters.lang && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium">
              {langName}
              <button type="button" onClick={() => onFilterChange("lang", "")} className="hover:text-white transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}
          {filters.sort !== "popularity.desc" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium">
              {sortLabel}
              <button type="button" onClick={() => onFilterChange("sort", "popularity.desc")} className="hover:text-white transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================
   SKELETON GRID
========================= */
function SkeletonGrid({ count = 18 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="aspect-[2/3] rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="w-full h-full animate-pulse bg-gradient-to-br from-white/5 via-white/10 to-white/5" />
          </div>
          <div className="space-y-2">
            <div className="h-3.5 w-4/5 rounded-full bg-white/10 animate-pulse" />
            <div className="h-2.5 w-2/5 rounded-full bg-white/5 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================
   EMPTY / ERROR
========================= */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6">
      <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
        <Popcorn className="w-10 h-10 text-white/20" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">No movies found</h3>
      <p className="text-white/50 text-center max-w-md">
        No movies match your current filters. Try adjusting your search or filter criteria.
      </p>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6">
      <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
        <AlertCircle className="w-10 h-10 text-red-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Something went wrong</h3>
      <p className="text-white/50 text-center max-w-md mb-6">
        {error || "Failed to load movies. Please try again."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition"
      >
        Try Again
      </button>
    </div>
  );
}

/* =========================
   MAIN
========================= */
export default function Movies() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();

  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const showToast = useToast();

  const [filters, setFilters] = useState({
    genre: searchParams.get("genre") || "",
    yearFrom: searchParams.get("yearFrom") || "",
    yearTo: searchParams.get("yearTo") || "",
    sort: searchParams.get("sort") || "popularity.desc",
    lang: searchParams.get("lang") || "",
  });

  const requireAuth = (redirectPath = "/") => {
    if (!user) {
      localStorage.setItem("redirectAfterLogin", redirectPath);
      navigate("/login");
      return false;
    }
    return true;
  };

  // Sync URL -> filters (for sidebar genre clicks etc.)
  useEffect(() => {
    const urlGenre = searchParams.get("genre") || "";
    const urlYearFrom = searchParams.get("yearFrom") || "";
    const urlYearTo = searchParams.get("yearTo") || "";
    const urlSort = searchParams.get("sort") || "popularity.desc";
    const urlLang = searchParams.get("lang") || "";

    setFilters((prev) => {
      if (
        String(prev.genre) === String(urlGenre) &&
        prev.yearFrom === urlYearFrom &&
        prev.yearTo === urlYearTo &&
        prev.sort === urlSort &&
        prev.lang === urlLang
      ) return prev;
      return { genre: urlGenre, yearFrom: urlYearFrom, yearTo: urlYearTo, sort: urlSort, lang: urlLang };
    });
    setPage(1);
  }, [searchParams]);

  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  const buildApiUrl = useCallback(
    (pageNum = 1, f = filters) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      if (f.sort) params.set("sort_by", f.sort);
      if (f.genre) params.set("with_genres", f.genre);
      if (f.yearFrom) params.set("primary_release_date.gte", `${f.yearFrom}-01-01`);
      if (f.yearTo) params.set("primary_release_date.lte", `${f.yearTo}-12-31`);
      if (f.lang) params.set("lang", f.lang);
      return `${API_BASE}/tmdb/discover/?${params.toString()}`;
    },
    [filters]
  );

  const fetchMovies = useCallback(
    async (pageNum = 1, append = false, f = filters) => {
      try {
        if (append) setIsLoadingMore(true);
        else { setIsLoading(true); setError(null); }

        const response = await fetch(buildApiUrl(pageNum, f));
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.detail || `HTTP ${response.status}`);

        const results = data.results || [];
        setMovies((prev) => (append ? [...prev, ...results] : results));
        setTotalPages(data.total_pages || 1);
        setPage(pageNum);
      } catch (err) {
        setError(err.message || "Failed to load movies");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [buildApiUrl, filters]
  );

  useEffect(() => {
    fetchMovies(1, false, filters);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [filters, fetchMovies]);

  // Sync filters -> URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.genre) params.set("genre", filters.genre);
    if (filters.yearFrom) params.set("yearFrom", filters.yearFrom);
    if (filters.yearTo) params.set("yearTo", filters.yearTo);
    if (filters.sort && filters.sort !== "popularity.desc") params.set("sort", filters.sort);
    if (filters.lang) params.set("lang", filters.lang);
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoading && !isLoadingMore && page < totalPages) {
          fetchMovies(page + 1, true, filters);
        }
      },
      { threshold: 0.1, rootMargin: "200px" }
    );

    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [isLoading, isLoadingMore, page, totalPages, fetchMovies, filters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: String(value) }));
  };

  const handleClearFilters = () => {
    setFilters({ genre: "", yearFrom: "", yearTo: "", sort: "popularity.desc", lang: "" });
    setSearchQuery("");
  };

  const activeCount = [
    filters.genre,
    filters.yearFrom || filters.yearTo,
    filters.sort !== "popularity.desc" ? filters.sort : "",
    filters.lang,
  ].filter(Boolean).length;

  // Client-side search filter on loaded results
  const displayMovies = searchQuery.trim()
    ? movies.filter((m) => (m.title || "").toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : movies;

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0f0f0f]">
        <main className="pt-16">
          <div className="p-8">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-1">Discover Movies</h1>
              <p className="text-white/50 text-sm">
                Explore our collection and find your next favorite film.
              </p>
            </div>

            {/* Filters */}
            <div className="mb-8">
              <FiltersBar
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                activeCount={activeCount}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>

            {/* Results count */}
            {!isLoading && !error && movies.length > 0 && (
              <p className="text-white/35 text-sm mb-6">
                {searchQuery.trim()
                  ? `${displayMovies.length} result${displayMovies.length !== 1 ? "s" : ""} for "${searchQuery}"`
                  : `Page ${page} of ${totalPages}`}
              </p>
            )}

            {/* Content */}
            {isLoading && movies.length === 0 ? (
              <SkeletonGrid />
            ) : error && !isLoading ? (
              <ErrorState error={error} onRetry={() => fetchMovies(1, false, filters)} />
            ) : !isLoading && displayMovies.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
                  {displayMovies.map((movie) => (
                    <MovieCard
                      key={movie.id}
                      movie={movie}
                      onToast={showToast}
                      user={user}
                      requireAuth={requireAuth}
                    />
                  ))}
                </div>

                {/* Infinite scroll sentinel */}
                <div ref={loadMoreRef} className="h-4" />

                {isLoadingMore && (
                  <div className="flex items-center justify-center py-10">
                    <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.04] border border-white/10 rounded-full">
                      <Loader2 className="w-5 h-5 text-[#FFC105] animate-spin" />
                      <span className="text-white/50 text-sm font-medium">Loading more...</span>
                    </div>
                  </div>
                )}

                {!isLoadingMore && page >= totalPages && movies.length > 0 && (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-white/30 text-sm">You've reached the end</p>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

      </div>
    </AppLayout>
  );
}
