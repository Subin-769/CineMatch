import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Star,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { toggleWatchlist } from "../api/cineMatchApi";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../i18n";

function formatRating(rating) {
  if (rating == null) return null;
  const n = Number(rating);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

export default function FeaturedHero({
  movie,
  movies = [],
  onToast,
  user,
  requireAuth,
  autoPlayInterval = 6000,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();

  // slides: prefer movies[], fallback to single movie
  const slides = useMemo(() => {
    const arr = Array.isArray(movies) && movies.length ? movies : movie ? [movie] : [];
    const seen = new Set();
    return arr
      .filter(Boolean)
      .filter((m) => m?.id && !seen.has(m.id) && (seen.add(m.id), true))
      .slice(0, 8);
  }, [movies, movie]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);

  const goToSlide = useCallback(
    (index) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      setCurrentIndex(index);
      window.setTimeout(() => setIsTransitioning(false), 500);
    },
    [isTransitioning]
  );

  const goToPrevious = useCallback(() => {
    if (!slides.length) return;
    const newIndex = currentIndex === 0 ? slides.length - 1 : currentIndex - 1;
    goToSlide(newIndex);
  }, [currentIndex, slides.length, goToSlide]);

  const goToNext = useCallback(() => {
    if (!slides.length) return;
    const newIndex = currentIndex === slides.length - 1 ? 0 : currentIndex + 1;
    goToSlide(newIndex);
  }, [currentIndex, slides.length, goToSlide]);

  // autoplay
  useEffect(() => {
    if (autoPlayInterval <= 0 || slides.length <= 1) return;
    const t = window.setInterval(goToNext, autoPlayInterval);
    return () => window.clearInterval(t);
  }, [goToNext, autoPlayInterval, slides.length]);

  if (!slides.length) return null;

  const currentMovie = slides[currentIndex];
  const year = currentMovie?.release_year ?? currentMovie?.year ?? "";
  const rating = formatRating(currentMovie?.rating);
  const bg = currentMovie?.backdrop_url || currentMovie?.poster_url || "/placeholder.svg";
  const poster = currentMovie?.poster_url || currentMovie?.backdrop_url || "/placeholder.svg";

  const handleWatchlist = async () => {
    if (requireAuth && !requireAuth("/")) return;
    try {
      const res = await toggleWatchlist(currentMovie.id);
      toast(res?.message || "Updated watchlist", "success");
      window.dispatchEvent(new Event("watchlist:changed"));
    } catch {
      toast("Failed to update watchlist", "error");
    }
  };

  const openRate = () => {
    if (requireAuth && !requireAuth("/")) return;
    setSelectedRating(0);
    setHoveredRating(0);
    setRatingModalOpen(true);
  };

  const submitRating = () => {
    if (!selectedRating) return;
    toast(`You rated "${currentMovie.title}" ${selectedRating}/5`, "success");
    setRatingModalOpen(false);
    setSelectedRating(0);
    setHoveredRating(0);
  };

  const displayRating = hoveredRating || selectedRating;

  return (
    <>
      {/* Lovable-style hero slider */}
      <section className="hero-contrast relative w-full h-[50vh] sm:h-[60vh] md:h-[70vh] min-h-[350px] sm:min-h-[450px] md:min-h-[500px] max-h-[700px] overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 shadow-[0_25px_70px_-35px_rgba(0,0,0,0.95)]">
        {/* Background slides */}
        {slides.map((m, idx) => {
          const url = m?.backdrop_url || m?.poster_url || "/placeholder.svg";
          return (
            <div
              key={m.id}
              className={[
                "absolute inset-0 transition-all duration-700 ease-out",
                idx === currentIndex ? "opacity-100 scale-100" : "opacity-0 scale-105",
              ].join(" ")}
            >
              <img
                src={url}
                alt={m?.title || "Movie"}
                className="w-full h-full object-cover object-top"
                loading={idx === currentIndex ? "eager" : "lazy"}
                decoding="async"
                fetchpriority={idx === currentIndex ? "high" : "low"}
              />
            </div>
          );
        })}

        {/* Overlays (Lovable-like) */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/85 via-black/45 to-transparent" />

        {/* Content */}
        <div className="relative h-full flex items-end pb-14 sm:pb-20 px-4 sm:px-6 md:px-10">
          <div key={currentMovie.id} className="max-w-2xl space-y-3 sm:space-y-4">
            {/* Featured badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFC105]/12 border border-[#FFC105]/20 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-[#FFC105]" />
              <span className="text-xs font-semibold text-[#FFC105] uppercase tracking-wide">
                {t("hero.featuredToday")}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
              {currentMovie.title}
            </h1>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
              {year ? <span>{year}</span> : null}
              <span className="w-1 h-1 rounded-full bg-white/35" />
              <span>{currentMovie.genre || t("hero.movie")}</span>
              <span className="w-1 h-1 rounded-full bg-white/35" />

              <div className="flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-[#FFC105] text-[#FFC105]" />
                <span className="font-semibold text-white">{rating ?? "—"}</span>
                <span className="text-white/50">{t("hero.avgOutOf10")}</span>
              </div>
            </div>

            {/* Overview */}
            <p className="text-sm sm:text-base text-white/70 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl hidden sm:block">
              {currentMovie.description || t("hero.defaultDescription")}
            </p>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1 sm:pt-2">
              <button
                className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-95 transition text-sm sm:text-base"
                onClick={() => navigate(`/movie/${currentMovie.id}`)}
                type="button"
              >
                {t("hero.viewDetails")}
              </button>

              <button
                className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-white/10 border border-white/10 text-white font-semibold hover:bg-white/15 transition flex items-center gap-2 text-sm sm:text-base"
                onClick={handleWatchlist}
                type="button"
              >
                <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">{t("hero.watchlist")}</span>
              </button>

              <button
                className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-white/10 border border-white/10 text-white font-semibold hover:bg-white/15 transition flex items-center gap-2 text-sm sm:text-base"
                onClick={openRate}
                type="button"
              >
                <Star className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">{t("hero.rate")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom-right controls (dots + arrows) */}
        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 flex items-center gap-2 sm:gap-3">
          {/* Dots */}
          <div className="flex items-center gap-1.5 sm:gap-2 mr-2 sm:mr-3">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToSlide(idx)}
                className={[
                  "transition-all duration-300 rounded-full",
                  idx === currentIndex
                    ? "w-6 h-2 bg-[#FFC105]"
                    : "w-2 h-2 bg-white/30 hover:bg-white/50",
                ].join(" ")}
                aria-label={`Go to slide ${idx + 1}`}
                type="button"
              />
            ))}
          </div>

          {/* Arrow buttons */}
          <button
            type="button"
            onClick={goToPrevious}
            disabled={isTransitioning}
            className="h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-white/10 border border-white/10 text-white grid place-items-center hover:bg-white/15 transition disabled:opacity-50"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <button
            type="button"
            onClick={goToNext}
            disabled={isTransitioning}
            className="h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-white/10 border border-white/10 text-white grid place-items-center hover:bg-white/15 transition disabled:opacity-50"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </section>

      {/* Rating Modal (in-file, JSX) */}
      {ratingModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRatingModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#141414] border border-white/10 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Rate this movie</h3>
                <p className="text-sm text-white/55 mt-1">
                  Choose a rating from 1 to 5.
                </p>
              </div>
              <button
                type="button"
                className="h-9 w-9 rounded-full bg-white/5 border border-white/10 grid place-items-center hover:bg-white/10 transition"
                onClick={() => setRatingModalOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4 text-white/70" />
              </button>
            </div>

            <div className="flex gap-4 mt-4">
              <div className="w-24 h-36 rounded-lg overflow-hidden shrink-0 border border-white/10">
                <img src={poster} alt={currentMovie.title} className="w-full h-full object-cover" />
              </div>

              <div className="flex-1 space-y-2">
                <h4 className="font-semibold text-white">{currentMovie.title}</h4>
                <p className="text-sm text-white/55 line-clamp-4">
                  {currentMovie.description || "No description available."}
                </p>
              </div>
            </div>

            {/* Stars */}
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setHoveredRating(s)}
                    onMouseLeave={() => setHoveredRating(0)}
                    onClick={() => setSelectedRating(s)}
                    className="p-1 transition-transform hover:scale-110"
                    aria-label={`Rate ${s}`}
                  >
                    <Star
                      className={[
                        "h-8 w-8 transition-colors",
                        s <= displayRating ? "fill-[#FFC105] text-[#FFC105]" : "text-white/25",
                      ].join(" ")}
                    />
                  </button>
                ))}
              </div>

              <p className="text-center text-sm text-white/55 h-5">
                {displayRating === 1 && "Poor"}
                {displayRating === 2 && "Fair"}
                {displayRating === 3 && "Good"}
                {displayRating === 4 && "Very Good"}
                {displayRating === 5 && "Excellent"}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setRatingModalOpen(false)}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 text-white py-2.5 hover:bg-white/10 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={selectedRating === 0}
                onClick={submitRating}
                className="flex-1 rounded-xl bg-[#FFC105] text-black font-semibold py-2.5 hover:opacity-95 transition disabled:opacity-40"
              >
                Submit Rating
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
