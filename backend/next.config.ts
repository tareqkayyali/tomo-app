import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public static docs under /legal/* (privacy.html, terms.html) are
  // intentionally world-readable across origins so the mobile web app
  // (dev or prod) can read the tomo-version meta tag during signup.
  async headers() {
    return [
      {
        source: "/legal/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
  // Serve Expo web export from /public/webapp/ for all frontend routes.
  // API (/api/*) and admin (/admin/*) routes are handled by Next.js as normal.
  async rewrites() {
    return {
      // beforeFiles: run BEFORE Next.js pages/API routes — maps Expo static assets
      beforeFiles: [
        { source: "/_expo/:path*", destination: "/webapp/_expo/:path*" },
        { source: "/assets/:path*", destination: "/webapp/assets/:path*" },
        { source: "/fonts/:path*", destination: "/webapp/fonts/:path*" },
        { source: "/metadata.json", destination: "/webapp/metadata.json" },
      ],
      afterFiles: [],
      // fallback: runs AFTER all pages and public files — SPA catch-all
      // If no Next.js page or public file matches, serve the Expo index.html
      // NOTE: /about is served from public/about/index.html (static file takes priority over fallback)
      fallback: [
        { source: "/:path*", destination: "/webapp/index.html" },
      ],
    };
  },
};

export default nextConfig;
