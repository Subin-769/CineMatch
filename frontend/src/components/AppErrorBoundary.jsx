import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[var(--bg)] text-foreground flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <h1 className="text-2xl font-bold text-white">Frontend error</h1>
            <p className="mt-3 text-white/70">
              The app hit a render error instead of loading normally.
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-black/30 p-4 text-left text-xs text-red-100">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
