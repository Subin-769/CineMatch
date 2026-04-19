import { useState } from "react";
import { Star, Plus, Check, Play, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { rateMovie, toggleWatchlist } from "../api/cineMatchApi";
import { useToast } from "../context/ToastContext";

export default function MovieCard({ movie, onToast, user, requireAuth, showPlay = true }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);

  const goDetails = () => {
    if (!movie.id) return;
    navigate(`/movie/${movie.id}`);
  };

  const onWatchlist = async (e) => {
    e.stopPropagation();

    if (!requireAuth?.(`/movie/${movie.id}`)) return;
    if (watchlistBusy) return;

    const nextValue = !isInWatchlist;
    setIsInWatchlist(nextValue);
    setWatchlistBusy(true);
    toast(nextValue ? "Added to watchlist!" : "Removed from watchlist!");

    try {
      const data = await toggleWatchlist(movie.id);
      setIsInWatchlist(data.in_watchlist);
      window.dispatchEvent(new Event("watchlist:changed"));
    } catch (err) {
      setIsInWatchlist(!nextValue);
      toast(err?.message || "Failed to update watchlist", "error");
    } finally {
      setWatchlistBusy(false);
    }
  };

  const onRate = async (rating) => {
    if (!requireAuth?.(`/movie/${movie.id}`)) return;
    if (ratingBusy) return;

    setSelectedStar(rating);
    setShowRating(false);
    setRatingBusy(true);
    toast(`Rated ${rating}/5`);

    try {
      await rateMovie(movie.id, rating);
    } catch (err) {
      setSelectedStar(0);
      toast(err?.message || "Failed to rate movie", "error");
    } finally {
      setRatingBusy(false);
    }
  };

  const ratingValue = movie.rating || "4.6";
  const displayStars = hoveredStar || selectedStar;
  const hasPoster = Boolean(movie.poster_url);

  return (
    <article
      data-card="movie"
      className="group/card w-full cursor-pointer select-none"
      onClick={goDetails}
    >
      <figure className="relative aspect-[2/3] overflow-hidden rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 shadow-[0_16px_50px_-30px_rgba(0,0,0,1)] transition-transform duration-300 group-hover/card:-translate-y-1">
        {hasPoster ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-900 p-4 text-center">
            <p className="text-sm font-semibold text-white/80 line-clamp-4">
              {movie.title}
            </p>
          </div>
        )}

        <figcaption className="absolute inset-0">
          {/* rating badge */}
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 rating-contrast">
            <div className="relative">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#FF4400]/20 via-white/10 to-transparent blur-md" />
              <div className="relative flex items-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-white/10 bg-black/55 px-2 py-1 sm:px-3 sm:py-1.5 backdrop-blur-sm">
                <div className="flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-lg sm:rounded-xl bg-white/10 border border-white/10">
                  <Star className="h-3 w-3 sm:h-4 sm:w-4 text-[#FF4400] fill-[#FF4400]" />
                </div>
                <div className="leading-none">
                  <p className="text-[10px] sm:text-[12px] font-semibold text-white">{ratingValue}</p>
                </div>
              </div>
            </div>
          </div>

          {/* hover overlay (GPU hint to reduce lag) */}
          <section className="movie-card-hover absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 transform-gpu">
            <div className="flex flex-col items-center gap-3">
              {/* view details */}
              {showPlay && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goDetails();
                  }}
                  className="h-14 w-14 rounded-full bg-[#FFC105] text-black shadow-lg shadow-black/40 hover:opacity-95 transition-opacity flex items-center justify-center"
                  aria-label="View Details"
                >
                  <Play className="h-6 w-6" />
                </button>
              )}

              {/* watchlist (less blur, more opacity => faster) */}
              <button
                type="button"
                onClick={onWatchlist}
                className="h-10 min-w-[140px] rounded-xl bg-white/20 backdrop-blur-sm text-white font-medium hover:bg-white/25 transition-colors border border-white/10 flex items-center justify-center gap-2 px-4 will-change-transform"
              >
                {isInWatchlist ? (
                  <>
                    <Check className="h-4 w-4" />
                    Watchlist
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Watchlist
                  </>
                )}
              </button>

              {/* rate */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!requireAuth?.(`/movie/${movie.id}`)) return;
                  setShowRating(true);
                }}
                className="h-10 min-w-[140px] rounded-xl bg-black/60 text-white font-medium hover:bg-black/70 transition-colors border border-white/10 flex items-center justify-center gap-2 px-4"
              >
                <Star className="h-4 w-4 text-[#FF4400]" />
                Rate
              </button>

              {!user && <p className="text-xs text-white/60">Login required</p>}
            </div>
          </section>

          {/* rating modal */}
          {showRating && (
            <section
              className="absolute inset-0 z-30 bg-black/95 flex flex-col items-center justify-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-white text-sm font-semibold">Rate this movie</p>

              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setHoveredStar(s)}
                    onMouseLeave={() => setHoveredStar(0)}
                    onClick={() => onRate(s)}
                    className="p-1"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        s <= displayStars
                          ? "text-[#FF4400] fill-[#FF4400]"
                          : "text-gray-500"
                      }`}
                    />
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowRating(false)}
                className="text-white/60 text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
            </section>
          )}
        </figcaption>
      </figure>

      {/* title */}
      <section className="mt-2 sm:mt-3">
        <h3 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem]">
          {movie.title}
        </h3>
        {movie.reason && (
          <p className="mt-1 text-[10px] sm:text-[11px] text-[#FFC105] truncate">
            {movie.reason}
          </p>
        )}
        <p className="text-[10px] sm:text-xs text-gray-400">
          {movie.year || "Unknown year"} • {movie.rating ?? "NR"}
        </p>
      </section>
    </article>
  );
}
