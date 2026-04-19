import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  Mail,
  MoreHorizontal,
  Search,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import api from "../api/api";
import { useAuth } from "../auth/AuthContext";
import AdminShell from "../components/admin/AdminShell";
import AdminSummaryCard from "../components/admin/AdminSummaryCard";
import MeterBar from "../components/admin/MeterBar";
import StatusBadge from "../components/admin/StatusBadge";
import {
  formatNumber,
  formatPercent,
  formatShortDate,
  formatTimeAgo,
  getInitials,
} from "../components/admin/adminUtils";

const POLL_INTERVAL_MS = 10000;

const EMPTY_DATA = {
  summary: {
    total_users: 0,
    new_this_month: 0,
    avg_engagement: 0,
    active_this_month: 0,
    onboarded_users: 0,
    admin_users: 0,
  },
  users: [],
};

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "warm", label: "Warming Up" },
  { value: "inactive", label: "Inactive" },
];

const roleOptions = [
  { value: "all", label: "All roles" },
  { value: "member", label: "Members" },
  { value: "admin", label: "Admins" },
];

const sortOptions = [
  { value: "engagement_desc", label: "Top engagement" },
  { value: "joined_desc", label: "Newest joined" },
  { value: "watched_desc", label: "Most watched" },
  { value: "rated_desc", label: "Most rated" },
];

function sortUsers(items, sortBy) {
  const rows = [...items];

  rows.sort((left, right) => {
    if (sortBy === "joined_desc") {
      return new Date(right.joined || 0).getTime() - new Date(left.joined || 0).getTime();
    }
    if (sortBy === "watched_desc") {
      return (right.watched || 0) - (left.watched || 0);
    }
    if (sortBy === "rated_desc") {
      return (right.rated || 0) - (left.rated || 0);
    }

    return (right.engagement || 0) - (left.engagement || 0);
  });

  return rows;
}

function UserOptionsMenu({ row, onViewProfile, onCopyEmail, onClose }) {
  const canEmail = Boolean(row.email);

  return (
    <div
      className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-white/10 bg-[#121212] p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.95)]"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onViewProfile(row);
          onClose();
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.05] hover:text-white"
      >
        <Eye className="h-4 w-4" />
        <span>View profile</span>
      </button>

      <a
        href={canEmail ? `mailto:${row.email}` : undefined}
        onClick={onClose}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
          canEmail ? "text-white/80 hover:bg-white/[0.05] hover:text-white" : "cursor-not-allowed text-white/25"
        }`}
      >
        <Mail className="h-4 w-4" />
        <span>Send email</span>
      </a>

      <button
        type="button"
        onClick={() => {
          onCopyEmail(row.email);
          onClose();
        }}
        disabled={!canEmail}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
          canEmail ? "text-white/80 hover:bg-white/[0.05] hover:text-white" : "cursor-not-allowed text-white/25"
        }`}
      >
        <Copy className="h-4 w-4" />
        <span>Copy email</span>
      </button>

      <div className="mt-2 border-t border-white/5 pt-2">
        <button
          type="button"
          disabled
          className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-400/45"
        >
          <Shield className="h-4 w-4" />
          <span>Suspend user</span>
        </button>
      </div>
    </div>
  );
}

