const toneMap = {
  active: "border-emerald-500/20 bg-emerald-500/12 text-emerald-300",
  warm: "border-amber-500/20 bg-amber-500/12 text-amber-300",
  inactive: "border-white/10 bg-white/[0.05] text-white/45",
  admin: "border-sky-500/20 bg-sky-500/12 text-sky-300",
  member: "border-white/10 bg-white/[0.05] text-white/65",
  complete: "border-emerald-500/20 bg-emerald-500/12 text-emerald-300",
  pending: "border-amber-500/20 bg-amber-500/12 text-amber-300",
  trending: "border-amber-500/20 bg-amber-500/12 text-amber-300",
  popular: "border-sky-500/20 bg-sky-500/12 text-sky-300",
  classic: "border-fuchsia-500/20 bg-fuchsia-500/12 text-fuchsia-300",
  fresh: "border-emerald-500/20 bg-emerald-500/12 text-emerald-300",
  steady: "border-white/10 bg-white/[0.05] text-white/65",
  needs_attention: "border-rose-500/20 bg-rose-500/12 text-rose-300",
};

export default function StatusBadge({ label, tone = "steady" }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${toneMap[tone] || toneMap.steady}`}>
      {label}
    </span>
  );
}
