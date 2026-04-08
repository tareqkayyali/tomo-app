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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

/* ---------- condition field metadata ---------- */

const CONDITION_FIELDS: { value: string; label: string; type: string }[] = [
  { value: "acwr", label: "ACWR", type: "number" },
  { value: "readiness_score", label: "Readiness Score (0–100)", type: "number" },
  { value: "readiness_rag", label: "Readiness RAG", type: "string" },
  { value: "hrv_morning_ms", label: "Morning HRV (ms)", type: "number" },
  { value: "hrv_ratio", label: "HRV Ratio (today/baseline)", type: "number" },
  { value: "sleep_hours", label: "Sleep Hours", type: "number" },
  { value: "sleep_debt_3d", label: "Sleep Debt 3-Day (hours)", type: "number" },
  { value: "energy", label: "Energy (1–5)", type: "number" },
  { value: "soreness", label: "Soreness (1–5)", type: "number" },
  { value: "mood", label: "Mood (1–5)", type: "number" },
  { value: "phv_stage", label: "PHV Stage", type: "string" },
  { value: "dual_load_index", label: "Dual Load Index (0–100)", type: "number" },
  { value: "days_to_next_match", label: "Days to Next Match", type: "number" },
  { value: "days_to_next_exam", label: "Days to Next Exam", type: "number" },
  { value: "academic_stress", label: "Academic Stress (1–5)", type: "number" },
  { value: "consecutive_red_days", label: "Consecutive RED Days", type: "number" },
  { value: "wellness_7day_avg", label: "Wellness 7-Day Avg (1–5)", type: "number" },
  { value: "injury_risk_flag", label: "Injury Risk Flag", type: "string" },
  { value: "pain_flag", label: "Pain Reported", type: "boolean" },
  { value: "has_match_today", label: "Match Today", type: "boolean" },
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
    (initialData?.conditions as any)?.conditions ?? []
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
    setConditions([...conditions, { field: "readiness_score", operator: "gte", value: 65 }]);
  }
  function removeCondition(idx: number) {
    setConditions(conditions.filter((_, i) => i !== idx));
  }
  function updateCondition(idx: number, patch: Partial<Condition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
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
  async function handleSave() {
    if (!key || !displayName) {
      toast.error("Key and Display Name are required");
      return;
    }
    if (conditions.length === 0) {
      toast.error("At least one condition is required");
      return;
    }

    setSaving(true);
    const payload = {
      key,
      display_name: displayName,
      subtitle,
      conditions: { match: matchMode, conditions },
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
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEdit ? "Edit Signal" : "New Signal"}
          </h1>
          <p className="text-muted-foreground">
            {isEdit ? `Editing ${displayName || key}` : "Create a new Dashboard signal"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/admin/signals")}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Signal"}
          </Button>
        </div>
      </div>

      {/* ════════ Section 1: Identity ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Signal key, display name, priority order</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Signal Key</Label>
              <Input
                value={key}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="PRIMED"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Uppercase, underscores only. Must be unique.</p>
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="PRIMED"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Peak performance window"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority (lower = checked first)</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={1}
                max={999}
              />
              <p className="text-xs text-muted-foreground">1=PHV_GATE (safety), 8=PRIMED (default positive)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            <Label>Enabled</Label>
          </div>
        </CardContent>
      </Card>

      {/* ════════ Section 2: Conditions ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
          <CardDescription>
            When should this signal activate? Uses the same condition DSL as PD Protocols.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>Match mode:</Label>
            <Select value={matchMode} onValueChange={(v) => setMatchMode(v as "all" | "any")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL conditions (AND)</SelectItem>
                <SelectItem value="any">ANY condition (OR)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {conditions.map((cond, idx) => (
            <div key={idx} className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
              <Select value={cond.field} onValueChange={(v) => v && updateCondition(idx, { field: v })}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={cond.operator} onValueChange={(v) => v && updateCondition(idx, { operator: v })}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={String(cond.value)}
                onChange={(e) => {
                  const fieldMeta = CONDITION_FIELDS.find((f) => f.value === cond.field);
                  const val = fieldMeta?.type === "number" ? Number(e.target.value) :
                    e.target.value === "true" ? true :
                    e.target.value === "false" ? false :
                    e.target.value;
                  updateCondition(idx, { value: val });
                }}
                className="w-[120px]"
              />

              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => removeCondition(idx)}>
                ✕
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addCondition}>
            + Add Condition
          </Button>
        </CardContent>
      </Card>

      {/* ════════ Section 3: Visual Config ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Visual Config</CardTitle>
          <CardDescription>Signal colors, hero background, arc opacity — applied to the Dashboard hero</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Color Presets */}
          <div className="space-y-2">
            <Label>Quick Presets</Label>
            <div className="flex gap-2 flex-wrap">
              {SIGNAL_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
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
              <Label>Pill Background (rgba)</Label>
              <Input value={pillBg} onChange={(e) => setPillBg(e.target.value)} className="font-mono" placeholder="rgba(122,155,118,0.12)" />
            </div>
            <div className="space-y-2">
              <Label>Coaching Bar RGBA</Label>
              <Input value={barRgba} onChange={(e) => setBarRgba(e.target.value)} className="font-mono" placeholder="rgba(122,155,118,0.5)" />
            </div>
          </div>

          {/* Arc Opacity */}
          <div className="space-y-2">
            <Label>Arc Opacity (encodes signal strength)</Label>
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
              <div className="mt-3 pl-3 border-l-2" style={{ borderColor: barRgba }}>
                <div className="text-[7px] font-semibold tracking-[3px] uppercase" style={{ color: color + "80" }}>tomo ai</div>
                <div className="text-xs mt-1" style={{ color: coachingColor }}>{coachingText || "Coaching text preview..."}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════════ Section 4: Coaching Text ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Coaching Text</CardTitle>
          <CardDescription>
            Supports &#123;field&#125; interpolation: &#123;acwr&#125;, &#123;hrv_delta&#125;, &#123;readiness_score&#125;, &#123;sleep_hours&#125;, &#123;soreness&#125;, &#123;mood&#125;, &#123;dual_load_index&#125;, &#123;days_to_next_match&#125;, &#123;load_multiplier&#125;, &#123;sleep_debt_3d&#125;, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={coachingText}
            onChange={(e) => setCoachingText(e.target.value)}
            rows={3}
            placeholder="Your body is ready. HRV {hrv_delta}% above baseline, readiness {readiness_score}. Quality session window — push intensity today."
          />
        </CardContent>
      </Card>

      {/* ════════ Section 5: Signal Pills ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Signal Pills (2–3)</CardTitle>
          <CardDescription>Metric pills shown in the hero section. Template syntax: &#123;field&#125;</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pillConfig.map((pill, idx) => (
            <div key={idx} className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
              <Select value={pill.metric} onValueChange={(v) => v && updatePill(idx, { metric: v })}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
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
                className="flex-1"
              />
              <Input
                value={pill.sub_label}
                onChange={(e) => updatePill(idx, { sub_label: e.target.value })}
                placeholder="above baseline"
                className="w-[160px]"
              />
              <Button variant="ghost" size="sm" className="text-red-400" onClick={() => removePill(idx)}>✕</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addPill}>+ Add Pill</Button>
        </CardContent>
      </Card>

      {/* ════════ Section 6: Trigger Rows ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Rows (2–3)</CardTitle>
          <CardDescription>
            &quot;What triggered this signal&quot; — shows metric, value, baseline, and delta. Template syntax: &#123;field&#125;, &#123;value&#125;, &#123;delta&#125;
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {triggerConfig.map((trigger, idx) => (
            <div key={idx} className="p-3 rounded-md border bg-muted/30 space-y-2">
              <div className="flex items-center gap-2">
                <Select value={trigger.metric} onValueChange={(v) => v && updateTrigger(idx, { metric: v })}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
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
                  className="w-[100px]"
                />
                <Select value={trigger.positive_when} onValueChange={(v) => updateTrigger(idx, { positive_when: v as "above" | "below" })}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Higher is better</SelectItem>
                    <SelectItem value="below">Lower is better</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" className="text-red-400 ml-auto" onClick={() => removeTrigger(idx)}>✕</Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={trigger.value_template}
                  onChange={(e) => updateTrigger(idx, { value_template: e.target.value })}
                  placeholder="{value}ms"
                  className="flex-1"
                />
                <Input
                  value={trigger.baseline_template}
                  onChange={(e) => updateTrigger(idx, { baseline_template: e.target.value })}
                  placeholder="baseline {hrv_baseline_ms}ms"
                  className="flex-1"
                />
                <Input
                  value={trigger.delta_template}
                  onChange={(e) => updateTrigger(idx, { delta_template: e.target.value })}
                  placeholder="{delta}%"
                  className="w-[120px]"
                />
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addTrigger}>+ Add Trigger Row</Button>
        </CardContent>
      </Card>

      {/* ════════ Section 7: Plan Adaptation ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Adaptation Override</CardTitle>
          <CardDescription>
            Override today&apos;s training session when this signal fires. Leave blank to use the athlete&apos;s scheduled session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Session Name Override</Label>
              <Input
                value={adaptedPlanName}
                onChange={(e) => setAdaptedPlanName(e.target.value)}
                placeholder="Recovery Walk / Rest Day"
              />
            </div>
            <div className="space-y-2">
              <Label>Session Meta Override</Label>
              <Input
                value={adaptedPlanMeta}
                onChange={(e) => setAdaptedPlanMeta(e.target.value)}
                placeholder="Light only · No weights · 20–30 min max"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════════ Section 8: Urgency ════════ */}
      <Card>
        <CardHeader>
          <CardTitle>Urgency Badge</CardTitle>
          <CardDescription>Show a safety/urgency badge in the Dashboard hero (e.g. PHV_GATE)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={showUrgencyBadge} onCheckedChange={setShowUrgencyBadge} />
            <Label>Show urgency badge</Label>
          </div>
          {showUrgencyBadge && (
            <div className="space-y-2">
              <Label>Badge Label</Label>
              <Input
                value={urgencyLabel}
                onChange={(e) => setUrgencyLabel(e.target.value)}
                placeholder="safety active"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════ Bottom Actions ════════ */}
      <div className="flex justify-end gap-2 pb-8">
        <Button variant="outline" onClick={() => router.push("/admin/signals")}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Signal"}
        </Button>
      </div>
    </div>
  );
}
