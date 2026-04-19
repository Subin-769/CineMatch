import { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../auth/AuthContext";
import { useGoogleLogin } from "@react-oauth/google";
import api, { AUTH_TOKEN_KEY } from "../api/api.js";

import posterBg from "../assets/Images/poster.jpg";

export default function Register() {
  const navigate = useNavigate();
  const { register, loadUser } = useContext(AuthContext);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isEmail = (v) => /\S+@\S+\.\S+/.test(v);
  const isUsername = (v) => /^[a-zA-Z0-9_.-]{3,30}$/.test(v);
  const hasLetter = (v) => /[A-Za-z]/.test(v);
  const hasNumber = (v) => /\d/.test(v);

  const getFieldError = (field, values) => {
    const name = values.fullName.trim();
    const user = values.username.trim();
    const mail = values.email.trim();

    if (field === "fullName") {
      if (!name) return "Full name is required.";
      if (name.length < 2) return "Full name must be at least 2 characters.";
    }

    if (field === "username") {
      if (!user) return "Username is required.";
      if (!isUsername(user)) {
        return "Username must be 3-30 characters (letters, numbers, . _ -).";
      }
    }

    if (field === "email") {
      if (!mail) return "Email is required.";
      if (!isEmail(mail)) return "Please enter a valid email address.";
    }

    if (field === "password") {
      if (!values.password) return "Password is required.";
      if (values.password.length < 6) return "Password must be at least 6 characters.";
      if (!hasLetter(values.password) || !hasNumber(values.password)) {
        return "Password must include at least one letter and one number.";
      }
    }

    if (field === "confirm") {
      if (!values.confirm) return "Please confirm your password.";
      if (values.password && values.password !== values.confirm) {
        return "Passwords do not match.";
      }
    }

    return "";
  };

  const validate = (values) => {
    const nextErrors = {};
    const fields = ["fullName", "username", "email", "password", "confirm"];
    fields.forEach((field) => {
      const msg = getFieldError(field, values);
      if (msg) nextErrors[field] = msg;
    });
    return nextErrors;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setSuccess("");
    const nextErrors = validate({ fullName, username, email, password, confirm });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setErr("Please fix the highlighted fields and try again.");
      return;
    }

    try {
      setLoading(true);
      const result = await register({
        username: username.trim(),
        email: email.trim(),
        password,
      });

      if (!result?.ok) {
        throw new Error(
          result?.error?.detail ||
            result?.error?.non_field_errors?.[0] ||
            result?.error ||
            "Registration failed"
        );
      }

      setSuccess("Account created successfully. Redirecting...");
      if (result?.user?.is_staff) {
        navigate("/admin");
        return;
      }
      if (result.isNewUser || !result?.user?.onboarding_completed) {
        navigate("/onboarding");
        return;
      }
      navigate("/");
    } catch (e2) {
      const apiMessage =
        e2?.response?.data?.detail ||
        e2?.response?.data?.non_field_errors?.[0] ||
        e2?.message;
      setErr(apiMessage || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async (credential) => {
    if (!credential) {
      setErr("Google Sign-Up failed. Please try again.");
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
      if (currentUser?.is_staff) {
        navigate("/admin");
        return;
      }
      if (res?.data?.is_new_user || !currentUser?.onboarding_completed) {
        navigate("/onboarding");
        return;
      }
      navigate("/");
    } catch (e2) {
      const apiMessage =
        e2?.response?.data?.detail ||
        e2?.response?.data?.non_field_errors?.[0] ||
        e2?.message;
      setErr(apiMessage || "Google Sign-Up failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const googleSignup = useGoogleLogin({
    scope: "profile email",
    onSuccess: (tokenResponse) => {
      const credential = tokenResponse?.access_token;
      handleGoogleSignup(credential);
    },
    onError: () => {
      setErr("Google Sign-Up failed. Please try again.");
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
          opacity: 0.4, // ✅ OPACITY REDUCED HERE
        }}
      />

      <div className="auth-overlay absolute inset-0 bg-black/70" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-7">
          <h1 className="text-4xl font-extrabold text-[#FFC105] tracking-tight">
            CineMatch
          </h1>
          <p className="auth-text auth-muted text-white/60 mt-2">
            Your personalized movie companion
          </p>
        </div>

        {/* Card */}
        <div className="auth-card bg-white/5 border border-white/10 rounded-2xl p-7 shadow-[0_25px_80px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <h2 className="text-2xl font-bold text-center text-white">
            Create Your Account
          </h2>
          <p className="auth-muted text-center text-white/50 mt-2">
            Join CineMatch to save your watchlist and ratings
          </p>

          {err && (
            <div className="mt-4 mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
          {success && (
            <div className="mt-4 mb-3 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4 mt-6">
            {/* Full Name */}
            <div>
              <label className="auth-text text-sm text-white/70">Full Name</label>
              <input
                className="auth-input mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none focus:border-[#FFC105]/40"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.fullName) {
                    setFieldErrors((prev) => ({ ...prev, fullName: "" }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    fullName: getFieldError("fullName", {
                      fullName,
                      username,
                      email,
                      password,
                      confirm,
                    }),
                  }))
                }
                autoComplete="name"
                aria-invalid={Boolean(fieldErrors.fullName)}
              />
              {fieldErrors.fullName ? (
                <p className="mt-2 text-xs text-red-400">{fieldErrors.fullName}</p>
              ) : null}
            </div>

            {/* Username */}
            <div>
              <label className="auth-text text-sm text-white/70">Username</label>
              <input
                className="auth-input mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none focus:border-[#FFC105]/40"
                placeholder="Username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username) {
                    setFieldErrors((prev) => ({ ...prev, username: "" }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    username: getFieldError("username", {
                      fullName,
                      username,
                      email,
                      password,
                      confirm,
                    }),
                  }))
                }
                autoComplete="username"
                aria-invalid={Boolean(fieldErrors.username)}
              />
              {fieldErrors.username ? (
                <p className="mt-2 text-xs text-red-400">{fieldErrors.username}</p>
              ) : null}
            </div>

            {/* Email */}
            <div>
              <label className="auth-text text-sm text-white/70">Email Address</label>
              <input
                className="auth-input mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none focus:border-[#FFC105]/40"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: "" }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    email: getFieldError("email", {
                      fullName,
                      username,
                      email,
                      password,
                      confirm,
                    }),
                  }))
                }
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? (
                <p className="mt-2 text-xs text-red-400">{fieldErrors.email}</p>
              ) : null}
            </div>

            {/* Password */}
            <div>
              <label className="auth-text text-sm text-white/70">Password</label>
              <input
                className="auth-input mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none focus:border-[#FFC105]/40"
                placeholder="Password (min 6 characters)"
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
                    password: getFieldError("password", {
                      fullName,
                      username,
                      email,
                      password,
                      confirm,
                    }),
                  }))
                }
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password)}
              />
              {fieldErrors.password ? (
                <p className="mt-2 text-xs text-red-400">{fieldErrors.password}</p>
              ) : null}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="auth-text text-sm text-white/70">Confirm Password</label>
              <input
                className="auth-input mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none focus:border-[#FFC105]/40"
                placeholder="Confirm password"
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (fieldErrors.confirm) {
                    setFieldErrors((prev) => ({ ...prev, confirm: "" }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    confirm: getFieldError("confirm", {
                      fullName,
                      username,
                      email,
                      password,
                      confirm,
                    }),
                  }))
                }
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.confirm)}
              />
              {fieldErrors.confirm ? (
                <p className="mt-2 text-xs text-red-400">{fieldErrors.confirm}</p>
              ) : null}
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              className={`w-full rounded-xl bg-[#FFC105] text-black font-semibold py-3 hover:opacity-95 transition ${
                loading || googleLoading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>

          {/* OR */}
          <div className="flex items-center gap-3 my-6">
            <div className="auth-divider h-px bg-white/10 flex-1" />
            <span className="auth-muted text-xs text-white/40">OR</span>
            <div className="auth-divider h-px bg-white/10 flex-1" />
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={() => googleSignup()}
            disabled={loading || googleLoading}
            className={`w-full rounded-xl bg-white/5 border border-white/10 py-3 text-white hover:bg-white/10 transition ${
              loading || googleLoading ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {googleLoading ? "Connecting to Google…" : "Sign up with Google"}
          </button>

          <p className="auth-muted text-center text-sm text-white/60 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-[#FFC105] hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
