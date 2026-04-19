import { useEffect, useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  Film,
  HardDrive,
  Key,
  MessageSquare,
  RefreshCw,
  Server,
  Settings2,
  Shield,
  Star,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

import AdminShell from "../components/admin/AdminShell";
import api from "../api/api";
import { formatNumber } from "../components/admin/adminUtils";

/* ── status dot ──────────────────────────────────────────────────── */

function StatusDot({ status }) {
  if (status === "connected") {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
    );
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-white/20" />;
}

/* ── skeleton ────────────────────────────────────────────────────── */

function PageSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="h-4 w-32 rounded bg-white/10" />
          <div className="mt-4 h-20 rounded-xl bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

/* ── integration card ────────────────────────────────────────────── */

const integrationIcons = {
  "TMDB API": Film,
  "Groq (AI Chat)": MessageSquare,
  "Gemini API": Brain,
  "Google OAuth": Shield,
};

function IntegrationCard({ integration }) {
  const isConnected = integration.status === "connected";
  const Icon = integrationIcons[integration.name] || Cloud;

  return (
    <div
      className={`group rounded-xl border p-4 transition ${
        isConnected
          ? "border-white/10 bg-white/[0.02] hover:border-white/15"
          : "border-dashed border-white/8 bg-white/[0.01]"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isConnected ? "bg-emerald-500/10" : "bg-white/[0.04]"
            }`}
          >
            <Icon className={`h-4.5 w-4.5 ${isConnected ? "text-emerald-400" : "text-white/30"}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{integration.name}</p>
            <p className="mt-0.5 text-xs text-white/45">{integration.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={integration.status} />
          <span
            className={`text-xs font-medium ${isConnected ? "text-emerald-400" : "text-white/30"}`}
          >
            {isConnected ? "Connected" : "Not configured"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── config row ──────────────────────────────────────────────────── */

function ConfigRow({ label, value, description }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.02] px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm text-white/75">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-white/35">{description}</p>}
      </div>
      <span className="shrink-0 rounded-md bg-white/[0.06] px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
        {value}
      </span>
    </div>
  );
}

/* ── data stat ───────────────────────────────────────────────────── */

function DataStat({ icon: Icon, label, value, color = "text-[#f6c000]" }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular-nums text-white">{formatNumber(value)}</p>
        <p className="text-[11px] text-white/40">{label}</p>
      </div>
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────────── */

export default function AdminSettings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await api.get("/admin/system-info/");
      setData(res.data);
      setLoadError("");
    } catch {
      setLoadError("System information is temporarily unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <AdminShell title="Settings" subtitle="System configuration and platform health.">
        <PageSkeleton />
      </AdminShell>
    );
  }

  const platform = data?.platform || {};
  const database = data?.database || {};
  const cacheInfo = data?.cache || {};
  const integrations = data?.integrations || [];
  const recommender = data?.recommender || {};
  const dataSummary = data?.data_summary || {};
  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <AdminShell
      title="Settings"
      subtitle="System configuration and platform health."
      lastUpdatedAt={data?.updated_at}
      isRefreshing={refreshing}
    >
      <div className="space-y-6">
        {loadError && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {loadError}
          </div>
        )}

        {/* ── Platform & Infrastructure ── */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Platform info */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6c000]/10">
                  <Server className="h-4.5 w-4.5 text-[#f6c000]" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Platform</h3>
                  <p className="text-xs text-white/45">Runtime environment details</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => load(true)}
                disabled={refreshing}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/50 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                aria-label="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="mt-5 space-y-2">
              <ConfigRow label="Application" value={platform.name || "CineMatch"} />
              <ConfigRow label="App Version" value={platform.version || "--"} />
              <ConfigRow label="Django" value={platform.django_version || "--"} />
              <ConfigRow label="Python" value={platform.python_version || "--"} />
              <ConfigRow
                label="Debug Mode"
                value={platform.debug_mode ? "ON" : "OFF"}
                description={platform.debug_mode ? "Not suitable for production" : "Production-ready"}
              />
            </div>
          </section>

          {/* Database & Cache */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10">
                <Database className="h-4.5 w-4.5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Database & Cache</h3>
                <p className="text-xs text-white/45">Storage infrastructure status</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-white/8 bg-white/[0.015] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="h-4 w-4 text-white/40" />
                    <span className="text-sm font-medium text-white">Database</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot status={database.status} />
                    <span
                      className={`text-xs font-medium ${
                        database.status === "connected" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {database.status === "connected" ? "Connected" : "Error"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <ConfigRow label="Engine" value={database.engine || "--"} />
                  <ConfigRow label="Name" value={database.name || "--"} />
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.015] p-4">
                <div className="flex items-center gap-2.5">
                  <Zap className="h-4 w-4 text-white/40" />
                  <span className="text-sm font-medium text-white">Cache</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  <ConfigRow label="Backend" value={cacheInfo.backend || "--"} />
                  <ConfigRow label="Default TTL" value={`${cacheInfo.timeout_seconds ?? 0}s`} />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── API Integrations ── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                <Key className="h-4.5 w-4.5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">API Integrations</h3>
                <p className="text-xs text-white/45">External service connections</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              {connectedCount === integrations.length ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span className="text-xs text-white/60">
                {connectedCount}/{integrations.length} connected
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {integrations.map((integration) => (
              <IntegrationCard key={integration.name} integration={integration} />
            ))}
          </div>
        </section>

        {/* ── Recommender Engine ── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f6c000]/10">
                <Settings2 className="h-4.5 w-4.5 text-[#f6c000]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Recommender Engine</h3>
                <p className="text-xs text-white/45">Signal weights and thresholds driving AI recommendations</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              <Brain className="h-3.5 w-3.5 text-[#f6c000]" />
              <span className="text-xs text-white/60">
                {recommender.active_models ?? 0} active / {recommender.total_models ?? 0} total
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* Signal weights */}
            <div>
              <p className="mb-3 text-[11px] uppercase tracking-wider text-white/35">Signal Weights</p>
              <div className="space-y-2">
                {recommender.weights &&
                  Object.entries(recommender.weights).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3.5 py-2.5">
                      <span className="text-sm text-white/65">
                        {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#f6c000] to-[#f97316]"
                            style={{ width: `${Math.min((value / 6) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-semibold tabular-nums text-white">
                          {value}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Thresholds */}
            <div>
              <p className="mb-3 text-[11px] uppercase tracking-wider text-white/35">Thresholds & Limits</p>
              <div className="space-y-2">
                <ConfigRow
                  label="High Rating Threshold"
                  value={`${recommender.high_rating_threshold ?? "--"}/10`}
                  description="Ratings at or above this are 'loved'"
                />
                <ConfigRow
                  label="Liked Rating Threshold"
                  value={`${recommender.liked_rating_threshold ?? "--"}/10`}
                  description="Ratings at or above this are 'liked'"
                />
                <ConfigRow
                  label="Recent Views Limit"
                  value={recommender.recent_views_limit ?? "--"}
                  description="Number of recent views used as seed signals"
                />
                <ConfigRow
                  label="Recs Per Request"
                  value={recommender.recommended_for_you_limit ?? "--"}
                  description="Movies returned per recommendation call"
                />
                <ConfigRow
                  label="Local Candidate Pool"
                  value={recommender.local_candidate_limit ?? "--"}
                  description="Max candidates from local DB before TMDB backfill"
                />
                <ConfigRow
                  label="TMDB Backfill Limit"
                  value={recommender.discover_backfill_limit ?? "--"}
                  description="Movies fetched from TMDB when local pool is thin"
                />
                <ConfigRow
                  label="Onboarding Genre Weight"
                  value={recommender.onboarding_genre_weight ?? "--"}
                  description="Boost for genres selected during onboarding"
                />
                <ConfigRow
                  label="Onboarding Vibe Weight"
                  value={recommender.onboarding_vibe_weight ?? "--"}
                  description="Boost for vibe preference from onboarding"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Data Overview ── */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Activity className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Data Overview</h3>
              <p className="text-xs text-white/45">Total records across the platform</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <DataStat icon={Users} label="Users" value={dataSummary.total_users ?? 0} color="text-sky-400" />
            <DataStat icon={Shield} label="Admins" value={dataSummary.admin_users ?? 0} color="text-violet-400" />
            <DataStat icon={Film} label="Movies" value={dataSummary.total_movies ?? 0} color="text-[#f6c000]" />
            <DataStat icon={Star} label="Ratings" value={dataSummary.total_ratings ?? 0} color="text-amber-400" />
            <DataStat icon={MessageSquare} label="Reviews" value={dataSummary.total_reviews ?? 0} color="text-pink-400" />
            <DataStat icon={Activity} label="Activities" value={dataSummary.total_activities ?? 0} color="text-emerald-400" />
            <DataStat icon={MessageSquare} label="Chat Sessions" value={dataSummary.total_chat_sessions ?? 0} color="text-cyan-400" />
            <DataStat icon={ChevronRight} label="Chat Messages" value={dataSummary.total_chat_messages ?? 0} color="text-orange-400" />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
