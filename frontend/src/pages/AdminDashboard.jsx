import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Brain,
  Film,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import api from "../api/api";
import { useAuth } from "../auth/AuthContext";
import ActivityFeed from "../components/admin/ActivityFeed";
import { GenreDistributionChart, RecommendationTrendsChart } from "../components/admin/Charts";
import AdminShell from "../components/admin/AdminShell";
import LivePulse from "../components/admin/LivePulse";
import MeterBar from "../components/admin/MeterBar";
import RatingDistributionChart from "../components/admin/RatingDistributionChart";
import StatsCard from "../components/admin/StatsCard";
import UserGrowthChart from "../components/admin/UserGrowthChart";
import { formatCompact, formatNumber, formatPercent, formatTimeAgo } from "../components/admin/adminUtils";

const EMPTY_STATS = {
  total_users: 0,
  movies_indexed: 0,
  ai_accuracy: 0,
  engagement_rate: 0,
  changes: {},
};

const PULSE_INTERVAL_MS = 5000;
const FULL_POLL_INTERVAL_MS = 30000;

const normalizeGenres = (items) => {
  const genreItems = Array.isArray(items) ? items : [];
  const total = genreItems.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  return genreItems.map((item) => ({
    ...item,
    value: Number(item.value) || 0,
    percent: item.percent ?? (total ? Math.round(((Number(item.value) || 0) / total) * 100) : 0),
  }));
};

const normalizeActivity = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    user: item.user || item.username || "User",
    time: formatTimeAgo(item.timestamp),
  }));

const mergeActivityItems = (previous, next) => {
  const merged = new Map();
  [...next, ...previous].forEach((item) => {
    if (!item?.id || merged.has(item.id)) return;
    merged.set(item.id, item);
  });

  return Array.from(merged.values())
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
    .slice(0, 6);
};

