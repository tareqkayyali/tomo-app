import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateBriefing } from "@/services/chat/briefingService";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    // Client can pass local hour + timezone for timezone-aware briefing
    const hourParam = req.nextUrl.searchParams.get("hour");
    const clientHour = hourParam ? parseInt(hourParam, 10) : undefined;
    const timezone = req.nextUrl.searchParams.get("tz") || undefined;

    const briefing = await generateBriefing(auth.user.id, clientHour, timezone);

    return NextResponse.json(briefing, {
      headers: { "api-version": "v1" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Briefing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
