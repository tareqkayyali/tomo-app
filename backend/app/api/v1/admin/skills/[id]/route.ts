import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { getSkill, updateSkill, deleteSkill } from "@/services/admin/skillAdminService";
import { z } from "zod";

const skillUpdateSchema = z.object({
  key: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  sort_order: z.number().int().optional(),
  sub_metrics: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        unit: z.string().default(""),
        description: z.string().default(""),
      })
    )
    .optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const skill = await getSkill(id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(skill);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get skill", detail: String(err) },
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
  const parsed = skillUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const skill = await updateSkill(id, parsed.data);
    return NextResponse.json(skill);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update skill", detail: String(err) },
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
    await deleteSkill(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete skill", detail: String(err) },
      { status: 500 }
    );
  }
}
