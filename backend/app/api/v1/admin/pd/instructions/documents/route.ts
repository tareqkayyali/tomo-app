import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  listMethodologyDocuments,
  createMethodologyDocument,
} from "@/services/admin/methodologyService";
import { documentWriteSchema } from "@/lib/validation/admin/directiveSchemas";

/** GET /api/v1/admin/pd/instructions/documents?status=&audience= */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const audience = searchParams.get("audience") ?? undefined;

  try {
    const documents = await listMethodologyDocuments({
      status: status as any,
      audience: audience as any,
    });
    return NextResponse.json({ documents });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list methodology documents", detail: String(err) },
      { status: 500 },
    );
  }
}

/** POST /api/v1/admin/pd/instructions/documents */
export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = documentWriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const doc = await createMethodologyDocument(parsed.data, auth.user.id);
    await logAudit({
      actor: auth.user,
      action: "create",
      resource_type: "methodology_document",
      resource_id: doc.id,
      metadata: { title: doc.title, audience: doc.audience, status: doc.status },
      req,
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create methodology document", detail: String(err) },
      { status: 500 },
    );
  }
}
