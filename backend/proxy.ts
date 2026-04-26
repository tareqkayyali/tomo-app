import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  extractOrGenerateTraceId,
  generateRequestId,
  ObservabilityHeaders,
} from "@/lib/observability/ids";

// Paths that REMAIN callable after a deletion request is pending, so the
// user can still see status / cancel / sign out. Everything else returns
// 410 GONE until the request is cancelled or purged.
const DELETION_EXEMPT_PATHS = new Set<string>([
  "/api/v1/user/delete/status",
  "/api/v1/user/delete/cancel",
  "/api/v1/user/me",
  "/api/v1/user/logout",
]);

/**
 * After the proxy has authenticated the request, check whether the
 * user's account is in the soft-delete grace period. If so, every
 * non-exempt path returns 410 GONE — regardless of method, so both
 * reads and writes are blocked (per GDPR Art. 17 brief).
 *
 * Returns a 410 response to short-circuit, or null to continue.
 */
async function assertAccountNotGone(
  userId: string,
  pathname: string,
  origin: string | null,
  req: NextRequest
): Promise<NextResponse | null> {
  if (DELETION_EXEMPT_PATHS.has(pathname)) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    // If admin creds are missing we can't check. Fail open — the DB
    // write-gate trigger (migration 071) is the authoritative stop.
    return null;
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data, error } = await admin
    .from("users")
    .select("deletion_requested_at, deletion_scheduled_purge_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    deletion_requested_at: string | null;
    deletion_scheduled_purge_at: string | null;
  };

  if (!row.deletion_requested_at) return null;

  return addCorsHeaders(
    NextResponse.json(
      {
        error: "Account scheduled for erasure",
        code: "ACCOUNT_DELETION_PENDING",
        requestedAt: row.deletion_requested_at,
        scheduledPurgeAt: row.deletion_scheduled_purge_at,
        cancelPath: "/api/v1/user/delete/cancel",
      },
      { status: 410 }
    ),
    origin,
    req
  );
}

// Allowed web origins for CORS
const ALLOWED_ORIGINS = [
  "https://app.my-tomo.com",
  "https://5qakhaec.up.railway.app",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:19006",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-user-id, x-user-email, x-trace-id, x-request-id, api-version, x-timezone, x-tomo-debug",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "api-version, x-trace-id, x-request-id",
  };
}

// ── Global Privacy Control (CCPA / CPRA § 1798.135) ────────────────
// Browsers and privacy tools send `Sec-GPC: 1` when the user has opted
// out of data sale/share via their browser or OS setting. California
// law requires businesses to treat this as a valid opt-out signal. We
// capture at the edge and forward `x-tomo-gpc: 1` so any downstream
// route that writes user_consents or fires analytics can consult it
// without re-parsing the request. Opt-out side effects (consent row,
// analytics suppression) happen at the write site so they're per-event
// auditable, not silently applied here.
function addCorsHeaders(
  response: NextResponse,
  origin: string | null,
  req?: NextRequest
) {
  const headers = getCorsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  if (req && req.headers.get("sec-gpc") === "1") {
    response.headers.set("x-tomo-gpc", "1");
  }
  return response;
}

function withRequestContext(req: NextRequest, traceId: string, requestId: string) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(ObservabilityHeaders.traceId, traceId);
  requestHeaders.set(ObservabilityHeaders.requestId, requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(ObservabilityHeaders.traceId, traceId);
  response.headers.set(ObservabilityHeaders.requestId, requestId);
  return response;
}

/**
 * Auth proxy (Next.js 16 proxy.ts — replaces middleware).
 * 1. Handles CORS preflight (OPTIONS)
 * 2. Checks Authorization: Bearer <token> header (mobile)
 * 3. Falls back to cookie-based auth (web)
 * Sets x-user-id and x-user-email headers for downstream routes.
 */
