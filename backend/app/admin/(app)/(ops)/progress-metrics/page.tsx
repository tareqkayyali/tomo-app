"use client";

/**
 * Progress Metrics admin list page.
 *
 * Table of every row in `progress_metrics`. Quick-toggle the enabled flag per
 * row; the mobile `GET /api/v1/progress/metrics` resolver re-reads on the
 * next request and the Signal > Progress tab reshapes immediately.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface ProgressMetric {
  id: string;
  metric_key: string;
  display_name: string;
  display_unit: string;
  category: "readiness" | "wellness" | "academic" | "performance" | "engagement";
  source_kind: string;
  source_field: string;
  direction: "higher_better" | "lower_better" | "neutral";
  sort_order: number;
  sport_filter: string[] | null;
  is_enabled: boolean;
  notification_triggers: { triggers?: unknown[] } | null;
  updated_at: string;
}

const CATEGORY_COLOR: Record<ProgressMetric["category"], string> = {
  readiness: "#7A9B76",
  wellness: "#5A8A9F",
  academic: "#8A6A30",
  performance: "#c49a3c",
  engagement: "#6A5A8A",
};

export default function ProgressMetricsPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<ProgressMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ProgressMetric["category"]>("all");

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/progress-metrics", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setMetrics(data.metrics ?? []);
    } else {
      toast.error("Failed to load progress metrics");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  async function handleToggle(m: ProgressMetric) {
    const res = await fetch(`/api/v1/admin/progress-metrics/${m.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "toggle", is_enabled: !m.is_enabled }),
    });
    if (res.ok) {
      toast.success(`"${m.display_name}" ${!m.is_enabled ? "enabled" : "disabled"}`);
      fetchMetrics();
    } else {
      toast.error("Failed to toggle metric");
    }
  }

  async function handleDuplicate(m: ProgressMetric) {
    const res = await fetch(`/api/v1/admin/progress-metrics/${m.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "duplicate" }),
    });
    if (res.ok) {
      toast.success(`Duplicated "${m.display_name}"`);
      fetchMetrics();
    } else {
      toast.error("Failed to duplicate metric");
    }
  }

  async function handleDelete(m: ProgressMetric) {
    if (!confirm(`Delete "${m.display_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/v1/admin/progress-metrics/${m.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success(`"${m.display_name}" deleted`);
      fetchMetrics();
    } else {
      toast.error("Failed to delete metric");
    }
  }

  const filteredMetrics = metrics.filter((m) =>
    filter === "all" ? true : m.category === filter,
  );
  const enabledCount = filteredMetrics.filter((m) => m.is_enabled).length;
  const totalCount = filteredMetrics.length;

  const FILTERS: Array<{ key: typeof filter; label: string; color?: string }> = [
    { key: "all", label: "All", color: "rgba(255,255,255,0.35)" },
    { key: "readiness", label: "Readiness", color: CATEGORY_COLOR.readiness },
    { key: "wellness", label: "Wellness", color: CATEGORY_COLOR.wellness },
    { key: "academic", label: "Academic", color: CATEGORY_COLOR.academic },
    { key: "performance", label: "Performance", color: CATEGORY_COLOR.performance },
    { key: "engagement", label: "Engagement", color: CATEGORY_COLOR.engagement },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Progress Metrics</h1>
          <p className="text-muted-foreground">
            {enabledCount} of {totalCount} metric{totalCount !== 1 ? "s" : ""} enabled &mdash;
            controls the Signal &gt; Progress tab ring cards.
          </p>
        </div>
        <Button onClick={() => router.push("/admin/progress-metrics/new")}>
          + New Metric
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 border-b border-border">
        {FILTERS.map((t) => {
          const isActive = filter === t.key;
          const count =
            t.key === "all"
              ? metrics.length
              : metrics.filter((m) => m.category === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <Badge variant="outline" className="ml-2">{count}</Badge>
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px]"
                  style={{ backgroundColor: t.color ?? "currentColor" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="p-8 text-muted-foreground">Loading…</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Sports</TableHead>
              <TableHead>Triggers</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMetrics.map((m) => {
              const triggerCount = Array.isArray(m.notification_triggers?.triggers)
                ? m.notification_triggers!.triggers!.length
                : 0;
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.sort_order}</TableCell>
                  <TableCell>
                    <div className="font-medium">{m.display_name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {m.metric_key} · {m.display_unit || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: CATEGORY_COLOR[m.category],
                        color: CATEGORY_COLOR[m.category],
                      }}
                    >
                      {m.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{m.source_kind}</div>
                    <div className="font-mono text-xs text-muted-foreground">{m.source_field}</div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{m.direction.replace("_", " ")}</span>
                  </TableCell>
                  <TableCell>
                    {m.sport_filter && m.sport_filter.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {m.sport_filter.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">all</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {triggerCount > 0 ? (
                      <Badge variant="outline">{triggerCount}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.is_enabled}
                      onCheckedChange={() => handleToggle(m)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/admin/progress-metrics/${m.id}/edit`)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDuplicate(m)}
                      >
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(m)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredMetrics.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No metrics in this category.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
