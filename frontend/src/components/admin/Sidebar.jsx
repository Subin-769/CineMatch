import { useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Film,
  Users,
  Brain,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const navItems = useMemo(
    () => [
      { label: "Dashboard", icon: LayoutDashboard, path: "/admin", end: true },
      { label: "Movies", icon: Film, path: "/admin/movies" },
      { label: "Users", icon: Users, path: "/admin/users" },
      { label: "AI Models", icon: Brain, path: "/admin/ai-models" },
      { label: "Analytics", icon: BarChart3, path: "/admin/analytics" },
    ],
    []
  );

  const systemItems = useMemo(
    () => [{ label: "Settings", icon: Settings, path: "/admin/settings" }],
    []
  );

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[250px] bg-[#0f0f0f] border-r border-white/10 hidden lg:flex flex-col">
      <div className="h-16 px-5 flex items-center gap-3 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-[#f6c000] flex items-center justify-center text-black">
          <Film className="w-5 h-5" />
        </div>
        <div>
          <p className="text-white font-semibold leading-none">CineMatch</p>
          <p className="text-[11px] text-white/40">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 mb-3">Main</p>
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.label}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:text-white hover:bg-white/5",
                    ].join(" ")
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 mb-3">System</p>
          <div className="space-y-1">
            {systemItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.label}
                  to={item.path}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:text-white hover:bg-white/5",
                    ].join(" ")
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="px-4 pb-5">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
