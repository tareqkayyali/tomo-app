import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * Auth proxy (Next.js 16 proxy.ts — replaces middleware).
 * 1. Checks Authorization: Bearer <token> header (mobile)
 * 2. Falls back to cookie-based auth (web)
 * Sets x-user-id and x-user-email headers for downstream routes.
 */
export async function proxy(req: NextRequest) {
  // Skip auth for public routes
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/v1")) {
    return NextResponse.next({ request: req });
  }

  // --- 1. Try Bearer token (mobile app) ---
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
      return NextResponse.json(
        { error: "Unauthorized. Invalid or expired token." },
        { status: 401 }
      );
    }

    const response = NextResponse.next({ request: req });
    response.headers.set("x-user-id", user.id);
    response.headers.set("x-user-email", user.email || "");
    return response;
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
    return NextResponse.json(
      { error: "Unauthorized. Please sign in." },
      { status: 401 }
    );
  }

  response.headers.set("x-user-id", user.id);
  response.headers.set("x-user-email", user.email || "");
  return response;
}

// Only run proxy on /api/v1/* routes. /api/health is public.
export const config = {
  matcher: ["/api/v1/:path*"],
};
