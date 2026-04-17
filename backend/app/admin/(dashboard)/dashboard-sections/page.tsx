"use client";

import { useEffect, useState, useCallback } from "react";
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

// ── Component type display config ──

const COMPONENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  signal_hero:     { label: "Athlete Mode",    color: "#30D158" },
  status_ring:     { label: "Status Ring",     color: "#7a9b76" },
  kpi_row:         { label: "KPI Row",         color: "#5A8A9F" },
  sparkline_row:   { label: "Sparkline Row",   color: "#8A6A30" },
  dual_load:       { label: "Dual Load",       color: "#c49a3c" },
  benchmark:       { label: "Benchmark",       color: "#6A8A5A" },
  rec_list:        { label: "Rec List",        color: "#4A7A8A" },
  event_list:      { label: "Event List",      color: "#5A6A8A" },
  growth_card:     { label: "Growth Card",     color: "#8A5A6A" },
  engagement_bar:  { label: "Engagement Bar",  color: "#6A5A8A" },
  protocol_banner: { label: "Protocol Banner", color: "#8A4A4A" },
  custom_card:     { label: "Custom Card",     color: "#5A8A6A" },
  daily_recs:      { label: "Daily Recs",      color: "#4A8A6A" },
  up_next:         { label: "Up Next",         color: "#6A7A5A" },
};

// Screen-level sections are rendered at fixed positions in the mobile app.
// Their sort_order only matters for CMS table display — reordering them
// has no effect on screen position.
const SCREEN_LEVEL_TYPES = new Set(["signal_hero", "daily_recs", "up_next"]);

const ZONE_LABELS: Record<string, { zone: string; position: string }> = {
  signal_hero: { zone: "Zone 1", position: "Top of screen" },
  daily_recs:  { zone: "Zone 2", position: "Below hero" },
  up_next:     { zone: "Zone 4", position: "Bottom of screen" },
};

interface DashboardSection {
  id: string;
  section_key: string;
  display_name: string;
  component_type: string;
  sort_order: number;
  visibility: Record<string, unknown> | null;
  config: Record<string, unknown>;
  coaching_text: string | null;
  sport_filter: string[] | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export default function DashboardSectionsPage() {
  const router = useRouter();
  const [sections, setSections] = useState<DashboardSection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSections = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/dashboard-sections", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setSections(data.sections ?? []);
    } else {
      toast.error("Failed to load dashboard sections");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // ── Toggle enable/disable ──
  async function handleToggle(section: DashboardSection) {
    const res = await fetch(`/api/v1/admin/dashboard-sections/${section.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "toggle", is_enabled: !section.is_enabled }),
    });

    if (res.ok) {
      toast.success(
        `"${section.display_name}" ${!section.is_enabled ? "enabled" : "disabled"}`
      );
      fetchSections();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to toggle section");
    }
  }

  // ── Duplicate ──
  async function handleDuplicate(section: DashboardSection) {
    const res = await fetch(`/api/v1/admin/dashboard-sections/${section.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "duplicate" }),
    });

    if (res.ok) {
      toast.success(`Duplicated "${section.display_name}"`);
      fetchSections();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to duplicate section");
    }
  }

  // ── Delete ──
  async function handleDelete(section: DashboardSection) {
    if (!confirm(`Delete "${section.display_name}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/v1/admin/dashboard-sections/${section.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${section.display_name}" deleted`);
      fetchSections();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete section");
    }
  }

  // ── Move up/down (swap sort_order with adjacent) ──
  async function handleMove(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= sections.length) return;

    const a = sections[index];
    const b = sections[swapIndex];
    const order = [
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ];

    const res = await fetch("/api/v1/admin/dashboard-sections", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });

    if (res.ok) {
      toast.success("Order updated");
      fetchSections();
    } else {
      toast.error("Failed to reorder");
    }
  }

  const enabledCount = sections.filter((s) => s.is_enabled).length;
  const totalCount = sections.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Sections</h1>
          <p className="text-muted-foreground">
            {enabledCount} of {totalCount} section{totalCount !== 1 ? "s" : ""} enabled
            {" "}&mdash; controls the mobile dashboard layout.
            Pinned sections (&#128274;) render at fixed screen positions.
          </p>
        </div>
        <Button onClick={() => router.push("/admin/dashboard-sections/new")}>
          + New Section
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead className="w-[100px]">Sport Filter</TableHead>
              <TableHead className="w-[80px]">Enabled</TableHead>
              <TableHead className="w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : sections.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No dashboard sections found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              sections.map((s, i) => {
                const typeConfig = COMPONENT_TYPE_LABELS[s.component_type] ?? {
                  label: s.component_type,
                  color: "#666",
                };
                const hasVisibility = s.visibility !== null;
                const conditionCount = hasVisibility
                  ? ((s.visibility as any)?.conditions?.length ?? 0)
                  : 0;
                const isPinned = SCREEN_LEVEL_TYPES.has(s.component_type);
                const zoneInfo = ZONE_LABELS[s.component_type] ?? null;

                return (
                  <TableRow
                    key={s.id}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      !s.is_enabled ? "opacity-50" : ""
                    }`}
                    onClick={() =>
                      router.push(`/admin/dashboard-sections/${s.id}/edit`)
                    }
                  >
                    {/* Sort Order + Move Arrows */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm w-8">{s.sort_order}</span>
                        {isPinned ? (
                          <span className="text-xs text-muted-foreground" title={zoneInfo?.position ?? "Pinned"}>
                            &#128274;
                          </span>
                        ) : (
                        <div className="flex flex-col gap-0.5">
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={i === 0}
                            onClick={() => handleMove(i, "up")}
                            title="Move up"
                          >
                            &uarr;
                          </button>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={i === sections.length - 1}
                            onClick={() => handleMove(i, "down")}
                            title="Move down"
                          >
                            &darr;
                          </button>
                        </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Display Name */}
                    <TableCell className="font-medium">
                      {s.display_name}
                      {s.coaching_text && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px] mt-0.5">
                          {s.coaching_text}
                        </p>
                      )}
                    </TableCell>

                    {/* Section Key */}
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.section_key}
                    </TableCell>

                    {/* Component Type Badge */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: typeConfig.color,
                            color: typeConfig.color,
                          }}
                        >
                          {typeConfig.label}
                        </Badge>
                        {zoneInfo && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                            style={{
                              borderColor: "rgba(255,255,255,0.15)",
                              color: "rgba(255,255,255,0.40)",
                            }}
                            title={zoneInfo.position}
                          >
                            {zoneInfo.zone}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Visibility */}
                    <TableCell className="text-sm text-muted-foreground">
                      {hasVisibility ? (
                        <span>
                          {(s.visibility as any)?.match?.toUpperCase()} of{" "}
                          {conditionCount} condition{conditionCount !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs">Always visible</span>
                      )}
                    </TableCell>

                    {/* Sport Filter */}
                    <TableCell>
                      {s.sport_filter && s.sport_filter.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {s.sport_filter.map((sport) => (
                            <Badge
                              key={sport}
                              variant="outline"
                              className="text-xs"
                            >
                              {sport}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">All</span>
                      )}
                    </TableCell>

                    {/* Enabled Toggle */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={s.is_enabled}
                        onCheckedChange={() => handleToggle(s)}
                      />
                    </TableCell>

                    {/* Actions */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/admin/dashboard-sections/${s.id}/edit`)
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicate(s)}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive/80"
                          onClick={() => handleDelete(s)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
