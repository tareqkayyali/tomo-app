import { NextResponse } from "next/server";
import { ArchetypeInfo } from "@/types";

export async function GET() {
  return NextResponse.json(
    { archetypes: ArchetypeInfo },
    { headers: { "api-version": "v1" } }
  );
}
