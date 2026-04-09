import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { planningProtocolSchema } from "@/lib/validation/planningSchemas";
import {
  getAllProtocols,
  createProtocol,
} from "@/services/admin/planningProtocolAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const protocols = await getAllProtocols();
    return NextResponse.json({ protocols });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list planning protocols", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = planningProtocolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const protocol = await createProtocol(parsed.data);
    return NextResponse.json(protocol, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create planning protocol", detail: String(err) },
      { status: 500 }
    );
  }
}
