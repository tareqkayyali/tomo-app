"use client";

/**
 * Admin: Scheduling Rules
 * ───────────────────────
 * Live editor for the CMS-managed scheduling_rules row (migration 047).
 * Changes take effect on the next /suggest-slots call (~60s cache TTL is
 * busted on save by the PATCH route).
 *
 * Sections:
 *  - Buffers (default, high-intensity, match before/after)
 *  - Day window (earliest start / latest end)
 *  - Preferred training window
 *  - Limits (max sessions/day, exam-day caps)
 *  - Priority orders (4 scenarios, comma-separated for now)
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

interface SchedulingRulesConfig {
  buffers: {
    default: number;
    afterHighIntensity: number;
    afterMatch: number;
    beforeMatch: number;
  };
  dayWindow: { startHour: number; endHour: number };
  preferredTrainingWindow: { startMin: number; endMin: number };
  limits: {
    maxSessionsPerDay: number;
    noHardOnExamDay: boolean;
    intensityCapOnExamDays: "REST" | "LIGHT" | "MODERATE" | "HARD";
  };
  priority: {
    normal: string[];
    leagueActive: string[];
    examPeriod: string[];
    leagueExam: string[];
  };
}

function minutesToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeStrToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function SchedulingRulesPage() {
  const [config, setConfig] = useState<SchedulingRulesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/scheduling-rules", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setConfig(data.config);
      setUpdatedAt(data.updatedAt);
      setUsingFallback(!!data.usingFallback);
    } else {
      toast.error("Failed to load scheduling rules");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    const res = await fetch("/api/v1/admin/scheduling-rules", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      toast.success("Scheduling rules saved — live on next /suggest-slots call");
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save");
    }
    setSaving(false);
  }

  if (loading || !config) {
    return <div className="p-6 text-muted-foreground">Loading scheduling rules…</div>;
  }

  const update = <K extends keyof SchedulingRulesConfig>(
    key: K,
    value: SchedulingRulesConfig[K]
  ) => setConfig({ ...config, [key]: value });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scheduling Rules</h1>
          <p className="text-muted-foreground">
            Global rules used by the calendar scheduling engine, AI build_session
            flow, and auto-fill-week suggestions.
            {updatedAt && (
              <span className="ml-2 text-xs">
                Last saved: {new Date(updatedAt).toLocaleString()}
              </span>
            )}
            {usingFallback && (
              <span className="ml-2 text-xs text-amber-500">
                (using fallback — no row in DB yet)
              </span>
            )}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {/* Buffers */}
      <Card>
        <CardHeader>
          <CardTitle>Buffers (minutes)</CardTitle>
          <CardDescription>
            Minimum gap between events. Longer gaps apply after high-effort
            sessions and around matches.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Default gap</Label>
            <Input
              type="number"
              min={0}
              max={240}
              value={config.buffers.default}
              onChange={(e) =>
                update("buffers", { ...config.buffers, default: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>After high-intensity (RPE ≥ 7)</Label>
            <Input
              type="number"
              min={0}
              max={480}
              value={config.buffers.afterHighIntensity}
              onChange={(e) =>
                update("buffers", {
                  ...config.buffers,
                  afterHighIntensity: Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label>After match</Label>
            <Input
              type="number"
              min={0}
              max={960}
              value={config.buffers.afterMatch}
              onChange={(e) =>
                update("buffers", { ...config.buffers, afterMatch: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>Before match</Label>
            <Input
              type="number"
              min={0}
              max={480}
              value={config.buffers.beforeMatch}
              onChange={(e) =>
                update("buffers", { ...config.buffers, beforeMatch: Number(e.target.value) })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Day window */}
      <Card>
        <CardHeader>
          <CardTitle>Day Window</CardTitle>
          <CardDescription>
            Earliest and latest hour of the day an event can be scheduled.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Start hour (0–23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={config.dayWindow.startHour}
              onChange={(e) =>
                update("dayWindow", {
                  ...config.dayWindow,
                  startHour: Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label>End hour (1–24)</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={config.dayWindow.endHour}
              onChange={(e) =>
                update("dayWindow", {
                  ...config.dayWindow,
                  endHour: Number(e.target.value),
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferred training window */}
      <Card>
        <CardHeader>
          <CardTitle>Preferred Training Window</CardTitle>
          <CardDescription>
            Slot scoring prioritizes these hours when suggesting times.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label>Start time (HH:MM)</Label>
            <Input
              type="time"
              value={minutesToTimeStr(config.preferredTrainingWindow.startMin)}
              onChange={(e) =>
                update("preferredTrainingWindow", {
                  ...config.preferredTrainingWindow,
                  startMin: timeStrToMinutes(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label>End time (HH:MM)</Label>
            <Input
              type="time"
              value={minutesToTimeStr(config.preferredTrainingWindow.endMin)}
              onChange={(e) =>
                update("preferredTrainingWindow", {
                  ...config.preferredTrainingWindow,
                  endMin: timeStrToMinutes(e.target.value),
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Limits</CardTitle>
          <CardDescription>
            Per-day and exam-period safety caps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Max sessions per day</Label>
            <Input
              type="number"
              min={1}
              max={6}
              value={config.limits.maxSessionsPerDay}
              onChange={(e) =>
                update("limits", {
                  ...config.limits,
                  maxSessionsPerDay: Number(e.target.value),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>No HARD sessions on exam day</Label>
              <p className="text-xs text-muted-foreground">
                Blocks HARD intensity when an exam is scheduled.
              </p>
            </div>
            <Switch
              checked={config.limits.noHardOnExamDay}
              onCheckedChange={(v) =>
                update("limits", { ...config.limits, noHardOnExamDay: v })
              }
            />
          </div>
          <div>
            <Label>Intensity cap on exam days</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={config.limits.intensityCapOnExamDays}
              onChange={(e) =>
                update("limits", {
                  ...config.limits,
                  intensityCapOnExamDays: e.target.value as
                    | "REST"
                    | "LIGHT"
                    | "MODERATE"
                    | "HARD",
                })
              }
            >
              <option value="REST">REST</option>
              <option value="LIGHT">LIGHT</option>
              <option value="MODERATE">MODERATE</option>
              <option value="HARD">HARD</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Priority orders */}
      <Card>
        <CardHeader>
          <CardTitle>Priority Orders</CardTitle>
          <CardDescription>
            Comma-separated event-type order (highest priority first) for each
            scenario. Used when multiple events compete for the same slot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["normal", "leagueActive", "examPeriod", "leagueExam"] as const).map((key) => (
            <div key={key}>
              <Label>
                {key === "normal"
                  ? "Normal"
                  : key === "leagueActive"
                  ? "League Active"
                  : key === "examPeriod"
                  ? "Exam Period"
                  : "League + Exam"}
              </Label>
              <Input
                value={config.priority[key].join(", ")}
                onChange={(e) =>
                  update("priority", {
                    ...config.priority,
                    [key]: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
