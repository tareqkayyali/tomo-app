import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateForYouContent } from "@/services/forYouService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const hourParam = req.nextUrl.searchParams.get("hour");
    const clientHour = hourParam ? parseInt(hourParam, 10) : undefined;

    const content = await generateForYouContent(auth.user.id, clientHour);

    return NextResponse.json(
      { success: true, data: content },
      { headers: { "api-version": "v1" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "ForYou generation error";
    console.error("[ForYou] Route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
