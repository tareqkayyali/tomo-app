import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { sportCreateSchema } from "@/lib/validation/sportSchemas";
import { listSports, createSport } from "@/services/admin/sportAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const sports = await listSports();
    return NextResponse.json({ sports });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list sports", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = sportCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const sport = await createSport(parsed.data);
    return NextResponse.json(sport, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create sport", detail: String(err) },
      { status: 500 }
    );
  }
}
