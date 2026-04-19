import { useEffect, useContext } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import Home from "./pages/Home";
import MovieDetails from "./pages/MovieDetails";
import Watchlist from "./pages/Watchlist";
import Ratings from "./pages/Ratings";
import Profile from "./pages/Profile";
import Chatbot from "./pages/Chatbot";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Movies from "./pages/Movies";
import Settings from "./pages/Settings";
import Preferences from "./pages/Preferences";
import SearchPage from "./pages/Search";
import { AuthContext } from "./auth/AuthContext";
import Onboarding from "./pages/Onboarding";
import AdminDashboard from "./pages/AdminDashboard";
import AdminMovies from "./pages/AdminMovies";
import AdminUsers from "./pages/AdminUsers";
import AdminAddMovie from "./pages/AdminAddMovie";
import AdminAddUser from "./pages/AdminAddUser";
import AdminAIModels from "./pages/AdminAIModels";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminSettings from "./pages/AdminSettings";
import AdminRoute from "./routes/AdminRoute";
import { loadStoredSettings } from "./lib/settings.js";

function AppLoadingScreen({ message = "Loading CineMatch..." }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-foreground flex items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-2xl border border-[#FFC105]/30 bg-[#FFC105]/20" />
        <p className="text-lg font-semibold text-white/80">{message}</p>
      </div>
    </div>
  );
}



export default function App() {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const settings = loadStoredSettings();
    const theme = settings.theme || "dark";
    root.setAttribute("data-theme", theme);
  }, []);

  const requireAuth = (element) => {
    if (loading) return <AppLoadingScreen message="Checking your session..." />;
    if (!user) return <Navigate to="/login" replace />;
    return element;
  };

  const isOnboardingCompleted = Boolean(user?.onboarding_completed);

  if (
    !loading &&
    user &&
    !isOnboardingCompleted &&
    location.pathname !== "/onboarding" &&
    !location.pathname.startsWith("/admin")
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />

      <Route path="/movie/:id" element={<MovieDetails />} />
      <Route path="/watchlist" element={<Watchlist />} />
      <Route path="/ratings" element={<Ratings />} />
      <Route path="/preferences" element={<Preferences />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/chatbot" element={requireAuth(<Chatbot />)} />
      <Route path="/settings" element={<Settings />} />

      <Route path="/top-rated" element={<Home />} />
      <Route path="*" element={<NotFound />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/movies" element={<Movies />} />
      <Route path="/search" element={<SearchPage />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/movies"
        element={
          <AdminRoute>
            <AdminMovies />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/movies/new"
        element={
          <AdminRoute>
            <AdminAddMovie />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/ai-models"
        element={
          <AdminRoute>
            <AdminAIModels />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <AdminRoute>
            <AdminAnalytics />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <AdminRoute>
            <AdminSettings />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users/new"
        element={
          <AdminRoute>
            <AdminAddUser />
          </AdminRoute>
        }
      />
      <Route
        path="/onboarding"
        element={
          loading ? (
            <AppLoadingScreen message="Preparing onboarding..." />
          ) : !user ? (
            <Navigate to="/login" replace />
          ) : isOnboardingCompleted ? (
            <Navigate to="/" replace />
          ) : (
            <Onboarding />
          )
        }
      />
    </Routes>
  );
}
