import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { getCategories } from "@/services/admin/contentItemAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const categories = await getCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get categories", detail: String(err) },
      { status: 500 }
    );
  }
}
