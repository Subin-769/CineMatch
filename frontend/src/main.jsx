import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { loadStoredSettings } from "./lib/settings.js";
import "./index.css";

if (typeof window !== "undefined") {
  try {
    const settings = loadStoredSettings();
    const theme = settings.theme || "dark";
    const language = settings.language === "ne" ? "ne" : "en";
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("lang", language);
  } catch {
    // no-op
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    <GoogleOAuthProvider
      clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_CLIENT_ID"}
    >
      <AppErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </GoogleOAuthProvider>
  </BrowserRouter>
);
