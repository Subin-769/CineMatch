import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  PauseCircle,
  Target,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AdminShell from "../components/admin/AdminShell";
import api from "../api/api";
import {
  formatNumber,
  formatPercent,
  formatTimeAgo,
} from "../components/admin/adminUtils";

/* ── helpers ─────────────────────────────────────────────────────── */

const modelPalette = ["#f6c000", "#34d399", "#60a5fa", "#f97316", "#a855f7"];

function fmtMs(v) {
  if (v == null) return "--";
  return `${Number(v).toFixed(0)}ms`;
}

const statusConfig = {
  active: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/12 border-emerald-500/20" },
  training: { icon: Loader2, color: "text-amber-400", bg: "bg-amber-500/12 border-amber-500/20" },
  inactive: { icon: PauseCircle, color: "text-white/40", bg: "bg-white/[0.05] border-white/10" },
};

/* ── tooltip ─────────────────────────────────────────────────────── */

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm shadow-[0_16px_40px_-24px_rgba(0,0,0,0.95)]">
      <p className="mb-1.5 text-xs text-white/50">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="font-semibold" style={{ color: entry.color }}>
          {entry.name}: {Number(entry.value).toFixed(1)}%
        </p>
      ))}
    </div>
  );
}

/* ── skeleton ────────────────────────────────────────────────────── */

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="h-3 w-20 rounded bg-white/10" />
            <div className="mt-3 h-8 w-16 rounded bg-white/10" />
            <div className="mt-2 h-3 w-28 rounded bg-white/10" />
          </div>
        ))}
      </div>
      <div className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="h-[260px] rounded-xl bg-white/[0.04]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex gap-4">
              <div className="h-12 w-12 rounded-xl bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-white/10" />
                <div className="h-3 w-64 rounded bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────────── */

