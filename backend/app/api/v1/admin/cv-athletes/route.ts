/**
 * GET /api/v1/admin/cv-athletes
 *
 * List all athletes with their CV completeness and section counts.
 * Supports pagination, search, and sort.
 *
 * Query params:
 *   ?page=1&limit=20&search=name&sort=completeness_desc
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1");
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get("limit") ?? "20"));
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const sort = req.nextUrl.searchParams.get("sort") ?? "name_asc";
  const offset = (page - 1) * limit;

  try {
    // Build query — join users with snapshots and cv_profiles
    let query = (db() as any)
      .from("users")
      .select(`
        id, name, email, sport, age, position, created_at,
        athlete_snapshots!inner(cv_completeness, sessions_total, training_age_weeks, coachability_index),
        cv_profiles(completeness_club_pct, completeness_uni_pct, statement_status, share_club_views, share_uni_views)
      `, { count: "exact" });

    // Search
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Sort
    switch (sort) {
      case "completeness_desc":
        query = query.order("cv_completeness", { ascending: false, foreignTable: "athlete_snapshots" });
        break;
      case "completeness_asc":
        query = query.order("cv_completeness", { ascending: true, foreignTable: "athlete_snapshots" });
        break;
      case "name_asc":
        query = query.order("name", { ascending: true });
        break;
      case "recent":
        query = query.order("created_at", { ascending: false });
        break;
      default:
        query = query.order("name", { ascending: true });
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Flatten the nested data
    const athletes = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      sport: row.sport,
      age: row.age,
      position: row.position,
      created_at: row.created_at,
      cv_completeness: row.athlete_snapshots?.cv_completeness ?? 0,
      sessions_total: row.athlete_snapshots?.sessions_total ?? 0,
      training_age_weeks: row.athlete_snapshots?.training_age_weeks ?? 0,
      coachability_index: row.athlete_snapshots?.coachability_index ?? null,
      completeness_club_pct: row.cv_profiles?.completeness_club_pct ?? 0,
      completeness_uni_pct: row.cv_profiles?.completeness_uni_pct ?? 0,
      statement_status: row.cv_profiles?.statement_status ?? null,
      share_club_views: row.cv_profiles?.share_club_views ?? 0,
      share_uni_views: row.cv_profiles?.share_uni_views ?? 0,
    }));

    return NextResponse.json({
      athletes,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch CV athletes", detail: String(err) },
      { status: 500 }
    );
  }
}
