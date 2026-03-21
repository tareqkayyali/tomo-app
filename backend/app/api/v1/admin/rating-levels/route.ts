import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { listRatingLevels, createRatingLevel } from "@/services/admin/ratingLevelAdminService";
import { z } from "zod";

const ratingLevelCreateSchema = z.object({
  sport_id: z.string().min(1, "Sport is required"),
  name: z.string().min(1, "Name is required").max(100),
  min_rating: z.number().int().min(0),
  max_rating: z.number().int().min(0),
  description: z.string().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color").default("#888888"),
  sort_order: z.number().int().default(0),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const sportId = req.nextUrl.searchParams.get("sport_id");
  if (!sportId) {
    return NextResponse.json(
      { error: "sport_id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const levels = await listRatingLevels(sportId);
    return NextResponse.json({ levels });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list rating levels", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = ratingLevelCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const level = await createRatingLevel(parsed.data);
    return NextResponse.json(level, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create rating level", detail: String(err) },
      { status: 500 }
    );
  }
}
