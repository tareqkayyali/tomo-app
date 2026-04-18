import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { featureFlagCreateSchema } from "@/lib/validation/uiConfigSchemas";
import { listFlags, createFlag } from "@/services/admin/featureFlagAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  try {
    const result = await listFlags();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list feature flags", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireEnterprise(req, "super_admin");
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = featureFlagCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const flag = await createFlag(parsed.data);
    return NextResponse.json(flag, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create feature flag", detail: String(err) },
      { status: 500 }
    );
  }
}
