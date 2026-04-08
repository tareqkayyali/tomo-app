"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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

/* ---------- info icon (matches ProtocolForm) ---------- */

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen(!open); }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold cursor-pointer hover:bg-blue-200 transition-colors"
      >
        i
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 top-6 w-72 p-3 rounded-md border bg-popover text-popover-foreground shadow-md text-xs leading-relaxed">
            {text}
          </div>
        </>
      )}
    </span>
  );
}

/* ---------- condition field metadata ---------- */

const CONDITION_FIELDS: { value: string; label: string; type: string; options?: string[] }[] = [
  { value: "acwr", label: "ACWR", type: "number" },
  { value: "readiness_score", label: "Readiness Score (0–100)", type: "number" },
  { value: "readiness_rag", label: "Readiness RAG", type: "string", options: ["GREEN", "YELLOW", "RED"] },
  { value: "hrv_morning_ms", label: "Morning HRV (ms)", type: "number" },
  { value: "hrv_ratio", label: "HRV Ratio (today/baseline)", type: "number" },
  { value: "sleep_hours", label: "Sleep Hours", type: "number" },
  { value: "sleep_debt_3d", label: "Sleep Debt 3-Day (hours)", type: "number" },
  { value: "energy", label: "Energy (1–5)", type: "number" },
  { value: "soreness", label: "Soreness (1–5)", type: "number" },
  { value: "mood", label: "Mood (1–5)", type: "number" },
  { value: "phv_stage", label: "PHV Stage", type: "string", options: ["pre", "mid", "post"] },
  { value: "dual_load_index", label: "Dual Load Index (0–100)", type: "number" },
  { value: "days_to_next_match", label: "Days to Next Match", type: "number" },
  { value: "days_to_next_exam", label: "Days to Next Exam", type: "number" },
  { value: "academic_stress", label: "Academic Stress (1–5)", type: "number" },
  { value: "consecutive_red_days", label: "Consecutive RED Days", type: "number" },
  { value: "wellness_7day_avg", label: "Wellness 7-Day Avg (1–5)", type: "number" },
  { value: "injury_risk_flag", label: "Injury Risk Flag", type: "string", options: ["none", "low", "moderate", "high"] },
  { value: "pain_flag", label: "Pain Reported", type: "boolean", options: ["true", "false"] },
  { value: "has_match_today", label: "Match Today", type: "boolean", options: ["true", "false"] },
  { value: "load_trend_7d", label: "Load Trend 7d", type: "number" },
  { value: "session_count_7day", label: "Sessions (7d)", type: "number" },
];

