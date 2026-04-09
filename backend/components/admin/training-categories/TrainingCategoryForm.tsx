"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TrainingCategoryFormProps {
  categoryId?: string;
  initialData?: Record<string, unknown>;
}

type DefaultMode = "fixed_days" | "days_per_week";
type PreferredTime = "morning" | "afternoon" | "evening";

const DURATION_OPTIONS = [30, 45, 60, 75, 90, 120] as const;
const TIME_OPTIONS: PreferredTime[] = ["morning", "afternoon", "evening"];
const SPORT_OPTIONS = [
  "football",
  "padel",
  "basketball",
  "tennis",
  "athletics",
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TrainingCategoryForm({
  categoryId,
  initialData,
}: TrainingCategoryFormProps) {
  const router = useRouter();
  const isEdit = Boolean(categoryId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // -- Form state --
  const [id, setId] = useState((initialData?.id as string) || "");
  const [label, setLabel] = useState((initialData?.label as string) || "");
  const [icon, setIcon] = useState((initialData?.icon as string) || "");
  const [color, setColor] = useState(
    (initialData?.color as string) || "#888888"
  );
  const [defaultMode, setDefaultMode] = useState<DefaultMode>(
    (initialData?.default_mode as DefaultMode) || "days_per_week"
  );
  const [defaultDaysPerWeek, setDefaultDaysPerWeek] = useState(
    (initialData?.default_days_per_week as number) || 3
  );
  const [defaultSessionDuration, setDefaultSessionDuration] = useState(
    (initialData?.default_session_duration as number) || 60
  );
  const [defaultPreferredTime, setDefaultPreferredTime] =
    useState<PreferredTime>(
      (initialData?.default_preferred_time as PreferredTime) || "afternoon"
    );
  const [sortOrder, setSortOrder] = useState(
    (initialData?.sort_order as number) || 0
  );
  const [sportFilter, setSportFilter] = useState<string[]>(
    (initialData?.sport_filter as string[]) || []
  );
  const [isEnabled, setIsEnabled] = useState(
    initialData?.is_enabled !== undefined
      ? (initialData.is_enabled as boolean)
      : true
  );

  /* ---- Sport filter toggle ---- */
  function toggleSport(sport: string) {
    setSportFilter((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  /* ---- Submit ---- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!id.trim()) {
      toast.error("Category ID is required");
      return;
    }
    if (!label.trim()) {
      toast.error("Display Name is required");
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      id: id.trim(),
      label: label.trim(),
      icon: icon.trim() || null,
      color: color.trim() || null,
      default_mode: defaultMode,
      default_days_per_week: defaultDaysPerWeek,
      default_session_duration: defaultSessionDuration,
      default_preferred_time: defaultPreferredTime,
      sort_order: sortOrder,
      sport_filter: sportFilter.length > 0 ? sportFilter : null,
      is_enabled: isEnabled,
    };

    // For POST (create), the API expects `key` as well — some older service code uses it
    if (!isEdit) {
      payload.key = id.trim();
    }

    const url = isEdit
      ? `/api/v1/admin/training-categories/${categoryId}`
      : "/api/v1/admin/training-categories";
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          isEdit ? "Category updated" : "Category created"
        );
        router.push("/admin/training-categories");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save category");
      }
    } catch {
      toast.error("Network error — failed to save");
    }

    setSaving(false);
  }

  /* ---- Delete ---- */
  async function handleDelete() {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setDeleting(true);

    try {
      const res = await fetch(
        `/api/v1/admin/training-categories/${categoryId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (res.ok) {
        toast.success(`"${label}" deleted`);
        router.push("/admin/training-categories");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to delete category");
      }
    } catch {
      toast.error("Network error — failed to delete");
    }

    setDeleting(false);
  }

  /* ---- Render ---- */
  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground mb-1"
            onClick={() => router.push("/admin/training-categories")}
          >
            &larr; Back to Training Categories
          </button>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEdit ? "Edit Training Category" : "New Training Category"}
          </h1>
        </div>
      </div>

      {/* ---- Identity ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cat-id">Category ID</Label>
              <Input
                id="cat-id"
                placeholder='e.g. "club", "gym"'
                value={id}
                onChange={(e) => setId(e.target.value)}
                disabled={isEdit}
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  ID cannot be changed after creation
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-label">Display Name</Label>
              <Input
                id="cat-label"
                placeholder="Club Training"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cat-icon">Icon</Label>
              <Input
                id="cat-icon"
                placeholder="Emoji"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-color">Color</Label>
              <div className="flex items-center gap-2">
                <div
                  className="h-8 w-8 rounded-md border shrink-0"
                  style={{ backgroundColor: color }}
                />
                <Input
                  id="cat-color"
                  placeholder="#2ECC71"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-sort">Sort Order</Label>
              <Input
                id="cat-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ---- Scheduling Defaults ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Scheduling Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Mode */}
          <div className="space-y-2">
            <Label>Default Mode</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "fixed_days", label: "Fixed Days" },
                  { value: "days_per_week", label: "Days Per Week" },
                ] as const
              ).map((opt) => (
                <Badge
                  key={opt.value}
                  variant={defaultMode === opt.value ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1 text-sm"
                  onClick={() => setDefaultMode(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Default Days Per Week */}
          <div className="space-y-2">
            <Label htmlFor="cat-days">Default Days/Week</Label>
            <Input
              id="cat-days"
              type="number"
              min={1}
              max={7}
              className="w-24"
              value={defaultDaysPerWeek}
              onChange={(e) =>
                setDefaultDaysPerWeek(
                  Math.min(7, Math.max(1, Number(e.target.value)))
                )
              }
            />
          </div>

          {/* Default Session Duration */}
          <div className="space-y-2">
            <Label>Default Session Duration (minutes)</Label>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((mins) => (
                <Badge
                  key={mins}
                  variant={
                    defaultSessionDuration === mins ? "default" : "outline"
                  }
                  className="cursor-pointer px-3 py-1 text-sm"
                  onClick={() => setDefaultSessionDuration(mins)}
                >
                  {mins}
                </Badge>
              ))}
            </div>
          </div>

          {/* Default Preferred Time */}
          <div className="space-y-2">
            <Label>Default Preferred Time</Label>
            <div className="flex gap-2">
              {TIME_OPTIONS.map((time) => (
                <Badge
                  key={time}
                  variant={
                    defaultPreferredTime === time ? "default" : "outline"
                  }
                  className="cursor-pointer px-3 py-1 text-sm capitalize"
                  onClick={() => setDefaultPreferredTime(time)}
                >
                  {time}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ---- Sport Filter ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Sport Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Leave empty to show this category for all sports.
          </p>
          <div className="flex flex-wrap gap-2">
            {SPORT_OPTIONS.map((sport) => (
              <Badge
                key={sport}
                variant={sportFilter.includes(sport) ? "default" : "outline"}
                className="cursor-pointer px-3 py-1 text-sm capitalize"
                onClick={() => toggleSport(sport)}
              >
                {sport}
              </Badge>
            ))}
          </div>
          {sportFilter.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              All sports (no filter)
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ---- Enabled ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            <Label className="cursor-pointer">
              {isEnabled ? "Enabled" : "Disabled"}
            </Label>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ---- Actions ---- */}
      <div className="flex items-center justify-between">
        <div>
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete Category"}
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/training-categories")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Create Category"}
          </Button>
        </div>
      </div>
    </form>
  );
}
