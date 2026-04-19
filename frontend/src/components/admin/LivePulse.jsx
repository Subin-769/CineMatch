import {
  Activity,
  Bot,
  Clock,
  Eye,
  ListPlus,
  MessageCircle,
  Search,
  Star,
  UserPlus,
  Zap,
} from "lucide-react";

const pulseItems = [
  { key: "signups_today", label: "Signups", icon: UserPlus, color: "text-emerald-400" },
  { key: "ratings_today", label: "Ratings", icon: Star, color: "text-[#f6c000]" },
  { key: "views_today", label: "Views", icon: Eye, color: "text-sky-400" },
  { key: "searches_today", label: "Searches", icon: Search, color: "text-violet-400" },
  { key: "watchlist_adds_today", label: "Watchlist Adds", icon: ListPlus, color: "text-orange-400" },
  { key: "chatbot_queries_today", label: "AI Chats", icon: MessageCircle, color: "text-pink-400" },
  { key: "recs_served_today", label: "Recs Served", icon: Bot, color: "text-cyan-400" },
];

function PulseSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="h-3 w-16 rounded bg-white/10" />
          <div className="mt-2 h-6 w-10 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export default function LivePulse({ data, isLoading = false }) {
  if (isLoading) return <PulseSkeleton />;

  const activeNow = data?.active_now ?? 0;
  const peakHour = data?.peak_hour;
  const peakCount = data?.peak_hour_count ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-400">Live Today</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-white/50">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-emerald-400" />
            <span className="font-semibold text-white">{activeNow}</span> active now
          </span>
          {peakHour !== null && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-[#f6c000]" />
              Peak at <span className="font-semibold text-white">{peakHour}</span>
              <span className="text-white/35">({peakCount} events)</span>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {pulseItems.map(({ key, label, icon: Icon, color }) => {
          const value = data?.[key] ?? 0;
          return (
            <div
              key={key}
              className="group rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-white/40">{label}</span>
                <Icon className={`h-3.5 w-3.5 ${color} opacity-60 transition-opacity group-hover:opacity-100`} />
              </div>
              <div className="mt-1.5 text-xl font-semibold tabular-nums text-white">
                {value.toLocaleString()}
              </div>
            </div>
          );
        })}

        <div className="group rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.04]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-white/40">Active Now</span>
            <Zap className="h-3.5 w-3.5 text-emerald-400 opacity-60 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-1.5 text-xl font-semibold tabular-nums text-white">
            {activeNow.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
