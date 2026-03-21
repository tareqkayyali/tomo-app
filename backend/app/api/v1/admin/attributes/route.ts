import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { attributeCreateSchema } from "@/lib/validation/sportSchemas";
import {
  listAttributes,
  createAttribute,
} from "@/services/admin/attributeAdminService";

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
    const attributes = await listAttributes(sportId);
    return NextResponse.json({ attributes });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list attributes", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = attributeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const attribute = await createAttribute(parsed.data);
    return NextResponse.json(attribute, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create attribute", detail: String(err) },
      { status: 500 }
    );
  }
}
