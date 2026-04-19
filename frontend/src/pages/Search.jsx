import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Film, Calendar, Star, Loader2 } from "lucide-react";
import AppLayout from "../components/AppLayout";
import { fetchMovies } from "../api/cineMatchApi";
import { API_BASE } from "../api/apiBase";


function MovieCardSkeleton() {
  return (
    <div className="cinema-card overflow-hidden">
      <div className="aspect-[2/3] skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 skeleton rounded" />
        <div className="h-3 w-1/2 skeleton rounded" />
      </div>
    </div>
  );
}

function MovieCard({ movie, onClick }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left group cinema-card overflow-hidden hover:border-white/20 transition"
    >
      <div className="poster-card relative">
        {!imageLoaded && !imageError && <div className="absolute inset-0 skeleton" />}

        {movie.poster_url && !imageError ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Film className="w-14 h-14 text-muted-foreground" />
          </div>
        )}

        {Number(movie.rating) > 0 && (
          <div className="absolute top-2 right-2 rating-badge">
            <Star className="w-3 h-3 fill-current" />
            <span>{Number(movie.rating).toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {movie.title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          {movie.year ? (
            <>
              <Calendar className="w-3.5 h-3.5" />
              <span>{movie.year}</span>
            </>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyState({ query }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="w-20 h-20 rounded-2xl bg-secondary border border-border flex items-center justify-center mb-6">
        <Search className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">
        No results for “{query}”
      </h3>
      <p className="text-muted-foreground text-center max-w-md">
        Try a different title or adjust your query.
      </p>
    </div>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const activeQuery = useMemo(() => (searchParams.get("q") || "").trim(), [searchParams]);

  useEffect(() => {
    setSearchQuery(activeQuery);
  }, [activeQuery]);

  const fetchSearch = useCallback(
    async (pageNum = 1, append = false, query = activeQuery) => {
      const q = (query || "").trim();
      if (!q) return;

      try {
        if (append) setIsLoadingMore(true);
        else {
          setIsLoading(true);
          setError(null);
        }

        const params = new URLSearchParams({ q, page: String(pageNum) });
        const res = await fetch(`${API_BASE}/tmdb/discover/?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);

        const items = data.results || [];
        setResults((prev) => (append ? [...prev, ...items] : items));
        setPage(pageNum);
        setTotalPages(data.total_pages || 1);
        setTotalResults(data.total_results || 0);
      } catch (err) {
        setError(err.message || "Failed to search");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeQuery]
  );

  const fetchTrending = useCallback(async () => {
    try {
      const data = await fetchMovies();
      setTrending(Array.isArray(data) ? data : []);
    } catch {
      setTrending([]);
    }
  }, []);

  useEffect(() => {
    if (activeQuery) {
      fetchSearch(1, false, activeQuery);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setResults([]);
      setTotalResults(0);
      fetchTrending();
    }
  }, [activeQuery, fetchSearch, fetchTrending]);

  const handleLoadMore = () => {
    if (!activeQuery) return;
    if (page >= totalPages) return;
    fetchSearch(page + 1, true, activeQuery);
  };

  return (
    <AppLayout searchQuery={searchQuery} setSearchQuery={setSearchQuery}>
      <div className="pt-24 lg:pt-28">
        <section className="px-6 lg:px-10 pt-6 pb-12">
          {activeQuery ? (
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Results for “{activeQuery}”</h2>
                <p className="text-muted-foreground text-sm">
                  {isLoading ? "Searching the catalog..." : `${totalResults} matches`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Trending this week</h2>
                <p className="text-muted-foreground text-sm">
                  Fresh picks to spark your next movie night.
                </p>
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div className="error-card">
              <p className="text-foreground font-semibold">Search failed</p>
              <p className="text-muted-foreground text-sm mt-2">{error}</p>
            </div>
          )}

          {isLoading && results.length === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6">
              {Array.from({ length: 14 }).map((_, i) => (
                <MovieCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!isLoading && !error && activeQuery && results.length === 0 && (
            <EmptyState query={activeQuery} />
          )}

          {!activeQuery && trending.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6">
              {trending.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  onClick={() => navigate(`/movie/${movie.id}`)}
                />
              ))}
            </div>
          )}

          {activeQuery && results.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6">
                {results.map((movie) => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    onClick={() => navigate(`/movie/${movie.id}`)}
                  />
                ))}
              </div>

              {page < totalPages && (
                <div className="flex items-center justify-center mt-10">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="btn-secondary"
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading more
                      </span>
                    ) : (
                      "Load more"
                    )}
                  </button>
                </div>
              )}

              {page >= totalPages && results.length > 0 && (
                <div className="flex items-center justify-center mt-10 text-muted-foreground text-sm">
                  End of results
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
