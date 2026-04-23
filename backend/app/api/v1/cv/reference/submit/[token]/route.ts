import { NextRequest, NextResponse } from "next/server";
import { submitReferenceByToken } from "@/services/cv/cvService";

/**
 * POST /api/v1/cv/reference/submit/[token]
 *
 * Anonymous endpoint — the referee submits their note via the tokenised
 * link they received by email. Token must be valid and the row must still
 * be in 'requested' state (one-shot).
 *
 * Body:
 *   rating: number (1-5, required)
 *   note:   string (short, ~2 lines)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await req.json();

    if (typeof body.rating !== "number" || !body.note) {
      return NextResponse.json(
        { error: "rating (number) and note (string) are required" },
        { status: 400 }
      );
    }

    const result = await submitReferenceByToken(token, {
      rating: body.rating,
      note: String(body.note).slice(0, 1000),
    });

    if (!result.ok) {
      const status =
        result.reason === "invalid_token" ? 404 :
        result.reason === "already_submitted" ? 409 :
        result.reason === "invalid_rating" ? 400 :
        500;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to submit reference", detail: String(err) },
      { status: 500 }
    );
  }
}
