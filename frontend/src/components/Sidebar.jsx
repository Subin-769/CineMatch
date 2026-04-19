import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Home,
  Film,
  Bookmark,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Compass,
  Clapperboard,
  Laugh,
  Ghost,
  Rocket,
} from "lucide-react";
import { useI18n } from "../i18n";

// ✅ Discover section (keep your real routes)
const discoverNav = [
  { icon: Home, labelKey: "nav.home", fallback: "Home", path: "/" },
  { icon: Compass, labelKey: "nav.allMovies", fallback: "All Movies", path: "/movies" },
  { icon: Bookmark, labelKey: "nav.watchlist", fallback: "Watchlist", path: "/watchlist" },
];

// ✅ TMDB Genre IDs (your logic)
const genreNav = [
  { id: 28, icon: Clapperboard, labelKey: "genre.action", fallback: "Action" },
  { id: 35, icon: Laugh, labelKey: "genre.comedy", fallback: "Comedy" },
  { id: 27, icon: Ghost, labelKey: "genre.horror", fallback: "Horror" },
  { id: 878, icon: Rocket, labelKey: "genre.scifi", fallback: "Sci-Fi" },
];

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const root = document.documentElement;
    const updateWidth = () => {
      // On mobile (<1024px), sidebar doesn't push content
      if (window.innerWidth < 1024) {
        root.style.setProperty("--sidebar-width", "0px");
      } else {
        const nextWidth = collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width-expanded)";
        root.style.setProperty("--sidebar-width", nextWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);

    return () => {
      window.removeEventListener("resize", updateWidth);
      root.style.setProperty("--sidebar-width", "0px");
    };
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // ✅ Update Movies page query param: /movies?genre=ID
  const goGenre = (genreId) => {
    const next = new URLSearchParams(searchParams);
    next.set("genre", String(genreId));

    // if not already on movies page, navigate there
    if (location.pathname !== "/movies") {
      navigate(`/movies?${next.toString()}`);
    } else {
      // already on movies -> just update params
      setSearchParams(next);
    }
  };

  const NavItemComponent = ({ item, showCollapsed }) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;

    return (
      <NavLink
        to={item.path}
        className={[
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
          isActive
            ? "bg-[#FFC105] text-black"
            : "text-white/70 hover:text-white hover:bg-white/5",
        ].join(" ")}
      >
        <Icon className={["h-5 w-5 shrink-0", isActive ? "text-black" : "text-white/70"].join(" ")} />
        {!showCollapsed && (
          <span className={["text-sm font-medium", isActive ? "text-black" : "text-white/90"].join(" ")}>
            {item.label}
          </span>
        )}
      </NavLink>
    );
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) onMobileClose();
  }, [location.pathname]);

  // On mobile, sidebar is always expanded (not collapsed)
  const isCollapsed = collapsed;

  const sidebarContent = (showCollapsed) => (
    <>
      {/* Logo */}
      <div
        className={[
          "flex items-center gap-3 px-4 h-16 border-b border-border",
          showCollapsed && "justify-center px-0",
        ].join(" ")}
      >
        <div className="w-9 h-9 rounded-lg bg-[#FFC105] flex items-center justify-center shrink-0 shadow-[0_10px_30px_rgba(255,193,5,0.20)]">
          <Film className="h-5 w-5 text-black" />
        </div>

        {!showCollapsed && (
          <div>
            <span className="font-bold text-lg text-[#FFC105] tracking-tight uppercase">
              CineMatch
            </span>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              {t("app.subtitle")}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {/* Discover */}
        {!showCollapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {t("app.discover")}
          </p>
        )}
        <div className="space-y-1">
          {discoverNav.map((item) => (
            <NavItemComponent
              key={item.path}
              item={{ ...item, label: t(item.labelKey) || item.fallback }}
              showCollapsed={showCollapsed}
            />
          ))}
        </div>

        {/* Genres */}
        <div className="mt-6">
          {!showCollapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {t("app.genres")}
          </p>
          )}

          <div className="space-y-1">
            {genreNav.map(({ id, icon: Icon, labelKey, fallback }) => (
              <button
                key={id}
                type="button"
                onClick={() => goGenre(id)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                  "text-white/70 hover:text-white hover:bg-white/5",
                  String(searchParams.get("genre") || "") === String(id) && location.pathname === "/movies"
                    ? "bg-white/5 ring-1 ring-[#FFC105]/25 text-white"
                    : "",
                  showCollapsed && "justify-center px-0",
                ].join(" ")}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!showCollapsed && (
                  <span className="text-sm font-medium">
                    {t(labelKey) || fallback}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* AI Curator Card */}
        <div
          className={[
            "mt-8 mx-1 rounded-xl bg-gradient-to-br from-[#FFC105]/12 to-[#FFC105]/5 border border-[#FFC105]/20",
            "shadow-[0_14px_35px_-22px_rgba(0,0,0,0.9)] transition-all duration-300",
            showCollapsed ? "p-2" : "p-4",
          ].join(" ")}
        >
          {showCollapsed ? (
            <NavLink
              to="/chatbot"
              className="w-full h-12 rounded-lg bg-[#FFC105]/15 flex items-center justify-center hover:bg-[#FFC105]/25 transition"
              title={t("ai.curator")}
            >
              <Sparkles className="h-5 w-5 text-[#FFC105]" />
            </NavLink>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-[#FFC105]/15 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-[#FFC105]" />
                </div>
                <span className="font-semibold text-sm text-white">{t("ai.curator")}</span>
              </div>
              <p className="text-xs text-white/55 mb-3">{t("ai.curator.desc")}</p>

              <div className="relative group">
                <div
                  className="
                    pointer-events-none absolute -inset-0.5 rounded-xl
                    bg-[#FFC105]/40 blur-lg opacity-0
                    transition-all duration-300
                    group-hover:opacity-100
                  "
                />

                <NavLink
                  to="/chatbot"
                  className="
                    relative z-10 block w-full text-center
                    py-2.5 rounded-xl
                    bg-[#FFC105] text-black
                    text-sm font-semibold
                    transition-all duration-300
                    hover:-translate-y-[1px]
                    hover:shadow-[0_10px_30px_-14px_rgba(255,193,5,0.6)]
                    active:translate-y-0
                  "
                >
                  {t("ai.curator.cta")}
                </NavLink>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-border space-y-1">
        <NavItemComponent item={{ icon: Settings, label: t("nav.settings"), path: "/settings" }} showCollapsed={showCollapsed} />

        {/* Collapse toggle — desktop only */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={[
            "w-full items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
            "text-white/70 hover:text-white hover:bg-white/5",
            "hidden lg:flex",
            showCollapsed && "justify-center px-0",
          ].join(" ")}
        >
          {showCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span className="text-sm font-medium">{t("nav.collapse")}</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className={[
          "fixed left-0 top-0 h-screen flex-col transition-[width] duration-300 z-50",
          "bg-[var(--bg)] backdrop-blur-xl border-r border-border",
          "hidden lg:flex",
          isCollapsed ? "w-[72px]" : "w-[240px]",
        ].join(" ")}
      >
        {sidebarContent(isCollapsed)}
      </aside>

      {/* Mobile sidebar drawer — always expanded */}
      <aside
        className={[
          "fixed left-0 top-0 h-screen flex flex-col transition-transform duration-300 z-50",
          "bg-[var(--bg)] backdrop-blur-xl border-r border-border",
          "w-[260px] lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
