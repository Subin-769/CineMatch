import { formatPercent } from "./adminUtils";

export default function MeterBar({ value = 0, tone = "gold", compact = false }) {
  const safeValue = Math.max(0, Math.min(Number(value) || 0, 100));
  const fillClass =
    tone === "blue"
      ? "from-sky-400 to-cyan-300"
      : tone === "emerald"
        ? "from-emerald-400 to-lime-300"
        : "from-[#f6c000] to-[#f97316]";

  return (
    <div className={`flex items-center gap-3 ${compact ? "min-w-[140px]" : ""}`}>
      <div className={`overflow-hidden rounded-full bg-white/8 ${compact ? "h-2 w-24" : "h-2.5 w-28"}`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r ${fillClass}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
      <span className="text-sm text-white/55">{formatPercent(safeValue, 0)}</span>
    </div>
  );
}
