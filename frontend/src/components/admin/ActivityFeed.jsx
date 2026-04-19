import { Dot } from "lucide-react";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function ActivityFeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 animate-pulse">
          <div className="h-11 w-11 rounded-full bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-4/5 rounded bg-white/10" />
            <div className="h-3 w-24 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ActivityFeed({ items, isLoading = false }) {
  if (isLoading) {
    return <ActivityFeedSkeleton />;
  }

  if (!items || items.length === 0) {
    return <p className="text-white/50 text-sm">No recent activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 transition-colors duration-200 hover:border-white/10 hover:bg-white/[0.05]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f6c000]/15 bg-gradient-to-br from-[#f6c000]/25 to-[#f97316]/15 text-sm font-semibold text-white">
            {getInitials(item.user || item.username)}
          </div>
          <div className="flex-1">
            <p className="text-sm text-white/90">
              <span className="font-semibold">{item.user || item.username}</span>{" "}
              <span className="text-white/60">{item.message}</span>
            </p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/40">
              <Dot className="w-4 h-4 text-emerald-400" />
              <span>{item.time}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
