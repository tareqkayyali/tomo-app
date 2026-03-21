import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { listSkills, createSkill } from "@/services/admin/skillAdminService";
import { z } from "zod";

const skillCreateSchema = z.object({
  sport_id: z.string().min(1, "Sport is required"),
  key: z.string().min(1, "Key is required").max(100),
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().default(""),
  description: z.string().default(""),
  icon: z.string().default(""),
  sort_order: z.number().int().default(0),
  sub_metrics: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        unit: z.string().default(""),
        description: z.string().default(""),
      })
    )
    .default([]),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const sportId = req.nextUrl.searchParams.get("sport_id");
  if (!sportId) {
    return NextResponse.json(
      { error: "sport_id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const skills = await listSkills(sportId);
    return NextResponse.json({ skills });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list skills", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = skillCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const skill = await createSkill(parsed.data);
    return NextResponse.json(skill, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create skill", detail: String(err) },
      { status: 500 }
    );
  }
}
