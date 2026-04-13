import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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
      "Content-Type, Authorization, x-user-id, x-user-email, api-version, x-timezone, x-tomo-debug",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

function addCorsHeaders(response: NextResponse, origin: string | null) {
  const headers = getCorsHeaders(origin);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
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

  // --- 0. CORS preflight ---
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 200,
      headers: getCorsHeaders(origin),
    });
  }

  // Content routes are public (read-only, no auth required)
  if (pathname.startsWith("/api/v1/content")) {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
  }

  // Config bundle routes are public (theme, page configs, feature flags)
  if (pathname.startsWith("/api/v1/config")) {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
  }

  // Training drill catalog is public (except /recommend which needs auth)
  if (
    pathname.startsWith("/api/v1/training/drills") &&
    !pathname.includes("/recommend")
  ) {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
  }

  // CV share links are public (scouts view without auth)
  if (pathname.startsWith("/api/v1/cv/share/")) {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
  }

  // Cron endpoints use their own CRON_SECRET auth (bypass Supabase token check)
  if (pathname === "/api/v1/suggestions/expire") {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
  }

  // Event processor webhook uses its own secret auth (Supabase Database Webhook)
  if (pathname === "/api/v1/events/process") {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
  }

  // Cron + test endpoints (bypass Supabase token check)
  if (pathname === "/api/v1/events/bridge-calendar" || pathname === "/api/v1/notifications/triggers" || pathname === "/api/v1/notifications/test-push" || pathname === "/api/v1/notifications/simulate" || pathname === "/api/v1/notifications/clear-all") {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
  }

  // WHOOP OAuth callback is a redirect from WHOOP (no auth header available)
  if (pathname === "/api/v1/integrations/whoop/callback") {
    return addCorsHeaders(NextResponse.next({ request: req }), origin);
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
          origin
        );
      }
      const response = NextResponse.next({ request: req });
      response.headers.set("x-user-id", userId);
      response.headers.set("x-user-email", "ai-service@internal");
      return addCorsHeaders(response, origin);
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
        origin
      );
    }

    const response = NextResponse.next({ request: req });
    response.headers.set("x-user-id", user.id);
    response.headers.set("x-user-email", user.email || "");
    return addCorsHeaders(response, origin);
  }

  // --- 2. Fall back to cookie-based auth (web) ---
  let response = NextResponse.next({ request: req });

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
          response = NextResponse.next({ request: req });
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
      origin
    );
  }

  response.headers.set("x-user-id", user.id);
  response.headers.set("x-user-email", user.email || "");
  return addCorsHeaders(response, origin);
}

// Only run proxy on /api/v1/* routes. /api/health is public.
export const config = {
  matcher: ["/api/v1/:path*"],
};
