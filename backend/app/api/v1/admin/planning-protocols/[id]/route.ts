import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { planningProtocolSchema } from "@/lib/validation/planningSchemas";
import {
  getProtocolById,
  updateProtocol,
  deleteProtocol,
} from "@/services/admin/planningProtocolAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const protocol = await getProtocolById(id);
    if (!protocol) {
      return NextResponse.json(
        { error: "Planning protocol not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(protocol);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get planning protocol", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const parsed = planningProtocolSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const protocol = await updateProtocol(id, parsed.data);
    return NextResponse.json(protocol);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update planning protocol", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    await deleteProtocol(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete planning protocol", detail: String(err) },
      { status: 500 }
    );
  }
}
