import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import {
  dashboardSectionCreateSchema,
  dashboardSectionReorderSchema,
} from "@/lib/validation/dashboardSectionSchemas";
import {
  getAllDashboardSections,
  createDashboardSection,
  reorderDashboardSections,
} from "@/services/admin/dashboardSectionAdminService";

// ---------- GET: List all sections ----------

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const sections = await getAllDashboardSections();
    return NextResponse.json({ sections });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list dashboard sections", detail: String(err) },
      { status: 500 }
    );
  }
}

// ---------- POST: Create section ----------

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();

  // Check if this is a reorder request
  if (body.order && Array.isArray(body.order)) {
    const parsed = dashboardSectionReorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    try {
      await reorderDashboardSections(parsed.data.order);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to reorder dashboard sections", detail: String(err) },
        { status: 500 }
      );
    }
  }

  // Standard create
  const parsed = dashboardSectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const section = await createDashboardSection(parsed.data);
    return NextResponse.json(section, { status: 201 });
  } catch (err) {
    const detail = String(err);
    // Unique constraint violation on section_key
    if (detail.includes("duplicate key") || detail.includes("unique")) {
      return NextResponse.json(
        { error: "A section with this key already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create dashboard section", detail },
      { status: 500 }
    );
  }
}