function UserProfilePanel({ row, onClose }) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0d0d0d] p-6 shadow-[0_32px_100px_-32px_rgba(0,0,0,0.98)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f6c000]/20 bg-gradient-to-br from-[#f6c000]/20 to-[#f97316]/15 text-lg font-semibold text-white">
              {getInitials(row.username)}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{row.username}</h2>
              <p className="text-sm text-white/45">{row.email || "No email address"}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Joined</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatShortDate(row.joined)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Last seen</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatTimeAgo(row.last_seen)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Watched</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatNumber(row.watched)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Rated</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatNumber(row.rated)}</div>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">Engagement</h3>
              <p className="mt-1 text-sm text-white/45">Live activity score based on project interactions.</p>
            </div>
            <div className="text-2xl font-semibold text-white">{formatPercent(row.engagement, 0)}</div>
          </div>

          <div className="mt-4">
            <MeterBar value={row.engagement} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <StatusBadge label={row.role} tone={row.role.toLowerCase()} />
            <StatusBadge
              label={row.onboarding_completed ? "Completed onboarding" : "Pending onboarding"}
              tone={row.onboarding_completed ? "complete" : "pending"}
            />
            <StatusBadge label={row.status?.label || "Inactive"} tone={row.status?.key || "inactive"} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Searches</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatNumber(row.searches)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Watchlist</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatNumber(row.watchlist)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-white/35">Preferences</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatNumber(row.preferences)}</div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <a
            href={row.email ? `mailto:${row.email}` : undefined}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
              row.email
                ? "bg-[#f6c000] text-black hover:bg-[#ffd54d]"
                : "cursor-not-allowed bg-white/[0.06] text-white/30"
            }`}
          >
            <Mail className="h-4 w-4" />
            <span>Send email</span>
          </a>
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/35"
          >
            <Shield className="h-4 w-4" />
            <span>Suspend</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const hasLoadedOnceRef = useRef(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("engagement_desc");
  const [showFilters, setShowFilters] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const deferredQuery = useDeferredValue(query);

  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    if (!user?.is_staff) return undefined;

    let isMounted = true;

    const loadUsers = async (initialLoad = false) => {
      if (initialLoad) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const response = await api.get("/admin/users/", {
          params: {
            q: deferredQuery.trim() || undefined,
            status: statusFilter !== "all" ? statusFilter : undefined,
            role: roleFilter !== "all" ? roleFilter : undefined,
          },
        });

        if (!isMounted) return;
        setData(response.data || EMPTY_DATA);
        setLastUpdatedAt(response.data?.updated_at || new Date().toISOString());
        setLoadError("");
        hasLoadedOnceRef.current = true;
      } catch {
        if (!isMounted) return;
        setLoadError("User analytics are temporarily unavailable.");
        if (!hasLoadedOnceRef.current) {
          setData(EMPTY_DATA);
        }
      } finally {
        if (!isMounted) return;
        setLoading(false);
        setIsRefreshing(false);
      }
    };

    void loadUsers(true);
    const intervalId = window.setInterval(() => {
      void loadUsers(false);
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [deferredQuery, roleFilter, statusFilter, user]);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToastMessage("");
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const summaryCards = useMemo(
    () => [
      {
        title: "Total Users",
        value: formatNumber(data.summary?.total_users),
        description: "Registered CineMatch accounts",
        icon: Users,
        accent: "gold",
      },
      {
        title: "New This Month",
        value: formatNumber(data.summary?.new_this_month),
        description: "Fresh accounts created this month",
        icon: Activity,
        accent: "emerald",
      },
      {
        title: "Avg. Engagement",
        value: formatPercent(data.summary?.avg_engagement),
        description: "Weighted activity score across the community",
        icon: CheckCircle2,
        accent: "blue",
      },
      {
        title: "Active This Month",
        value: formatNumber(data.summary?.active_this_month),
        description: `${formatNumber(data.summary?.onboarded_users)} onboarded • ${formatNumber(data.summary?.admin_users)} admins`,
        icon: Shield,
        accent: "rose",
      },
    ],
    [data.summary]
  );

  const visibleUsers = useMemo(() => sortUsers(data.users || [], sortBy), [data.users, sortBy]);

  const filterSummary = useMemo(() => {
    const items = [];

    if (statusFilter !== "all") {
      items.push(statusOptions.find((option) => option.value === statusFilter)?.label || statusFilter);
    }
    if (roleFilter !== "all") {
      items.push(roleOptions.find((option) => option.value === roleFilter)?.label || roleFilter);
    }

    items.push(sortOptions.find((option) => option.value === sortBy)?.label || "Top engagement");
    return items;
  }, [roleFilter, sortBy, statusFilter]);

  const handleCopyEmail = async (email) => {
    if (!email) return;

    try {
      await navigator.clipboard.writeText(email);
      setToastMessage("Email copied");
    } catch {
      setToastMessage("Could not copy email");
    }
  };

  return (
    <AdminShell
      title="Users"
      subtitle="Manage user health, onboarding completion, and engagement signals from live project data."
      lastUpdatedAt={lastUpdatedAt}
      isRefreshing={isRefreshing}
    >
      <div
        className="space-y-6"
        onClick={() => {
          setActiveMenuId(null);
        }}
      >
        {loadError ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {loadError}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <AdminSummaryCard key={card.title} {...card} loading={loading} />
          ))}
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.03))]">
          <div className="border-b border-white/8 px-4 py-4 md:px-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex w-full flex-col gap-3 lg:flex-row">
                <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-white/70">
                  <Search className="h-4 w-4 text-white/35" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search users..."
                    className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowFilters((current) => !current);
                  }}
                  className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    showFilters || statusFilter !== "all" || roleFilter !== "all"
                      ? "border-[#f6c000]/25 bg-[#f6c000]/10 text-[#ffd54d]"
                      : "border-white/10 bg-[#141414] text-white/70 hover:text-white"
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </button>

                <Link
                  to="/admin/users/new"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#f6c000] px-4 py-3 text-sm font-medium text-black transition hover:bg-[#ffd54d]"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Add User</span>
                </Link>
              </div>

              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                {isRefreshing ? "Refreshing live users" : `${visibleUsers.length} users shown`}
              </div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center gap-2">
              {filterSummary.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/55"
                >
                  {item}
                </span>
              ))}
            </div>

            {showFilters ? (
              <div
                className="grid gap-3 rounded-2xl border border-white/10 bg-[#111111] p-3 md:grid-cols-3"
                onClick={(event) => event.stopPropagation()}
              >
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-white/35">Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white/70 outline-none"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-white/35">Role</span>
                  <select
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white/70 outline-none"
                  >
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.16em] text-white/35">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#161616] px-4 py-3 text-sm text-white/70 outline-none"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 lg:hidden">
          {!loading && visibleUsers.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-12 text-center text-white/45">
              No users matched the current filters.
            </div>
          ) : null}

          {visibleUsers.map((row) => (
            <article
              key={row.id}
              className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f6c000]/15 bg-gradient-to-br from-[#f6c000]/25 to-[#f97316]/15 text-sm font-semibold text-white">
                    {getInitials(row.username)}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{row.username}</div>
                    <div className="text-sm text-white/45">{row.email || "No email"}</div>
                    <div className="mt-1 text-xs text-white/30">{formatTimeAgo(row.last_seen)}</div>
                  </div>
                </div>

                <div className="relative" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setActiveMenuId((current) => (current === row.id ? null : row.id))}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:text-white"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {activeMenuId === row.id ? (
                    <UserOptionsMenu
                      row={row}
                      onViewProfile={setSelectedUser}
                      onCopyEmail={handleCopyEmail}
                      onClose={() => setActiveMenuId(null)}
                    />
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-white/35">Joined</div>
                  <div className="mt-2 text-sm font-semibold text-white">{formatShortDate(row.joined)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-white/35">Engagement</div>
                  <div className="mt-2">
                    <MeterBar value={row.engagement} compact />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-white/35">Watched</div>
                  <div className="mt-2 text-sm font-semibold text-white">{formatNumber(row.watched)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-white/35">Rated</div>
                  <div className="mt-2 text-sm font-semibold text-white">{formatNumber(row.rated)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={row.role} tone={row.role.toLowerCase()} />
                <StatusBadge
                  label={row.onboarding_completed ? "Completed" : "Pending"}
                  tone={row.onboarding_completed ? "complete" : "pending"}
                />
                <StatusBadge label={row.status?.label || "Inactive"} tone={row.status?.key || "inactive"} />
              </div>
            </article>
          ))}
        </section>

        <section className="hidden overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.03))] lg:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/40">
                  <th className="px-5 py-4">User</th>
                  <th className="px-5 py-4">Joined</th>
                  <th className="px-5 py-4">Watched</th>
                  <th className="px-5 py-4">Rated</th>
                  <th className="px-5 py-4">Engagement</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Onboarding</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Options</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {!loading && visibleUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-white/45">
                      No users matched the current filters.
                    </td>
                  </tr>
                ) : null}

                {visibleUsers.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 transition hover:bg-[linear-gradient(90deg,rgba(246,192,0,0.04),rgba(255,255,255,0.02))] last:border-b-0"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#f6c000]/15 bg-gradient-to-br from-[#f6c000]/25 to-[#f97316]/15 text-sm font-semibold text-white shadow-[0_12px_30px_-22px_rgba(246,192,0,0.7)]">
                          {getInitials(row.username)}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{row.username}</div>
                          <div className="text-white/45">{row.email || "No email"}</div>
                          <div className="mt-1 text-xs text-white/30">{formatTimeAgo(row.last_seen)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-white/65">{formatShortDate(row.joined)}</td>
                    <td className="px-5 py-4">{formatNumber(row.watched)}</td>
                    <td className="px-5 py-4">{formatNumber(row.rated)}</td>
                    <td className="px-5 py-4">
                      <MeterBar value={row.engagement} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge label={row.role} tone={row.role.toLowerCase()} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        label={row.onboarding_completed ? "Completed" : "Pending"}
                        tone={row.onboarding_completed ? "complete" : "pending"}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge label={row.status?.label || "Inactive"} tone={row.status?.key || "inactive"} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setActiveMenuId((current) => (current === row.id ? null : row.id))}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:border-white/20 hover:text-white"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {activeMenuId === row.id ? (
                          <UserOptionsMenu
                            row={row}
                            onViewProfile={setSelectedUser}
                            onCopyEmail={handleCopyEmail}
                            onClose={() => setActiveMenuId(null)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedUser ? <UserProfilePanel row={selectedUser} onClose={() => setSelectedUser(null)} /> : null}

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-full border border-white/10 bg-[#111111] px-4 py-2 text-sm text-white shadow-[0_20px_60px_-30px_rgba(0,0,0,0.95)]">
          {toastMessage}
        </div>
      ) : null}
    </AdminShell>
  );
}
