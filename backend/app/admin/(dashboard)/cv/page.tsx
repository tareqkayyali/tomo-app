"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CVOverview {
  total_profiles: number;
  completeness_distribution: Record<string, number>;
  section_fill_rates: Record<string, number>;
  share_views_30d: { club: number; university: number; total: number };
  statement_statuses: { draft: number; approved: number; needs_update: number };
}

export default function CVOverviewPage() {
  const [data, setData] = useState<CVOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/admin/cv-overview", { credentials: "include" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading CV overview...</div>;
  if (!data) return <div className="p-6 text-destructive">Failed to load CV data</div>;

  const dist = data.completeness_distribution;
  const sections = data.section_fill_rates;
  const shares = data.share_views_30d;
  const stmts = data.statement_statuses;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Player CV</h1>
          <p className="text-muted-foreground">CV system overview and analytics</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/cv/athletes"><Button variant="outline">View Athletes</Button></Link>
          <Link href="/admin/cv/settings"><Button>CV Settings</Button></Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total CV Profiles</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{data.total_profiles}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Share Views (30d)</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{shares.total}</p>
            <p className="text-xs text-muted-foreground">Club: {shares.club} · Uni: {shares.university}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Statements Approved</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stmts.approved}</p>
            <p className="text-xs text-muted-foreground">Draft: {stmts.draft} · Needs Update: {stmts.needs_update}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Completeness</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">
            {data.total_profiles > 0 ? Math.round(
              ((dist["0-25"] ?? 0) * 12.5 + (dist["25-50"] ?? 0) * 37.5 + (dist["50-75"] ?? 0) * 62.5 + (dist["75-100"] ?? 0) * 87.5) / data.total_profiles
            ) : 0}%
          </p></CardContent>
        </Card>
      </div>

      {/* Completeness Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Completeness Distribution</CardTitle>
          <CardDescription>How complete are athlete CVs across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {Object.entries(dist).map(([bucket, count]) => (
              <div key={bucket} className="text-center rounded-lg border p-4">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-sm text-muted-foreground">{bucket}%</p>
                <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{
                    width: `${data.total_profiles > 0 ? (count / data.total_profiles) * 100 : 0}%`
                  }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section Fill Rates */}
      <Card>
        <CardHeader>
          <CardTitle>Section Fill Rates</CardTitle>
          <CardDescription>Total entries across all athletes per manual CV section</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {Object.entries(sections).map(([key, count]) => (
              <div key={key} className="text-center rounded-lg border p-4">
                <p className="text-xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
