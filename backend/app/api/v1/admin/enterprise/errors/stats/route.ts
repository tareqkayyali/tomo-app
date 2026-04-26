import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: NextRequest) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const db = supabaseAdmin() as any;
  const hours = clamp(
    parseInt(req.nextUrl.searchParams.get("hours") ?? "24", 10) || 24,
    1,
    720
  );
  const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const sinceHourIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const [hourlyRes, topCodesRes, topFingerprintsRes, layerBreakdownRes, recentCriticalRes] =
    await Promise.all([
      db
        .from("app_error_stats")
        .select("bucket_hour,error_count,unique_users")
        .gte("bucket_hour", sinceHourIso)
        .order("bucket_hour", { ascending: true }),
      db
        .from("app_error_stats")
        .select("error_code,layer,error_count")
        .neq("severity", "all")
        .neq("layer", "all")
        .gte("bucket_hour", sinceHourIso)
        .order("error_count", { ascending: false })
        .limit(20),
      db
        .from("app_error_stats")
        .select("fingerprint,error_count,unique_users")
        .not("fingerprint", "is", null)
        .neq("layer", "all")
        .neq("severity", "all")
        .gte("bucket_hour", sinceHourIso)
        .order("error_count", { ascending: false })
        .limit(20),
      db
        .from("app_error_stats")
        .select("layer,severity,error_count,unique_users")
        .neq("layer", "all")
        .neq("severity", "all")
        .gte("bucket_hour", sinceHourIso)
        .order("error_count", { ascending: false }),
      db
        .from("app_errors")
        .select("*")
        .in("severity", ["critical", "high"])
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const anyError =
    hourlyRes.error ||
    topCodesRes.error ||
    topFingerprintsRes.error ||
    layerBreakdownRes.error ||
    recentCriticalRes.error;
  if (anyError) {
    return NextResponse.json(
      { error: "Failed to load error stats", detail: anyError.message },
      { status: 500 }
    );
  }

  const hourlyMap = new Map<string, { bucket_hour: string; error_count: number; unique_users: number }>();
  for (const row of (hourlyRes.data ?? []) as Array<{ bucket_hour: string; error_count: number; unique_users: number }>) {
    const key = row.bucket_hour;
    const prev = hourlyMap.get(key);
    hourlyMap.set(key, {
      bucket_hour: key,
      error_count: (prev?.error_count ?? 0) + (row.error_count ?? 0),
      unique_users: Math.max(prev?.unique_users ?? 0, row.unique_users ?? 0),
    });
  }

  const breakdownMap = new Map<string, { layer: string; severity: string; error_count: number; unique_users: number }>();
  for (const row of (layerBreakdownRes.data ?? []) as Array<{ layer: string; severity: string; error_count: number; unique_users: number }>) {
    const key = `${row.layer}|${row.severity}`;
    const prev = breakdownMap.get(key);
    breakdownMap.set(key, {
      layer: row.layer,
      severity: row.severity,
      error_count: (prev?.error_count ?? 0) + (row.error_count ?? 0),
      unique_users: Math.max(prev?.unique_users ?? 0, row.unique_users ?? 0),
    });
  }

  return NextResponse.json({
    hourly: Array.from(hourlyMap.values()),
    topCodes: topCodesRes.data ?? [],
    topFingerprints: topFingerprintsRes.data ?? [],
    layerBreakdown: Array.from(breakdownMap.values()),
    recentCritical: recentCriticalRes.data ?? [],
  });
}
