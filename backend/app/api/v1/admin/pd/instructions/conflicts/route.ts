import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { listDirectives, getDirective } from "@/services/admin/directiveService";
import {
  detectCollisions,
  isShadowed,
  type Collision,
} from "@/services/admin/conflictDetection";

/**
 * GET /api/v1/admin/pd/instructions/conflicts
 *   → { collisions: Collision[] }   — every same-type-same-scope group with 2+ rules
 *
 * GET /api/v1/admin/pd/instructions/conflicts?for=<directiveId>
 *   → { collision: Collision | null } — the collision shadowing the given rule, if any
 */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const forId = url.searchParams.get("for");

  try {
    const [approved, published] = await Promise.all([
      listDirectives({ status: "approved" }),
      listDirectives({ status: "published" }),
    ]);
    const all = [...approved, ...published];

    if (forId) {
      const target = await getDirective(forId);
      if (!target) {
        return NextResponse.json({ collision: null });
      }
      // Only directives in the live draft set shadow each other.
      const collision = isShadowed(target, all);
      return NextResponse.json({ collision });
    }

    const collisions: Collision[] = detectCollisions(all);
    return NextResponse.json({ collisions });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to detect conflicts", detail: String(err) },
      { status: 500 },
    );
  }
}
