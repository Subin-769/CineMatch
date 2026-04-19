import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Calendar,
  Save,
  LogOut,
  Eye,
  Star,
  Heart,
  Clock,
  Film,
  Bookmark,
  ChevronRight,
  TrendingUp,
  Award,
  Sparkles,
  Edit3,
  X,
  Check,
} from "lucide-react";
import { AuthContext } from "../auth/AuthContext";
import api from "../api/api";
import { fetchMyPreferences } from "../api/cineMatchApi";
import AppLayout from "../components/AppLayout";

function parseGenres(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

function ago(ts) {
  if (!ts) return "recently";
  const ms = Date.now() - new Date(ts).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function activityIcon(type) {
  if (type === "rated") return Star;
  if (type === "watchlist") return Bookmark;
  if (type === "loved") return Heart;
  return Film;
}

function activityColor(type) {
  if (type === "rated") return "#FFC105";
  if (type === "watchlist") return "#60a5fa";
  if (type === "loved") return "#EC4899";
  return "#a78bfa";
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, refreshMe, logout } = useContext(AuthContext);
  const [searchQuery, setSearchQuery] = useState("");

  const [form, setForm] = useState({ username: "", email: "" });
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [watchlist, setWatchlist] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      username: user.username || "",
      email: user.email || "",
    });
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user) return;
      try {
        const [wRes, rRes, prefs] = await Promise.all([
          api.get("/watchlist/"),
          api.get("/rating/my/"),
          fetchMyPreferences().catch(() => []),
        ]);

        if (mounted) {
          const wData = wRes.data;
          setWatchlist(Array.isArray(wData) ? wData : []);

          const rData = rRes.data;
          setRatings(Array.isArray(rData) ? rData : []);

          setPreferences(Array.isArray(prefs) ? prefs : []);
        }
      } catch {
        // keep profile screen stable
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [user]);

  const joinDate = user?.date_joined
    ? new Date(user.date_joined).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : "N/A";

  const memberDays = user?.date_joined
    ? Math.max(1, Math.floor((Date.now() - new Date(user.date_joined).getTime()) / 86400000))
    : 0;

  const avgRating = useMemo(() => {
    if (!ratings.length) return 0;
    const sum = ratings.reduce((a, r) => a + Number(r.rating || 0), 0);
    return Math.round((sum / ratings.length) * 10) / 10;
  }, [ratings]);

  const topGenres = useMemo(() => {
    const counts = {};
    [...watchlist, ...ratings].forEach((m) => {
      parseGenres(m.genres).forEach((g) => {
        counts[g] = (counts[g] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g, count]) => ({ name: g, count }));
  }, [watchlist, ratings]);

  const lovedCount = useMemo(
    () => preferences.filter((p) => p.preference === "love").length,
    [preferences]
  );

  const activities = useMemo(() => {
    const rated = ratings.map((r) => ({
      type: "rated",
      title: r.title,
      value: `${r.rating}/5`,
      time: ago(r.rated_at),
      when: new Date(r.rated_at).getTime(),
      poster: r.poster_url,
      tmdb_id: r.tmdb_id,
    }));
    const added = watchlist.map((w) => ({
      type: "watchlist",
      title: w.title,
      value: "saved",
      time: ago(w.added_at),
      when: new Date(w.added_at).getTime(),
      poster: w.poster_url,
      tmdb_id: w.tmdb_id,
    }));
    return [...rated, ...added].sort((a, b) => b.when - a.when).slice(0, 10);
  }, [ratings, watchlist]);

  const recentPosters = useMemo(() => {
    const all = [...ratings, ...watchlist]
      .filter((m) => m.poster_url)
      .sort((a, b) => {
        const aTime = new Date(a.rated_at || a.added_at || 0).getTime();
        const bTime = new Date(b.rated_at || b.added_at || 0).getTime();
        return bTime - aTime;
      });
    const seen = new Set();
    return all
      .filter((m) => {
        const id = m.tmdb_id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 6);
  }, [ratings, watchlist]);

  async function onSave() {
    setMsg("");
    setErr("");
    setSaving(true);
    try {
      await api.patch("/auth/me/", {
        username: form.username.trim(),
        email: form.email.trim(),
      });
      await refreshMe?.();
      setMsg("Profile updated successfully");
      setEditing(false);
      window.setTimeout(() => setMsg(""), 3000);
    } catch (e) {
      const detail = e.response?.data?.detail;
      setErr(detail || e.message || "Profile update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    await logout?.();
    navigate("/login");
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
              <User className="w-7 h-7 text-[#FFC105]" />
            </div>
            <h1 className="text-2xl font-bold">Login required</h1>
            <p className="text-white/60 mt-2 mb-6">Please login to access your profile.</p>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("redirectAfterLogin", "/profile");
                navigate("/login");
              }}
              className="px-6 py-3 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition"
            >
              Login
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const initials = (user.username || "U").slice(0, 2).toUpperCase();

  return (
    <AppLayout searchQuery={searchQuery} setSearchQuery={setSearchQuery}>
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <main className="pt-16">

          {/* ── Hero Banner ── */}
          <div className="relative overflow-hidden">
            {/* Background collage of recent posters */}
            <div className="absolute inset-0 flex">
              {recentPosters.slice(0, 6).map((m, i) => (
                <div key={m.tmdb_id} className="flex-1 relative overflow-hidden" style={{ opacity: 0.15 - i * 0.015 }}>
                  <img
                    src={m.poster_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
              {recentPosters.length === 0 && (
                <div className="flex-1 bg-gradient-to-br from-[#FFC105]/5 to-transparent" />
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#0f0f0f]/60 via-[#0f0f0f]/80 to-[#0f0f0f]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0f0f0f]/90 to-[#0f0f0f]/40" />

            <div className="relative px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-20 sm:pb-24 max-w-6xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-5 sm:gap-6">
                {/* Avatar */}
                <div className="relative">
                  <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#FFC105]/20 to-[#FFC105]/5 border-2 border-[#FFC105]/30 flex items-center justify-center shadow-[0_20px_60px_-20px_rgba(255,193,5,0.3)]">
                    <span className="text-3xl sm:text-4xl font-bold text-[#FFC105]">{initials}</span>
                  </div>
                  <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500 border-[3px] border-[#0f0f0f] flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  </div>
                </div>

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight truncate">
                    {user.username}
                  </h1>
                  <p className="text-sm sm:text-base text-white/50 mt-0.5 truncate">
                    {user.email || "No email set"}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 sm:mt-3">
                    <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-white/45">
                      <Calendar className="w-3.5 h-3.5" />
                      Joined {joinDate}
                    </span>
                    {memberDays > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-white/45">
                        <Clock className="w-3.5 h-3.5" />
                        {memberDays} day{memberDays !== 1 ? "s" : ""} on CineMatch
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 sm:gap-3 shrink-0 self-start sm:self-end">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition text-sm font-medium"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Edit Profile</span>
                    <span className="sm:hidden">Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/15 transition text-sm font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Main Content ── */}
          <div className="max-w-6xl px-4 sm:px-6 lg:px-8 -mt-10 sm:-mt-12 relative z-10 pb-12">

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => navigate("/ratings")}
                className="group rounded-2xl border border-white/10 bg-[#0f0f0f]/90 backdrop-blur-xl p-4 sm:p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#FFC105]/10 border border-[#FFC105]/20 flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFC105]" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl sm:text-2xl font-bold">{new Set(ratings.map((r) => r.tmdb_id)).size}</p>
                    <p className="text-[10px] sm:text-xs text-white/45 font-medium">Movies Watched</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate("/ratings")}
                className="group rounded-2xl border border-white/10 bg-[#0f0f0f]/90 backdrop-blur-xl p-4 sm:p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl sm:text-2xl font-bold">{ratings.length}</p>
                    <p className="text-[10px] sm:text-xs text-white/45 font-medium">Ratings Given</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate("/watchlist")}
                className="group rounded-2xl border border-white/10 bg-[#0f0f0f]/90 backdrop-blur-xl p-4 sm:p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl sm:text-2xl font-bold">{watchlist.length}</p>
                    <p className="text-[10px] sm:text-xs text-white/45 font-medium">In Watchlist</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate("/preferences")}
                className="group rounded-2xl border border-white/10 bg-[#0f0f0f]/90 backdrop-blur-xl p-4 sm:p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center shrink-0">
                    <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-pink-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl sm:text-2xl font-bold">{lovedCount}</p>
                    <p className="text-[10px] sm:text-xs text-white/45 font-medium">Movies Loved</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Two-column layout */}
            <div className="grid lg:grid-cols-3 gap-4 sm:gap-5 mt-5 sm:mt-6">

              {/* Left column (2/3) */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-5">

                {/* Recent Activity */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#FFC105]/10 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-[#FFC105]" />
                      </div>
                      <h2 className="text-sm sm:text-base font-semibold">Recent Activity</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate("/ratings")}
                      className="text-xs text-white/40 hover:text-white/60 transition inline-flex items-center gap-1"
                    >
                      View all <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.04]">
                    {activities.length === 0 ? (
                      <div className="px-5 py-10 text-center">
                        <Film className="w-8 h-8 text-white/15 mx-auto mb-3" />
                        <p className="text-sm text-white/40">No activity yet. Start exploring movies!</p>
                      </div>
                    ) : (
                      activities.map((a, i) => {
                        const Icon = activityIcon(a.type);
                        const color = activityColor(a.type);
                        return (
                          <button
                            key={`${a.type}-${a.title}-${i}`}
                            type="button"
                            onClick={() => a.tmdb_id && navigate(`/movie/${a.tmdb_id}`)}
                            className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-white/[0.02] transition text-left"
                          >
                            {a.poster ? (
                              <div className="w-8 h-12 sm:w-9 sm:h-[54px] rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                <img src={a.poster} alt="" className="w-full h-full object-cover" loading="lazy" />
                              </div>
                            ) : (
                              <div className="w-8 h-12 sm:w-9 sm:h-[54px] rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                <Film className="w-3.5 h-3.5 text-white/20" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm font-medium text-white/90 truncate">{a.title}</p>
                              <p className="text-[10px] sm:text-xs text-white/40 mt-0.5 flex items-center gap-1.5">
                                <Icon className="w-3 h-3" style={{ color }} />
                                <span className="capitalize">{a.type}</span>
                                <span style={{ color }}>{a.value}</span>
                              </p>
                            </div>
                            <span className="text-[10px] sm:text-xs text-white/30 shrink-0">{a.time}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Quick Navigation */}
                <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {[
                    { label: "Watchlist", desc: `${watchlist.length} saved`, icon: Bookmark, path: "/watchlist", color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.15)" },
                    { label: "Ratings", desc: `${ratings.length} rated`, icon: Star, path: "/ratings", color: "#FFC105", bg: "rgba(255,193,5,0.08)", border: "rgba(255,193,5,0.15)" },
                    { label: "Preferences", desc: `${preferences.length} movies`, icon: Heart, path: "/preferences", color: "#EC4899", bg: "rgba(236,72,153,0.08)", border: "rgba(236,72,153,0.15)" },
                    { label: "AI Curator", desc: "Get picks", icon: Sparkles, path: "/chatbot", color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.15)" },
                  ].map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className="group rounded-2xl p-3.5 sm:p-4 text-left border transition-all hover:scale-[1.02]"
                      style={{ background: item.bg, borderColor: item.border }}
                    >
                      <item.icon className="w-5 h-5 mb-2" style={{ color: item.color }} />
                      <p className="text-xs sm:text-sm font-semibold">{item.label}</p>
                      <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">{item.desc}</p>
                    </button>
                  ))}
                </section>
              </div>

              {/* Right column (1/3) */}
              <div className="space-y-4 sm:space-y-5">

                {/* Rating Summary */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Award className="w-4 h-4 text-amber-400" />
                    </div>
                    <h2 className="text-sm sm:text-base font-semibold">Rating Summary</h2>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-center">
                      <p className="text-3xl sm:text-4xl font-extrabold text-[#FFC105]">
                        {avgRating || "—"}
                      </p>
                      <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">Avg Rating</p>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = ratings.filter((r) => Number(r.rating) === star).length;
                        const pct = ratings.length ? (count / ratings.length) * 100 : 0;
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="text-[10px] sm:text-xs text-white/40 w-3 text-right">{star}</span>
                            <Star className="w-3 h-3 text-[#FFC105] fill-[#FFC105]" />
                            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#FFC105] transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-white/30 w-5 text-right">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[10px] sm:text-xs text-white/30">
                    Based on {ratings.length} rating{ratings.length !== 1 ? "s" : ""}
                  </p>
                </section>

                {/* Favorite Genres */}
                <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <Film className="w-4 h-4 text-purple-400" />
                      </div>
                      <h2 className="text-sm sm:text-base font-semibold">Top Genres</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate("/movies")}
                      className="text-[10px] sm:text-xs text-white/40 hover:text-white/60 transition"
                    >
                      Explore
                    </button>
                  </div>

                  {topGenres.length > 0 ? (
                    <div className="space-y-2">
                      {topGenres.map((g, i) => {
                        const maxCount = topGenres[0]?.count || 1;
                        const pct = (g.count / maxCount) * 100;
                        return (
                          <div key={g.name} className="flex items-center gap-3">
                            <span className="text-[10px] text-white/25 w-4 text-right font-mono">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs sm:text-sm font-medium text-white/80 truncate">{g.name}</span>
                                <span className="text-[10px] text-white/30 shrink-0 ml-2">{g.count}</span>
                              </div>
                              <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-purple-500/60 to-purple-400/40 transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-white/30 text-center py-4">
                      Rate or save movies to see your genre breakdown
                    </p>
                  )}
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Edit Profile Modal ── */}
      {editing && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setEditing(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#141414] border border-white/10 shadow-2xl p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/40 font-medium mb-1.5 block">Username</label>
                <input
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 outline-none focus:border-[#FFC105]/40 transition text-sm"
                  placeholder="Username"
                  value={form.username}
                  onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-white/40 font-medium mb-1.5 block">Email</label>
                <input
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 outline-none focus:border-[#FFC105]/40 transition text-sm"
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>

            {msg && (
              <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400">
                <Check className="w-4 h-4" />
                {msg}
              </div>
            )}
            {err && <p className="text-sm text-red-400 mt-3">{err}</p>}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 text-white py-2.5 hover:bg-white/10 transition text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-[#FFC105] text-black font-semibold py-2.5 hover:opacity-95 transition disabled:opacity-60 text-sm inline-flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#141414] border border-white/10 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <LogOut className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Sign Out</h3>
                <p className="text-sm text-white/50">Are you sure you want to sign out?</p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 text-white py-2.5 hover:bg-white/10 transition text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex-1 rounded-xl bg-red-500 text-white font-semibold py-2.5 hover:bg-red-600 transition text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
