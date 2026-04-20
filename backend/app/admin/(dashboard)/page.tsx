"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCards } from "@/components/admin/dashboard/StatsCards";
import type { DashboardStats } from "@/services/admin/dashboardService";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-2 h-5 w-96" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

const categoryColors: Record<string, "default" | "secondary" | "outline"> = {
  warmup: "secondary",
  training: "default",
  cooldown: "outline",
  recovery: "secondary",
  activation: "default",
};

function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/v1/admin/stats");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(String(err));
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-destructive">Failed to load stats: {error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage all content that powers the Tomo athlete platform.
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={stats} />

      {/* Breakdown Sections */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Drills by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Drills by Category</CardTitle>
            <CardDescription>Distribution across drill types</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.drillsByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drills yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.drillsByCategory.map((item) => (
                  <Badge
                    key={item.category}
                    variant={categoryColors[item.category] ?? "outline"}
                  >
                    {formatCategory(item.category)} ({item.count})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Drills by Sport */}
        <Card>
          <CardHeader>
            <CardTitle>Drills by Sport</CardTitle>
            <CardDescription>How drills are spread across sports</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.drillsBySport.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drills yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.drillsBySport.map((item) => (
                  <Badge key={item.sport_id} variant="secondary">
                    {formatCategory(item.sport_name)} ({item.count})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Content by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Content by Category</CardTitle>
            <CardDescription>
              Content items grouped by type
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.contentByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No content items yet
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.contentByCategory.map((item) => (
                  <Badge key={item.category} variant="outline">
                    {formatCategory(item.category)} ({item.count})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Jump to common tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/drills/new"
              className={buttonVariants({ variant: "default" })}
            >
              New Drill
            </Link>
            <Link
              href="/admin/assessments/new"
              className={buttonVariants({ variant: "secondary" })}
            >
              New Assessment
            </Link>
            <Link
              href="/admin/sports/new"
              className={buttonVariants({ variant: "secondary" })}
            >
              New Sport
            </Link>
            <Link
              href="/admin/content/new"
              className={buttonVariants({ variant: "outline" })}
            >
              New Content Item
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