export default function AdminAIModels() {
  const [summary, setSummary] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await api.get("/admin/model-metrics/");
        if (!mounted) return;
        setModels(Array.isArray(res.data?.models) ? res.data.models : []);
        setSummary(res.data?.summary || {});
        setLoadError("");
      } catch {
        if (!mounted) return;
        setLoadError("Model metrics unavailable right now.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  // Auto-select first model for chart
  useEffect(() => {
    if (!models.length) return;
    if (!selectedModelId || !models.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  /* ── derived data ── */

  const kpis = useMemo(() => {
    if (!summary) return [];
    return [
      {
        label: "Active Models",
        value: summary.active_models ?? 0,
        fmt: formatNumber,
        icon: Cpu,
        sub: `${formatNumber(summary.total_models ?? 0)} total registered`,
      },
      {
        label: "Avg Accuracy",
        value: summary.avg_accuracy ?? 0,
        fmt: (v) => formatPercent(v),
        icon: Target,
        sub: `${formatNumber(summary.total_predictions_today ?? 0)} predictions today`,
      },
      {
        label: "Avg Latency",
        value: summary.avg_response_time_ms ?? 0,
        fmt: fmtMs,
        icon: Zap,
        sub: "Backend recommendation time",
      },
      {
        label: "Total Predictions",
        value: summary.total_predictions_today ?? 0,
        fmt: formatNumber,
        icon: Activity,
        sub: "Served today across all models",
      },
    ];
  }, [summary]);

  const trendData = useMemo(() => {
    const byDate = new Map();
    models.forEach((model) => {
      model.accuracy_trend?.forEach((pt) => {
        const key = pt.date || pt.computed_at;
        if (!key) return;
        if (!byDate.has(key)) byDate.set(key, { date: key });
        byDate.get(key)[model.name] = pt.accuracy;
      });
    });
    return Array.from(byDate.values()).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
  }, [models]);

  const hasTrend = trendData.length > 0;

  /* ── render ── */

  if (loading) {
    return (
      <AdminShell title="AI Models" subtitle="Monitor recommendation models powering CineMatch.">
        <PageSkeleton />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="AI Models" subtitle="Monitor recommendation models powering CineMatch.">
      <div className="space-y-6">
        {loadError && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
            {loadError}
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{kpi.label}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{kpi.fmt(kpi.value)}</p>
                    <p className="mt-1 text-xs text-white/50">{kpi.sub}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                    <Icon className="h-4 w-4 text-[#f6c000]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Accuracy Trend Chart ── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Accuracy Over Time</h3>
              <p className="text-xs text-white/50">Model accuracy snapshots from training evaluations</p>
            </div>
            {models.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {models.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedModelId(m.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                      selectedModelId === m.id
                        ? "border-white/20 bg-white/10 text-white"
                        : "border-white/8 bg-transparent text-white/50 hover:text-white/75"
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: modelPalette[i % modelPalette.length] }}
                    />
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasTrend ? (
            <div className="mt-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    {models.map((m, i) => (
                      <linearGradient key={m.id} id={`grad-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={modelPalette[i % modelPalette.length]} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={modelPalette[i % modelPalette.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {models.map((m, i) => (
                    <Area
                      key={m.id}
                      type="monotone"
                      dataKey={m.name}
                      name={m.name}
                      stroke={modelPalette[i % modelPalette.length]}
                      fill={`url(#grad-${m.id})`}
                      strokeWidth={selectedModelId === m.id ? 2.5 : 1.5}
                      strokeOpacity={selectedModelId === m.id ? 1 : 0.4}
                      fillOpacity={selectedModelId === m.id ? 1 : 0.15}
                      dot={false}
                      activeDot={
                        selectedModelId === m.id
                          ? { r: 4, fill: modelPalette[i % modelPalette.length], stroke: "#0f0f0f", strokeWidth: 2 }
                          : false
                      }
                      connectNulls
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4 flex h-[200px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/45">
              Accuracy data builds as users interact with recommendations. More ratings = better snapshots.
            </div>
          )}
        </div>

        {/* ── Model Cards ── */}
        <div>
          <h3 className="mb-4 text-base font-semibold text-white">Model Registry</h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {models.length > 0 ? (
              models.map((model, i) => {
                const cfg = statusConfig[model.status] || statusConfig.inactive;
                const StatusIcon = cfg.icon;
                const accuracy = model.latest_accuracy;
                const isEstimated = model.latest_accuracy_metric_type === "catalog_quality";

                return (
                  <div
                    key={model.id}
                    className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/15 hover:bg-white/[0.035]"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-3.5">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${modelPalette[i % modelPalette.length]}15` }}
                      >
                        <Brain className="h-5 w-5" style={{ color: modelPalette[i % modelPalette.length] }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-sm font-semibold text-white">{model.name}</h4>
                          <span className="shrink-0 text-[11px] text-white/35">v{model.version}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/55">
                            {model.display_type}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {model.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {model.description && (
                      <p className="mt-3 text-xs leading-relaxed text-white/45">{model.description}</p>
                    )}

                    {/* Metrics grid */}
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-white/35">Accuracy</p>
                        <p className="mt-1 text-base font-semibold tabular-nums text-white">
                          {accuracy != null ? `${accuracy.toFixed(1)}%` : "--"}
                        </p>
                        {isEstimated && accuracy != null && (
                          <p className="text-[10px] text-white/30">estimated</p>
                        )}
                      </div>
                      <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-white/35">Latency</p>
                        <p className="mt-1 text-base font-semibold tabular-nums text-white">
                          {fmtMs(model.avg_response_time_ms)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-white/35">24h Reqs</p>
                        <p className="mt-1 text-base font-semibold tabular-nums text-white">
                          {formatNumber(model.predictions_last_24h ?? 0)}
                        </p>
                      </div>
                    </div>

                    {/* Accuracy bar */}
                    {accuracy != null && (
                      <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(accuracy, 100)}%`,
                              background: `linear-gradient(90deg, ${modelPalette[i % modelPalette.length]}, ${modelPalette[i % modelPalette.length]}88)`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-white/35">
                      <span>{formatNumber(model.total_predictions ?? 0)} total predictions</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {model.last_used ? formatTimeAgo(model.last_used) : "Never used"}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">
                No recommendation models registered yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
