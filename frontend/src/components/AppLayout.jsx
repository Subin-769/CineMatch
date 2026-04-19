import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { loadStoredSettings } from "../lib/settings.js";

export default function AppLayout({ children, searchQuery, setSearchQuery }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const settings = loadStoredSettings();
    const theme = settings.theme || "dark";
    root.setAttribute("data-theme", theme);

    root.classList.remove("reduce-motion");
    root.classList.remove("preload-sidebar");
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-foreground">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <Topbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onMenuClick={() => setMobileOpen((v) => !v)}
      />

      <div className="sidebar-transition min-w-0 ml-0 lg:ml-[var(--sidebar-width)] transition-[margin] duration-300">
        {children}
      </div>
    </div>
  );
}
