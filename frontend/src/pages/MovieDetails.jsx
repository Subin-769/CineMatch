import { useState, useEffect, useCallback, useRef, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play, Plus, Check, Star, Clock, Calendar, Globe, ExternalLink, ThumbsDown, ThumbsUp, Heart, Users, TrendingUp, DollarSign,
  Film, X, ChevronRight, AlertCircle, Building2,
}

  from "lucide-react";
import AppLayout from "../components/AppLayout";
import { AuthContext } from "../auth/AuthContext";
import { useToast } from "../context/ToastContext";
import { API_BASE } from "../api/apiBase";
import { loadStoredSettings } from "../lib/settings.js";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// Utility: Safe JSON fetch
async function safeFetch(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    throw new Error(`Invalid response format. ${text.slice(0, 120)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

// Format currency
function formatCurrency(amount) {
  if (!amount || amount === 0) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

// Format runtime
function formatRuntime(minutes) {
  if (!minutes) return "N/A";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

// Skeleton Components
function HeroSkeleton() {
  return (
    <div className="relative h-[500px] lg:h-[600px] animate-pulse">
      <div className="absolute inset-0 bg-muted" />
      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10">
        <div className="flex gap-6 lg:gap-10">
          <div className="hidden sm:block w-48 lg:w-64 h-72 lg:h-96 skeleton rounded-xl" />
          <div className="flex-1 space-y-4">
            <div className="h-10 w-3/4 skeleton rounded" />
            <div className="h-6 w-1/2 skeleton rounded" />
            <div className="h-4 w-2/3 skeleton rounded" />
            <div className="flex gap-3 mt-6">
              <div className="h-12 w-40 skeleton rounded-lg" />
              <div className="h-12 w-44 skeleton rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="stat-item">
          <div className="h-6 w-16 skeleton rounded mb-2" />
          <div className="h-4 w-12 skeleton rounded" />
        </div>
      ))}
    </div>
  );
}

function CastSkeleton() {
  return (
    <div className="scroll-rail">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="cast-card">
          <div className="w-24 h-24 mx-auto skeleton rounded-full" />
          <div className="h-4 w-20 mx-auto skeleton rounded mt-3" />
          <div className="h-3 w-16 mx-auto skeleton rounded mt-1" />
        </div>
      ))}
    </div>
  );
}

function PosterRailSkeleton() {
  return (
    <div className="scroll-rail">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex-shrink-0 w-36 lg:w-44">
          <div className="poster-card skeleton" />
          <div className="h-4 w-full skeleton rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

// Star Rating Component
function StarRating({ value, onChange, disabled }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className="star-btn focus:outline-none disabled:cursor-not-allowed"
        >
          <Star className={`star ${star <= (hover || value) ? "filled fill-current" : ""}`} />
        </button>
      ))}
      {value > 0 && <span className="ml-2 text-sm text-muted-foreground">{value}/5</span>}
    </div>
  );
}

// Preference Buttons Component
function PreferenceButtons({ value, onChange, disabled }) {
  const [preference, setPreference] = useState(value || null);

  useEffect(() => {
    setPreference(value || null);
  }, [value]);

  const handleChange = (next) => {
    if (disabled) return;
    const updated = preference === next ? null : next;
    setPreference(updated);
    onChange?.(updated);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleChange("dislike")}
        disabled={disabled}
        className={`preference-btn ${preference === "dislike" ? "active" : ""}`}
        title="Not for me"
      >
        <ThumbsDown className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleChange("like")}
        disabled={disabled}
        className={`preference-btn ${preference === "like" ? "active" : ""}`}
        title="I like this"
      >
        <ThumbsUp className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleChange("love")}
        disabled={disabled}
        className={`preference-btn ${preference === "love" ? "active" : ""}`}
        title="Love it!"
      >
        <Heart className="w-4 h-4" />
      </button>
    </div>
  );
}

// Movie Poster Card Component
function MoviePosterCard({ movie, onClick }) {
  const posterUrl = movie.poster_path ? `${TMDB_IMAGE_BASE}/w342${movie.poster_path}` : null;

  return (
    <div className="flex-shrink-0 w-36 lg:w-44 cursor-pointer group" onClick={onClick}>
      <div className="poster-card relative">
        {posterUrl ? (
          <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Film className="w-12 h-12 text-muted-foreground" />
          </div>
        )}

        {movie.vote_average > 0 && (
          <div className="absolute top-2 right-2 rating-badge z-10">
            <Star className="w-3 h-3 fill-current" />
            <span>{movie.vote_average.toFixed(1)}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ChevronRight className="w-10 h-10 text-primary" />
        </div>
      </div>

      <h4 className="mt-2 text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
        {movie.title}
      </h4>
      {movie.release_date && (
        <p className="text-xs text-muted-foreground">{new Date(movie.release_date).getFullYear()}</p>
      )}
    </div>
  );
}

// Video Modal Component
function VideoModal({ video, onClose, autoplay = true }) {
  if (!video) return null;

  const autoplayParam = autoplay ? "1" : "0";
  const videoUrl =
    video.site === "YouTube"
      ? `https://www.youtube.com/embed/${video.key}?autoplay=${autoplayParam}`
      : video.site === "Vimeo"
        ? `https://player.vimeo.com/video/${video.key}?autoplay=${autoplayParam}`
        : null;

  if (!videoUrl) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <iframe
          src={videoUrl}
          title={video.name}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}


// Error Card Component
function ErrorCard({ message, onRetry }) {
  return (
    <div className="error-card max-w-md mx-auto my-20">
      <AlertCircle className="w-12 h-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h3>
      <p className="text-muted-foreground mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-gold">
          Try Again
        </button>
      )}
    </div>
  );
}

