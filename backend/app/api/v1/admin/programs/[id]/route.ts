import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { programUpdateSchema } from "@/lib/validation/programSchemas";
import {
  getProgramFull,
  updateProgram,
  deleteProgram,
  setChatEligibility,
} from "@/services/admin/programAdminService";
import { z } from "zod";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const program = await getProgramFull(id);
    if (!program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    return NextResponse.json(program);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get program", detail: String(err) },
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
  const parsed = programUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const program = await updateProgram(id, parsed.data);
    return NextResponse.json(program);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update program", detail: String(err) },
      { status: 500 }
    );
  }
}

// Single-field PATCH shortcut for the admin UI chat toggle column.
// Keeps the UI row quick-action light — the full PUT is reserved for
// the edit form.
const patchSchema = z.object({
  chat_eligible: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.chat_eligible !== undefined) {
      const updated = await setChatEligibility(id, parsed.data.chat_eligible);
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to patch program", detail: String(err) },
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
  const hard = req.nextUrl.searchParams.get("hard") === "true";

  try {
    await deleteProgram(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete program", detail: String(err) },
      { status: 500 }
    );
  }
}
