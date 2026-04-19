import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastIcon({ type }) {
  if (type === "error") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  if (type === "info") return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
  return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback(
    (message, type = "success") => {
      const id = ++idRef.current;
      setToasts((prev) => {
        const next = [...prev, { id, message, type, leaving: false }];
        // keep max 3 visible
        if (next.length > 3) next.shift();
        return next;
      });
      setTimeout(() => dismiss(id), 3000);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}

      {/* Toast container — top center, below topbar */}
      <div
        aria-live="polite"
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto flex items-center gap-3 w-full px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-xl",
              "transform transition-all duration-300 ease-out",
              t.leaving
                ? "opacity-0 -translate-y-2 scale-95"
                : "opacity-100 translate-y-0 scale-100 animate-toast-in",
              t.type === "error"
                ? "bg-red-500/15 border-red-500/25 text-red-200"
                : t.type === "info"
                ? "bg-blue-500/15 border-blue-500/25 text-blue-200"
                : "bg-emerald-500/15 border-emerald-500/25 text-emerald-200",
            ].join(" ")}
          >
            <ToastIcon type={t.type} />
            <span className="text-sm font-medium flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 p-0.5 rounded-md hover:bg-white/10 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
