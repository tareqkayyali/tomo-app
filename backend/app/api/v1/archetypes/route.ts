import { NextResponse } from "next/server";
import { ArchetypeInfo } from "@/types";

export async function GET() {
  try {
    return NextResponse.json(
      { archetypes: ArchetypeInfo },
      { headers: { "api-version": "v1", "Cache-Control": "private, max-age=300" } }
    );
  } catch (err: any) {
    console.error('[archetypes] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
