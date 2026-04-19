export default function AdminSummaryCard({
  title,
  value,
  description,
  icon: Icon,
  accent = "gold",
  loading = false,
}) {
  const accentStyles = {
    gold: "border-[#433615] bg-[#2d2411] text-[#f6c000]",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    blue: "border-sky-500/20 bg-sky-500/10 text-sky-300",
    rose: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  };

  if (loading) {
    return (
      <div className="animate-pulse rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded bg-white/10" />
            <div className="h-10 w-24 rounded bg-white/10" />
            <div className="h-3 w-36 rounded bg-white/10" />
          </div>
          <div className="h-12 w-12 rounded-2xl bg-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_60px_-40px_rgba(0,0,0,0.95)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-white/50">{title}</p>
          <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{value}</div>
          <p className="mt-2 text-sm text-white/40">{description}</p>
        </div>

        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${accentStyles[accent] || accentStyles.gold}`}>
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
      </div>
    </div>
  );
}
