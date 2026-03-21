import { supabaseAdmin } from "@/lib/supabase/admin";

export interface DrillsBySport {
  sport_id: string;
  sport_name: string;
  count: number;
}

export interface DrillsByCategory {
  category: string;
  count: number;
}

export interface ContentByCategory {
  category: string;
  count: number;
}

export interface DrillUsageStats {
  totalCompletions: number;
  uniqueUsers: number;
}

export interface DashboardStats {
  drills: {
    total: number;
    active: number;
    inactive: number;
  };
  assessments: number;
  normativeData: number;
  sports: {
    total: number;
    available: number;
  };
  contentItems: {
    total: number;
    active: number;
  };
  drillsBySport: DrillsBySport[];
  drillsByCategory: DrillsByCategory[];
  contentByCategory: ContentByCategory[];
  drillUsage: DrillUsageStats;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = supabaseAdmin();

  const [
    { count: drillTotal },
    { count: drillActive },
    { count: assessmentCount },
    { count: normativeCount },
    { count: sportTotal },
    { count: sportAvailable },
    { count: contentTotal },
    { count: contentActive },
    drillsBySportResult,
    sportsListResult,
    drillsByCategoryResult,
    contentByCategoryResult,
    drillUsageResult,
  ] = await Promise.all([
    // Total drills
    db.from("training_drills").select("*", { count: "exact", head: true }),
    // Active drills
    db
      .from("training_drills")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    // Assessments
    db
      .from("sport_test_definitions")
      .select("*", { count: "exact", head: true }),
    // Normative data
    db
      .from("sport_normative_data")
      .select("*", { count: "exact", head: true }),
    // Total sports
    db.from("sports").select("*", { count: "exact", head: true }),
    // Available sports
    db
      .from("sports")
      .select("*", { count: "exact", head: true })
      .eq("available", true),
    // Total content
    db.from("content_items").select("*", { count: "exact", head: true }),
    // Active content
    db
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    // Drills by sport
    db.from("training_drills").select("sport_id"),
    // All sports (for label lookup)
    db.from("sports").select("id, label"),
    // Drills by category
    db.from("training_drills").select("category"),
    // Content by category
    db.from("content_items").select("category"),
    // Drill usage
    db.from("user_drill_history").select("user_id"),
  ]);

  // Build sport name lookup
  const sportNameMap = new Map<string, string>();
  if (sportsListResult.data) {
    for (const s of sportsListResult.data) {
      sportNameMap.set(s.id, s.label);
    }
  }

  // Aggregate drills by sport
  const sportCounts = new Map<string, number>();
  if (drillsBySportResult.data) {
    for (const row of drillsBySportResult.data) {
      sportCounts.set(row.sport_id, (sportCounts.get(row.sport_id) ?? 0) + 1);
    }
  }
  const drillsBySport: DrillsBySport[] = Array.from(sportCounts.entries())
    .map(([sport_id, count]) => ({
      sport_id,
      sport_name: sportNameMap.get(sport_id) ?? sport_id,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Aggregate drills by category
  const catCounts = new Map<string, number>();
  if (drillsByCategoryResult.data) {
    for (const row of drillsByCategoryResult.data as Array<{
      category: string;
    }>) {
      catCounts.set(row.category, (catCounts.get(row.category) ?? 0) + 1);
    }
  }
  const drillsByCategory: DrillsByCategory[] = Array.from(catCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Aggregate content by category
  const contentCatCounts = new Map<string, number>();
  if (contentByCategoryResult.data) {
    for (const row of contentByCategoryResult.data as Array<{
      category: string;
    }>) {
      contentCatCounts.set(
        row.category,
        (contentCatCounts.get(row.category) ?? 0) + 1
      );
    }
  }
  const contentByCategory: ContentByCategory[] = Array.from(
    contentCatCounts.entries()
  )
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Drill usage stats
  const usageRows = (drillUsageResult.data ?? []) as Array<{
    user_id: string;
  }>;
  const uniqueUserIds = new Set(usageRows.map((r) => r.user_id));

  return {
    drills: {
      total: drillTotal ?? 0,
      active: drillActive ?? 0,
      inactive: (drillTotal ?? 0) - (drillActive ?? 0),
    },
    assessments: assessmentCount ?? 0,
    normativeData: normativeCount ?? 0,
    sports: {
      total: sportTotal ?? 0,
      available: sportAvailable ?? 0,
    },
    contentItems: {
      total: contentTotal ?? 0,
      active: contentActive ?? 0,
    },
    drillsBySport,
    drillsByCategory,
    contentByCategory,
    drillUsage: {
      totalCompletions: usageRows.length,
      uniqueUsers: uniqueUserIds.size,
    },
  };
}