const formatChange = (change) => {
  const value = Number(change?.value ?? 0);
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}% ${change?.label || "vs previous 30 days"}`;
};

const getChangeType = (change) => (change?.trend === "negative" ? "negative" : "positive");

export default function AdminDashboard() {
  const { user } = useAuth();
  const hasLoadedOnceRef = useRef(false);

  const [stats, setStats] = useState(EMPTY_STATS);
  const [trends, setTrends] = useState([]);
  const [genres, setGenres] = useState([]);
  const [topRecommended, setTopRecommended] = useState([]);
  const [activity, setActivity] = useState([]);
  const [pulse, setPulse] = useState(null);
  const [ratingDist, setRatingDist] = useState(null);
  const [userGrowth, setUserGrowth] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Fast polling: pulse data (every 5s)
  useEffect(() => {
    if (!user?.is_staff) return undefined;
    let isMounted = true;

    const loadPulse = async () => {
      try {
        const res = await api.get("/admin/realtime-pulse/");
        if (!isMounted) return;
        setPulse(res.data);
        setPulseLoading(false);
      } catch {
        // Silently degrade - pulse is optional
      }
    };

    void loadPulse();
    const id = window.setInterval(loadPulse, PULSE_INTERVAL_MS);
    return () => { isMounted = false; window.clearInterval(id); };
  }, [user]);

  // Full data polling (every 30s)
  useEffect(() => {
    if (!user?.is_staff) return undefined;
    let isMounted = true;

    const loadFullData = async (initialLoad = false) => {
      if (initialLoad) {
        setDashboardLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const [statsRes, recsRes, genresRes, activityRes, ratingRes, growthRes] = await Promise.all([
          api.get("/admin/stats/"),
          api.get("/admin/recommendations/"),
          api.get("/admin/genres/"),
          api.get("/admin/activity/"),
          api.get("/admin/rating-distribution/"),
          api.get("/admin/user-growth/"),
        ]);

        if (!isMounted) return;
        setLoadError("");
        setStats(statsRes.data || EMPTY_STATS);
        setTrends(Array.isArray(recsRes.data?.trends) ? recsRes.data.trends : []);
        setTopRecommended(Array.isArray(recsRes.data?.top_recommended) ? recsRes.data.top_recommended : []);
        setGenres(normalizeGenres(genresRes.data?.genres));
        setRatingDist(ratingRes.data || null);
        setUserGrowth(growthRes.data || null);

        const normalizedActivity = normalizeActivity(activityRes.data?.activity);
        setActivity((previous) => (initialLoad ? normalizedActivity : mergeActivityItems(previous, normalizedActivity)));
        setLastUpdatedAt(
          statsRes.data?.updated_at ||
            recsRes.data?.updated_at ||
            genresRes.data?.updated_at ||
            activityRes.data?.updated_at ||
            new Date().toISOString()
        );
        hasLoadedOnceRef.current = true;
      } catch {
        if (!isMounted) return;
        setLoadError("Live admin data is temporarily unavailable.");
        if (!hasLoadedOnceRef.current) {
          setStats(EMPTY_STATS);
          setTrends([]);
          setGenres([]);
          setTopRecommended([]);
          setActivity([]);
        }
      } finally {
        if (!isMounted) return;
        setDashboardLoading(false);
        setIsRefreshing(false);
      }
    };

    void loadFullData(true);
    const intervalId = window.setInterval(() => {
      void loadFullData(false);
    }, FULL_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [user]);

  const statsDisplay = useMemo(() => {
    const data = stats || EMPTY_STATS;
    return [
      {
        title: "Total Users",
        value: dashboardLoading ? null : formatNumber(data.total_users),
        change: formatChange(data.changes?.total_users),
        changeType: getChangeType(data.changes?.total_users),
        icon: Users,
      },
      {
        title: "Movies Indexed",
        value: dashboardLoading ? null : formatNumber(data.movies_indexed),
        change: formatChange(data.changes?.movies_indexed),
        changeType: getChangeType(data.changes?.movies_indexed),
        icon: Film,
      },
      {
        title: "AI Accuracy",
        value: dashboardLoading ? null : formatPercent(data.ai_accuracy),
        change: formatChange(data.changes?.ai_accuracy),
        changeType: getChangeType(data.changes?.ai_accuracy),
        icon: Brain,
      },
      {
        title: "Engagement Rate",
        value: dashboardLoading ? null : formatPercent(data.engagement_rate),
        change: formatChange(data.changes?.engagement_rate),
        changeType: getChangeType(data.changes?.engagement_rate),
        icon: Activity,
      },
    ];
  }, [dashboardLoading, stats]);

  return (
    <AdminShell
      title="Dashboard"
      subtitle="Real-time view of CineMatch engagement, recommendations, and catalog momentum."
      lastUpdatedAt={lastUpdatedAt}
      isRefreshing={isRefreshing}
    >
      <div className="space-y-6">
        {loadError ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {loadError}
          </div>
        ) : null}

        {/* Live Pulse - real-time today metrics */}
        <section className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6">
          <LivePulse data={pulse} isLoading={pulseLoading} />
        </section>

        {/* Summary stats cards */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {statsDisplay.map((card) => (
            <StatsCard key={card.title} {...card} />
          ))}
        </section>

        {/* User Growth + Rating Distribution row */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <UserGrowthChart
              data={userGrowth?.daily}
              totalPeriod={userGrowth?.total_period ?? 0}
              isLoading={dashboardLoading}
            />
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <RatingDistributionChart
              data={ratingDist?.distribution}
              totalRatings={ratingDist?.total_ratings ?? 0}
              avgRating={ratingDist?.avg_rating ?? 0}
              isLoading={dashboardLoading}
            />
          </div>
        </section>

        {/* Admin Flow + Activity Feed */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Admin Flow</p>
                <h2 className="mt-2 text-xl font-semibold">Jump into the live consoles</h2>
                <p className="mt-2 max-w-xl text-sm text-white/50">
                  Open the dedicated users and movies pages to inspect deeper tables, filters, and dynamic catalog health.
                </p>
              </div>
              <Sparkles className="h-5 w-5 text-[#f6c000]" />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Link
                to="/admin/users"
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#f6c000]/30 hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#433615] bg-[#2d2411] text-[#f6c000]">
                    <Users className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/75" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">Users Console</h3>
                <p className="mt-1 text-sm text-white/50">Track activity, onboarding completion, and account health in real time.</p>
              </Link>

              <Link
                to="/admin/movies"
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-sky-500/30 hover:bg-white/[0.05]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                    <Film className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/75" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">Movies Console</h3>
                <p className="mt-1 text-sm text-white/50">Monitor AI-ready catalog coverage, metadata gaps, and high-signal titles.</p>
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Recent Activity</h2>
                <p className="text-sm text-white/50">Live user interactions</p>
              </div>
              <span className="text-xs text-emerald-400">{isRefreshing ? "Syncing" : "Live"}</span>
            </div>
            <div className="mt-5">
              <ActivityFeed items={activity} isLoading={dashboardLoading} />
            </div>
          </div>
        </section>

        {/* Recommendation Trends + Genre Distribution */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div>
              <h2 className="text-base font-semibold">Recommendation Trends</h2>
              <p className="text-sm text-white/50">Monthly recommendation activity and model confidence.</p>
            </div>
            <div className="mt-4">
              <RecommendationTrendsChart data={trends} isLoading={dashboardLoading} />
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div>
              <h2 className="text-base font-semibold">Genre Distribution</h2>
              <p className="text-sm text-white/50">Top genres appearing in your current catalog.</p>
            </div>
            <div className="mt-5">
              <GenreDistributionChart data={genres} isLoading={dashboardLoading} />
            </div>
          </div>
        </section>

        {/* Top Recommended Titles */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Top Recommended Titles</h2>
              <p className="text-sm text-white/50">Movies with the strongest recommendation mix right now.</p>
            </div>
            <Link to="/admin/movies" className="text-sm text-[#f6c000] hover:text-[#ffd54d]">
              View movies
            </Link>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/40">
                  <th className="py-3 pr-2">Movie</th>
                  <th className="py-3 pr-2">Genre</th>
                  <th className="py-3 pr-2">AI Score</th>
                  <th className="py-3 pr-2">Signals</th>
                  <th className="py-3 pr-2">Trend</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {!dashboardLoading && topRecommended.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-white/45">
                      No recommendation data yet.
                    </td>
                  </tr>
                ) : null}
                {topRecommended.map((item) => (
                  <tr key={item.id || item.title} className="border-b border-white/5 last:border-b-0">
                    <td className="py-4 pr-2">
                      <div className="font-semibold text-white">{item.title}</div>
                    </td>
                    <td className="py-4 pr-2">
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/65">
                        {item.genre}
                      </span>
                    </td>
                    <td className="py-4 pr-2">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-[#f6c000]" />
                        <MeterBar value={item.score} compact />
                      </div>
                    </td>
                    <td className="py-4 pr-2">{formatCompact(item.recs)}</td>
                    <td className="py-4 pr-2">
                      {item.trend === "down" ? (
                        <TrendingDown className="h-4 w-4 text-rose-400" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
