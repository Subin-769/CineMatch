import { useContext, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Film,
  User,
  ChevronDown,
  LogOut,
  Heart,
  Star,
  ArrowRight,
  Settings,
  LogIn,
  UserPlus,
  Bookmark,
  Sparkles,
  Menu,
} from "lucide-react";
import { AuthContext } from "../auth/AuthContext";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../i18n";
import { API_BASE } from "../api/apiBase";

export default function Topbar({ searchQuery, setSearchQuery, onMenuClick }) {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout } = useContext(AuthContext);
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [popular, setPopular] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingPopular, setLoadingPopular] = useState(false);

  const effectiveSearchQuery = typeof searchQuery === "string" ? searchQuery : localSearchQuery;
  const setEffectiveSearchQuery =
    typeof setSearchQuery === "function" ? setSearchQuery : setLocalSearchQuery;

  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  // Logout confirm
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    function onBackendOffline(e) {
      const msg = e?.detail?.message || "Backend offline. Please try again.";
      showToast(msg, "error");
    }
    window.addEventListener("backend:offline", onBackendOffline);
    return () => window.removeEventListener("backend:offline", onBackendOffline);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e) {
      const menuEl = menuRef.current;
      const searchEl = searchRef.current;
      if (menuEl && !menuEl.contains(e.target)) setOpen(false);
      if (searchEl && !searchEl.contains(e.target)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Fetch helper with refresh-on-401
  async function fetchWithRefresh(url, options = {}) {
    const opts = { credentials: "include", ...options };
    let res = await fetch(url, opts);

    if (res.status === 401) {
      const r = await fetch(`${API_BASE}/auth/refresh/`, {
        method: "POST",
        credentials: "include",
      });

      if (r.ok) {
        res = await fetch(url, opts);
      }
    }
    return res;
  }

  // Load watchlist count when user logs in + when watchlist changes
  useEffect(() => {
    async function loadCount() {
      if (!user) {
        setWatchlistCount(0);
        return;
      }

      try {
        const res = await fetchWithRefresh(`${API_BASE}/watchlist/count/`);
        if (!res.ok) return;
        const data = await res.json();
        setWatchlistCount(typeof data.count === "number" ? data.count : 0);
      } catch {
        window.dispatchEvent(
          new CustomEvent("backend:offline", {
            detail: {
              message: "Backend offline. Start the Django server on http://127.0.0.1:8000.",
            },
          })
        );
      }
    }

    loadCount();

    const onChanged = () => loadCount();
    window.addEventListener("watchlist:changed", onChanged);
    return () => window.removeEventListener("watchlist:changed", onChanged);
  }, [user]);

  // Confirmed logout action
  async function confirmLogout() {
    try {
      await logout?.();
    } finally {
      setShowLogoutConfirm(false);
      setOpen(false);

      setWatchlistCount(0);
      navigate("/");
      showToast(t("topbar.signedOut"));
    }
  }

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  function handleProfileClick() {
    if (authLoading) return;
    setOpen((v) => !v);
  }

  function handlePrimaryAction() {
    if (!user) {
      setOpen(true);
      return;
    }
    navigate("/watchlist");
  }

  async function fetchPopular() {
    if (loadingPopular) return;
    try {
      setLoadingPopular(true);
      const res = await fetch(
        `${API_BASE}/tmdb/discover/?sort_by=popularity.desc&page=1`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      const items = data.results || [];
      setPopular(items.slice(0, 6));
    } catch {
      setPopular([]);
    } finally {
      setLoadingPopular(false);
    }
  }

  async function fetchSuggestions(query) {
    const q = (query || "").trim();
    if (!q) {
      setSuggestions([]);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoadingSuggestions(true);
      const params = new URLSearchParams({ q, page: "1" });
      const res = await fetch(
        `${API_BASE}/tmdb/discover/?${params.toString()}`,
        { signal: controller.signal }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      const items = data.results || [];
      setSuggestions(items.slice(0, 6));
    } catch (err) {
      if (err?.name !== "AbortError") {
        setSuggestions([]);
      }
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function submitSearch() {
    const q = (effectiveSearchQuery || "").trim();
    if (!q) {
      navigate("/search");
      return;
    }
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (!searchOpen) return;
    const q = (effectiveSearchQuery || "").trim();
    if (!q) {
      fetchPopular();
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestions(q);
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [effectiveSearchQuery, searchOpen]);

  function submitSearch() {
    const q = (effectiveSearchQuery || "").trim();
    if (!q) {
      navigate("/search");
      return;
    }
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      {/* ✅ Lovable Layout: fixed bar aligned with sidebar width */}
      <header className="topbar-transition fixed top-0 left-0 lg:left-[var(--sidebar-width)] right-0 z-40 h-16 bg-[var(--bg)] backdrop-blur-xl border-b border-border transition-[left] duration-300">
        <div className="h-full flex items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMenuClick}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/5 transition shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-xl relative" ref={searchRef}>
            <div
              className={[
                "relative flex items-center rounded-full transition-all duration-200",
                "bg-white/5 border border-border",
                searchFocused ? "ring-1 ring-[#FFC105]/40 border-[#FFC105]/20" : "",
              ].join(" ")}
            >
              <Search className="absolute left-4 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                placeholder={t("topbar.searchPlaceholder")}
                value={effectiveSearchQuery}
                onChange={(e) => setEffectiveSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.isComposing) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitSearch();
                  }
                }}
                className="pl-11 pr-4 h-10 sm:h-11 w-full bg-transparent text-foreground rounded-full outline-none placeholder:text-white/35 text-sm sm:text-base"
                onFocus={() => {
                  setSearchFocused(true);
                  setSearchOpen(true);
                }}
                onBlur={() => setSearchFocused(false)}
              />
            </div>

            {searchOpen && (
              <div className="absolute mt-3 w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0b0b] shadow-[0_20px_50px_-28px_rgba(0,0,0,0.95)] overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-widest text-white/40">Recommendations</span>
                  <button
                    type="button"
                    onClick={submitSearch}
                    className="text-xs text-[#FFC105] hover:text-[#ffd24d] transition"
                  >
                    View all
                  </button>
                </div>

                {(loadingSuggestions || loadingPopular) && (
                  <div className="px-4 py-4 text-sm text-white/50">Loading suggestions...</div>
                )}

                {!(loadingSuggestions || loadingPopular) && (
                  <div className="py-2">
                    {(suggestions.length > 0 ? suggestions : popular).map((movie) => (
                      <button
                        key={movie.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          navigate(`/movie/${movie.id}`);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition"
                      >
                        <div className="w-10 h-14 rounded-md overflow-hidden bg-white/5 border border-white/10 shrink-0">
                          {movie.poster_url ? (
                            <img
                              src={movie.poster_url}
                              alt={movie.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="w-4 h-4 text-white/30" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/90 font-semibold truncate">
                            {movie.title || "Untitled"}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-white/50">
                            <span>{movie.year || "—"}</span>
                            {Number(movie.rating) > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Star className="w-3 h-3 text-[#FFC105]" />
                                {Number(movie.rating).toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-white/30" />
                      </button>
                    ))}

                    {suggestions.length === 0 && popular.length === 0 && (
                      <div className="px-4 py-4 text-sm text-white/50">
                        No recommendations yet.
                      </div>
                    )}

                    {effectiveSearchQuery.trim() && (
                      <button
                        type="button"
                        onClick={submitSearch}
                        className="w-full px-4 py-3 text-left text-sm text-[#FFC105] hover:bg-white/5 transition"
                      >
                        See all results for “{effectiveSearchQuery.trim()}”
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Primary Button */}
            {user ? (
              <button
                onClick={handlePrimaryAction}
                className="relative flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-full bg-white/5 border border-border text-foreground hover:bg-white/10 transition"
                title="Open your watchlist"
              >
                <Bookmark className="w-4 h-4 text-[#FFC105]" />
                <span className="font-semibold hidden sm:inline">{t("topbar.watchlist")}</span>
                <span className="ml-0.5 sm:ml-1 min-w-[24px] sm:min-w-[28px] text-center px-1.5 sm:px-2 py-0.5 rounded-full bg-[#FFC105] text-black text-xs font-bold">
                  {watchlistCount}
                </span>
              </button>
            ) : (
              /* Gold button with subtle glow like lovable */
              <div className="relative group">
                <div className="pointer-events-none absolute -inset-0.5 rounded-full bg-[#FFC105]/30 blur-lg opacity-0 transition-all duration-300 group-hover:opacity-100" />
                <button
                  onClick={handlePrimaryAction}
                  className="relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[#FFC105] text-black font-semibold hover:opacity-95 transition shadow-[0_10px_25px_-15px_rgba(255,193,5,0.45)]"
                >
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("topbar.getStarted")}</span>
                </button>
              </div>
            )}

            {/* Profile Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={handleProfileClick}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-2.5 py-2 rounded-full border border-border bg-white/5 hover:bg-white/10 transition"
                aria-label="User menu"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
              </button>

              {!authLoading && open && (
                <div className="absolute right-0 mt-3 w-64 rounded-xl bg-[var(--bg)] border border-border shadow-2xl overflow-hidden">
                  {/* Header */}
                  {user ? (
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm text-muted-foreground">{t("topbar.signedInAs")}</p>
                      <p className="text-sm font-semibold text-foreground">{user.username}</p>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-semibold text-foreground">{t("topbar.guest")}</p>
                      <p className="text-xs text-muted-foreground">{t("topbar.signinHint")}</p>
                    </div>
                  )}

                  {/* Guest menu */}
                  {!user && (
                    <>
                      <button
                        onClick={() => go("/login")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-foreground hover:bg-white/5 transition"
                      >
                        <LogIn className="w-4 h-4 text-muted-foreground" />
                        {t("topbar.login")}
                      </button>

                      <button
                        onClick={() => go("/register")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-foreground hover:bg-white/5 transition"
                      >
                        <UserPlus className="w-4 h-4 text-muted-foreground" />
                        {t("topbar.createAccount")}
                      </button>
                    </>
                  )}

                  {/* Logged-in menu */}
                  {user && (
                    <>
                      <button
                        onClick={() => go("/profile")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-foreground hover:bg-white/5 transition"
                      >
                        <User className="w-4 h-4 text-muted-foreground" />
                        {t("topbar.myProfile")}
                      </button>

                      <button
                        onClick={() => go("/watchlist")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-foreground hover:bg-white/5 transition"
                      >
                        <Heart className="w-4 h-4 text-muted-foreground" />
                        {t("topbar.myWatchlist")}
                      </button>

                      <button
                        onClick={() => go("/ratings")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-foreground hover:bg-white/5 transition"
                      >
                        <Star className="w-4 h-4 text-muted-foreground" />
                        {t("topbar.myRatings")}
                      </button>

                      <button
                        onClick={() => go("/preferences")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-foreground hover:bg-white/5 transition"
                      >
                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                        My Preferences
                      </button>

                      <button
                        onClick={() => go("/settings")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-foreground hover:bg-white/5 transition"
                      >
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        {t("topbar.settings")}
                      </button>

                      <div className="h-px bg-white/10" />

                      <button
                        onClick={() => setShowLogoutConfirm(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-400 hover:bg-white/5 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--bg)] border border-border shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">{t("topbar.signOutTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t("topbar.signOutConfirm")}</p>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl bg-white/5 border border-border text-foreground py-2.5 hover:bg-white/10 transition"
              >
                {t("topbar.cancel")}
              </button>

              <button
                type="button"
                onClick={confirmLogout}
                className="flex-1 rounded-xl bg-[#FFC105] text-black font-semibold py-2.5 hover:opacity-95 transition"
              >
                {t("topbar.logout")}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
