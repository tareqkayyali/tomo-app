import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { listPositions, createPosition } from "@/services/admin/positionAdminService";
import { z } from "zod";

const positionCreateSchema = z.object({
  sport_id: z.string().min(1, "Sport is required"),
  key: z.string().min(1, "Key is required").max(20),
  label: z.string().min(1, "Label is required").max(200),
  sort_order: z.number().int().default(0),
  attribute_weights: z.record(z.string(), z.number().min(0).max(1)).default({}),
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
    const positions = await listPositions(sportId);
    return NextResponse.json({ positions });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list positions", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = positionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const position = await createPosition(parsed.data);
    return NextResponse.json(position, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create position", detail: String(err) },
      { status: 500 }
    );
  }
}
