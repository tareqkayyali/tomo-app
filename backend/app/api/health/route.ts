import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "tomo-api",
    version: "1.0.0",
    apiVersion: "v1",
    timestamp: new Date().toISOString(),
  });
}
