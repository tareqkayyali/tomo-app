"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ── Constants ──

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const POSITIONS = [
  "GK", "CB", "FB", "WB", "CDM", "CM", "CAM", "WM", "W", "ST", "CF",
];

// ── Types ──

interface DrillAssignment {
  drill_id: string;
  drill_name?: string;
  week_number: number;
  day_of_week: number;
  sets: number;
  reps: string;
  intensity: string;
  rest_seconds: number;
  rpe_target: number;
  duration_min?: number;
  coach_notes?: string;
  progression: string;
  is_mandatory: boolean;
  order_in_day: number;
  repeat_weeks: number;
}

interface DrillOption {
  id: string;
  name: string;
  category: string;
  duration_minutes: number;
}

interface ProgrammeFormProps {
  programmeId?: string;
  initialData?: Record<string, unknown>;
}

// ── Main Form ──

export function ProgrammeForm({ programmeId, initialData }: ProgrammeFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Basic fields
  const [name, setName] = useState((initialData?.name as string) || "");
  const [description, setDescription] = useState((initialData?.description as string) || "");
  const [seasonCycle, setSeasonCycle] = useState((initialData?.season_cycle as string) || "in_season");
  const [startDate, setStartDate] = useState((initialData?.start_date as string) || "");
  const [weeks, setWeeks] = useState((initialData?.weeks as number) || 4);
  const [status, setStatus] = useState((initialData?.status as string) || "draft");
  const [targetType, setTargetType] = useState((initialData?.target_type as string) || "all");
  const [targetPositions, setTargetPositions] = useState<string[]>(
    (initialData?.target_positions as string[]) || []
  );

  // Drill assignments
  const [drills, setDrills] = useState<DrillAssignment[]>(
    ((initialData?.drills as DrillAssignment[]) || []).map((d) => ({
      ...d,
      drill_name: (d as any).training_drills?.name || d.drill_name,
    }))
  );

  // Drill catalog for picker
  const [drillCatalog, setDrillCatalog] = useState<DrillOption[]>([]);
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [pickerWeek, setPickerWeek] = useState(1);
  const [pickerDay, setPickerDay] = useState(1);

  // Load drill catalog
  const loadDrills = useCallback(async () => {
    const res = await fetch("/api/v1/admin/drills?limit=100&active=true", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setDrillCatalog(data.drills || []);
    }
  }, []);

  useEffect(() => {
    loadDrills();
  }, [loadDrills]);

  // ── Drill assignment helpers ──

  function addDrill(drillOption: DrillOption) {
    const dayDrills = drills.filter(
      (d) => d.week_number === pickerWeek && d.day_of_week === pickerDay
    );

    setDrills([
      ...drills,
      {
        drill_id: drillOption.id,
        drill_name: drillOption.name,
        week_number: pickerWeek,
        day_of_week: pickerDay,
        sets: 3,
        reps: "8-12",
        intensity: "moderate",
        rest_seconds: 60,
        rpe_target: 7,
        duration_min: drillOption.duration_minutes,
        progression: "none",
        is_mandatory: true,
        order_in_day: dayDrills.length,
        repeat_weeks: 1,
      },
    ]);
    setShowDrillPicker(false);
  }

  function removeDrill(index: number) {
    setDrills(drills.filter((_, i) => i !== index));
  }

  function updateDrillField(index: number, field: keyof DrillAssignment, value: unknown) {
    setDrills(drills.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  // ── Position toggle ──

  function togglePosition(pos: string) {
    if (targetPositions.includes(pos)) {
      setTargetPositions(targetPositions.filter((p) => p !== pos));
    } else {
      setTargetPositions([...targetPositions, pos]);
    }
  }

  // ── Submit ──

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name,
      description,
      season_cycle: seasonCycle,
      start_date: startDate,
      weeks,
      status,
      target_type: targetType,
      target_positions: targetPositions,
      target_player_ids: [],
      drills: drills.map(({ drill_name, ...rest }) => rest),
    };

    const url = programmeId
      ? `/api/v1/admin/programmes/${programmeId}`
      : "/api/v1/admin/programmes";
    const method = programmeId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(programmeId ? "Programme updated" : "Programme created");
      if (!programmeId) {
        const data = await res.json();
        if (data?.id) router.push(`/admin/programmes/${data.id}/edit`);
        else router.push("/admin/programmes");
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save programme");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {programmeId ? "Edit Programme" : "New Programme"}
          </h1>
          <p className="text-muted-foreground">
            {programmeId ? "Update multi-week training programme" : "Create a new coach programme"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/programmes")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : programmeId ? "Save Programme" : "Create Programme"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* ── Section 1: Basic Info ── */}
      <Card>
        <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Programme Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Season Cycle</Label>
              <Select value={seasonCycle} onValueChange={(v) => v && setSeasonCycle(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_season">Pre-Season</SelectItem>
                  <SelectItem value="in_season">In-Season</SelectItem>
                  <SelectItem value="off_season">Off-Season</SelectItem>
                  <SelectItem value="exam_period">Exam Period</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Weeks</Label>
              <Input type="number" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} min={1} max={52} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Targeting ── */}
      <Card>
        <CardHeader><CardTitle>Targeting</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Target Type</Label>
            <Select value={targetType} onValueChange={(v) => v && setTargetType(v)}>
              <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Players</SelectItem>
                <SelectItem value="position_group">Position Group</SelectItem>
                <SelectItem value="individual">Individual Players</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {targetType === "position_group" && (
            <div className="space-y-2">
              <Label>Target Positions</Label>
              <div className="flex flex-wrap gap-2">
                {POSITIONS.map((pos) => (
                  <Badge
                    key={pos}
                    variant={targetPositions.includes(pos) ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => togglePosition(pos)}
                  >
                    {pos}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: Weekly Drill Schedule ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Weekly Drill Schedule</CardTitle>
            <span className="text-sm text-muted-foreground">{drills.length} drill{drills.length !== 1 ? "s" : ""} assigned</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Week × Day grid */}
          {Array.from({ length: weeks }, (_, w) => w + 1).map((weekNum) => (
            <div key={weekNum} className="border rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-sm">Week {weekNum}</h4>
              <div className="grid grid-cols-7 gap-2">
                {DAY_LABELS.map((dayLabel, dayIdx) => {
                  const dayDrills = drills.filter(
                    (d) => d.week_number === weekNum && d.day_of_week === dayIdx
                  );
                  return (
                    <div key={dayIdx} className="border rounded p-2 min-h-[80px] bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{dayLabel}</p>
                      {dayDrills.map((d) => {
                        const globalIdx = drills.indexOf(d);
                        return (
                          <div key={globalIdx} className="bg-background rounded p-1.5 mb-1 text-xs border">
                            <div className="flex justify-between items-start">
                              <span className="font-medium truncate flex-1">{d.drill_name || "Drill"}</span>
                              <button
                                type="button"
                                onClick={() => removeDrill(globalIdx)}
                                className="text-destructive ml-1 shrink-0"
                              >
                                ×
                              </button>
                            </div>
                            <div className="text-muted-foreground mt-0.5">
                              {d.sets}×{d.reps} RPE {d.rpe_target}
                            </div>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setPickerWeek(weekNum);
                          setPickerDay(dayIdx);
                          setShowDrillPicker(true);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Drill picker modal */}
          {showDrillPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-background rounded-lg p-6 w-[600px] max-h-[80vh] overflow-y-auto shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">
                    Add Drill — Week {pickerWeek}, {DAY_LABELS[pickerDay]}
                  </h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowDrillPicker(false)}>
                    ×
                  </Button>
                </div>
                <div className="space-y-2">
                  {drillCatalog.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No active drills found</p>
                  ) : (
                    drillCatalog.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => addDrill(d)}
                        className="w-full text-left p-3 border rounded hover:bg-muted/50 transition-colors"
                      >
                        <div className="font-medium text-sm">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.category} · {d.duration_minutes}min
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bottom actions ── */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/programmes")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : programmeId ? "Save Programme" : "Create Programme"}
        </Button>
      </div>
    </form>
  );
}
