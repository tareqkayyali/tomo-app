import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin() as any;

/**
 * GET /api/v1/admin/notifications/dashboard
 * Returns notification stats and recent notifications for the admin panel.
 */
export async function GET(_req: NextRequest) {
  const dbClient = db();
  const now = new Date();
  const d24h = new Date(now.getTime() - 24 * 3600000).toISOString();
  const d7d = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();

  const [
    count24hRes,
    count7dRes,
    statusCountsRes,
    categoryCountsRes,
    recentRes,
  ] = await Promise.allSettled([
    dbClient
      .from("athlete_notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", d24h),

    dbClient
      .from("athlete_notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", d7d),

    dbClient
      .from("athlete_notifications")
      .select("status")
      .gte("created_at", d7d),

    dbClient
      .from("athlete_notifications")
      .select("category")
      .gte("created_at", d7d),

    dbClient
      .from("athlete_notifications")
      .select("id, type, category, title, status, priority, created_at, athlete_id")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const total24h = count24hRes.status === "fulfilled" ? count24hRes.value?.count ?? 0 : 0;
  const total7d = count7dRes.status === "fulfilled" ? count7dRes.value?.count ?? 0 : 0;

  // Compute rates
  let unreadRate = 0;
  let actionRate = 0;
  let dismissRate = 0;
  if (statusCountsRes.status === "fulfilled" && statusCountsRes.value?.data) {
    const statuses = statusCountsRes.value.data as Array<{ status: string }>;
    const total = statuses.length || 1;
    const unread = statuses.filter((s) => s.status === "unread").length;
    const acted = statuses.filter((s) => s.status === "acted").length;
    const dismissed = statuses.filter((s) => s.status === "dismissed").length;
    unreadRate = Math.round((unread / total) * 100);
    actionRate = Math.round((acted / total) * 100);
    dismissRate = Math.round((dismissed / total) * 100);
  }

  // Category breakdown
  const byCategory: Record<string, number> = {};
  if (categoryCountsRes.status === "fulfilled" && categoryCountsRes.value?.data) {
    for (const row of categoryCountsRes.value.data as Array<{ category: string }>) {
      byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    }
  }

  const recent = recentRes.status === "fulfilled" ? recentRes.value?.data ?? [] : [];

  // Compute per-type engagement funnels
  const funnels: Array<{
    type: string;
    created: number;
    read: number;
    acted: number;
    dismissed: number;
    expired: number;
    actionRate: number;
  }> = [];

  if (statusCountsRes.status === "fulfilled" && statusCountsRes.value?.data) {
    // We need type + status for funnels — fetch separately
    const { data: typeStatus } = await dbClient
      .from("athlete_notifications")
      .select("type, status")
      .gte("created_at", d7d);

    if (typeStatus) {
      const byType = new Map<string, Record<string, number>>();
      for (const row of typeStatus as Array<{ type: string; status: string }>) {
        if (!byType.has(row.type)) {
          byType.set(row.type, { created: 0, read: 0, acted: 0, dismissed: 0, expired: 0, unread: 0 });
        }
        const counts = byType.get(row.type)!;
        counts.created++;
        if (row.status in counts) counts[row.status]++;
      }

      for (const [type, counts] of byType.entries()) {
        const total = counts.created || 1;
        funnels.push({
          type,
          created: counts.created,
          read: counts.read + counts.acted, // read includes those that went on to act
          acted: counts.acted,
          dismissed: counts.dismissed,
          expired: counts.expired,
          actionRate: Math.round((counts.acted / total) * 100),
        });
      }

      // Sort by created count descending
      funnels.sort((a, b) => b.created - a.created);
    }
  }

  return NextResponse.json({
    stats: { total24h, total7d, unreadRate, actionRate, dismissRate, byCategory },
    recent,
    funnels,
  });
}
