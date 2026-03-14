import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  calculatePercentile,
  getMetricTrajectory,
} from "@/services/benchmarkService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { key } = await params;
  const { searchParams } = new URL(req.url);
  const months = parseInt(searchParams.get("months") || "12", 10);

  const trajectory = await getMetricTrajectory(auth.user.id, key, months);
  return NextResponse.json(
    { metricKey: key, trajectory },
    { headers: { "api-version": "v1" } }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  const { key } = await params;

  try {
    const { value, source, testedAt } = await req.json();
    if (typeof value !== "number") {
      return NextResponse.json(
        { error: "value is required and must be a number" },
        { status: 400 }
      );
    }

    const result = await calculatePercentile(auth.user.id, key, value, {
      source,
      testedAt,
    });
    if (!result) {
      return NextResponse.json(
        { error: "Benchmark norm not found for this player profile" },
        { status: 404 }
      );
    }

    return NextResponse.json(result, {
      status: 201,
      headers: { "api-version": "v1" },
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
