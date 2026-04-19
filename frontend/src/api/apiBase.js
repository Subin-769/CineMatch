const rawBase = (import.meta.env.VITE_API_BASE_URL || "/api").trim();

// Guard against stale local configs pointing to 8002.
export const API_BASE = rawBase.includes("8002") ? "/api" : rawBase;

