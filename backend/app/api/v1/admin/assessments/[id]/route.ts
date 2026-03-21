import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { assessmentUpdateSchema } from "@/lib/validation/assessmentSchemas";
import {
  getAssessment,
  updateAssessment,
  deleteAssessment,
} from "@/services/admin/assessmentAdminService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const assessment = await getAssessment(id);
    if (!assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(assessment);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get assessment", detail: String(err) },
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
  const parsed = assessmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const assessment = await updateAssessment(id, parsed.data);
    return NextResponse.json(assessment);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update assessment", detail: String(err) },
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
    await deleteAssessment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete assessment", detail: String(err) },
      { status: 500 }
    );
  }
}
