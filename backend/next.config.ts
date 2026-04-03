import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      fallback: [
        { source: "/:path*", destination: "/webapp/index.html" },
      ],
    };
  },
};

export default nextConfig;
