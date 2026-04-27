import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  getMethodologyDocument,
  updateMethodologyDocument,
  deleteMethodologyDocument,
} from "@/services/admin/methodologyService";
import { documentWriteSchema } from "@/lib/validation/admin/directiveSchemas";

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const doc = await getMethodologyDocument(id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load methodology document", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  // Allow partial updates: validate only the fields present.
  const parsed = documentWriteSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const before = await getMethodologyDocument(id);
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const after = await updateMethodologyDocument(id, parsed.data);
    await logAudit({
      actor: auth.user,
      action: "update",
      resource_type: "methodology_document",
      resource_id: id,
      metadata: { before, after },
      req,
    });
    return NextResponse.json(after);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update methodology document", detail: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    const before = await getMethodologyDocument(id);
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await deleteMethodologyDocument(id);
    await logAudit({
      actor: auth.user,
      action: "delete",
      resource_type: "methodology_document",
      resource_id: id,
      metadata: { title: before.title },
      req,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete methodology document", detail: String(err) },
      { status: 500 },
    );
  }
}
