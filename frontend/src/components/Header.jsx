import { Link, useNavigate } from "react-router-dom";
import { Film, User } from "lucide-react";

export default function Header() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/60 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-white">
          <div className="w-8 h-8 rounded-lg bg-[#FFC105] flex items-center justify-center">
            <Film className="w-4 h-4 text-black" />
          </div>
          <span className="font-bold tracking-tight">CineMatch</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-white/70">
          <Link to="/movies" className="hover:text-white transition-colors">
            Movies
          </Link>
          <Link to="/watchlist" className="hover:text-white transition-colors">
            Watchlist
          </Link>
          <Link to="/ratings" className="hover:text-white transition-colors">
            Ratings
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-border text-white/90 hover:bg-white/10 transition"
        >
          <User className="w-4 h-4" />
          Profile
        </button>
      </div>
    </header>
  );
}
