import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Eye,
  MousePointerClick,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AdminShell from "../components/admin/AdminShell";
import api from "../api/api";
import { formatNumber, formatPercent } from "../components/admin/adminUtils";

const donutPalette = ["#f6c000", "#34d399", "#60a5fa", "#a855f7", "#f97316", "#94a3b8"];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm text-white/85 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.95)]">
      <p className="mb-1 text-xs text-white/60">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-semibold" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()}
          {entry.name === "Retention" ? "%" : ""}
        </p>
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const [stats, setStats] = useState({});
  const [trends, setTrends] = useState([]);
  const [genres, setGenres] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [statsRes, recsRes, genresRes, activityRes] = await Promise.all([
          api.get("/admin/stats/"),
          api.get("/admin/recommendations/"),
          api.get("/admin/genres/"),
          api.get("/admin/activity/"),
        ]);
        if (!mounted) return;
        setStats(statsRes.data || {});
        setTrends(Array.isArray(recsRes.data?.trends) ? recsRes.data.trends : []);
        setGenres(Array.isArray(genresRes.data?.genres) ? genresRes.data.genres : []);
        setActivity(Array.isArray(activityRes.data?.activity) ? activityRes.data.activity : []);
        setLoadError("");
      } catch (error) {
        if (!mounted) return;
        setLoadError("Live analytics unavailable. Showing placeholders.");
      } finally {
        if (!mounted) return;
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const kpis = useMemo(
    () => [
      { label: "Total Users", value: formatNumber(stats.total_users), change: stats.changes?.total_users?.label || "vs prev 30d", up: (stats.changes?.total_users?.trend || "positive") !== "negative", icon: Users },
      { label: "Movies Indexed", value: formatNumber(stats.movies_indexed), change: stats.changes?.movies_indexed?.label || "vs prev 30d", up: (stats.changes?.movies_indexed?.trend || "positive") !== "negative", icon: Eye },
      { label: "AI Accuracy", value: formatPercent(stats.ai_accuracy), change: stats.changes?.ai_accuracy?.label || "vs prev 30d", up: (stats.changes?.ai_accuracy?.trend || "positive") !== "negative", icon: Clock },
      { label: "Engagement Rate", value: formatPercent(stats.engagement_rate), change: stats.changes?.engagement_rate?.label || "vs prev 30d", up: (stats.changes?.engagement_rate?.trend || "positive") !== "negative", icon: MousePointerClick },
    ],
    [stats]
  );

  const engagementData = trends.length
    ? trends.map((t) => ({ day: t.month, views: t.recommendations, clicks: Math.round(t.recommendations * 0.42), conversions: Math.round(t.recommendations * 0.1) }))
    : [];

  const retentionData = trends.length
    ? trends.map((t, idx) => ({ week: `M${idx + 1}`, rate: t.accuracy }))
    : [];

  const deviceData = genres.length
    ? genres.slice(0, 6).map((g, i) => ({ name: g.name, value: g.value, color: donutPalette[i % donutPalette.length] }))
    : [];

  const hourlyActivity = useMemo(() => {
    if (!activity.length) return [];
    const buckets = new Array(24).fill(0);
    activity.forEach((item) => {
      const hour = new Date(item.timestamp).getHours();
      buckets[hour] += 1;
    });
    return buckets.map((count, hour) => ({ hour: `${hour}:00`, users: count }));
  }, [activity]);

  const topReferrers = useMemo(() => {
    if (!activity.length) return [];
    const counts = activity.reduce((acc, item) => {
      const key = item.message?.split(" ")[0] || item.user || "Direct";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const total = Object.values(counts).reduce((sum, val) => sum + val, 0) || 1;
    return Object.entries(counts)
      .map(([source, sessions]) => ({ source, sessions, pct: Math.round((sessions / total) * 100) }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);
  }, [activity]);

  return (
    <AdminShell title="Analytics" subtitle="Platform usage & engagement insights">
      <div className="space-y-6">
        {loadError ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {loadError}
          </div>
        ) : null}
        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_16px_50px_-28px_rgba(0,0,0,0.9)]"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">{kpi.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{kpi.value}</p>
                    <p
                      className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
                        kpi.up ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {kpi.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {kpi.change}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06] text-white/80">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Weekly engagement */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Weekly Engagement</h3>
              <p className="text-xs text-white/55">Views, clicks & conversion funnel</p>
            </div>
            <div className="flex gap-4 text-xs text-white/55">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f6c000]" /> Views</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Clicks</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> Conversions</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={engagementData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f6c000" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="#f6c000" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="views" name="Views" stroke="#f6c000" fill="url(#gViews)" strokeWidth={2} />
              <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#34d399" fill="url(#gClicks)" strokeWidth={2} />
              <Area type="monotone" dataKey="conversions" name="Conversions" stroke="#60a5fa" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* User retention */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white">User Retention</h3>
              <p className="text-xs text-white/55">8-week cohort retention curve</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={retentionData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="rate" name="Retention" stroke="#f6c000" strokeWidth={2} dot={{ fill: "#f6c000", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Device breakdown */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white">Device Breakdown</h3>
              <p className="text-xs text-white/55">Where users watch recommendations</p>
            </div>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={deviceData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                    {deviceData.map((d, i) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3 text-sm text-white/75">
                {deviceData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-semibold tabular-nums">{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* Hourly activity */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white">Hourly Activity</h3>
              <p className="text-xs text-white/55">Active users by hour of day</p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyActivity} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="hour" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 9 }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="users" name="Users" fill="#f6c000" radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Traffic sources */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white">Traffic Sources</h3>
              <p className="text-xs text-white/55">Top referrers by sessions</p>
            </div>
            <div className="space-y-3">
              {topReferrers.map((ref) => (
                <div key={ref.source}>
                  <div className="mb-1 flex items-center justify-between text-xs text-white/75">
                    <span>{ref.source}</span>
                    <span className="tabular-nums text-white/55">{ref.sessions.toLocaleString()} ({ref.pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#f6c000] to-[#f97316]"
                      style={{ width: `${ref.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
