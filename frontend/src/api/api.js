import axios from "axios";
import { API_BASE } from "./apiBase";

export const AUTH_TOKEN_KEY = "cinematch:token";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

let lastOfflineToastAt = 0;
function notifyBackendOffline(error) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastOfflineToastAt < 10000) return;
  lastOfflineToastAt = now;
  const message =
    error?.message === "Network Error"
      ? "Backend offline. Start the Django server on http://127.0.0.1:8000."
      : "Backend unavailable. Please try again.";
  window.dispatchEvent(
    new CustomEvent("backend:offline", {
      detail: { message },
    })
  );
}

let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb) {
  refreshSubscribers.push(cb);
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (!error?.response) {
      notifyBackendOffline(error);
      return Promise.reject(error);
    }

    const originalRequest = error.config;

    // If 401 and not already retried, attempt token refresh
    if (error.response.status === 401 && !originalRequest._retry) {
      // Don't retry auth endpoints themselves
      if (originalRequest.url?.includes("/auth/")) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await axios.post(
            `${API_BASE}/auth/refresh/`,
            {},
            { withCredentials: true }
          );
          const newAccess = refreshRes.data?.access;
          if (newAccess) {
            window.localStorage.setItem(AUTH_TOKEN_KEY, newAccess);
            onRefreshed(newAccess);
          } else {
            // Refresh succeeded via cookie — retry with existing token
            onRefreshed(getStoredToken());
          }
        } catch {
          refreshSubscribers = [];
          isRefreshing = false;
          return Promise.reject(error);
        }
        isRefreshing = false;
      }

      // Queue this request to retry after refresh completes
      return new Promise((resolve) => {
        addRefreshSubscriber((token) => {
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          resolve(api(originalRequest));
        });
      });
    }

    return Promise.reject(error);
  }
);

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
