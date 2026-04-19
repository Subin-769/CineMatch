import { useCallback, useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { Star, Film, Lock, RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { API_BASE } from "../api/apiBase";


function LoginRequired() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
        <Lock className="w-8 h-8 text-[#FFC105]" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Login required</h3>
      <p className="text-white/50 text-center max-w-sm mb-6">
        Please log in to view and manage your ratings.
      </p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("redirectAfterLogin", "/ratings");
          navigate("/login");
        }}
        className="px-6 py-3 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition"
      >
        Login
      </button>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <h3 className="text-xl font-semibold text-white mb-2">Something went wrong</h3>
      <p className="text-white/50 text-center max-w-sm mb-6">
        We could not load your ratings. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 border border-white/10 text-white hover:bg-white/15 transition"
      >
        <RefreshCw className="w-5 h-5" />
        Try Again
      </button>
    </div>
  );
}

function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
        <Film className="w-10 h-10 text-white/20" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">No ratings yet</h3>
      <p className="text-white/50 text-center max-w-sm mb-6">
        Rate movies and they will appear here.
      </p>
      <button
        type="button"
        onClick={() => navigate("/movies")}
        className="px-6 py-3 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition"
      >
        Browse Movies
      </button>
    </div>
  );
}

function StarPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-1"
          title={`Rate ${n}/5`}
        >
          <Star
            className={`w-5 h-5 ${n <= value ? "text-[#FFC105] fill-[#FFC105]" : "text-white/25"}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function Ratings() {
  const navigate = useNavigate();
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState(false);
  const [sortBy, setSortBy] = useState("rated_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const fetchRatings = useCallback(async () => {
    setLoading(true);
    setNeedLogin(false);
    setError(false);

    try {
      const res = await fetch(`${API_BASE}/rating/my/`, {
        credentials: "include",
      });

      if (res.status === 401) {
        setNeedLogin(true);
        setRatings([]);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch ratings");

      const data = await res.json();
      setRatings(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings]);

  const sorted = useMemo(() => {
    const list = [...ratings];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") {
        cmp = String(a.title || "").localeCompare(String(b.title || ""));
      } else if (sortBy === "rating") {
        cmp = Number(a.rating || 0) - Number(b.rating || 0);
      } else {
        cmp = new Date(a.rated_at || 0).getTime() - new Date(b.rated_at || 0).getTime();
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return list;
  }, [ratings, sortBy, sortOrder]);

  const handleReRate = async (tmdbId, nextRating) => {
    try {
      const res = await fetch(`${API_BASE}/rating/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdb_id: tmdbId, rating: nextRating }),
      });
      if (!res.ok) throw new Error("Failed");
      setRatings((prev) =>
        prev.map((r) =>
          r.tmdb_id === tmdbId ? { ...r, rating: nextRating, rated_at: new Date().toISOString() } : r
        )
      );
    } catch {
      // no-op toast system here; keep UX simple
    }
  };

  return (
    <AppLayout>
      <div className="pt-20 sm:pt-24 lg:pt-28 px-4 sm:px-6 lg:px-10 pb-12">
        <div className="max-w-7xl mx-auto">
          <div className="mb-5 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">My Ratings</h1>
            <p className="text-sm sm:text-base text-white/50">Movies you have rated on CineMatch.</p>
          </div>

          {!loading && !needLogin && !error && ratings.length > 0 && (
            <div className="mb-5 sm:mb-6 flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white"
              >
                <option value="rated_at">Recently Rated</option>
                <option value="title">Title</option>
                <option value="rating">My Rating</option>
              </select>

              <button
                type="button"
                onClick={() => setSortOrder((v) => (v === "asc" ? "desc" : "asc"))}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white"
              >
                {sortOrder === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                {sortOrder === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse" />
              ))}
            </div>
          ) : needLogin ? (
            <LoginRequired />
          ) : error ? (
            <ErrorState onRetry={fetchRatings} />
          ) : ratings.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {sorted.map((item) => (
                <div
                  key={`${item.tmdb_id}-${item.rated_at}`}
                  className="rounded-2xl bg-white/[0.02] border border-white/10 p-3 sm:p-4 flex gap-3 sm:gap-4"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/movie/${item.tmdb_id}`)}
                    className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0"
                  >
                    {item.poster_url ? (
                      <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-6 h-6 text-white/20" />
                      </div>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/movie/${item.tmdb_id}`)}
                      className="text-left"
                    >
                      <h3 className="text-base sm:text-lg font-semibold text-white line-clamp-1 hover:text-[#FFC105] transition-colors">
                        {item.title}
                      </h3>
                    </button>
                    <p className="text-xs sm:text-sm text-white/50 mt-1">
                      {item.year || "Year N/A"} • Rated{" "}
                      {item.rated_at ? new Date(item.rated_at).toLocaleString() : "recently"}
                    </p>
                    {item.overview ? (
                      <p className="text-xs sm:text-sm text-white/70 mt-2 line-clamp-2 hidden sm:block">{item.overview}</p>
                    ) : null}
                    <div className="mt-2 sm:mt-3 flex items-center gap-2 sm:gap-3">
                      <span className="text-xs sm:text-sm text-white/60">Your rating:</span>
                      <StarPicker value={Number(item.rating || 0)} onChange={(n) => handleReRate(item.tmdb_id, n)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