export async function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");

  // Skip auth for public routes
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/v1")) {
    return NextResponse.next({ request: req });
  }

  const traceId = extractOrGenerateTraceId(req.headers);
  const requestId = generateRequestId();

  // --- 0. CORS preflight ---
  if (req.method === "OPTIONS") {
    const response = new NextResponse(null, {
      status: 200,
      headers: getCorsHeaders(origin),
    });
    response.headers.set(ObservabilityHeaders.traceId, traceId);
    response.headers.set(ObservabilityHeaders.requestId, requestId);
    return response;
  }

  // Content routes are public (read-only, no auth required)
  if (pathname.startsWith("/api/v1/content")) {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // Config bundle routes are public (theme, page configs, feature flags)
  if (pathname.startsWith("/api/v1/config")) {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // Training drill catalog is public (except /recommend which needs auth)
  if (
    pathname.startsWith("/api/v1/training/drills") &&
    !pathname.includes("/recommend")
  ) {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // CV share links are public (scouts view without auth)
  if (pathname.startsWith("/api/v1/cv/share/")) {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // Cron endpoints use their own CRON_SECRET auth (bypass Supabase token check)
  if (pathname === "/api/v1/suggestions/expire") {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // Chat Quality cron endpoints — verified by X-Cron-Secret via cronAuth.ts.
  // Covers /api/v1/cron/quality-drift-check, /auto-repair-scan,
  // /shadow-evaluate, /golden-set-curate.
  if (pathname.startsWith("/api/v1/cron/")) {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // Event processor webhook uses its own secret auth (Supabase Database Webhook)
  if (pathname === "/api/v1/events/process") {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // Cron + test endpoints (bypass Supabase token check)
  if (pathname === "/api/v1/events/bridge-calendar" || pathname === "/api/v1/notifications/triggers" || pathname === "/api/v1/notifications/test-push" || pathname === "/api/v1/notifications/simulate" || pathname === "/api/v1/notifications/clear-all") {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // WHOOP OAuth callback is a redirect from WHOOP (no auth header available)
  if (pathname === "/api/v1/integrations/whoop/callback") {
    return addCorsHeaders(withRequestContext(req, traceId, requestId), origin, req);
  }

  // --- 0b. Internal service-to-service auth (Python AI service → TS backend) ---
  // The Python AI service sends write actions (create_event, etc.) via bridge.
  // It authenticates with the Supabase service role key + X-Tomo-Internal header.
  // We validate the key and trust the X-Tomo-User-Id for the downstream user context.
  const internalHeader = req.headers.get("x-tomo-internal");
  if (internalHeader === "ai-service") {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (token && serviceKey && token === serviceKey) {
      const userId = req.headers.get("x-tomo-user-id");
      if (!userId) {
        return addCorsHeaders(
          NextResponse.json({ error: "Internal auth: X-Tomo-User-Id required" }, { status: 400 }),
          origin,
          req
        );
      }
      const response = withRequestContext(req, traceId, requestId);
      response.headers.set("x-user-id", userId);
      response.headers.set("x-user-email", "ai-service@internal");
      return addCorsHeaders(response, origin, req);
    }
    // Invalid service key — fall through to normal auth
  }

  // --- 1. Try Bearer token (mobile app + web) ---
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return addCorsHeaders(
        NextResponse.json(
          { error: "Unauthorized. Invalid or expired token." },
          { status: 401 }
        ),
        origin,
        req
      );
    }

    const gone = await assertAccountNotGone(user.id, pathname, origin, req);
    if (gone) return gone;

    const response = withRequestContext(req, traceId, requestId);
    response.headers.set("x-user-id", user.id);
    response.headers.set("x-user-email", user.email || "");
    return addCorsHeaders(response, origin, req);
  }

  // --- 2. Fall back to cookie-based auth (web) ---
  let response = withRequestContext(req, traceId, requestId);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          response = withRequestContext(req, traceId, requestId);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return addCorsHeaders(
      NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      ),
      origin,
      req
    );
  }

  const goneCookie = await assertAccountNotGone(user.id, pathname, origin, req);
  if (goneCookie) return goneCookie;

  response.headers.set("x-user-id", user.id);
  response.headers.set("x-user-email", user.email || "");
  return addCorsHeaders(response, origin, req);
}

// Only run proxy on /api/v1/* routes. /api/health is public.
export const config = {
  matcher: ["/api/v1/:path*"],
};
