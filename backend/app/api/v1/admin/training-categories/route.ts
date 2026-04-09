import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import {
  getAllCategories,
  createCategory,
} from "@/services/admin/trainingCategoryAdminService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const categories = await getAllCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list categories", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();

  // Basic validation — training_category_templates has flexible schema
  if (!body.key || !body.label) {
    return NextResponse.json(
      { error: "Validation failed: key and label are required" },
      { status: 400 }
    );
  }

  try {
    const category = await createCategory(body);
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create category", detail: String(err) },
      { status: 500 }
    );
  }
}
