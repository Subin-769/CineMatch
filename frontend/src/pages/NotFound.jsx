import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error("404 route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-6xl font-bold mb-3">404</h1>
        <p className="text-gray-400 mb-6">Oops! Page not found.</p>
        <Link
          to="/"
          className="inline-block px-6 py-3 rounded-lg bg-[#FFC105] text-black font-semibold hover:bg-[#FFC105]/90 transition-colors"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}
