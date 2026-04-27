import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  getDirective,
  updateDirective,
  deleteDirective,
  approveDirective,
} from "@/services/admin/directiveService";

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const directive = await getDirective(id);
    if (!directive) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(directive);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load directive", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Special action: approve
  if (body._action === "approve") {
    try {
      const before = await getDirective(id);
      if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const after = await approveDirective(id, auth.user.id);
      await logAudit({
        actor: auth.user,
        action: "update",
        resource_type: "methodology_directive",
        resource_id: id,
        metadata: { transition: "approve", before_status: before.status, after_status: after.status },
        req,
      });
      return NextResponse.json(after);
    } catch (err) {
      return NextResponse.json(
        { error: "Failed to approve directive", detail: String(err) },
        { status: 500 },
      );
    }
  }

  try {
    const before = await getDirective(id);
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const after = await updateDirective(id, body, auth.user.id);
    await logAudit({
      actor: auth.user,
      action: "update",
      resource_type: "methodology_directive",
      resource_id: id,
      metadata: { before, after },
      req,
    });
    return NextResponse.json(after);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isValidation = message.toLowerCase().includes("invalid") || message.includes("ZodError");
    return NextResponse.json(
      { error: isValidation ? "Validation failed" : "Failed to update directive", detail: message },
      { status: isValidation ? 400 : 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const before = await getDirective(id);
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await deleteDirective(id, auth.user.id);
    await logAudit({
      actor: auth.user,
      action: "delete",
      resource_type: "methodology_directive",
      resource_id: id,
      metadata: { directive_type: before.directive_type },
      req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete directive", detail: String(err) },
      { status: 500 },
    );
  }
}
