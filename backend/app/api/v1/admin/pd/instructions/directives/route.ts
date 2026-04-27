import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { logAudit } from "@/lib/admin/audit";
import {
  listDirectives,
  createDirective,
} from "@/services/admin/directiveService";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

/** GET /api/v1/admin/pd/instructions/directives?directive_type=&audience=&status=&document_id= */
export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const directive_type = searchParams.get("directive_type") ?? undefined;
  const audience = searchParams.get("audience") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const document_id = searchParams.get("document_id") ?? undefined;

  try {
    const directives = await listDirectives({
      directive_type: directive_type as DirectiveType | undefined,
      audience: audience as any,
      status: status as any,
      document_id,
    });
    return NextResponse.json({ directives });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list directives", detail: String(err) },
      { status: 500 },
    );
  }
}

/** POST /api/v1/admin/pd/instructions/directives */
export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const directive = await createDirective(body, auth.user.id);
    await logAudit({
      actor: auth.user,
      action: "create",
      resource_type: "methodology_directive",
      resource_id: directive.id,
      metadata: {
        directive_type: directive.directive_type,
        audience: directive.audience,
        status: directive.status,
      },
      req,
    });
    return NextResponse.json(directive, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isValidation = message.includes("ZodError") || message.toLowerCase().includes("invalid");
    return NextResponse.json(
      { error: isValidation ? "Validation failed" : "Failed to create directive", detail: message },
      { status: isValidation ? 400 : 500 },
    );
  }
}
