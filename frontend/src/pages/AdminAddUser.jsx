import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Mail, Shield, Sparkles, UserPlus, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import api from "../api/api";
import AdminShell from "../components/admin/AdminShell";
import { getInitials } from "../components/admin/adminUtils";

const initialForm = {
  username: "",
  email: "",
  password: "",
  role: "member",
  status: "active",
  onboarding: "completed",
  welcomeNote: "",
};

export default function AdminAddUser() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [toastMessage, setToastMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const previewName = form.username.trim() || "New member";
  const previewEmail = form.email.trim() || "member@cinematch.app";

  const onboardingLabel = useMemo(
    () => (form.onboarding === "completed" ? "Completed onboarding" : "Needs onboarding"),
    [form.onboarding]
  );

  const handleChange = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setErrorMessage("");

    const username = form.username.trim();
    const email = form.email.trim();
    if (!username || !email) {
      setErrorMessage("Username and email are required.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/admin/users/create/", {
        username,
        email,
        password: form.password || undefined,
        role: form.role,
        status: form.status,
        onboarding: form.onboarding,
        welcome_note: form.welcomeNote.trim() || undefined,
      });

      const generated = data?.generated_password;
      setToastMessage(
        generated
          ? `User created. Temporary password: ${generated}`
          : `User "${data?.user?.username || username}" created successfully.`
      );
      setForm(initialForm);
      window.setTimeout(() => {
        setToastMessage("");
        navigate("/admin/users");
      }, generated ? 6000 : 2200);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to create user.";
      setErrorMessage(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminShell
      title="Add User"
      subtitle="Create a polished user entry flow for admins, onboarding, and access setup."
      lastUpdatedAt={new Date().toISOString()}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to users</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-5 md:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">User Setup</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Admin invite form</h2>
                <p className="mt-2 max-w-xl text-sm text-white/45">
                  Capture identity, access level, onboarding state, and a short internal note in one clean flow.
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#433615] bg-[#2d2411] text-[#f6c000]">
                <UserPlus className="h-5 w-5" />
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-white/55">Username</span>
                  <input
                    value={form.username}
                    onChange={handleChange("username")}
                    placeholder="Enter username"
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-white/55">Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    placeholder="Enter email"
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm text-white/55">
                  Password <span className="text-white/30">(optional — leave blank to auto-generate)</span>
                </span>
                <input
                  type="text"
                  value={form.password}
                  onChange={handleChange("password")}
                  placeholder="Leave empty to generate a temporary password"
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-white/55">Role</span>
                  <select
                    value={form.role}
                    onChange={handleChange("role")}
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white/75 outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-white/55">Status</span>
                  <select
                    value={form.status}
                    onChange={handleChange("status")}
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white/75 outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="warm">Warming Up</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-white/55">Onboarding</span>
                  <select
                    value={form.onboarding}
                    onChange={handleChange("onboarding")}
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white/75 outline-none"
                  >
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                  </select>
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm text-white/55">Welcome note</span>
                <textarea
                  rows={5}
                  value={form.welcomeNote}
                  onChange={handleChange("welcomeNote")}
                  placeholder="Add a short note for onboarding or admin context"
                  className="w-full rounded-[1.5rem] border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">Identity</div>
                  <div className="mt-2 text-sm text-white/75">Username and email for the new account.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">Access</div>
                  <div className="mt-2 text-sm text-white/75">Choose role and initial lifecycle status.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">Onboarding</div>
                  <div className="mt-2 text-sm text-white/75">Control whether the user still needs setup.</div>
                </div>
              </div>

              {errorMessage ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#f6c000] px-5 py-3 text-sm font-medium text-black transition hover:bg-[#ffd54d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{submitting ? "Creating user..." : "Create user"}</span>
                </button>
                <Link
                  to="/admin/users"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:text-white"
                >
                  <span>Cancel</span>
                </Link>
              </div>
            </form>
          </section>

          <section className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Live Preview</p>
              <div className="mt-5 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#f6c000]/15 bg-gradient-to-br from-[#f6c000]/25 to-[#f97316]/15 text-lg font-semibold text-white">
                  {getInitials(previewName)}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">{previewName}</h3>
                  <p className="text-sm text-white/45">{previewEmail}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                  {form.role === "admin" ? "Admin" : "Member"}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                  {form.status === "warm" ? "Warming Up" : form.status[0].toUpperCase() + form.status.slice(1)}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                  {onboardingLabel}
                </span>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-[#f6c000]" />
                  <span className="text-sm text-white/75">Welcome note preview</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  {form.welcomeNote.trim() || "No note added yet. Use this space for onboarding guidance or admin context."}
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-white">Quick checklist</h3>
              </div>
              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-3 text-sm text-white/65">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                  <span>Use a real email so invite and recovery flows stay consistent.</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-white/65">
                  <Shield className="mt-0.5 h-4 w-4 text-sky-300" />
                  <span>Grant admin only when the user needs dashboard and system access.</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-white/65">
                  <Users className="mt-0.5 h-4 w-4 text-[#f6c000]" />
                  <span>Keep onboarding pending for accounts that still need preference setup.</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {toastMessage ? (
          <div className="fixed bottom-6 right-6 z-50 rounded-full border border-white/10 bg-[#111111] px-4 py-2 text-sm text-white shadow-[0_20px_60px_-30px_rgba(0,0,0,0.95)]">
            {toastMessage}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
