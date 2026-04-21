import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import FeaturedHero from "../components/FeaturedHero";
import MovieCarousel from "../components/MovieCarousel";
import MovieRow from "../components/MovieRow";
import {
  fetchBatchedPersonalized,
  fetchCriticallyAcclaimed,
  fetchContinueJourney,
  fetchHiddenGems,
  fetchLikedMovies,
  fetchLovedMovies,
  fetchRatedMovies,
  fetchWatchlistMovies,
  fetchFavoriteGenres,
  fetchDiscoverByGenre,
  fetchGuestRecommendations,
  fetchRecommendedForYou,
  fetchNewReleases,
  fetchSurpriseMovie,
  fetchTrendingInGenre,
  fetchTrendingMovies,
  invalidateRecommendationCache,
  logRecommendationTiming,
} from "../api/recommendations";
import { AuthContext } from "../auth/AuthContext";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../i18n";

function filterMoviesByQuery(movies, searchQuery) {
  const q = (searchQuery || "").trim().toLowerCase();
  if (!q) return movies;
  return (movies || []).filter((movie) => {
    const title = (movie.title || "").toLowerCase();
    const genre = (movie.genre || "").toLowerCase();
    return title.includes(q) || genre.includes(q);
  });
}

function LoadingRow({ title }) {
  return (
    <section className="w-full mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>
      <div className="min-h-[200px] sm:min-h-[270px]">
        <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="w-36 sm:w-44 md:w-56 shrink-0">
              <div className="relative aspect-[2/3] w-full rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/5 via-white/10 to-white/5" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-3 w-4/5 rounded-full bg-white/10 animate-pulse" />
                <div className="h-2.5 w-2/5 rounded-full bg-white/5 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user, loading } = useContext(AuthContext);
  const { t } = useI18n();

  const [searchQuery, setSearchQuery] = useState("");
  const showToast = useToast();

  const [trendingMovies, setTrendingMovies] = useState([]);
  const [newReleases, setNewReleases] = useState([]);
  const [recommendedMovies, setRecommendedMovies] = useState([]);
  const [recommendedExplanation, setRecommendedExplanation] = useState("");
  const [lovedMovies, setLovedMovies] = useState([]);
  const [lovedSeedTitle, setLovedSeedTitle] = useState(null);
  const [ratedMovies, setRatedMovies] = useState([]);
  const [ratedSeedTitle, setRatedSeedTitle] = useState(null);
  const [watchlistMovies, setWatchlistMovies] = useState([]);
  const [watchlistSeedTitle, setWatchlistSeedTitle] = useState(null);
  const [tasteMovies, setTasteMovies] = useState([]);

  // New sections
  const [trendingGenreMovies, setTrendingGenreMovies] = useState([]);
  const [trendingGenreName, setTrendingGenreName] = useState(null);
  const [continueMovies, setContinueMovies] = useState([]);
  const [continueSeedTitle, setContinueSeedTitle] = useState(null);
  const [surpriseMovies, setSurpriseMovies] = useState([]);
  const [surpriseExclude, setSurpriseExclude] = useState([]);
  const [likedMovies, setLikedMovies] = useState([]);
  const [likedSeedTitle, setLikedSeedTitle] = useState(null);
  const [hiddenGems, setHiddenGems] = useState([]);

  // Fallback flags — true when backend returned generic recs instead of personalized
  const [lovedFallback, setLovedFallback] = useState(false);
  const [likedFallback, setLikedFallback] = useState(false);
  const [ratedFallback, setRatedFallback] = useState(false);
  const [watchlistFallback, setWatchlistFallback] = useState(false);

  // Loading states
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingNewReleases, setLoadingNewReleases] = useState(true);
  const [loadingPersonalized, setLoadingPersonalized] = useState(false);
  const [loadingLoved, setLoadingLoved] = useState(false);
  const [loadingRated, setLoadingRated] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [loadingTaste, setLoadingTaste] = useState(false);
  const [loadingTrendingGenre, setLoadingTrendingGenre] = useState(false);
  const [loadingContinue, setLoadingContinue] = useState(false);
  const [loadingSurprise, setLoadingSurprise] = useState(false);
  const [loadingLiked, setLoadingLiked] = useState(false);
  const [loadingHiddenGems, setLoadingHiddenGems] = useState(false);

  const isMountedRef = useRef(true);

  const requireAuth = (redirectPath = "/") => {
    if (!user) {
      localStorage.setItem("redirectAfterLogin", redirectPath);
      navigate("/login");
      return false;
    }
    return true;
  };

  const loadPersonalized = async (ref) => {
    if (!user) {
      try {
        const fallbackMovies = await fetchGuestRecommendations(12);
        if (ref?.current) {
          setRecommendedMovies(fallbackMovies || []);
          setRecommendedExplanation("Sign in to unlock picks tailored to your taste.");
        }
      } catch {
        if (ref?.current) {
          setRecommendedMovies([]);
          setRecommendedExplanation("Sign in to unlock picks tailored to your taste.");
        }
      }
      if (ref?.current) setLovedMovies([]);
      if (ref?.current) setLovedSeedTitle(null);
      if (ref?.current) setRatedMovies([]);
      if (ref?.current) setWatchlistMovies([]);
      if (ref?.current) setTasteMovies([]);
      return;
    }
    setLoadingPersonalized(true);
    try {
      const startTime = performance.now();
      const data = await fetchRecommendedForYou(user?.id, 6);
      let movies = data.movies || [];
      let explanation = data.explanation?.reason_text || "";

      if (!movies.length) {
        movies = await fetchGuestRecommendations(12);
        explanation = explanation || "We are warming up your personal recommendations.";
      }

      if (ref?.current) {
        setRecommendedMovies(movies);
        setRecommendedExplanation(explanation);
        const endTime = performance.now();
        const bufferMs = Math.round(endTime - startTime);
        const recommendationTimeMs = Math.round(Number(data.meta?.response_time_ms || 0));
        const frontendRenderMs = Math.max(bufferMs - recommendationTimeMs, 0);

        void logRecommendationTiming({
          recommendation_time_ms: recommendationTimeMs,
          frontend_render_ms: frontendRenderMs,
          total_buffer_ms: bufferMs,
        }).catch(() => {});
      }
    } catch {
      // Silently fail — guest fallback or empty state is fine
    } finally {
      if (ref?.current) setLoadingPersonalized(false);
    }
  };

  const loadBatchedPersonalized = async (ref) => {
    if (!user) {
      if (ref?.current) {
        setLovedMovies([]); setLovedSeedTitle(null); setLovedFallback(false);
        setLikedMovies([]); setLikedSeedTitle(null); setLikedFallback(false);
        setRatedMovies([]); setRatedSeedTitle(null); setRatedFallback(false);
        setWatchlistMovies([]); setWatchlistSeedTitle(null); setWatchlistFallback(false);
      }
      return;
    }
    setLoadingLoved(true);
    setLoadingLiked(true);
    setLoadingRated(true);
    setLoadingWatchlist(true);
    try {
      const data = await fetchBatchedPersonalized(user?.id, 12);
      if (ref?.current) {
        setLovedMovies(data.loved.movies);
        setLovedSeedTitle(data.loved.seed_title);
        setLovedFallback(data.loved.fallback);

        setLikedMovies(data.liked.movies);
        setLikedSeedTitle(data.liked.seed_title);
        setLikedFallback(data.liked.fallback);

        setRatedMovies(data.rated.movies);
        setRatedSeedTitle(data.rated.seed_title);
        setRatedFallback(data.rated.fallback);

        setWatchlistMovies(data.watchlist.movies);
        setWatchlistSeedTitle(data.watchlist.seed_title);
        setWatchlistFallback(data.watchlist.fallback);
      }
    } catch { /* silently fail — fallback sections will show instead */ }
    finally {
      if (ref?.current) {
        setLoadingLoved(false);
        setLoadingLiked(false);
        setLoadingRated(false);
        setLoadingWatchlist(false);
      }
    }
  };

  const loadTaste = async (ref) => {
    setLoadingTaste(true);
    try {
      let ids = user ? await fetchFavoriteGenres(2) : [];
      if (!ids || ids.length === 0) {
        if (!user) {
          const fallback = await fetchCriticallyAcclaimed();
          if (ref?.current) setTasteMovies((fallback || []).slice(0, 12));
          return;
        }
        ids = [];
      }
      const rows = await Promise.allSettled(
        ids.map(async (genreId) => fetchDiscoverByGenre(genreId, "popularity.desc"))
      );
      const combined = [];
      const seen = new Set();
      rows.filter((r) => r.status === "fulfilled").forEach((r) => {
        (r.value || []).forEach((movie) => {
          if (!movie?.id || seen.has(movie.id)) return;
          seen.add(movie.id);
          combined.push(movie);
        });
      });
      if (ref?.current) setTasteMovies(combined.slice(0, 12));
    } catch { /* ignore */ }
    finally { if (ref?.current) setLoadingTaste(false); }
  };

  const loadTrendingGenre = async (ref) => {
    if (!user) return;
    setLoadingTrendingGenre(true);
    try {
      const data = await fetchTrendingInGenre(user?.id);
      if (ref?.current) {
        setTrendingGenreMovies(data.movies || []);
        setTrendingGenreName(data.genre_name || null);
      }
    } catch { /* ignore */ }
    finally { if (ref?.current) setLoadingTrendingGenre(false); }
  };

  const loadContinue = async (ref) => {
    if (!user) return;
    setLoadingContinue(true);
    try {
      const data = await fetchContinueJourney(user?.id);
      if (ref?.current) {
        setContinueMovies(data.movies || []);
        setContinueSeedTitle(data.seed_title || null);
      }
    } catch { /* ignore */ }
    finally { if (ref?.current) setLoadingContinue(false); }
  };

  const loadSurprise = useCallback(async (ref, exclude = []) => {
    if (!user) return;
    setLoadingSurprise(true);
    try {
      const data = await fetchSurpriseMovie(exclude);
      if (ref?.current) {
        setSurpriseMovies(data.movies || []);
        setSurpriseExclude((prev) => [...prev, ...(data.movies || []).map((m) => m.id)]);
      }
    } catch { /* ignore */ }
    finally { if (ref?.current) setLoadingSurprise(false); }
  }, [user]);

  const loadHiddenGems = async (ref) => {
    setLoadingHiddenGems(true);
    try {
      const data = await fetchHiddenGems(user?.id, 12);
      if (ref?.current) setHiddenGems(data.movies || []);
    } catch { /* ignore */ }
    finally { if (ref?.current) setLoadingHiddenGems(false); }
  };

  const handleShuffleSurprise = () => {
    loadSurprise(isMountedRef, surpriseExclude);
  };

  useEffect(() => {
    isMountedRef.current = true;
    setLoadingTrending(true);
    setLoadingNewReleases(true);
    setLoadingHiddenGems(true);

    const tier1 = fetchTrendingMovies(12).then((movies) => {
      if (isMountedRef.current) {
        setTrendingMovies(movies || []);
        setLoadingTrending(false);
      }
    }).catch(() => { if (isMountedRef.current) setLoadingTrending(false); });

    tier1.then(() =>
      fetchNewReleases(12).then((movies) => {
        if (isMountedRef.current) {
          setNewReleases(movies || []);
          setLoadingNewReleases(false);
        }
      }).catch(() => { if (isMountedRef.current) setLoadingNewReleases(false); })
    );

    // Hidden gems is far down the page — wait for the browser to be idle.
    const idleCb = (window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)));
    const idleHandle = idleCb(() => {
      if (isMountedRef.current) loadHiddenGems(isMountedRef);
    });

    return () => {
      isMountedRef.current = false;
      if (window.cancelIdleCallback && typeof idleHandle === "number") {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    isMountedRef.current = true;

    const run = async () => {
      // Tier 2a — top of personalized content (first thing user sees below hero/trending).
      await Promise.allSettled([
        loadPersonalized(isMountedRef),
        user ? loadBatchedPersonalized(isMountedRef) : Promise.resolve(),
      ]);
      if (!isMountedRef.current) return;

      // Tier 2b — secondary genre row.
      if (user) await loadTrendingGenre(isMountedRef);
      if (!isMountedRef.current) return;

      // Tier 3 — below the fold. Serialize to keep memory footprint low.
      if (user) await loadContinue(isMountedRef);
      if (!isMountedRef.current) return;
      if (user) await loadSurprise(isMountedRef, []);
      if (!isMountedRef.current) return;
      await loadTaste(isMountedRef);
    };

    run();
  }, [user?.id, loading]);

  useEffect(() => {
    if (!user?.id) return undefined;

    function onPrefsChanged() {
      invalidateRecommendationCache([
        `rfy_${user.id}_`,
        `batched_normalized_${user.id}_`,
        `trending_in_genre_${user.id}`,
        `continue_journey_${user.id}`,
        `hidden_gems_${user.id}_`,
      ]);
      loadPersonalized(isMountedRef);
      loadBatchedPersonalized(isMountedRef);
      loadTaste(isMountedRef);
      loadTrendingGenre(isMountedRef);
      loadContinue(isMountedRef);
      loadSurprise(isMountedRef, []);
      loadHiddenGems(isMountedRef);
    }

    function onWatchHistoryChanged() {
      invalidateRecommendationCache([
        `rfy_${user.id}_`,
        `continue_journey_${user.id}`,
      ]);
      loadPersonalized(isMountedRef);
      loadContinue(isMountedRef);
    }

    window.addEventListener("preferences:changed", onPrefsChanged);
    window.addEventListener("watch-history:changed", onWatchHistoryChanged);
    return () => {
      window.removeEventListener("preferences:changed", onPrefsChanged);
      window.removeEventListener("watch-history:changed", onWatchHistoryChanged);
    };
  }, [user?.id]);

  const filteredTrending = useMemo(() => filterMoviesByQuery(trendingMovies, searchQuery), [trendingMovies, searchQuery]);
  const filteredRecommended = useMemo(() => filterMoviesByQuery(recommendedMovies, searchQuery), [recommendedMovies, searchQuery]);
  const filteredLoved = useMemo(() => filterMoviesByQuery(lovedMovies, searchQuery), [lovedMovies, searchQuery]);
  const filteredLiked = useMemo(() => filterMoviesByQuery(likedMovies, searchQuery), [likedMovies, searchQuery]);
  const filteredRated = useMemo(() => filterMoviesByQuery(ratedMovies, searchQuery), [ratedMovies, searchQuery]);
  const filteredWatchlist = useMemo(() => filterMoviesByQuery(watchlistMovies, searchQuery), [watchlistMovies, searchQuery]);
  const filteredTaste = useMemo(() => filterMoviesByQuery(tasteMovies, searchQuery), [tasteMovies, searchQuery]);
  const filteredNewReleases = useMemo(() => filterMoviesByQuery(newReleases, searchQuery), [newReleases, searchQuery]);
  const filteredTrendingGenre = useMemo(() => filterMoviesByQuery(trendingGenreMovies, searchQuery), [trendingGenreMovies, searchQuery]);
  const filteredContinue = useMemo(() => filterMoviesByQuery(continueMovies, searchQuery), [continueMovies, searchQuery]);
  const filteredSurprise = useMemo(() => filterMoviesByQuery(surpriseMovies, searchQuery), [surpriseMovies, searchQuery]);
  const filteredHiddenGems = useMemo(() => filterMoviesByQuery(hiddenGems, searchQuery), [hiddenGems, searchQuery]);

  const featuredMovie = filteredTrending[0] || null;

  return (
    <AppLayout searchQuery={searchQuery} setSearchQuery={setSearchQuery}>
      <div className="min-h-screen bg-[#0f0f0f]">
        <main className="pt-16">
          <div className="p-4 sm:p-6 lg:p-8">
            {/* 1. Featured Hero */}
            <FeaturedHero
              movie={featuredMovie}
              movies={filteredTrending}
              onToast={showToast}
              user={user}
              requireAuth={requireAuth}
            />

            {/* 2. Trending Now */}
            {loadingTrending ? (
              <LoadingRow title="Trending Now" />
            ) : (
              <MovieRow
                title="Trending Now"
                movies={filteredTrending}
                onToast={showToast}
                user={user}
                requireAuth={requireAuth}
              />
            )}

            {/* 3. New Releases */}
            {loadingNewReleases ? (
              <LoadingRow title="New Releases" />
            ) : (
              <MovieRow
                title="New Releases"
                movies={filteredNewReleases}
                onToast={showToast}
                user={user}
                requireAuth={requireAuth}
              />
            )}

            {/* 4. Trending in [Top Genre] — auth only */}
            {user && (
              loadingTrendingGenre ? (
                <LoadingRow title={trendingGenreName ? `Trending in ${trendingGenreName}` : "Trending in Your Genre"} />
              ) : filteredTrendingGenre.length > 0 ? (
                <MovieRow
                  title={trendingGenreName ? `Trending in ${trendingGenreName}` : "Trending in Your Genre"}
                  movies={filteredTrendingGenre}
                  onToast={showToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              ) : null
            )}

            {/* 5. Continue Your Journey — auth only */}
            {user && (
              loadingContinue ? (
                <LoadingRow title="Continue Your Journey" />
              ) : filteredContinue.length > 0 ? (
                <MovieRow
                  title="Continue Your Journey"
                  subtitle={continueSeedTitle ? `Based on ${continueSeedTitle} and other movies you explored` : "Based on movies you recently explored"}
                  movies={filteredContinue}
                  onToast={showToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              ) : null
            )}

            {/* 6. Recommended For You */}
            {loading ? (
              <LoadingRow title="Recommended For You" />
            ) : loadingPersonalized ? (
              <LoadingRow title="Recommended For You" />
            ) : (
              <MovieCarousel
                title="Recommended For You"
                explanation={recommendedExplanation}
                movies={filteredRecommended}
                onToast={showToast}
                user={user}
                requireAuth={requireAuth}
              />
            )}

            {/* 7. Surprise Picks — auth only */}
            {user && (
              loadingSurprise ? (
                <LoadingRow title="Surprise Picks" />
              ) : filteredSurprise.length > 0 ? (
                <div className="relative">
                  <div className="absolute top-0 right-0 z-10 mt-1 mr-2">
                    <button
                      type="button"
                      onClick={handleShuffleSurprise}
                      className="px-4 py-1.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors border border-white/10"
                    >
                      Shuffle
                    </button>
                  </div>
                  <MovieRow
                    title="Surprise Picks"
                    subtitle="Movies you wouldn't expect to love"
                    movies={filteredSurprise}
                    onToast={showToast}
                    user={user}
                    requireAuth={requireAuth}
                  />
                </div>
              ) : null
            )}

            {/* 8. Because You Loved [Title] / Movies You Might Love — auth only */}
            {user && (
              loading || loadingLoved ? (
                <LoadingRow title={lovedSeedTitle ? `Because you loved ${lovedSeedTitle}` : "Movies You Might Love"} />
              ) : filteredLoved.length > 0 ? (
                <MovieRow
                  title={lovedFallback ? "Movies You Might Love" : (lovedSeedTitle ? `Because you loved ${lovedSeedTitle}` : "Movies You Might Love")}
                  subtitle={lovedFallback ? "Love a movie to get personalized picks here" : undefined}
                  movies={filteredLoved}
                  onToast={showToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              ) : null
            )}

            {/* 9. Because You Liked [Title] / Popular Picks — auth only */}
            {user && (
              loadingLiked ? (
                <LoadingRow title={likedSeedTitle ? `Because you liked ${likedSeedTitle}` : "Popular Right Now"} />
              ) : filteredLiked.length > 0 ? (
                <MovieRow
                  title={likedFallback ? "Popular Right Now" : (likedSeedTitle ? `Because you liked ${likedSeedTitle}` : "Based on Movies You Liked")}
                  subtitle={likedFallback ? "Like movies to unlock personalized recommendations" : undefined}
                  movies={filteredLiked}
                  onToast={showToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              ) : null
            )}

            {/* 10. Inspired by Your Ratings / Top Rated Picks — auth only */}
            {user && (
              loading || loadingRated ? (
                <LoadingRow title={ratedSeedTitle ? `Because you rated ${ratedSeedTitle}` : "Top Rated Picks"} />
              ) : filteredRated.length > 0 ? (
                <MovieRow
                  title={ratedFallback ? "Top Rated Picks" : (ratedSeedTitle ? `Because you rated ${ratedSeedTitle}` : "Inspired by Your Ratings")}
                  subtitle={ratedFallback ? "Rate movies to get recommendations based on your taste" : "Inspired by movies you rated highly"}
                  movies={filteredRated}
                  onToast={showToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              ) : null
            )}

            {/* 11. Because You Want to Watch / Worth Watching — auth only */}
            {user && (
              loading || loadingWatchlist ? (
                <LoadingRow title={watchlistSeedTitle ? `Because you saved ${watchlistSeedTitle}` : "Worth Adding to Your Watchlist"} />
              ) : filteredWatchlist.length > 0 ? (
                <MovieRow
                  title={watchlistFallback ? "Worth Adding to Your Watchlist" : (watchlistSeedTitle ? `Because you saved ${watchlistSeedTitle}` : "Because You Want to Watch")}
                  subtitle={watchlistFallback ? "Save movies to your watchlist for tailored suggestions" : "Similar to what's saved in your watchlist"}
                  movies={filteredWatchlist}
                  onToast={showToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              ) : null
            )}

            {/* 12. Picks For You */}
            {loading ? (
              <LoadingRow title="Picks For You" />
            ) : loadingTaste ? (
              <LoadingRow title="Picks For You" />
            ) : (
              filteredTaste.length > 0 ? (
                <MovieRow
                  title="Picks For You"
                  subtitle={user ? "Based on genres you keep coming back to" : "A few critically acclaimed picks to get you started"}
                  movies={filteredTaste}
                  onToast={showToast}
                  user={user}
                  requireAuth={requireAuth}
                />
              ) : null
            )}

            {/* 13. Hidden Gems */}
            {loadingHiddenGems ? (
              <LoadingRow title="Hidden Gems" />
            ) : filteredHiddenGems.length > 0 ? (
              <MovieRow
                title="Hidden Gems"
                subtitle="Critically acclaimed films you might have missed"
                movies={filteredHiddenGems}
                onToast={showToast}
                user={user}
                requireAuth={requireAuth}
              />
            ) : null}
          </div>
        </main>

      </div>
    </AppLayout>
  );
}
