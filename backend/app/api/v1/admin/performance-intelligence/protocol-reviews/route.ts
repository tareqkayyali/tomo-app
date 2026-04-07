import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { protocolReviewCreateSchema } from "@/lib/validation/performanceIntelligenceSchemas";
import {
  listProtocolReviews,
  createProtocolReview,
} from "@/services/admin/protocolReviewService";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const url = new URL(req.url);
    const section = url.searchParams.get("section") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!)
      : undefined;

    const rows = await listProtocolReviews({ section, status, limit });
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to list protocol reviews", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = protocolReviewCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const review = await createProtocolReview({
      ...parsed.data,
      changed_by: auth.user.id,
    });
    return NextResponse.json(review, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create protocol review", detail: String(err) },
      { status: 500 }
    );
  }
}
