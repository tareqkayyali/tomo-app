import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  getMethodologyDocument,
  updateMethodologyDocument,
  deleteMethodologyDocument,
} from "@/services/admin/methodologyService";
import {
  documentUpdateSchema,
} from "@/lib/validation/admin/directiveSchemas";

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
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  // Allow partial updates: validate only the fields present. Note: this
  // schema deliberately does NOT re-apply the create-time refine that
  // requires `source_text || source_file_url`. A document that already
  // has content shouldn't have to re-prove it on every save.
  const parsed = documentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldMessages = Object.entries(flat.fieldErrors).flatMap(
      ([field, msgs]) => (msgs ?? []).map((m: string) => `${field}: ${m}`),
    );
    const allMessages = [...fieldMessages, ...flat.formErrors];
    const friendly = allMessages.length
      ? allMessages.join("; ")
      : "Validation failed";
    console.error("[pd/instructions/documents/PUT] validation failed:", {
      id,
      body_keys: Object.keys(body as Record<string, unknown>),
      flat,
    });
    return NextResponse.json(
      {
        error: friendly,
        details: flat,
      },
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
    console.error("[pd/instructions/documents/PUT] DB update failed:", {
      id,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Couldn't save: ${err.message}`
            : "Couldn't save the document",
        detail: String(err),
      },
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
