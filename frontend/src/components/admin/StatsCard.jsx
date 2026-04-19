import { TrendingDown, TrendingUp } from "lucide-react";

export default function StatsCard({ title, value, change, changeType = "positive", icon: Icon }) {
  if (value === null || value === undefined) {
    return (
      <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="h-9 w-20 rounded bg-white/10" />
          </div>
          <div className="h-9 w-9 rounded-lg bg-white/10" />
        </div>
        <div className="mt-4 h-4 w-32 rounded bg-white/10" />
      </div>
    );
  }

  const isNegative = changeType === "negative";
  const TrendIcon = isNegative ? TrendingDown : TrendingUp;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{title}</p>
          <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
        </div>
        <div className="w-9 h-9 rounded-lg bg-[#2a2416] border border-[#3a311d] flex items-center justify-center">
          {Icon ? <Icon className="w-5 h-5 text-[#f6c000]" /> : null}
        </div>
      </div>
      <div className={`mt-3 flex items-center gap-2 text-sm ${isNegative ? "text-red-400" : "text-emerald-400"}`}>
        <TrendIcon className="w-4 h-4" />
        <span>{change}</span>
      </div>
    </div>
  );
}