const OPERATORS: { value: string; label: string }[] = [
  { value: "gt", label: "is greater than" },
  { value: "gte", label: "is greater than or equal to" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is less than or equal to" },
  { value: "eq", label: "equals" },
  { value: "neq", label: "does not equal" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is not one of" },
];

/* ---------- label lookup maps (matches ProtocolForm pattern) ---------- */

const fieldLabelMap: Record<string, string> = {};
for (const f of CONDITION_FIELDS) {
  fieldLabelMap[f.value] = f.label;
}

const operatorLabelMap: Record<string, string> = {};
for (const op of OPERATORS) {
  operatorLabelMap[op.value] = op.label;
}

const MATCH_LABELS: Record<string, string> = {
  all: "ALL",
  any: "ANY",
};

/* ---------- types ---------- */

interface Condition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

interface PillConfig {
  metric: string;
  label_template: string;
  sub_label: string;
}

interface TriggerConfig {
  metric: string;
  label: string;
  value_template: string;
  baseline_template: string;
  delta_template: string;
  positive_when: "above" | "below";
}

interface SignalFormProps {
  signalId?: string;
  initialData?: Record<string, unknown>;
}

/* ---------- preset signal colors ---------- */

const SIGNAL_PRESETS: { label: string; color: string; heroBg: string; pillBg: string; barRgba: string; coachingColor: string }[] = [
  { label: "Green (PRIMED/MATCH)", color: "#7a9b76", heroBg: "#101C14", pillBg: "rgba(122,155,118,0.12)", barRgba: "rgba(122,155,118,0.5)", coachingColor: "#567A5C" },
  { label: "Amber (OVERLOADED/DUAL)", color: "#c49a3c", heroBg: "#151209", pillBg: "rgba(196,154,60,0.10)", barRgba: "rgba(196,154,60,0.5)", coachingColor: "#8A6A30" },
  { label: "Teal (RECOVERING)", color: "#5A8A9F", heroBg: "#0C1315", pillBg: "rgba(90,138,159,0.12)", barRgba: "rgba(90,138,159,0.5)", coachingColor: "#3A6A7F" },
  { label: "Red (PHV_GATE)", color: "#A05A4A", heroBg: "#1C0F0C", pillBg: "rgba(160,90,74,0.10)", barRgba: "rgba(160,90,74,0.5)", coachingColor: "#7A3A2A" },
];

/* ---------- component ---------- */

export function SignalForm({ signalId, initialData }: SignalFormProps) {
  const router = useRouter();
  const isEdit = !!signalId;
  const isBuiltIn = (initialData?.is_built_in as boolean) ?? false;

  // ── Identity ──
  const [key, setKey] = useState((initialData?.key as string) ?? "");
  const [displayName, setDisplayName] = useState((initialData?.display_name as string) ?? "");
  const [subtitle, setSubtitle] = useState((initialData?.subtitle as string) ?? "");
  const [priority, setPriority] = useState<number>((initialData?.priority as number) ?? 50);

  // ── Conditions ──
  const [matchMode, setMatchMode] = useState<"all" | "any">(
    (initialData?.conditions as any)?.match ?? "all"
  );
  const [conditions, setConditions] = useState<Condition[]>(
    (initialData?.conditions as any)?.conditions ?? [{ field: "", operator: "eq", value: "" }]
  );

  // ── Visual Config ──
  const [color, setColor] = useState((initialData?.color as string) ?? "#7a9b76");
  const [heroBg, setHeroBg] = useState((initialData?.hero_background as string) ?? "#101C14");
  const [arcOpacity, setArcOpacity] = useState<{ large: number; medium: number; small: number }>(
    (initialData?.arc_opacity as any) ?? { large: 1.0, medium: 1.0, small: 1.0 }
  );
  const [pillBg, setPillBg] = useState((initialData?.pill_background as string) ?? "rgba(122,155,118,0.12)");
  const [barRgba, setBarRgba] = useState((initialData?.bar_rgba as string) ?? "rgba(122,155,118,0.5)");
  const [coachingColor, setCoachingColor] = useState((initialData?.coaching_color as string) ?? "#567A5C");

  // ── Content ──
  const [coachingText, setCoachingText] = useState((initialData?.coaching_text as string) ?? "");
  const [pillConfig, setPillConfig] = useState<PillConfig[]>(
    (initialData?.pill_config as PillConfig[]) ?? []
  );
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig[]>(
    (initialData?.trigger_config as TriggerConfig[]) ?? []
  );

  // ── Plan Adaptation ──
  const [adaptedPlanName, setAdaptedPlanName] = useState((initialData?.adapted_plan_name as string) ?? "");
  const [adaptedPlanMeta, setAdaptedPlanMeta] = useState((initialData?.adapted_plan_meta as string) ?? "");

  // ── Urgency ──
  const [showUrgencyBadge, setShowUrgencyBadge] = useState((initialData?.show_urgency_badge as boolean) ?? false);
  const [urgencyLabel, setUrgencyLabel] = useState((initialData?.urgency_label as string) ?? "");

  // ── Status ──
  const [isEnabled, setIsEnabled] = useState((initialData?.is_enabled as boolean) ?? true);
  const [saving, setSaving] = useState(false);

  // ── Auto-uppercase key ──
  function handleKeyChange(v: string) {
    setKey(v.toUpperCase().replace(/[^A-Z0-9_]/g, ""));
  }

  // ── Apply color preset ──
  function applyPreset(preset: typeof SIGNAL_PRESETS[0]) {
    setColor(preset.color);
    setHeroBg(preset.heroBg);
    setPillBg(preset.pillBg);
    setBarRgba(preset.barRgba);
    setCoachingColor(preset.coachingColor);
    toast.success(`Applied "${preset.label}" color preset`);
  }

  // ── Condition CRUD ──
  function addCondition() {
    setConditions([...conditions, { field: "", operator: "eq", value: "" }]);
  }
  function removeCondition(idx: number) {
    setConditions(conditions.filter((_, i) => i !== idx));
  }
  function updateCondition(idx: number, patch: Partial<Condition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function getFieldMeta(fieldName: string) {
    return CONDITION_FIELDS.find((f) => f.value === fieldName);
  }

  // ── Pill CRUD ──
  function addPill() {
    setPillConfig([...pillConfig, { metric: "hrv_ratio", label_template: "HRV {hrv_delta}%", sub_label: "vs baseline" }]);
  }
  function removePill(idx: number) {
    setPillConfig(pillConfig.filter((_, i) => i !== idx));
  }
  function updatePill(idx: number, patch: Partial<PillConfig>) {
    setPillConfig(pillConfig.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  // ── Trigger CRUD ──
  function addTrigger() {
    setTriggerConfig([...triggerConfig, {
      metric: "hrv_morning_ms", label: "HRV", value_template: "{value}ms",
      baseline_template: "baseline {hrv_baseline_ms}ms", delta_template: "{delta}%",
      positive_when: "above",
    }]);
  }
  function removeTrigger(idx: number) {
    setTriggerConfig(triggerConfig.filter((_, i) => i !== idx));
  }
  function updateTrigger(idx: number, patch: Partial<TriggerConfig>) {
    setTriggerConfig(triggerConfig.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  // ── Save ──
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!key.trim() || !displayName.trim()) {
      toast.error("Signal Key and Display Name are required");
      return;
    }

    const validConditions = conditions.filter((c) => c.field && c.operator);
    if (validConditions.length === 0) {
      toast.error("At least one condition is required");
      return;
    }

    setSaving(true);
    const payload = {
      key,
      display_name: displayName,
      subtitle,
      conditions: {
        match: matchMode,
        conditions: validConditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: typeof c.value === "string" && !isNaN(Number(c.value)) && c.value !== ""
            ? Number(c.value)
            : c.value,
        })),
      },
      priority,
      color,
      hero_background: heroBg,
      arc_opacity: arcOpacity,
      pill_background: pillBg,
      bar_rgba: barRgba,
      coaching_color: coachingColor,
      coaching_text: coachingText,
      pill_config: pillConfig,
      trigger_config: triggerConfig,
      adapted_plan_name: adaptedPlanName || null,
      adapted_plan_meta: adaptedPlanMeta || null,
      show_urgency_badge: showUrgencyBadge,
      urgency_label: urgencyLabel || null,
      is_enabled: isEnabled,
    };

    const url = isEdit ? `/api/v1/admin/signals/${signalId}` : "/api/v1/admin/signals";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(isEdit ? "Signal updated" : "Signal created");
      router.push("/admin/signals");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save signal");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEdit ? "Edit Signal" : "New Signal"}
          </h1>
          <p className="text-muted-foreground">
            {isEdit ? "Update signal configuration" : "Create a new Dashboard signal"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/signals")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update Signal" : "Create Signal"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Built-in warning */}
      {isBuiltIn && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 text-sm">
          This is a built-in signal. You can tune thresholds and visual config but cannot disable or delete it.
        </div>
      )}

      {/* ════════ Section 1: Identity ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Signal key, display name, priority order</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Signal Key *
                <InfoTip text="Unique machine identifier. Uppercase + underscores only. Used internally for signal evaluation and API responses (e.g. PRIMED, PHV_GATE, OVERLOADED)" />
              </Label>
              <Input
                value={key}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="PRIMED"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">Uppercase, underscores only. Must be unique.</p>
            </div>
            <div className="space-y-2">
              <Label>
                Display Name *
                <InfoTip text="The signal name shown to athletes in the Dashboard hero. Usually matches the key but can have spaces (e.g. 'DUAL LOAD', 'PHV GATE')" />
              </Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="PRIMED"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Subtitle
                <InfoTip text="Short description shown below the signal name in the Dashboard hero (e.g. 'Peak performance window', 'Growth phase protection active')" />
              </Label>
              <Input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Peak performance window"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Priority (lower = checked first)
                <InfoTip text="Signals are evaluated in priority order (lowest first). First match wins. Safety signals should be lowest (1-3), positive signals highest (7-8). 1=PHV_GATE, 2=OVERLOADED, 3=SLEEP_DEBT, 4=DUAL_LOAD, 5=MATCH_WINDOW, 6=RECOVERING, 7=MENTAL_LOAD, 8=PRIMED" />
              </Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 50)}
                min={1}
                max={999}
              />
              <p className="text-xs text-muted-foreground">
                1-3: safety signals, 4-6: contextual, 7-8: positive states, 9+: custom
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════════ Section 2: Conditions ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
          <CardDescription>
            When should this signal activate? Uses the same condition DSL as PD Protocols. Evaluated against the athlete snapshot on every boot request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>
              Match:
              <InfoTip text="ALL = every condition must be true for the signal to activate. ANY = at least one condition being true will trigger the signal" />
            </Label>
            <Select value={matchMode} onValueChange={(v) => setMatchMode((v ?? "all") as "all" | "any")}>
              <SelectTrigger className="w-[120px]">
                <span>{MATCH_LABELS[matchMode] ?? matchMode}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL</SelectItem>
                <SelectItem value="any">ANY</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {matchMode === "all" ? "All conditions must be true" : "At least one condition must be true"}
            </p>
          </div>

          <div className="space-y-3">
            {conditions.map((cond, idx) => {
              const fieldMeta = getFieldMeta(cond.field);
              return (
                <div key={idx} className="flex items-start gap-2 p-3 rounded-md border bg-muted/30">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {/* Field */}
                    <Select
                      value={cond.field}
                      onValueChange={(v) => v && updateCondition(idx, { field: v })}
                    >
                      <SelectTrigger>
                        <span>{cond.field ? (fieldLabelMap[cond.field] ?? cond.field) : "Select field"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operator */}
                    <Select
                      value={cond.operator}
                      onValueChange={(v) => v && updateCondition(idx, { operator: v })}
                    >
                      <SelectTrigger>
                        <span>{cond.operator ? (operatorLabelMap[cond.operator] ?? cond.operator) : "Operator"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value — dropdown if field has options, text input otherwise */}
                    {fieldMeta?.options ? (
                      <Select
                        value={String(cond.value)}
                        onValueChange={(v) => v && updateCondition(idx, { value: v })}
                      >
                        <SelectTrigger>
                          <span>{cond.value ? String(cond.value) : "Value"}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {fieldMeta.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={fieldMeta?.type === "number" ? "number" : "text"}
                        value={String(cond.value)}
                        onChange={(e) => {
                          const val = fieldMeta?.type === "number" ? Number(e.target.value) : e.target.value;
                          updateCondition(idx, { value: val });
                        }}
                        placeholder="Value"
                      />
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 mt-1"
                    onClick={() => removeCondition(idx)}
                    disabled={conditions.length <= 1}
                  >
                    x
                  </Button>
                </div>
              );
            })}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addCondition}>
            + Add Condition
          </Button>
        </CardContent>
      </Card>

      {/* ════════ Section 3: Visual Config ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Visual Config</CardTitle>
          <CardDescription>
            Signal colors, hero background, arc opacity — applied to the Dashboard hero section
            <InfoTip text="These values control how the signal appears in the mobile Dashboard. The hero background is the full-width background, signal color applies to arcs, pills, and text, coaching color is the coaching text, and bar_rgba is the left accent bar" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Color Presets */}
          <div className="space-y-2">
            <Label>
              Quick Presets
              <InfoTip text="Apply a pre-configured color palette. You can fine-tune individual values after applying a preset" />
            </Label>
            <div className="flex gap-2 flex-wrap">
              {SIGNAL_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => applyPreset(preset)}
                >
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.color }} />
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Signal Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Hero Background</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={heroBg} onChange={(e) => setHeroBg(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                <Input value={heroBg} onChange={(e) => setHeroBg(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Coaching Text Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={coachingColor} onChange={(e) => setCoachingColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                <Input value={coachingColor} onChange={(e) => setCoachingColor(e.target.value)} className="font-mono" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Pill Background (rgba)
                <InfoTip text="Background color for signal pills in the hero section. Use rgba format for transparency (e.g. rgba(122,155,118,0.12))" />
              </Label>
              <Input value={pillBg} onChange={(e) => setPillBg(e.target.value)} className="font-mono" placeholder="rgba(122,155,118,0.12)" />
            </div>
            <div className="space-y-2">
              <Label>
                Coaching Bar RGBA
                <InfoTip text="Color of the left accent bar next to the coaching text. Use rgba for semi-transparency (e.g. rgba(122,155,118,0.5))" />
              </Label>
              <Input value={barRgba} onChange={(e) => setBarRgba(e.target.value)} className="font-mono" placeholder="rgba(122,155,118,0.5)" />
            </div>
          </div>

          {/* Arc Opacity */}
          <div className="space-y-2">
            <Label>
              Arc Opacity (encodes signal strength)
              <InfoTip text="Controls the opacity of the 3 concentric arcs in the Dashboard hero. 1.0 = fully visible, 0.0 = hidden. Use lower values for weaker/cautious signals, higher for strong/positive signals" />
            </Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Large (outer)</span>
                <Input type="number" step={0.05} min={0} max={1} value={arcOpacity.large}
                  onChange={(e) => setArcOpacity({ ...arcOpacity, large: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Medium (middle)</span>
                <Input type="number" step={0.05} min={0} max={1} value={arcOpacity.medium}
                  onChange={(e) => setArcOpacity({ ...arcOpacity, medium: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Small (inner)</span>
                <Input type="number" step={0.05} min={0} max={1} value={arcOpacity.small}
                  onChange={(e) => setArcOpacity({ ...arcOpacity, small: Number(e.target.value) })} />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="rounded-xl p-6 border" style={{ backgroundColor: heroBg }}>
              <div className="flex items-end gap-4">
                {/* Mini arc preview */}
                <svg viewBox="0 0 60 38" width={52} height={34}>
                  <path d="M6 32 A24 24 0 0 1 54 32" stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={arcOpacity.large} />
                  <path d="M13 32 A17 17 0 0 1 47 32" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={arcOpacity.medium} />
                  <path d="M20 32 A10 10 0 0 1 40 32" stroke={color} strokeWidth={2.0} fill="none" strokeLinecap="round" opacity={arcOpacity.small} />
                  <circle cx={30} cy={32} r={3} fill={color} />
                </svg>
                <div>
                  <div className="text-lg font-bold tracking-wide" style={{ color }}>{displayName || "SIGNAL"}</div>
                  <div className="text-xs" style={{ color: color + "88" }}>{subtitle || "Subtitle"}</div>
                </div>
              </div>
              {/* Coaching preview */}
              <div className="mt-3 pl-3 border-l-2" style={{ borderColor: barRgba }}>
                <div className="text-[7px] font-semibold tracking-[3px] uppercase" style={{ color: color + "80" }}>tomo ai</div>
                <div className="text-xs mt-1" style={{ color: coachingColor }}>{coachingText || "Coaching text preview..."}</div>
              </div>
              {/* Pill preview */}
              {pillConfig.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {pillConfig.map((pill, idx) => (
                    <div key={idx} className="rounded-full px-3 py-1" style={{ backgroundColor: pillBg }}>
                      <span className="text-[10px] font-semibold" style={{ color }}>{pill.label_template}</span>
                      {pill.sub_label && <span className="text-[9px] ml-1" style={{ color: color + "88" }}>{pill.sub_label}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════════ Section 4: Coaching Text ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Coaching Text</CardTitle>
          <CardDescription>
            Plain-English coaching message shown in the Dashboard hero.
            <InfoTip text="Supports {field} interpolation for live athlete values. Available fields: {acwr}, {hrv_delta}, {readiness_score}, {sleep_hours}, {soreness}, {mood}, {dual_load_index}, {days_to_next_match}, {load_multiplier}, {sleep_debt_3d}. Missing fields render as '—'" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={coachingText}
            onChange={(e) => setCoachingText(e.target.value)}
            rows={3}
            placeholder="Your body is ready. HRV {hrv_delta}% above baseline, readiness {readiness_score}. Quality session window — push intensity today."
          />
          <p className="text-xs text-muted-foreground">
            Template syntax: &#123;field&#125; — e.g. &#123;acwr&#125;, &#123;hrv_delta&#125;, &#123;readiness_score&#125;, &#123;sleep_hours&#125;
          </p>
        </CardContent>
      </Card>

      {/* ════════ Section 5: Signal Pills ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Signal Pills (2–3)</CardTitle>
          <CardDescription>
            Metric pills shown in the hero section below the signal name.
            <InfoTip text="Each pill shows a metric snapshot. Use {field} syntax in the label template for live values. Recommended: 2-3 pills max for clean layout" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pillConfig.map((pill, idx) => (
            <div key={idx} className="flex items-start gap-2 p-3 rounded-md border bg-muted/30">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <Select value={pill.metric} onValueChange={(v) => v && updatePill(idx, { metric: v })}>
                  <SelectTrigger>
                    <span>{pill.metric ? (fieldLabelMap[pill.metric] ?? pill.metric) : "Select metric"}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={pill.label_template}
                  onChange={(e) => updatePill(idx, { label_template: e.target.value })}
                  placeholder="HRV {hrv_delta}%"
                />
                <Input
                  value={pill.sub_label}
                  onChange={(e) => updatePill(idx, { sub_label: e.target.value })}
                  placeholder="above baseline"
                />
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-red-400 hover:text-red-300 mt-1" onClick={() => removePill(idx)}>
                x
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addPill}>+ Add Pill</Button>
        </CardContent>
      </Card>

      {/* ════════ Section 6: Trigger Rows ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Rows (2–3)</CardTitle>
          <CardDescription>
            &quot;What triggered this signal&quot; — shows metric, value, baseline, and delta in the Dashboard.
            <InfoTip text="Each trigger row shows what data point contributed to the signal firing. Use {field}, {value}, {delta} syntax. 'Positive when' controls the color coding (green for good, amber for concerning)" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {triggerConfig.map((trigger, idx) => (
            <div key={idx} className="p-3 rounded-md border bg-muted/30 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Select value={trigger.metric} onValueChange={(v) => v && updateTrigger(idx, { metric: v })}>
                    <SelectTrigger>
                      <span>{trigger.metric ? (fieldLabelMap[trigger.metric] ?? trigger.metric) : "Select metric"}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={trigger.label}
                    onChange={(e) => updateTrigger(idx, { label: e.target.value })}
                    placeholder="HRV"
                  />
                  <Select value={trigger.positive_when} onValueChange={(v) => v && updateTrigger(idx, { positive_when: v as "above" | "below" })}>
                    <SelectTrigger>
                      <span>{trigger.positive_when === "above" ? "Higher is better" : "Lower is better"}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">Higher is better</SelectItem>
                      <SelectItem value="below">Lower is better</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-red-400 hover:text-red-300 mt-1" onClick={() => removeTrigger(idx)}>
                  x
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={trigger.value_template}
                  onChange={(e) => updateTrigger(idx, { value_template: e.target.value })}
                  placeholder="{value}ms"
                />
                <Input
                  value={trigger.baseline_template}
                  onChange={(e) => updateTrigger(idx, { baseline_template: e.target.value })}
                  placeholder="baseline {hrv_baseline_ms}ms"
                />
                <Input
                  value={trigger.delta_template}
                  onChange={(e) => updateTrigger(idx, { delta_template: e.target.value })}
                  placeholder="{delta}%"
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addTrigger}>+ Add Trigger Row</Button>
        </CardContent>
      </Card>

      {/* ════════ Section 7: Plan Adaptation ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Adaptation Override</CardTitle>
          <CardDescription>
            Override today&apos;s training session when this signal fires. Leave blank to use the athlete&apos;s scheduled session.
            <InfoTip text="When set, the Dashboard 'Today's Plan' card shows this instead of the athlete's scheduled program. Use for safety signals (e.g. 'Recovery Walk / Rest Day') or load management" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Session Name Override
                <InfoTip text="The session title shown in the Dashboard (e.g. 'Recovery Walk / Rest Day', 'Light Technical Work')" />
              </Label>
              <Input
                value={adaptedPlanName}
                onChange={(e) => setAdaptedPlanName(e.target.value)}
                placeholder="Recovery Walk / Rest Day"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Session Meta Override
                <InfoTip text="Secondary info below the session name (e.g. 'Light only · No weights · 20–30 min max')" />
              </Label>
              <Input
                value={adaptedPlanMeta}
                onChange={(e) => setAdaptedPlanMeta(e.target.value)}
                placeholder="Light only · No weights · 20–30 min max"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════════ Section 8: Urgency Badge ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Urgency Badge</CardTitle>
          <CardDescription>
            Show a safety/urgency badge in the Dashboard hero
            <InfoTip text="The urgency badge appears as a red/amber pill next to the signal name. Use only for safety-critical signals (PHV_GATE, OVERLOADED) to draw attention" />
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={showUrgencyBadge} onCheckedChange={setShowUrgencyBadge} />
            <Label>Show urgency badge</Label>
          </div>
          {showUrgencyBadge && (
            <div className="space-y-2">
              <Label>
                Badge Label
                <InfoTip text="Text shown inside the urgency badge (e.g. 'safety active', 'load warning')" />
              </Label>
              <Input
                value={urgencyLabel}
                onChange={(e) => setUrgencyLabel(e.target.value)}
                placeholder="safety active"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════ Section 9: Status ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              disabled={isBuiltIn && isEnabled}
            />
            <Label>Enabled</Label>
          </div>

          {isBuiltIn && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Built-in</Badge>
              <span className="text-xs text-muted-foreground">
                This signal is built into the system and cannot be deleted
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/signals")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Update Signal" : "Create Signal"}
        </Button>
      </div>
    </form>
  );
}
