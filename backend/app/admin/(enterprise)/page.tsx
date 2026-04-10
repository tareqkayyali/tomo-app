"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Enterprise CMS Dashboard
 * Org-scoped metrics: athlete count, protocol compliance, AI quality, engagement.
 */

interface DashboardStats {
  athletes: { total: number; active: number; byPosition: Record<string, number> };
  protocols: { total: number; mandatory: number; institutional: number };
  knowledge: { chunks: number; entities: number; relationships: number };
  ai: { evalPassRate: number; phvSafetyScore: number; avgLatencyMs: number };
  engagement: { dailyActive: number; weeklyActive: number; avgSessionsPerWeek: number };
}

function StatCard({
  label,
  value,
  sublabel,
  color = "default",
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: "default" | "green" | "yellow" | "red";
}) {
  const colorClasses = {
    default: "border-border",
    green: "border-l-4 border-l-green-500",
    yellow: "border-l-4 border-l-yellow-500",
    red: "border-l-4 border-l-red-500",
  };

  return (
    <Card className={`p-4 ${colorClasses[color]}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sublabel && (
        <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
      )}
    </Card>
  );
}

export default function EnterpriseDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/v1/admin/enterprise/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
      // Set fallback stats so the dashboard still renders
      setStats({
        athletes: { total: 0, active: 0, byPosition: {} },
        protocols: { total: 0, mandatory: 0, institutional: 0 },
        knowledge: { chunks: 0, entities: 0, relationships: 0 },
        ai: { evalPassRate: 0, phvSafetyScore: 1.0, avgLatencyMs: 0 },
        engagement: { dailyActive: 0, weeklyActive: 0, avgSessionsPerWeek: 0 },
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Enterprise Dashboard</h1>
          <p className="text-muted-foreground">Organization overview</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  const s = stats!;
  const safetyColor =
    s.ai.phvSafetyScore >= 1.0 ? "green" : s.ai.phvSafetyScore >= 0.9 ? "yellow" : "red";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Enterprise Dashboard</h1>
          <p className="text-muted-foreground">Organization performance overview</p>
        </div>
        <Badge variant="outline" className="text-xs">
          Phase 8 — Enterprise CMS
        </Badge>
      </div>

      {error && (
        <Card className="p-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            Dashboard stats unavailable — showing placeholder data.
          </p>
        </Card>
      )}

      {/* Athletes */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Athletes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Athletes" value={s.athletes.total} />
          <StatCard
            label="Active (7d)"
            value={s.athletes.active}
            sublabel={
              s.athletes.total > 0
                ? `${Math.round((s.athletes.active / s.athletes.total) * 100)}% engagement`
                : undefined
            }
            color="green"
          />
          <StatCard label="Daily Active" value={s.engagement.dailyActive} />
          <StatCard
            label="Avg Sessions/Week"
            value={s.engagement.avgSessionsPerWeek.toFixed(1)}
          />
        </div>
      </div>

      {/* Protocols & Knowledge */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Protocols & Knowledge</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Protocols"
            value={s.protocols.total}
            sublabel={`${s.protocols.mandatory} mandatory`}
          />
          <StatCard
            label="Institutional"
            value={s.protocols.institutional}
            sublabel="Org-specific protocols"
          />
          <StatCard
            label="Knowledge Chunks"
            value={s.knowledge.chunks}
            sublabel={`${s.knowledge.entities} entities`}
          />
          <StatCard
            label="Graph Relations"
            value={s.knowledge.relationships}
          />
        </div>
      </div>

      {/* AI Quality */}
      <div>
        <h2 className="text-lg font-semibold mb-3">AI Quality Gate</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="PHV Safety"
            value={`${(s.ai.phvSafetyScore * 100).toFixed(0)}%`}
            sublabel="Hard gate: must be 100%"
            color={safetyColor}
          />
          <StatCard
            label="Eval Pass Rate"
            value={`${(s.ai.evalPassRate * 100).toFixed(0)}%`}
            sublabel="250 scenario suite"
            color={s.ai.evalPassRate >= 0.7 ? "green" : "yellow"}
          />
          <StatCard
            label="Avg Latency"
            value={`${s.ai.avgLatencyMs}ms`}
            sublabel="Chat response time"
            color={s.ai.avgLatencyMs < 3000 ? "green" : "yellow"}
          />
        </div>
      </div>
    </div>
  );
}
