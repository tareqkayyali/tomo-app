/**
 * GET /api/v1/admin/cv-overview
 *
 * CMS dashboard for Player CV system.
 * Returns aggregate stats: completeness distribution, section fill rates,
 * share link metrics, AI generation stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const db = () => supabaseAdmin();

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    const [
      totalProfiles,
      completenessStats,
      sectionCounts,
      shareLinkStats,
      statementStats,
    ] = await Promise.all([
      // Total CV profiles created
      (db() as any).from("cv_profiles").select("*", { count: "exact", head: true }),

      // Completeness distribution
      (db() as any).from("cv_profiles").select("completeness_club_pct, completeness_uni_pct"),

      // Section fill rates
      Promise.all([
        (db() as any).from("cv_career_entries").select("athlete_id", { count: "exact", head: true }),
        (db() as any).from("cv_academic_entries").select("athlete_id", { count: "exact", head: true }),
        (db() as any).from("cv_media_links").select("athlete_id", { count: "exact", head: true }),
        (db() as any).from("cv_references").select("athlete_id", { count: "exact", head: true }),
        (db() as any).from("cv_character_traits").select("athlete_id", { count: "exact", head: true }),
      ]),

      // Share link usage
      (db() as any).from("cv_share_views")
        .select("cv_type")
        .gte("viewed_at", new Date(Date.now() - 30 * 86400000).toISOString()),

      // Statement generation stats
      (db() as any).from("cv_profiles")
        .select("statement_status")
        .not("personal_statement_club", "is", null),
    ]);

    // Completeness buckets
    const completeness = completenessStats.data ?? [];
    const buckets = { "0-25": 0, "25-50": 0, "50-75": 0, "75-100": 0 };
    for (const row of completeness) {
      const pct = row.completeness_club_pct ?? 0;
      if (pct < 25) buckets["0-25"]++;
      else if (pct < 50) buckets["25-50"]++;
      else if (pct < 75) buckets["50-75"]++;
      else buckets["75-100"]++;
    }

    // Section counts
    const [career, academic, media, refs, traits] = sectionCounts;

    // Share views by type
    const shareViews = shareLinkStats.data ?? [];
    const clubViews = shareViews.filter((v: any) => v.cv_type === "club").length;
    const uniViews = shareViews.filter((v: any) => v.cv_type === "university").length;

    // Statement statuses
    const statements = statementStats.data ?? [];
    const stmtStatus = {
      draft: statements.filter((s: any) => s.statement_status === "draft").length,
      approved: statements.filter((s: any) => s.statement_status === "approved").length,
      needs_update: statements.filter((s: any) => s.statement_status === "needs_update").length,
    };

    return NextResponse.json({
      total_profiles: totalProfiles.count ?? 0,
      completeness_distribution: buckets,
      section_fill_rates: {
        career_entries: career.count ?? 0,
        academic_entries: academic.count ?? 0,
        media_links: media.count ?? 0,
        references: refs.count ?? 0,
        character_traits: traits.count ?? 0,
      },
      share_views_30d: { club: clubViews, university: uniViews, total: clubViews + uniViews },
      statement_statuses: stmtStatus,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch CV overview", detail: String(err) },
      { status: 500 }
    );
  }
}
