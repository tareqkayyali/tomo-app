import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import {
  assessmentFilterSchema,
  assessmentCreateSchema,
} from "@/lib/validation/assessmentSchemas";
import {
  listAssessments,
  createAssessment,
} from "@/services/admin/assessmentAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = assessmentFilterSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid filters", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await listAssessments(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list assessments", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = assessmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const assessment = await createAssessment(parsed.data);
    return NextResponse.json(assessment, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create assessment", detail: String(err) },
      { status: 500 }
    );
  }
}
