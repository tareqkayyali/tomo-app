"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { modesHelp } from "@/lib/cms-help/modes";

/* ---------- types ---------- */

interface ModeFormProps {
  modeId?: string;
  initialData?: Record<string, unknown>;
}

/* ---------- option lists ---------- */

const SPORT_OPTIONS: [string, string][] = [
  ["football", "Football"],
  ["padel", "Padel"],
  ["basketball", "Basketball"],
  ["tennis", "Tennis"],
  ["athletics", "Athletics"],
];

const INTENSITY_CAP_OPTIONS: [string, string][] = [
  ["REST", "REST"],
  ["LIGHT", "LIGHT"],
  ["MODERATE", "MODERATE"],
];

const AI_TONE_OPTIONS: [string, string][] = [
  ["supportive", "Supportive"],
  ["performance", "Performance"],
  ["balanced", "Balanced"],
  ["academic", "Academic"],
];

/* ---------- BadgeMultiSelect ---------- */

function BadgeMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: [string, string][];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((s) => s !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([key, label]) => {
        const isSelected = selected.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors border cursor-pointer ${
              isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- PillSelector (single select with nullable) ---------- */

function PillSelector({
  options,
  value,
  onChange,
  nullable = false,
}: {
  options: [string, string][];
  value: string | null;
  onChange: (next: string | null) => void;
  nullable?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {nullable && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors border cursor-pointer ${
            value === null
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
          }`}
        >
          None
        </button>
      )}
      {options.map(([key, label]) => {
        const isSelected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors border cursor-pointer ${
              isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- helpers ---------- */

function parseParams(data: Record<string, unknown>): Record<string, unknown> {
  if (!data.params || typeof data.params !== "object") return {};
  return data.params as Record<string, unknown>;
}

function safeNum(v: unknown, fallback: string): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function safeBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

function safeStr(v: unknown, fallback: string | null): string | null {
  if (v === null || v === undefined) return fallback;
  return String(v);
}


/* ---------- component ---------- */

export function ModeForm({ modeId, initialData }: ModeFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const params = initialData ? parseParams(initialData) : {};

  // Section 1: Identity
  const [id, setId] = useState((initialData?.id as string) ?? "");
  const [label, setLabel] = useState((initialData?.label as string) ?? "");
  const [description, setDescription] = useState(
    (initialData?.description as string) ?? ""
  );
  const [icon, setIcon] = useState((initialData?.icon as string) ?? "");
  const [color, setColor] = useState((initialData?.color as string) ?? "#4CAF50");
  const [sortOrder, setSortOrder] = useState<number>(
    (initialData?.sort_order as number) ?? 0
  );
  const [isEnabled, setIsEnabled] = useState(
    (initialData?.is_enabled as boolean) ?? true
  );

  // Sport filter
  const initSports = Array.isArray(initialData?.sport_filter)
    ? (initialData.sport_filter as string[])
    : [];
  const [sportFilter, setSportFilter] = useState<string[]>(initSports);

  // Section 2: Params — broken into individual fields
  const [maxHardPerWeek, setMaxHardPerWeek] = useState(safeNum(params.maxHardPerWeek, ""));
  const [maxSessionsPerDay, setMaxSessionsPerDay] = useState(safeNum(params.maxSessionsPerDay, ""));
  const [studyDurationMultiplier, setStudyDurationMultiplier] = useState(
    safeNum(params.studyDurationMultiplier, "")
  );
  const [reduceGymDaysTo, setReduceGymDaysTo] = useState(safeNum(params.reduceGymDaysTo, ""));
  const [dropPersonalDev, setDropPersonalDev] = useState(safeBool(params.dropPersonalDev, false));
  const [intensityCapOnExamDays, setIntensityCapOnExamDays] = useState<string | null>(
    safeStr(params.intensityCapOnExamDays, null)
  );
  const [addRecoveryAfterMatch, setAddRecoveryAfterMatch] = useState(
    safeBool(params.addRecoveryAfterMatch, false)
  );
  const [studyTrainingBalanceRatio, setStudyTrainingBalanceRatio] = useState(
    safeNum(params.studyTrainingBalanceRatio, "")
  );
  const [loadCapMultiplier, setLoadCapMultiplier] = useState(
    safeNum(params.loadCapMultiplier, "")
  );
  const [aiCoachingTone, setAiCoachingTone] = useState<string | null>(
    safeStr(params.aiCoachingTone, null)
  );

  // Priority Boosts — structured array
  const initBoosts = Array.isArray(params.priorityBoosts)
    ? (params.priorityBoosts as { category: string; delta: number }[])
    : [];
  const [priorityBoosts, setPriorityBoosts] = useState<{ category: string; delta: number }[]>(initBoosts);

  // Reference Templates — key/value pairs
  const initTemplates = (params.referenceTemplates && typeof params.referenceTemplates === 'object' && !Array.isArray(params.referenceTemplates))
    ? Object.entries(params.referenceTemplates as Record<string, string>).map(([k, v]) => ({ key: k, value: v }))
    : [];
  const [referenceTemplates, setReferenceTemplates] = useState<{ key: string; value: string }[]>(initTemplates);

  /* ---------- save ---------- */

  async function handleSave() {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }

    if (!modeId && !id.trim()) {
      toast.error("Mode ID is required");
      return;
    }

    // Build structured data from form state
    const validBoosts = priorityBoosts.filter((b) => b.category.trim());
    const validTemplates = referenceTemplates.filter((t) => t.key.trim());

    // Build params object
    const builtParams: Record<string, unknown> = {};

    if (maxHardPerWeek !== "") builtParams.maxHardPerWeek = Number(maxHardPerWeek);
    if (maxSessionsPerDay !== "") builtParams.maxSessionsPerDay = Number(maxSessionsPerDay);
    if (studyDurationMultiplier !== "")
      builtParams.studyDurationMultiplier = Number(studyDurationMultiplier);
    if (reduceGymDaysTo !== "") builtParams.reduceGymDaysTo = Number(reduceGymDaysTo);
    builtParams.dropPersonalDev = dropPersonalDev;
    if (intensityCapOnExamDays !== null)
      builtParams.intensityCapOnExamDays = intensityCapOnExamDays;
    builtParams.addRecoveryAfterMatch = addRecoveryAfterMatch;
    if (studyTrainingBalanceRatio !== "")
      builtParams.studyTrainingBalanceRatio = Number(studyTrainingBalanceRatio);
    if (loadCapMultiplier !== "")
      builtParams.loadCapMultiplier = Number(loadCapMultiplier);
    if (aiCoachingTone !== null) builtParams.aiCoachingTone = aiCoachingTone;
    if (validBoosts.length > 0) builtParams.priorityBoosts = validBoosts;
    if (validTemplates.length > 0) {
      const templatesObj: Record<string, string> = {};
      for (const t of validTemplates) templatesObj[t.key.trim()] = t.value;
      builtParams.referenceTemplates = templatesObj;
    }

    const body: Record<string, unknown> = {
      label: label.trim(),
      description: description.trim() || null,
      icon: icon.trim() || null,
      color: color.trim() || null,
      sort_order: sortOrder,
      is_enabled: isEnabled,
      sport_filter: sportFilter.length > 0 ? sportFilter : null,
      params: builtParams,
    };

    // For create, include the id
    if (!modeId) {
      body.id = id.trim();
    }

    setSaving(true);
    try {
      const url = modeId
        ? `/api/v1/admin/modes/${modeId}`
        : "/api/v1/admin/modes";
      const method = modeId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(modeId ? "Mode updated" : "Mode created");
        router.push("/admin/modes");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save mode");
      }
    } catch (err) {
      toast.error("Network error saving mode");
    }
    setSaving(false);
  }

  /* ---------- delete ---------- */

  async function handleDelete() {
    if (!modeId) return;
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/v1/admin/modes/${modeId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${label}" deleted`);
      router.push("/admin/modes");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete mode");
    }
  }

  /* ---------- render ---------- */

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Button
        variant="ghost"
        onClick={() => router.push("/admin/modes")}
        className="mb-2"
      >
        &larr; Back to Modes
      </Button>

      <h1 className="text-3xl font-bold tracking-tight">
        {modeId ? `Edit Mode: ${label}` : "New Mode"}
      </h1>

      <PageGuide {...modesHelp.form.page} />

      {/* Section 1: Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Basic mode information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ID — only editable on create */}
          <div className="space-y-2">
            <Label>Mode ID</Label>
            {modeId ? (
              <p className="text-sm font-mono text-muted-foreground">{modeId}</p>
            ) : (
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. exam_mode, league_mode"
              />
            )}
            <FieldGuide {...modesHelp.form.fields!.modeId} />
          </div>

          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Exam Mode"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this mode do?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Icon</Label>
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g. icon identifier"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#4CAF50"
                />
                <div
                  className="h-9 w-9 rounded-md border shrink-0"
                  style={{ backgroundColor: color }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              <Label>Enabled</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Sport Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Sport Filter</CardTitle>
          <CardDescription>
            Which sports can use this mode? Leave empty for all sports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BadgeMultiSelect
            options={SPORT_OPTIONS}
            selected={sportFilter}
            onChange={setSportFilter}
          />
          {sportFilter.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              No filter applied — available for all sports
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Section 3: Schedule Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule Parameters</CardTitle>
          <CardDescription>
            Controls how the schedule engine adjusts when this mode is active
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Hard Sessions / Week</Label>
              <Input
                type="number"
                min={0}
                max={14}
                value={maxHardPerWeek}
                onChange={(e) => setMaxHardPerWeek(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Sessions / Day</Label>
              <Input
                type="number"
                min={0}
                max={5}
                value={maxSessionsPerDay}
                onChange={(e) => setMaxSessionsPerDay(e.target.value)}
                placeholder="e.g. 1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Study Duration Multiplier</Label>
              <Input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={studyDurationMultiplier}
                onChange={(e) => setStudyDurationMultiplier(e.target.value)}
                placeholder="e.g. 1.5"
              />
              <FieldGuide {...modesHelp.form.fields!.studyDurationMultiplier} />
            </div>
            <div className="space-y-2">
              <Label>Reduce Gym Days To</Label>
              <Input
                type="number"
                min={0}
                max={7}
                value={reduceGymDaysTo}
                onChange={(e) => setReduceGymDaysTo(e.target.value)}
                placeholder="Leave empty for no change"
              />
              <FieldGuide {...modesHelp.form.fields!.reduceGymDaysTo} />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Intensity Cap on Exam Days</Label>
            <PillSelector
              options={INTENSITY_CAP_OPTIONS}
              value={intensityCapOnExamDays}
              onChange={setIntensityCapOnExamDays}
              nullable
            />
            <FieldGuide {...modesHelp.form.fields!.intensityCapOnExamDays} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Study/Training Balance Ratio</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={studyTrainingBalanceRatio}
                onChange={(e) => setStudyTrainingBalanceRatio(e.target.value)}
                placeholder="e.g. 0.6"
              />
              <FieldGuide {...modesHelp.form.fields!.studyTrainingBalanceRatio} />
            </div>
            <div className="space-y-2">
              <Label>Load Cap Multiplier</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={loadCapMultiplier}
                onChange={(e) => setLoadCapMultiplier(e.target.value)}
                placeholder="e.g. 0.7"
              />
              <FieldGuide {...modesHelp.form.fields!.loadCapMultiplier} />
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Switch
                checked={dropPersonalDev}
                onCheckedChange={setDropPersonalDev}
              />
              <div>
                <Label>Drop Personal Dev</Label>
                <FieldGuide {...modesHelp.form.fields!.dropPersonalDev} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={addRecoveryAfterMatch}
                onCheckedChange={setAddRecoveryAfterMatch}
              />
              <div>
                <Label>Add Recovery After Match</Label>
                <FieldGuide {...modesHelp.form.fields!.addRecoveryAfterMatch} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: AI Coaching */}
      <Card>
        <CardHeader>
          <CardTitle>AI Coaching</CardTitle>
          <CardDescription>
            Controls how the AI coach adjusts tone and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>AI Coaching Tone</Label>
            <PillSelector
              options={AI_TONE_OPTIONS}
              value={aiCoachingTone}
              onChange={setAiCoachingTone}
              nullable
            />
            <FieldGuide {...modesHelp.form.fields!.aiCoachingTone} />
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Priority Boosts */}
      <Card>
        <CardHeader>
          <CardTitle>Priority Boosts</CardTitle>
          <CardDescription>
            Boost priority for specific recommendation categories when this mode is active
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {priorityBoosts.map((boost, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={boost.category}
                onChange={(e) => {
                  const next = [...priorityBoosts];
                  next[idx] = { ...next[idx], category: e.target.value };
                  setPriorityBoosts(next);
                }}
                placeholder="Category (e.g. recovery, study)"
                className="flex-1"
              />
              <Input
                type="number"
                value={boost.delta}
                onChange={(e) => {
                  const next = [...priorityBoosts];
                  next[idx] = { ...next[idx], delta: Number(e.target.value) };
                  setPriorityBoosts(next);
                }}
                placeholder="Delta"
                className="w-24"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive/80"
                onClick={() => setPriorityBoosts(priorityBoosts.filter((_, i) => i !== idx))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPriorityBoosts([...priorityBoosts, { category: "", delta: 0 }])}
          >
            + Add Boost
          </Button>
        </CardContent>
      </Card>

      {/* Section 6: Reference Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Reference Templates</CardTitle>
          <CardDescription>
            Template references used by the schedule engine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {referenceTemplates.map((tmpl, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={tmpl.key}
                onChange={(e) => {
                  const next = [...referenceTemplates];
                  next[idx] = { ...next[idx], key: e.target.value };
                  setReferenceTemplates(next);
                }}
                placeholder="Key (e.g. exam_prep)"
                className="flex-1"
              />
              <Input
                value={tmpl.value}
                onChange={(e) => {
                  const next = [...referenceTemplates];
                  next[idx] = { ...next[idx], value: e.target.value };
                  setReferenceTemplates(next);
                }}
                placeholder="Template ID"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive/80"
                onClick={() => setReferenceTemplates(referenceTemplates.filter((_, i) => i !== idx))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReferenceTemplates([...referenceTemplates, { key: "", value: "" }])}
          >
            + Add Template
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between pb-8">
        <div>
          {modeId && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive/80"
              onClick={handleDelete}
            >
              Delete Mode
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/admin/modes")}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : modeId ? "Save Changes" : "Create Mode"}
          </Button>
        </div>
      </div>
    </div>
  );
}
