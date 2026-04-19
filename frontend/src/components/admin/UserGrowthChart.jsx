import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm shadow-[0_16px_40px_-24px_rgba(0,0,0,0.95)]">
      <p className="text-xs text-white/60">{label}</p>
      <p className="mt-1 font-semibold text-emerald-400">
        {payload[0].value} signup{payload[0].value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export default function UserGrowthChart({ data, totalPeriod = 0, isLoading = false }) {
  if (isLoading) {
    return <div className="h-[140px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-sm text-white/50">
        No signup data yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">User Growth</h3>
          <p className="text-xs text-white/50">Daily signups over the last 14 days</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold tabular-nums text-white">{totalPeriod}</span>
          <p className="text-[11px] text-white/40">total signups</p>
        </div>
      </div>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="signups"
              stroke="#34d399"
              fill="url(#growthFill)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#34d399", stroke: "#0f0f0f", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
