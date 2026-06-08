import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const watchUsePolling = process.env.VITE_DISABLE_POLLING !== "1";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "MindFlip",
        short_name: "MindFlip",
        description: "AI-powered flashcard study app",
        theme_color: "#6366f1",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Do not precache index.html — avoids serving stale authenticated SPA shells offline.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/api\.mindflip\.io\/flashcard-sets/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-flashcard-sets",
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    watch: {
      usePolling: watchUsePolling,
      interval: 300,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/apps/**/node_modules/**",
        "**/apps/**/dist/**",
        "**/mobile/node_modules/**",
        "**/mobile/.expo/**",
        "**/mobile/dist/**",
        "**/services/api/.venv/**",
        "**/services/api/**/__pycache__/**",
        "**/.mypy_cache/**",
        "**/.pytest_cache/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
