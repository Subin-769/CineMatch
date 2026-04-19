import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "axios",
      "framer-motion",
      "lucide-react",
      "recharts",
      "swiper",
      "@react-oauth/google",
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: false,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/.venv/**",
        "**/.venv311/**",
        "**/vite.config.js",
        "**/.env",
        "**/.env.*",
        "**/tailwind.config.js",
        "**/postcss.config.js",
        "**/*.test.js",
        "**/*.test.jsx",
      ],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
