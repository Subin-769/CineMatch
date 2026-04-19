export const DEFAULT_SETTINGS = {
  theme: "dark",
  autoplayTrailers: true,
  personalizedPicks: true,
  language: "en",
};

export function loadStoredSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem("cinematch:settings");
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_SETTINGS;
    }

    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    window.localStorage.removeItem("cinematch:settings");
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(next) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("cinematch:settings", JSON.stringify(next));
}
