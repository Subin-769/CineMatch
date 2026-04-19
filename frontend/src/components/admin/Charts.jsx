import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
  Area,
  Label,
  Sector,
} from "recharts";

const defaultLineColors = {
  recommendations: "#f6c000",
  accuracy: "#34d399",
};

const donutColors = ["#f6c000", "#34d399", "#60a5fa", "#a855f7", "#f472b6", "#9ca3af"];

const TooltipCard = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-[13px] shadow-[0_16px_40px_-24px_rgba(0,0,0,0.95)]">
      <p className="mb-2 text-sm font-medium text-white">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-white/85">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
          <span>
            {entry.name}: {entry.value}
            {entry.dataKey === "accuracy" ? "%" : ""}
          </span>
        </div>
      ))}
    </div>
  );
};

function ChartSkeleton({ height = "h-[260px]" }) {
  return (
    <div className={`${height} animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]`} />
  );
}

export function RecommendationTrendsChart({ data, isLoading = false }) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-white/50">
        No trend data yet.
      </div>
    );
  }

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="recsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f6c000" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#f6c000" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="month" stroke="rgba(255,255,255,0.35)" fontSize={12} />
          <YAxis stroke="rgba(255,255,255,0.35)" fontSize={12} />
          <Tooltip content={<TooltipCard />} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="recommendations"
            name="Recommendations"
            stroke={defaultLineColors.recommendations}
            fill="url(#recsFill)"
            strokeWidth={2.5}
          />
          <Line
            type="monotone"
            dataKey="accuracy"
            name="Accuracy"
            stroke={defaultLineColors.accuracy}
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderActiveSlice(props) {
  return <Sector {...props} outerRadius={(props.outerRadius || 100) + 6} />;
}

export function GenreDistributionChart({ data, isLoading = false }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(data?.length ? 0 : -1);
  }, [data]);

  if (isLoading) {
    return <ChartSkeleton height="h-[280px]" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-white/50">
        No genre data yet.
      </div>
    );
  }

  const total = data.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="h-[300px] w-full max-w-[280px] mx-auto">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Pie
              data={data}
              dataKey="value"
              activeIndex={activeIndex}
              activeShape={renderActiveSlice}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={96}
              paddingAngle={2}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={2}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(-1)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={donutColors[index % donutColors.length]}
                  fillOpacity={activeIndex === -1 || activeIndex === index ? 1 : 0.68}
                  style={{ transition: "fill-opacity 180ms ease" }}
                />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (!viewBox) return null;
                  const { cx, cy } = viewBox;
                  return (
                    <g>
                      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-white text-[18px] font-semibold">
                        {total}
                      </text>
                      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[rgba(255,255,255,0.48)] text-[12px]">
                        genre signals
                      </text>
                    </g>
                  );
                }}
              />
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0]?.payload;
                return (
                  <div className="rounded-xl border border-white/10 bg-[#0f0f0f] px-4 py-3 text-[13px] shadow-[0_16px_40px_-24px_rgba(0,0,0,0.95)]">
                    <p className="text-sm font-medium text-white">{item.name}</p>
                    <p className="mt-1 text-white/75">
                      {item.value} signals • {item.percent}%
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="grid w-full grid-cols-1 gap-3">
        {data.map((entry, index) => (
          <div
            key={entry.name}
            className="flex items-center justify-between gap-6 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm text-white/70 transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.03)]"
                style={{ background: donutColors[index % donutColors.length] }}
              />
              <span className="text-white/82">{entry.name}</span>
            </div>
            <div className="text-right">
              <div className="font-medium text-white">{entry.percent}%</div>
              <div className="text-xs text-white/45">{entry.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
