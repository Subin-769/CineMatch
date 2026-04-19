import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

export default function MovieRow({ title, subtitle, movies = [], onToast, user, requireAuth }) {
  const swiperRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const slides = useMemo(
    () => (Array.isArray(movies) ? movies.filter((m) => m?.id) : []),
    [movies]
  );

  if (!slides.length) return null;

  const updateEdges = (s) => {
    if (!s || !s.el) return;
    const el = s.el;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft;
    const atStartNow = left <= 2;
    const atEndNow = max <= 2 || left >= max - 2;
    setAtStart(atStartNow);
    setAtEnd(atEndNow);
  };

  return (
    <section className="w-full mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="min-w-0 flex-1 mr-2">
          <h2 className="text-base sm:text-xl font-semibold text-white truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs text-white/60 mt-1">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => swiperRef.current?.slidePrev()}
            disabled={atStart}
            className={`h-9 w-9 rounded-full border border-white/10 bg-black/60 backdrop-blur flex items-center justify-center transition
              ${!atStart ? "text-white hover:bg-black/80" : "text-white/30 cursor-not-allowed"}`}
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => swiperRef.current?.slideNext()}
            disabled={atEnd}
            className={`h-9 w-9 rounded-full border border-white/10 bg-black/60 backdrop-blur flex items-center justify-center transition
              ${!atEnd ? "text-white hover:bg-black/80" : "text-white/30 cursor-not-allowed"}`}
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Slider */}
      <div className="scroll-fade relative w-full">
        {!atStart && (
          <div className="scroll-fade-left pointer-events-none absolute left-0 top-0 bottom-0 w-14 z-10" />
        )}
        {!atEnd && (
          <div className="scroll-fade-right pointer-events-none absolute right-0 top-0 bottom-0 w-14 z-10" />
        )}

        <Swiper
          onSwiper={(s) => {
            swiperRef.current = s;
            updateEdges(s);
          }}
          onScroll={(s) => {
            updateEdges(s);
          }}
          onSlideChange={(s) => {
            updateEdges(s);
          }}
          onTransitionEnd={(s) => {
            updateEdges(s);
          }}
          cssMode={true}              // ✅ key: native smooth trackpad scrolling
          slidesPerView={"auto"}
          spaceBetween={16}
          speed={300}                 // not very relevant in cssMode, but fine
          grabCursor={true}
          simulateTouch={true}
          touchStartPreventDefault={false}
          style={{ paddingBottom: "8px", paddingRight: "8px" }}
        >
          {slides.map((movie) => (
            <SwiperSlide key={movie.id} className="!w-auto">
              <div className="w-36 sm:w-44 md:w-56">
                <MovieCard
                  movie={movie}
                  onToast={onToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        <style>{`
          /* hide scrollbar for cssMode (webkit) */
          .swiper-wrapper::-webkit-scrollbar { display: none; }
          .swiper { scrollbar-width: none; }
        `}</style>
      </div>
    </section>
  );
}
