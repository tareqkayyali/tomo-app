import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Auto-heal UI visibility (Phase 0 scaffolding). Gates the CMS "AI Health"
  // tab so empty-but-structured tables don't surface to admins before Phase 1
  // populates them. Flip to "true" in Railway env when ready to expose.
  env: {
    NEXT_PUBLIC_AUTO_HEAL_UI_VISIBLE:
      process.env.NEXT_PUBLIC_AUTO_HEAL_UI_VISIBLE ?? "false",
  },
  // Permanent redirects — all historical CMS URLs preserved across all three
  // consolidation phases. Order: most-specific first (Next.js uses first match).
  async redirects() {
    return [
      // ── AI Health: tab consolidation (auto-heal → ai-ops, evaluations → quality) ──
      { source: "/admin/ai-health/auto-heal", destination: "/admin/ai-health/ai-ops", permanent: true },
      { source: "/admin/ai-health/evaluations", destination: "/admin/ai-health/quality/evals", permanent: true },
      { source: "/admin/ai-health/evaluations/runs", destination: "/admin/ai-health/quality/eval-runs", permanent: true },
      { source: "/admin/ai-health/evaluations/baselines", destination: "/admin/ai-health/quality/baselines", permanent: true },
      // ── AI Health: pre-pillar enterprise/* URLs ──────────────────────────
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
      // ── Performance Director: pre-pillar URLs ────────────────────────────
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
      { source: "/admin/scheduling-rules", destination: "/admin/pd/config/scheduling", permanent: true },
      { source: "/admin/dual-load", destination: "/admin/pd/config", permanent: true },
      { source: "/admin/pd/dual-load", destination: "/admin/pd/config", permanent: true },
      { source: "/admin/pd/scheduling", destination: "/admin/pd/config/scheduling", permanent: true },
      { source: "/admin/modes", destination: "/admin/pd/modes", permanent: true },
      { source: "/admin/modes/new", destination: "/admin/pd/modes/new", permanent: true },
      { source: "/admin/modes/:id/edit", destination: "/admin/pd/modes/:id/edit", permanent: true },
      { source: "/admin/chat-pills", destination: "/admin/pd/chat-pills", permanent: true },
      { source: "/admin/wearables", destination: "/admin/pd/wearables", permanent: true },
      { source: "/admin/acwr-inspector", destination: "/admin/pd/acwr", permanent: true },
      // ── Data Fabric: flat /admin/* → /admin/data/* ───────────────────────
      { source: "/admin/programs/position-matrix", destination: "/admin/data/programs/position-matrix", permanent: true },
      { source: "/admin/programs/new", destination: "/admin/data/programs/new", permanent: true },
      { source: "/admin/programs/:id/edit", destination: "/admin/data/programs/:id/edit", permanent: true },
      { source: "/admin/programs", destination: "/admin/data/programs", permanent: true },
      { source: "/admin/drills/new", destination: "/admin/data/drills/new", permanent: true },
      { source: "/admin/drills/:id/edit", destination: "/admin/data/drills/:id/edit", permanent: true },
      { source: "/admin/drills", destination: "/admin/data/drills", permanent: true },
      { source: "/admin/normative-wideners", destination: "/admin/data/normative-data/wideners", permanent: true },
      { source: "/admin/normative-data/wideners", destination: "/admin/data/normative-data/wideners", permanent: true },
      { source: "/admin/normative-data", destination: "/admin/data/normative-data", permanent: true },
      { source: "/admin/progress-metrics/new", destination: "/admin/data/progress-metrics/new", permanent: true },
      { source: "/admin/progress-metrics/:id/edit", destination: "/admin/data/progress-metrics/:id/edit", permanent: true },
      { source: "/admin/progress-metrics", destination: "/admin/data/progress-metrics", permanent: true },
      { source: "/admin/dashboard-sections/new", destination: "/admin/data/dashboard-sections/new", permanent: true },
      { source: "/admin/dashboard-sections/:id/edit", destination: "/admin/data/dashboard-sections/:id/edit", permanent: true },
      { source: "/admin/dashboard-sections", destination: "/admin/data/dashboard-sections", permanent: true },
      { source: "/admin/content-items", destination: "/admin/data/content-items", permanent: true },
      { source: "/admin/notifications/templates", destination: "/admin/data/notifications/templates", permanent: true },
      { source: "/admin/notifications/scheduled", destination: "/admin/data/notifications/scheduled", permanent: true },
      { source: "/admin/notifications/config", destination: "/admin/data/notifications/config", permanent: true },
      { source: "/admin/config/notifications", destination: "/admin/data/notifications/config", permanent: true },
      { source: "/admin/notifications", destination: "/admin/data/notifications/templates", permanent: true },
      { source: "/admin/cv-references", destination: "/admin/data/cv", permanent: true },
      { source: "/admin/cv-ai-summaries", destination: "/admin/data/cv/summaries", permanent: true },
      { source: "/admin/cv/summaries", destination: "/admin/data/cv/summaries", permanent: true },
      { source: "/admin/cv", destination: "/admin/data/cv", permanent: true },
      // ── System: flat /admin/* → /admin/system/* ──────────────────────────
      { source: "/admin/audit", destination: "/admin/system/audit", permanent: true },
      { source: "/admin/users/:id", destination: "/admin/system/users/:id", permanent: true },
      { source: "/admin/users", destination: "/admin/system/users", permanent: true },
      { source: "/admin/enterprise/organizations/:id", destination: "/admin/system/organizations/:id", permanent: true },
      { source: "/admin/enterprise/organizations", destination: "/admin/system/organizations", permanent: true },
      { source: "/admin/enterprise/onboarding", destination: "/admin/system/onboarding", permanent: true },
      { source: "/admin/feature-flags/new", destination: "/admin/system/feature-flags/new", permanent: true },
      { source: "/admin/feature-flags", destination: "/admin/system/feature-flags", permanent: true },
      { source: "/admin/config/:key", destination: "/admin/system/config/:key", permanent: true },
      { source: "/admin/config", destination: "/admin/system/config", permanent: true },
      { source: "/admin/safety-gate", destination: "/admin/system/safety-gate", permanent: true },
      { source: "/admin/debug", destination: "/admin/system/debug", permanent: true },
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

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
