import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auto-heal UI visibility (Phase 0 scaffolding). Gates the CMS "AI Health"
  // tab so empty-but-structured tables don't surface to admins before Phase 1
  // populates them. Flip to "true" in Railway env when ready to expose.
  env: {
    NEXT_PUBLIC_AUTO_HEAL_UI_VISIBLE:
      process.env.NEXT_PUBLIC_AUTO_HEAL_UI_VISIBLE ?? "false",
  },
  // Permanent redirects from old CMS URLs to three-pillar structure.
  // Preserves bookmarks after the AI Health / PD / Data Fabric consolidation.
  async redirects() {
    return [
      // ── Pillar 1: AI Health ──────────────────────────────────────────────
      { source: "/admin/enterprise/quality", destination: "/admin/ai-health/quality", permanent: true },
      { source: "/admin/enterprise/quality/auto-heal", destination: "/admin/ai-health/auto-heal", permanent: true },
      { source: "/admin/enterprise/quality/golden-set", destination: "/admin/ai-health/quality/golden-set", permanent: true },
      { source: "/admin/enterprise/quality/shadow-runs", destination: "/admin/ai-health/quality/shadow-runs", permanent: true },
      { source: "/admin/enterprise/quality/disagreements", destination: "/admin/ai-health/quality/disagreements", permanent: true },
      { source: "/admin/enterprise/quality/drift", destination: "/admin/ai-health/quality/drift", permanent: true },
      { source: "/admin/enterprise/quality/safety-flags", destination: "/admin/ai-health/quality/safety-flags", permanent: true },
      { source: "/admin/enterprise/evaluations", destination: "/admin/ai-health/evaluations", permanent: true },
      { source: "/admin/enterprise/evaluations/runs", destination: "/admin/ai-health/evaluations/runs", permanent: true },
      { source: "/admin/enterprise/evaluations/baselines", destination: "/admin/ai-health/evaluations/baselines", permanent: true },
      { source: "/admin/enterprise/ai-operations", destination: "/admin/ai-health/ai-ops", permanent: true },
      { source: "/admin/enterprise/knowledge", destination: "/admin/ai-health/knowledge", permanent: true },
      { source: "/admin/enterprise/knowledge/editor", destination: "/admin/ai-health/knowledge/editor", permanent: true },
      { source: "/admin/enterprise/knowledge/graph", destination: "/admin/ai-health/knowledge/graph", permanent: true },
      { source: "/admin/observability", destination: "/admin/ai-health/observability", permanent: true },
      // ── Pillar 2: Performance Director ───────────────────────────────────
      { source: "/admin/enterprise/protocols", destination: "/admin/pd/protocols", permanent: true },
      { source: "/admin/enterprise/protocols/builder", destination: "/admin/pd/protocols/builder", permanent: true },
      { source: "/admin/enterprise/protocols/generations", destination: "/admin/pd/protocols/generations", permanent: true },
      { source: "/admin/enterprise/protocols/inheritance", destination: "/admin/pd/protocols/inheritance", permanent: true },
      { source: "/admin/enterprise/protocols/test", destination: "/admin/pd/protocols/test", permanent: true },
      { source: "/admin/performance-intelligence", destination: "/admin/pd/intelligence", permanent: true },
      { source: "/admin/planning-protocols", destination: "/admin/pd/planning", permanent: true },
      { source: "/admin/planning-protocols/new", destination: "/admin/pd/planning/new", permanent: true },
      { source: "/admin/planning-protocols/:id/edit", destination: "/admin/pd/planning/:id/edit", permanent: true },
      { source: "/admin/cognitive-windows", destination: "/admin/pd/cognitive-windows", permanent: true },
      { source: "/admin/cognitive-windows/new", destination: "/admin/pd/cognitive-windows/new", permanent: true },
      { source: "/admin/cognitive-windows/:id/edit", destination: "/admin/pd/cognitive-windows/:id/edit", permanent: true },
      { source: "/admin/scheduling-rules", destination: "/admin/pd/scheduling", permanent: true },
      { source: "/admin/dual-load", destination: "/admin/pd/dual-load", permanent: true },
      { source: "/admin/modes", destination: "/admin/pd/modes", permanent: true },
      { source: "/admin/modes/new", destination: "/admin/pd/modes/new", permanent: true },
      { source: "/admin/modes/:id/edit", destination: "/admin/pd/modes/:id/edit", permanent: true },
      { source: "/admin/chat-pills", destination: "/admin/pd/chat-pills", permanent: true },
      { source: "/admin/wearables", destination: "/admin/pd/wearables", permanent: true },
      { source: "/admin/acwr-inspector", destination: "/admin/pd/acwr", permanent: true },
      // ── Phase 2 consolidations ───────────────────────────────────────────
      // PD Config hub (dual-load + scheduling moved under /admin/pd/config)
      { source: "/admin/pd/dual-load", destination: "/admin/pd/config", permanent: true },
      { source: "/admin/pd/scheduling", destination: "/admin/pd/config/scheduling", permanent: true },
      // Normative Data hub (wideners moved under normative-data/)
      { source: "/admin/normative-wideners", destination: "/admin/normative-data/wideners", permanent: true },
      // Athlete CV hub (cv-references + cv-ai-summaries merged under /admin/cv)
      { source: "/admin/cv-references", destination: "/admin/cv", permanent: true },
      { source: "/admin/cv-ai-summaries", destination: "/admin/cv/summaries", permanent: true },
      // Notifications config (moved under /admin/notifications/config)
      { source: "/admin/config/notifications", destination: "/admin/notifications/config", permanent: true },
    ];
  },
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
