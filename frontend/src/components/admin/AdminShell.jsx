import { Bell, RadioTower } from "lucide-react";
import { useMemo } from "react";

import { useAuth } from "../../auth/AuthContext";
import Sidebar from "./Sidebar";
import { formatLastUpdated, getInitials } from "./adminUtils";

export default function AdminShell({
  title,
  subtitle,
  lastUpdatedAt,
  isRefreshing = false,
  children,
}) {
  const { user } = useAuth();

  const initials = useMemo(() => {
    const base = user?.username || user?.email || "AD";
    return getInitials(base);
  }, [user?.email, user?.username]);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white font-display">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_top_left,rgba(246,192,0,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_58%)]" />
      </div>

      <Sidebar />

      <div className="relative ml-0 lg:ml-[250px]">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b0b]/90 backdrop-blur-xl">
          <div className="px-4 py-4 md:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                  <RadioTower className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{isRefreshing ? "Syncing live feed" : "Live admin console"}</span>
                </div>
                <h1 className="text-2xl font-semibold text-white">{title}</h1>
                <p className="mt-1 text-sm text-white/50">{subtitle}</p>
              </div>

              <div className="flex items-center gap-3 self-start lg:self-auto">
                <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/45 md:flex">
                  {formatLastUpdated(lastUpdatedAt)}
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f6c000] text-sm font-semibold text-black">
                  {initials}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="relative px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
