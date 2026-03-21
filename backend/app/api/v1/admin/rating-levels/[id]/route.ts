import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { getRatingLevel, updateRatingLevel, deleteRatingLevel } from "@/services/admin/ratingLevelAdminService";
import { z } from "zod";

const ratingLevelUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  min_rating: z.number().int().min(0).optional(),
  max_rating: z.number().int().min(0).optional(),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color").optional(),
  sort_order: z.number().int().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const level = await getRatingLevel(id);
    if (!level) {
      return NextResponse.json({ error: "Rating level not found" }, { status: 404 });
    }
    return NextResponse.json(level);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get rating level", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = ratingLevelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const level = await updateRatingLevel(id, parsed.data);
    return NextResponse.json(level);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update rating level", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    await deleteRatingLevel(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete rating level", detail: String(err) },
      { status: 500 }
    );
  }
}
