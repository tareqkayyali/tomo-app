/**
 * GET /api/v1/programs — List/filter training programs from the canonical
 * `public.training_programs` table (migration 049).
 *
 * Source-of-truth shift: the hardcoded FOOTBALL_PROGRAMS catalog was
 * replaced by the DB table. All consumers (mobile EventEditScreen search,
 * ai-service session builder, admin rec engine) now read the same rows.
 *
 * Query params:
 *   sport    — sport_id filter (default: "football")
 *   category — filter by category slug (e.g. "sprint", "passing")
 *   type     — "physical" | "technical"
 *   position — position code; matches rows with ALL or that position
 *   chat     — "1" / "true" → filter to chat_eligible programs only
 *   q        — substring search on name/description/tags/category
 *   limit    — 1..100 (default 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const sport = url.searchParams.get("sport") || "football";
    const category = url.searchParams.get("category");
    const type = url.searchParams.get("type");
    const position = url.searchParams.get("position");
    const chatFlag = url.searchParams.get("chat");
    const q = url.searchParams.get("q")?.trim().toLowerCase();
    const limitParam = parseInt(url.searchParams.get("limit") || "", 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(MAX_LIMIT, Math.max(1, limitParam))
      : DEFAULT_LIMIT;

    const db = supabaseAdmin();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (db as any)
      .from("training_programs")
      .select(
        "id, sport_id, name, category, type, description, equipment, " +
        "duration_minutes, duration_weeks, position_emphasis, difficulty, " +
        "tags, chat_eligible, active"
      )
      .eq("sport_id", sport)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(limit);

    if (category) query = query.eq("category", category);
    if (type) query = query.eq("type", type);
    if (chatFlag === "1" || chatFlag === "true") {
      query = query.eq("chat_eligible", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[programs] query failed:", error);
      return NextResponse.json(
        { error: "Failed to load programs", detail: error.message },
        { status: 500 }
      );
    }

    // Post-filter in JS for two things Supabase client can't do cleanly:
    //   - `position` matches against a JSONB array field (position_emphasis
    //     contains "ALL" OR the requested position)
    //   - `q` substring search across name/description/tags/category
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[] = data || [];

    if (position) {
      rows = rows.filter((p) => {
        const emph: string[] = Array.isArray(p.position_emphasis)
          ? p.position_emphasis
          : [];
        return emph.includes("ALL") || emph.includes(position);
      });
    }

    if (q) {
      rows = rows.filter((p) => {
        const tags: string[] = Array.isArray(p.tags) ? p.tags : [];
        return (
          (p.name || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q) ||
          tags.some((t) => (t || "").toLowerCase().includes(q))
        );
      });
    }

    return NextResponse.json({ programs: rows });
  } catch (err: unknown) {
    console.error("[programs] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
