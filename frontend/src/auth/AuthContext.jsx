import React, { createContext, useContext, useEffect, useState } from "react";
import api, { AUTH_TOKEN_KEY } from "../api/api.js";

export const AuthContext = createContext();

function storeToken(token) {
  if (typeof window === "undefined" || !token) return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearStoredTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const res = await api.get("/auth/me/");
      console.log("AUTH USER:", res?.data?.user);
      const payload = res?.data?.user ?? null;
      setUser(payload);
      return payload;
    } catch {
      clearStoredTokens();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUser();
  }, []);

  async function refreshMe() {
    return loadUser();
  }

  async function syncUserFromAuthResponse(res) {
    const accessToken =
      res?.data?.access || res?.data?.access_token || res?.data?.key;
    if (accessToken) {
      storeToken(accessToken);
    }

    const responseUser = res?.data?.user ?? null;
    if (responseUser) {
      console.log("AUTH USER:", responseUser);
      setUser(responseUser);
    }

    const currentUser = await loadUser();
    return currentUser ?? responseUser;
  }

  async function login(payload) {
    try {
      const res = await api.post("/auth/login/", payload);
      const currentUser = await syncUserFromAuthResponse(res);
      return {
        ok: true,
        user: currentUser,
        isNewUser: Boolean(res?.data?.is_new_user),
      };
    } catch (err) {
      clearStoredTokens();
      setUser(null);
      setLoading(false);
      return { ok: false, error: err?.response?.data || err?.message };
    }
  }

  async function register(payload) {
    try {
      const res = await api.post("/auth/register/", payload);
      const currentUser = await syncUserFromAuthResponse(res);
      return {
        ok: true,
        user: currentUser,
        isNewUser: Boolean(res?.data?.is_new_user),
      };
    } catch (err) {
      clearStoredTokens();
      setUser(null);
      setLoading(false);
      return { ok: false, error: err?.response?.data || err?.message };
    }
  }

  async function logout() {
    try {
      await api.post("/auth/logout/");
    } finally {
      clearStoredTokens();
      setUser(null);
      setLoading(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshMe, loadUser, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

