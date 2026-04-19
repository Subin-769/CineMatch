import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const ratingColors = [
  "#ef4444", // 1
  "#f97316", // 2
  "#f97316", // 3
  "#eab308", // 4
  "#eab308", // 5
  "#a3e635", // 6
  "#22c55e", // 7
  "#34d399", // 8
  "#34d399", // 9
  "#10b981", // 10
];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2 text-sm shadow-[0_16px_40px_-24px_rgba(0,0,0,0.95)]">
      <p className="text-xs text-white/60">Rating {label}</p>
      <p className="mt-1 font-semibold text-[#f6c000]">
        {payload[0].value.toLocaleString()} rating{payload[0].value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

export default function RatingDistributionChart({
  data,
  totalRatings = 0,
  avgRating = 0,
  isLoading = false,
}) {
  if (isLoading) {
    return <div className="h-[180px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-white/50">
        No rating data yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Rating Distribution</h3>
          <p className="text-xs text-white/50">How users rate movies (1-10 scale)</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <span className="text-lg font-semibold tabular-nums text-white">{avgRating}</span>
            <p className="text-[11px] text-white/40">avg rating</p>
          </div>
          <div>
            <span className="text-lg font-semibold tabular-nums text-white">
              {totalRatings.toLocaleString()}
            </span>
            <p className="text-[11px] text-white/40">total</p>
          </div>
        </div>
      </div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="rating"
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((entry, index) => (
                <Cell
                  key={entry.rating}
                  fill={ratingColors[index % ratingColors.length]}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
