import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../auth/AuthContext";
import { useGoogleLogin } from "@react-oauth/google";
import api, { AUTH_TOKEN_KEY } from "../api/api.js";

import posterBg from "../assets/Images/poster.jpg";

export default function Login() {
  const navigate = useNavigate();
  const { login, loadUser } = useContext(AuthContext);

  const [identifier, setIdentifier] = useState(""); // email or username
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isEmail = (v) => /\S+@\S+\.\S+/.test(v);
  const isLikelyUsername = (v) => /^[^\s]{3,}$/.test(v);

  const getFieldError = (field, values) => {
    const id = values.identifier.trim();

    if (field === "identifier") {
      if (!id) return "Email or username is required.";
      if (id.includes("@") && !isEmail(id)) return "Please enter a valid email address.";
      if (!id.includes("@") && !isLikelyUsername(id)) {
        return "Username must be at least 3 characters with no spaces.";
      }
    }

    if (field === "password") {
      if (!values.password) return "Password is required.";
    }

    return "";
  };

  const validate = (values) => {
    const nextErrors = {};
    const identifierError = getFieldError("identifier", values);
    const passwordError = getFieldError("password", values);

    if (identifierError) nextErrors.identifier = identifierError;
    if (passwordError) nextErrors.password = passwordError;

    return nextErrors;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setSuccess("");
    const nextErrors = validate({ identifier, password });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setErr("Please fix the highlighted fields and try again.");
      return;
    }

    setLoading(true);
    try {
      const trimmedIdentifier = identifier.trim();
      const payload = {
        username_or_email: trimmedIdentifier,
        identifier: trimmedIdentifier,
        ...(trimmedIdentifier.includes("@")
          ? { email: trimmedIdentifier }
          : { username: trimmedIdentifier }),
        password,
      };

      const result = await login(payload);
      if (!result?.ok) {
        throw new Error(
          result?.error?.detail ||
            result?.error?.non_field_errors?.[0] ||
            result?.error ||
            "Invalid credentials"
        );
      }

      setSuccess("Signed in successfully. Redirecting...");

      navigate(result?.user?.is_staff ? "/admin" : "/", { replace: true });
    } catch (e2) {
      const apiMessage =
        e2?.response?.data?.detail ||
        e2?.response?.data?.non_field_errors?.[0] ||
        e2?.message;
      setErr(apiMessage || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (credential) => {
    if (!credential) {
      setErr("Google Sign-In failed. Please try again.");
      return;
    }
    setErr("");
    setSuccess("");
    setGoogleLoading(true);
    try {
      const res = await api.post("/auth/google/", { access_token: credential });

      const token =
        res?.data?.access || res?.data?.access_token || res?.data?.key;
      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      }

      const currentUser = await loadUser?.();
      setSuccess("Signed in with Google. Redirecting...");
      navigate(currentUser?.is_staff ? "/admin" : "/", { replace: true });
    } catch (e2) {
      const apiMessage =
        e2?.response?.data?.detail ||
        e2?.response?.data?.non_field_errors?.[0] ||
        e2?.message;
      setErr(apiMessage || "Google Sign-In failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    scope: "profile email",
    onSuccess: (tokenResponse) => {
      const credential = tokenResponse?.access_token;
      handleGoogleLogin(credential);
    },
    onError: () => {
      setErr("Google Sign-In failed. Please try again.");
    },
  });

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");
    return () => {
      if (previousTheme) {
        root.setAttribute("data-theme", previousTheme);
      } else {
        root.removeAttribute("data-theme");
      }
    };
  }, []);

  return (
    <div className="auth-dark min-h-screen relative flex items-center justify-center px-4 py-10 bg-black overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${posterBg})`,
          opacity: 0.4,
        }}
      />
      <div className="auth-overlay absolute inset-0 bg-black/70" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-7">
          <h1 className="text-4xl font-extrabold text-[#FFC105]">CineMatch</h1>
          <p className="auth-text auth-muted text-white/60 mt-2">
            Your personalized movie companion
          </p>
        </div>

        <div className="auth-card bg-white/5 border border-white/10 rounded-2xl p-7 shadow-[0_25px_80px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-center text-white">Welcome Back</h2>
          <p className="auth-muted text-center text-white/50 mt-2 mb-6">
            Continue discovering movies you'll love
          </p>

          {err && (
            <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
          {success && (
            <div className="mb-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="auth-text text-sm text-white/70">Email or Username</label>
              <input
                className="auth-input mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none focus:border-[#FFC105]/40"
                placeholder="you@example.com or your-username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (fieldErrors.identifier) {
                    setFieldErrors((prev) => ({ ...prev, identifier: "" }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    identifier: getFieldError("identifier", { identifier, password }),
                  }))
                }
                autoComplete="username"
                aria-invalid={Boolean(fieldErrors.identifier)}
              />
              {fieldErrors.identifier ? (
                <p className="mt-2 text-xs text-red-400">{fieldErrors.identifier}</p>
              ) : null}
            </div>

            <div>
              <label className="auth-text text-sm text-white/70">Password</label>
              <input
                className="auth-input mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none focus:border-[#FFC105]/40"
                placeholder="Enter your password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: "" }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    password: getFieldError("password", { identifier, password }),
                  }))
                }
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password)}
              />
              {fieldErrors.password ? (
                <p className="mt-2 text-xs text-red-400">{fieldErrors.password}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="auth-muted flex items-center gap-2 text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>

              <button
                type="button"
                onClick={() => setErr("Forgot password: Coming soon")}
                className="text-[#FFC105] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className={`w-full rounded-xl bg-[#FFC105] text-black font-semibold py-3 hover:opacity-95 transition ${
                loading || googleLoading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="auth-divider h-px bg-white/10 flex-1" />
            <span className="auth-muted text-xs text-white/40">OR</span>
            <div className="auth-divider h-px bg-white/10 flex-1" />
          </div>

          <button
            type="button"
            onClick={() => googleLogin()}
            disabled={loading || googleLoading}
            className={`w-full rounded-xl bg-white/5 border border-white/10 py-3 text-white hover:bg-white/10 transition ${
              loading || googleLoading ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {googleLoading ? "Connecting to Google…" : "Sign in with Google"}
          </button>

          <p className="auth-muted text-center text-sm text-white/60 mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-[#FFC105] hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