// Main Component
export default function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [movie, setMovie] = useState(null);
  const [credits, setCredits] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [videos, setVideos] = useState([]);
  const [autoplayTrailers, setAutoplayTrailers] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [preference, setPreference] = useState(null);
  const [preferenceLoading, setPreferenceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [videoModal, setVideoModal] = useState(null);
  const showToast = useToast();
  const autoOpenedRef = useRef(false);

  const loadAutoplaySetting = () => {
    if (typeof window === "undefined") return true;
    try {
      const settings = loadStoredSettings();
      return settings.autoplayTrailers !== false;
    } catch {
      return true;
    }
  };

  useEffect(() => {
    const apply = () => setAutoplayTrailers(loadAutoplaySetting());
    apply();

    const onStorage = (e) => {
      if (e.key === "cinematch:settings") apply();
    };

    window.addEventListener("settings:changed", apply);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("settings:changed", apply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [movieData, creditsData, similarData, recsData, keywordsData, videosData] =
        await Promise.all([
          safeFetch(`${API_BASE}/tmdb/movie/${id}/`),
          safeFetch(`${API_BASE}/tmdb/movie/${id}/credits/`).catch(() => null),
          safeFetch(`${API_BASE}/tmdb/movie/${id}/similar/`).catch(() => ({ results: [] })),
          safeFetch(`${API_BASE}/tmdb/movie/${id}/recommendations/`).catch(() => ({ results: [] })),
          safeFetch(`${API_BASE}/tmdb/movie/${id}/keywords/`).catch(() => ({ keywords: [] })),
          safeFetch(`${API_BASE}/tmdb/movie/${id}/videos/`).catch(() => ({ results: [] })),
        ]);

      setMovie(movieData);
      setCredits(creditsData);
      setSimilar(similarData.results || []);
      setRecommendations(recsData.results || []);
      setKeywords(keywordsData.keywords || []);
      setVideos(videosData.results || []);
      if (user) {
        window.dispatchEvent(new Event("watch-history:changed"));
      }
    } catch (err) {
      setError(err.message || "Failed to load movie details");
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    fetchData();
    window.scrollTo(0, 0);
    autoOpenedRef.current = false;
    setVideoModal(null);
  }, [fetchData]);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setPreference(null);
      setInWatchlist(false);
      setUserRating(0);
      return () => {
        alive = false;
      };
    }

    const loadPreference = async () => {
      setPreferenceLoading(true);
      try {
        const data = await safeFetch(`${API_BASE}/preference/${id}/`, {
          credentials: "include",
        });
        if (alive) setPreference(data.preference || null);
      } catch {
        if (alive) setPreference(null);
      } finally {
        if (alive) setPreferenceLoading(false);
      }
    };

    loadPreference();
    return () => {
      alive = false;
    };
  }, [id, user]);

  useEffect(() => {
    let alive = true;
    if (!user) return () => {
      alive = false;
    };

    const loadMeta = async () => {
      try {
        const [watchData, ratingData] = await Promise.all([
          safeFetch(`${API_BASE}/watchlist/status/${id}/`, { credentials: "include" }),
          safeFetch(`${API_BASE}/rating/${id}/`, { credentials: "include" }),
        ]);
        if (!alive) return;
        setInWatchlist(Boolean(watchData?.in_watchlist));
        setUserRating(Number(ratingData?.rating || 0));
      } catch {
        if (!alive) return;
        setInWatchlist(false);
      }
    };

    loadMeta();
    return () => {
      alive = false;
    };
  }, [id, user]);

  const handleWatchlistToggle = async () => {
    // only logged-in users can watchlist
    if (!user) {
      localStorage.setItem("redirectAfterLogin", `/movie/${id}`);
      navigate("/login");
      return;
    }

    if (watchlistLoading) return;
    setWatchlistLoading(true);
    const nextValue = !inWatchlist;
    setInWatchlist(nextValue);
    showToast(nextValue ? "Added to watchlist!" : "Removed from watchlist!", "success");

    try {
      const data = await safeFetch(`${API_BASE}/watchlist/toggle/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdb_id: parseInt(id, 10) }),
      });

      setInWatchlist(data.in_watchlist);
      window.dispatchEvent(new Event("preferences:changed"));
    } catch {
      setInWatchlist(!nextValue);
      showToast("Failed to update watchlist", "error");
    } finally {
      setWatchlistLoading(false);
    }
  };

  const handlePreferenceChange = async (nextPreference) => {
    if (!user) {
      localStorage.setItem("redirectAfterLogin", `/movie/${id}`);
      navigate("/login");
      return;
    }

    try {
      const data = await safeFetch(`${API_BASE}/preference/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tmdb_id: parseInt(id, 10),
          preference: nextPreference,
        }),
      });
      setPreference(data.preference || null);
      if (data.preference) {
        const label = data.preference === "love" ? "Loved" : data.preference === "like" ? "Liked" : "Disliked";
        showToast( `${label} this movie`, "success");
      } else {
        showToast( "Preference cleared", "success");
      }
      window.dispatchEvent(new Event("preferences:changed"));
    } catch {
      showToast( "Failed to save preference", "error");
    }
  };


  const handleRatingSave = async () => {
    // only logged-in users can rate
    if (!user) {
      localStorage.setItem("redirectAfterLogin", `/movie/${id}`);
      navigate("/login");
      return;
    }
    if (!ratingDraft) return;
    setRatingSaving(true);
    const prevRating = userRating;
    setUserRating(ratingDraft);

    try {
      const data = await safeFetch(`${API_BASE}/rating/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send cookies
        body: JSON.stringify({ tmdb_id: parseInt(id, 10), rating: ratingDraft }),
      });

      showToast( data.message || "Rating saved", "success");
      window.dispatchEvent(new Event("preferences:changed"));
      setRatingModalOpen(false);
    } catch {
      setUserRating(prevRating);
      showToast( "Failed to save rating", "error");
    } finally {
      setRatingSaving(false);
    }
  };

  const handleRatingRemove = async () => {
    if (!user) return;
    setRatingSaving(true);
    const prevRating = userRating;
    setUserRating(0);
    try {
      const data = await safeFetch(`${API_BASE}/rating/${id}/delete/`, {
        method: "DELETE",
        credentials: "include",
      });
      showToast( data.message || "Rating removed", "success");
      window.dispatchEvent(new Event("preferences:changed"));
      setRatingModalOpen(false);
    } catch {
      setUserRating(prevRating);
      showToast( "Failed to remove rating", "error");
    } finally {
      setRatingSaving(false);
    }
  };

  const openRatingModal = () => {
    if (!user) {
      localStorage.setItem("redirectAfterLogin", `/movie/${id}`);
      navigate("/login");
      return;
    }
    setRatingDraft(userRating || 0);
    setRatingModalOpen(true);
  };


  const handleMovieClick = (movieId) => {
    navigate(`/movie/${movieId}`);
  };

  const trailer =
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos.find((v) => v.site === "YouTube" && v.type === "Teaser") ||
    videos.find((v) => v.site === "YouTube" && v.type === "Clip") ||
    videos.find((v) => v.site === "YouTube" && v.type === "Featurette") ||
    videos.find((v) => v.site === "YouTube") ||
    null;

  useEffect(() => {
    if (!autoplayTrailers) {
      autoOpenedRef.current = false;
      return;
    }
    if (trailer && !autoOpenedRef.current && !videoModal) {
      autoOpenedRef.current = true;
      setVideoModal(trailer);
    }
  }, [autoplayTrailers, trailer, videoModal]);


  const director = credits?.crew?.find((c) => c.job === "Director");
  const writers = credits?.crew?.filter((c) => c.department === "Writing").slice(0, 2);
  const composer = credits?.crew?.find((c) => c.job === "Original Music Composer" || c.job === "Music");
  const producer = credits?.crew?.find((c) => c.job === "Producer");

  const backdropUrl = movie?.backdrop_path ? `${TMDB_IMAGE_BASE}/original${movie.backdrop_path}` : null;
  const posterUrl = movie?.poster_path ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}` : null;

  return (
    <AppLayout>
      {loading ? (
        <div className="animate-fade-in">
          <HeroSkeleton />
          <div className="px-6 lg:px-10 py-8 space-y-8">
            <StatsSkeleton />
            <div className="cinema-divider" />
            <CastSkeleton />
            <div className="cinema-divider" />
            <PosterRailSkeleton />
          </div>
        </div>
      ) : error ? (
        <ErrorCard message={error} onRetry={fetchData} />
      ) : movie ? (
        <div className="animate-fade-in pb-12">
          {/* HERO */}
          <section className="detail-hero-contrast relative min-h-[500px] lg:min-h-[600px]">
            {backdropUrl && (
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${backdropUrl})` }} />
            )}
            <div className="absolute inset-0 hero-gradient" />
            <div className="absolute inset-0 hero-gradient-bottom" />

            <div className="relative z-10 flex items-end min-h-[500px] lg:min-h-[600px] p-6 lg:p-10">
              <div className="flex flex-col sm:flex-row gap-6 lg:gap-10 w-full">
                <div className="hidden sm:block flex-shrink-0">
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={movie.title}
                      className="w-48 lg:w-64 rounded-xl shadow-2xl border border-white/10"
                    />
                  ) : (
                    <div className="w-48 lg:w-64 aspect-[2/3] rounded-xl bg-muted flex items-center justify-center">
                      <Film className="w-16 h-16 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <h1 className="text-3xl lg:text-5xl font-bold text-foreground mb-2">{movie.title}</h1>
                    {movie.tagline && (
                      <p className="text-lg lg:text-xl text-muted-foreground italic">"{movie.tagline}"</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {movie.release_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(movie.release_date).getFullYear()}
                      </span>
                    )}
                    {movie.runtime > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatRuntime(movie.runtime)}
                      </span>
                    )}
                    {movie.original_language && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-4 h-4" />
                        {movie.original_language.toUpperCase()}
                      </span>
                    )}
                    {movie.vote_average > 0 && (
                      <span className="rating-badge">
                        <Star className="w-4 h-4 fill-current" />
                        {movie.vote_average.toFixed(1)}
                      </span>
                    )}
                  </div>

                  {movie.genres?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {movie.genres.map((genre) => (
                        <span key={genre.id} className="genre-tag">
                          {genre.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    {trailer ? (
                      <button onClick={() => setVideoModal(trailer)} className="btn-gold">
                        <Play className="w-5 h-5" />
                        Watch Trailer
                      </button>
                    ) : (
                      <button className="btn-secondary cursor-not-allowed opacity-60" disabled>
                        <Play className="w-5 h-5" />
                        No Trailer
                      </button>
                    )}

                    <button
                      onClick={handleWatchlistToggle}
                      className={inWatchlist ? "btn-gold-outline" : "btn-gold"}
                      disabled={watchlistLoading}
                    >
                      {inWatchlist ? (
                        <>
                          <Check className="w-5 h-5" />
                          In Watchlist
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          Add to Watchlist
                        </>
                      )}
                    </button>

                    <PreferenceButtons
                      value={preference}
                      onChange={handlePreferenceChange}
                      disabled={preferenceLoading}
                    />
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <span className="text-sm text-muted-foreground">Your Rating:</span>
                    <button
                      type="button"
                      onClick={openRatingModal}
                      className="btn-secondary"
                    >
                      {userRating ? `${userRating}/5` : "Rate this movie"}
                    </button>
                    {!user && <span className="text-xs text-muted-foreground ml-2">Login to rate</span>}
                  </div>

                  <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition pt-2"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* STATS */}
          <section className="px-6 lg:px-10 py-8">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="stat-item">
                <Star className="w-5 h-5 text-primary mb-1" />
                <span className="value">{movie.vote_average?.toFixed(1) || "N/A"}</span>
                <span className="label">TMDB Score</span>
              </div>
              <div className="stat-item">
                <Users className="w-5 h-5 text-cinema-info mb-1" />
                <span className="value">{movie.vote_count?.toLocaleString() || 0}</span>
                <span className="label">Votes</span>
              </div>
              <div className="stat-item">
                <TrendingUp className="w-5 h-5 text-cinema-orange mb-1" />
                <span className="value">{movie.popularity?.toFixed(0) || "N/A"}</span>
                <span className="label">Popularity</span>
              </div>
              <div className="stat-item">
                <DollarSign className="w-5 h-5 text-cinema-success mb-1" />
                <span className="value">{formatCurrency(movie.budget)}</span>
                <span className="label">Budget</span>
              </div>
              <div className="stat-item">
                <DollarSign className="w-5 h-5 text-cinema-gold mb-1" />
                <span className="value">{formatCurrency(movie.revenue)}</span>
                <span className="label">Revenue</span>
              </div>
              <div className="stat-item">
                <Film className="w-5 h-5 text-cinema-pink mb-1" />
                <span className="value">{movie.status || "N/A"}</span>
                <span className="label">Status</span>
              </div>
            </div>
          </section>

          <div className="cinema-divider mx-6 lg:mx-10" />

          {/* STORY */}
          <section className="px-6 lg:px-10 py-8">
            <h2 className="section-heading mb-4">Story</h2>
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <p className="text-foreground leading-relaxed text-lg">
                  {movie.overview || "No overview available."}
                </p>
              </div>
              <div className="space-y-4">
                {keywords.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Keywords</h3>
                    <div className="flex flex-wrap gap-2">
                      {keywords.slice(0, 10).map((kw) => (
                        <span key={kw.id} className="keyword-tag">
                          {kw.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="cinema-divider mx-6 lg:mx-10" />

          {/* PEOPLE */}
          <section className="px-6 lg:px-10 py-8">
            <div className="mb-8">
              <h2 className="section-heading mb-4">Crew</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {director && (
                  <div className="crew-item">
                    <span className="role">Director</span>
                    <span className="name">{director.name}</span>
                  </div>
                )}
                {writers?.map((w, i) => (
                  <div key={`${w.id}-${i}`} className="crew-item">
                    <span className="role">Writer</span>
                    <span className="name">{w.name}</span>
                  </div>
                ))}
                {producer && (
                  <div className="crew-item">
                    <span className="role">Producer</span>
                    <span className="name">{producer.name}</span>
                  </div>
                )}
                {composer && (
                  <div className="crew-item">
                    <span className="role">Music</span>
                    <span className="name">{composer.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="section-heading mb-4">Top Cast</h2>
              {credits?.cast?.length > 0 ? (
                <div className="scroll-rail">
                  {credits.cast.slice(0, 12).map((person) => (
                    <div key={person.id} className="cast-card">
                      {person.profile_path ? (
                        <img
                          src={`${TMDB_IMAGE_BASE}/w185${person.profile_path}`}
                          alt={person.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-24 h-24 mx-auto rounded-full bg-muted flex items-center justify-center">
                          <Users className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <p className="mt-2 text-sm font-medium text-foreground line-clamp-1">{person.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{person.character}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No cast information available.</p>
              )}
            </div>
          </section>

          <div className="cinema-divider mx-6 lg:mx-10" />

          {/* DISCOVERY */}
          <section className="px-6 lg:px-10 py-8 space-y-8">
            {similar.length > 0 && (
              <div>
                <h2 className="section-heading mb-4">Similar Movies</h2>
                <div className="scroll-rail">
                  {similar.slice(0, 10).map((m) => (
                    <MoviePosterCard key={m.id} movie={m} onClick={() => handleMovieClick(m.id)} />
                  ))}
                </div>
              </div>
            )}

            {recommendations.length > 0 && (
              <div>
                <h2 className="section-heading mb-4">Recommended For You</h2>
                <div className="scroll-rail">
                  {recommendations.slice(0, 10).map((m) => (
                    <MoviePosterCard key={m.id} movie={m} onClick={() => handleMovieClick(m.id)} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="cinema-divider mx-6 lg:mx-10" />

          {/* EXTRA INFO */}
          <section className="px-6 lg:px-10 py-8">
            <h2 className="section-heading mb-6">Additional Information</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="cinema-card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Release Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Release Date</span>
                    <span className="text-foreground">
                      {movie.release_date
                        ? new Date(movie.release_date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Runtime</span>
                    <span className="text-foreground">{formatRuntime(movie.runtime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span className="text-foreground">{movie.status || "N/A"}</span>
                  </div>
                </div>
              </div>

              <div className="cinema-card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Languages & Countries</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Original Language</span>
                    <span className="text-foreground">{movie.original_language?.toUpperCase() || "N/A"}</span>
                  </div>

                  {movie.spoken_languages?.length > 0 && (
                    <div>
                      <span className="text-muted-foreground block mb-1">Spoken Languages</span>
                      <span className="text-foreground">
                        {movie.spoken_languages.map((l) => l.english_name).join(", ")}
                      </span>
                    </div>
                  )}

                  {movie.production_countries?.length > 0 && (
                    <div>
                      <span className="text-muted-foreground block mb-1">Countries</span>
                      <span className="text-foreground">
                        {movie.production_countries.map((c) => c.name).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="cinema-card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">External Links</h3>
                <div className="space-y-2">
                  {movie.homepage && (
                    <a
                      href={movie.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-cinema-info hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Official Website
                    </a>
                  )}
                  {movie.imdb_id && (
                    <a
                      href={`https://www.imdb.com/title/${movie.imdb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-cinema-gold hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on IMDb
                    </a>
                  )}
                </div>
              </div>
            </div>

            {movie.production_companies?.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Production Companies
                </h3>
                <div className="flex flex-wrap gap-4">
                  {movie.production_companies.map((company) => (
                    <div
                      key={company.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary border border-border"
                    >
                      {company.logo_path ? (
                        <img
                          src={`${TMDB_IMAGE_BASE}/w92${company.logo_path}`}
                          alt={company.name}
                          className="h-6 w-auto object-contain brightness-0 invert opacity-80"
                        />
                      ) : (
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="text-sm text-foreground">{company.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {videoModal && (
        <VideoModal
          video={videoModal}
          onClose={() => setVideoModal(null)}
          autoplay={autoplayTrailers}
        />
      )}

      {ratingModalOpen && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !ratingSaving && setRatingModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--bg)] border border-border shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Rate this movie</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a rating from 1 to 5.
                </p>
              </div>
              <button
                type="button"
                className="h-9 w-9 rounded-full bg-white/5 border border-white/10 grid place-items-center hover:bg-white/10 transition"
                onClick={() => setRatingModalOpen(false)}
                aria-label="Close"
                disabled={ratingSaving}
              >
                <X className="h-4 w-4 text-foreground/70" />
              </button>
            </div>

            <div className="mt-5">
              <StarRating value={ratingDraft} onChange={setRatingDraft} disabled={ratingSaving} />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setRatingModalOpen(false)}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 text-foreground py-2.5 hover:bg-white/10 transition"
                disabled={ratingSaving}
              >
                Cancel
              </button>

              {userRating > 0 && (
                <button
                  type="button"
                  onClick={handleRatingRemove}
                  className="flex-1 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 py-2.5 hover:bg-red-500/25 transition"
                  disabled={ratingSaving}
                >
                  Remove Rating
                </button>
              )}

              <button
                type="button"
                disabled={!ratingDraft || ratingSaving}
                onClick={handleRatingSave}
                className="flex-1 rounded-xl bg-[#FFC105] text-black font-semibold py-2.5 hover:opacity-95 transition disabled:opacity-40"
              >
                Save Rating
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}
