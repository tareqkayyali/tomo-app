import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateInjury, deleteInjury } from "@/services/cv/cvService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const body = await req.json();
    const row = await updateInjury(id, auth.user.id, body);
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update injury", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    await deleteInjury(id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete injury", detail: String(err) },
      { status: 500 }
    );
  }
}
