import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { dashboardSectionUpdateSchema } from "@/lib/validation/dashboardSectionSchemas";
import {
  getDashboardSectionById,
  updateDashboardSection,
  deleteDashboardSection,
  toggleDashboardSection,
  duplicateDashboardSection,
} from "@/services/admin/dashboardSectionAdminService";

// ---------- GET: Get section by ID ----------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const section = await getDashboardSectionById(id);
    if (!section) {
      return NextResponse.json(
        { error: "Dashboard section not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(section);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get dashboard section", detail: String(err) },
      { status: 500 }
    );
  }
}

// ---------- PUT: Update section ----------

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();

  // Handle toggle action
  if (body._action === "toggle") {
    try {
      const section = await toggleDashboardSection(id, body.is_enabled);
      return NextResponse.json(section);
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to toggle dashboard section", detail: String(err) },
        { status: 500 }
      );
    }
  }

  // Handle duplicate action
  if (body._action === "duplicate") {
    try {
      const section = await duplicateDashboardSection(id);
      return NextResponse.json(section, { status: 201 });
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to duplicate dashboard section", detail: String(err) },
        { status: 500 }
      );
    }
  }

  // Standard update
  const parsed = dashboardSectionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const section = await updateDashboardSection(id, parsed.data);
    return NextResponse.json(section);
  } catch (err) {
    const detail = String(err);
    if (detail.includes("duplicate key") || detail.includes("unique")) {
      return NextResponse.json(
        { error: "A section with this key already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update dashboard section", detail },
      { status: 500 }
    );
  }
}

// ---------- DELETE: Delete section ----------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    await deleteDashboardSection(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete dashboard section", detail: String(err) },
      { status: 500 }
    );
  }
}
