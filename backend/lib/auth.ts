import { NextRequest, NextResponse } from "next/server";

export interface RequestUser {
  id: string;
  email: string;
}

/**
 * Extract authenticated user from request headers set by middleware/proxy.
 */
export function getRequestUser(req: NextRequest): RequestUser | null {
  const id = req.headers.get("x-user-id");
  const email = req.headers.get("x-user-email") || "";

  if (!id) return null;
  return { id, email };
}

/**
 * Require authentication. Returns the user or an error response.
 */
export function requireAuth(
  req: NextRequest
): { user: RequestUser } | { error: NextResponse } {
  const user = getRequestUser(req);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}
