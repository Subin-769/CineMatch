import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Film, Globe, Moon, Sparkles, Sun, User } from "lucide-react";
import AppLayout from "../components/AppLayout";
import { AuthContext } from "../auth/AuthContext";
import { useI18n } from "../i18n";
import { API_BASE } from "../api/apiBase";
import {
  loadStoredSettings,
  saveStoredSettings,
} from "../lib/settings.js";

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div>
          {label && <p className="text-sm font-semibold text-white">{label}</p>}
          {description && <p className="text-xs text-white/55">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          checked ? "bg-[#FFC105]" : "bg-white/15",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-black transition",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, refreshMe } = useContext(AuthContext);
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [settings, setSettings] = useState(() => loadStoredSettings());

  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  useEffect(() => {
    saveStoredSettings(settings);
    const root = document.documentElement;
    root.setAttribute("data-theme", settings.theme || "dark");
    root.setAttribute("lang", settings.language === "ne" ? "ne" : "en");
    window.dispatchEvent(new Event("language:changed"));
  }, [settings]);

  useEffect(() => {
    if (user?.username) {
      setProfileName(user.username);
    } else {
      setProfileName("");
    }
  }, [user]);

  const update = (patch) => setSettings((prev) => ({ ...prev, ...patch }));

  async function saveUsername() {
    setProfileMsg("");
    setProfileErr("");
    if (!user) {
      navigate("/login");
      return;
    }

    const nextName = profileName.trim();
    if (!nextName) {
      setProfileErr("Username is required.");
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/auth/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: nextName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Profile update failed");
      await refreshMe?.();
      setProfileMsg("Username updated.");
    } catch (err) {
      setProfileErr(err?.message || "Profile update failed");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <AppLayout searchQuery={searchQuery} setSearchQuery={setSearchQuery}>
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <main className="pt-16">
          <div className="px-6 lg:px-10 py-8">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold">{t("settings.title")}</h1>
                <p className="text-white/60 mt-1">{t("settings.subtitle")}</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/60">
                {t("settings.autoSaved")}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mt-8">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-[#FFC105]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{t("settings.account")}</h2>
                    <p className="text-xs text-white/55">{t("settings.profileBasics")}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{t("settings.username")}</p>
                    <p className="text-xs text-white/55 mb-2">
                      {user
                        ? t("settings.usernameHintLoggedIn")
                        : t("settings.usernameHintLoggedOut")}
                    </p>
                    <input
                      className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:border-[#FFC105]/40 disabled:opacity-60"
                      placeholder={t("settings.username")}
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={!user}
                    />
                  </div>

                  {profileErr && (
                    <p className="text-xs text-red-300">{profileErr}</p>
                  )}
                  {profileMsg && (
                    <p className="text-xs text-emerald-300">{profileMsg}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={saveUsername}
                      disabled={!user || savingProfile}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFC105] text-black font-semibold hover:opacity-90 transition disabled:opacity-60"
                    >
                      {savingProfile ? "Saving..." : t("settings.saveUsername")}
                    </button>
                    {!user && (
                      <button
                        type="button"
                        onClick={() => navigate("/login")}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition"
                      >
                        {t("settings.login")}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Film className="h-5 w-5 text-[#FFC105]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{t("settings.playback")}</h2>
                    <p className="text-xs text-white/55">{t("settings.playbackDesc")}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Toggle
                    checked={settings.autoplayTrailers}
                    onChange={(value) => update({ autoplayTrailers: value })}
                    label={t("settings.autoplayTrailers")}
                    description={t("settings.autoplayDesc")}
                  />
                </div>
              </section>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mt-6">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-[#FFC105]" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{t("settings.preferences")}</h2>
                    <p className="text-xs text-white/55">{t("settings.themeLanguage")}</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{t("settings.theme")}</p>
                      <p className="text-xs text-white/55">
                        {settings.theme === "light"
                          ? t("settings.themeLightOn")
                          : t("settings.themeDarkOn")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      {settings.theme === "light" ? (
                        <Sun className="h-4 w-4" />
                      ) : (
                        <Moon className="h-4 w-4" />
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.theme === "light"}
                        onClick={() =>
                          update({
                            theme: settings.theme === "light" ? "dark" : "light",
                          })
                        }
                        className={[
                          "relative inline-flex h-6 w-11 items-center rounded-full transition",
                          settings.theme === "light" ? "bg-[#FFC105]" : "bg-white/15",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-block h-5 w-5 transform rounded-full bg-black transition",
                            settings.theme === "light" ? "translate-x-5" : "translate-x-0.5",
                          ].join(" ")}
                        />
                      </button>
                    </div>
                  </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-white/60" />
                        <p className="text-sm font-semibold text-white">{t("settings.language")}</p>
                      </div>
                      <p className="text-xs text-white/55 mb-2">
                        {t("settings.languageDesc")}
                      </p>
                    <select
                      value={settings.language}
                      onChange={(e) => update({ language: e.target.value })}
                      className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-[#FFC105]/40"
                    >
                      <option value="en">{t("settings.languageEnglish")}</option>
                      <option value="ne">{t("settings.languageNepali")}</option>
                    </select>
                  </div>

                  <div className="cinema-divider" />

                  <Toggle
                    checked={settings.personalizedPicks}
                    onChange={(value) => update({ personalizedPicks: value })}
                    label={t("settings.personalized")}
                    description={t("settings.personalizedDesc")}
                  />
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
