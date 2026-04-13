"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardStats } from "@/services/admin/dashboardService";

interface StatCardProps {
  title: string;
  value: number;
  description: string;
  icon: string;
  href?: string;
  breakdown?: { label: string; value: number }[];
}

function StatCard({
  title,
  value,
  description,
  icon,
  href,
  breakdown,
}: StatCardProps) {
  const content = (
    <Card className="transition-colors hover:border-primary/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="text-2xl">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <CardDescription>{description}</CardDescription>
        {breakdown && breakdown.length > 0 && (
          <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
            {breakdown.map((b) => (
              <span key={b.label}>
                {b.value} {b.label}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
}

export function StatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      {/* Row 1: Core metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Training Drills"
          value={stats.drills.total}
          description="Drills in the catalog"
          icon=""
          href="/admin/drills"
          breakdown={[
            { label: "active", value: stats.drills.active },
            { label: "inactive", value: stats.drills.inactive },
          ]}
        />
        <StatCard
          title="Assessments"
          value={stats.assessments}
          description="Physical test definitions"
          icon=""
          href="/admin/assessments"
        />
        <StatCard
          title="Normative Data"
          value={stats.normativeData}
          description="Benchmark metric rows"
          icon=""
          href="/admin/normative-data"
        />
      </div>

      {/* Row 2: Supporting metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Sports"
          value={stats.sports.total}
          description="Configured sports"
          icon=""
          href="/admin/sports"
          breakdown={[
            { label: "available", value: stats.sports.available },
            {
              label: "hidden",
              value: stats.sports.total - stats.sports.available,
            },
          ]}
        />
        <StatCard
          title="Content Items"
          value={stats.contentItems.total}
          description="Quotes, tips, milestones"
          icon=""
          href="/admin/content"
          breakdown={[
            { label: "active", value: stats.contentItems.active },
            {
              label: "inactive",
              value: stats.contentItems.total - stats.contentItems.active,
            },
          ]}
        />
        <StatCard
          title="Drill Usage"
          value={stats.drillUsage.totalCompletions}
          description="Total drill completions"
          icon=""
          breakdown={[
            { label: "unique users", value: stats.drillUsage.uniqueUsers },
          ]}
        />
      </div>
    </div>
  );
}
