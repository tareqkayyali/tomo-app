"use client";

import { useEffect, useState } from "react";
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

/* ---------- types ---------- */

interface FieldMeta {
  field: string;
  label: string;
  description: string;
  type: string;
  unit: string | null;
  range: { min: number; max: number } | null;
  options: string[] | null;
}

interface OperatorMeta {
  operator: string;
  label: string;
}

interface Condition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

interface ProtocolFormProps {
  protocolId?: string;
  initialData?: Record<string, unknown>;
}

/* ---------- info icon ---------- */

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

/* ---------- multi-select badge options ---------- */

const CONTRAINDICATION_OPTIONS: [string, string][] = [
  ["barbell_back_squat", "Barbell Back Squat"],
  ["barbell_front_squat", "Barbell Front Squat"],
  ["depth_jumps", "Depth Jumps"],
  ["box_jumps", "Box Jumps"],
  ["maximal_sprinting", "Maximal Sprinting"],
  ["heavy_deadlift", "Heavy Deadlift"],
  ["power_clean", "Power Clean"],
  ["snatch", "Snatch"],
  ["olympic_lifting", "Olympic Lifting"],
  ["plyometric_bounding", "Plyometric Bounding"],
  ["stiff_leg_deadlift", "Stiff-Leg Deadlift"],
  ["good_morning", "Good Morning"],
  ["loaded_carry_heavy", "Heavy Loaded Carry"],
  ["overhead_press_heavy", "Heavy Overhead Press"],
  ["barbell_row_heavy", "Heavy Barbell Row"],
];

const REQUIRED_ELEMENT_OPTIONS: [string, string][] = [
  ["hip_hinge_bodyweight", "Hip Hinge (Bodyweight)"],
  ["glute_bridge", "Glute Bridge"],
  ["lateral_band_work", "Lateral Band Work"],
  ["warm_up", "Warm-Up"],
  ["cool_down", "Cool-Down"],
  ["mobility", "Mobility"],
  ["foam_rolling", "Foam Rolling"],
  ["core_stability", "Core Stability"],
  ["balance_work", "Balance Work"],
  ["stretching", "Stretching"],
];

const BLOCKED_REC_OPTIONS: [string, string][] = [
  ["max_strength", "Max Strength"],
  ["power_development", "Power Development"],
  ["speed_development", "Speed Development"],
  ["strength_development", "Strength Development"],
  ["volume_accumulation", "Volume Accumulation"],
  ["technical_development", "Technical Development"],
  ["plyometrics", "Plyometrics"],
];

const MANDATORY_REC_OPTIONS: [string, string][] = [
  ["recovery", "Recovery"],
  ["sleep_optimisation", "Sleep Optimisation"],
  ["injury_prevention", "Injury Prevention"],
  ["movement_quality", "Movement Quality"],
  ["nutrition", "Nutrition"],
  ["load_management", "Load Management"],
  ["academic_balance", "Academic Balance"],
  ["activation", "Activation"],
  ["match_preparation", "Match Preparation"],
  ["mobility", "Mobility"],
  ["return_to_training", "Return to Training"],
  ["engagement", "Engagement"],
];

const FORCED_RAG_OPTIONS: [string, string][] = [
  ["phv_mid", "PHV Mid-Stage"],
  ["load_management", "Load Management"],
  ["injury_prevention", "Injury Prevention"],
  ["academic_performance", "Academic Performance"],
  ["dual_load", "Dual Load"],
  ["recovery_science", "Recovery Science"],
  ["sleep_science", "Sleep Science"],
  ["nutrition", "Nutrition"],
];

const BLOCKED_RAG_OPTIONS: [string, string][] = [
  ["max_strength_training", "Max Strength Training"],
  ["advanced_periodization", "Advanced Periodization"],
  ["performance_peaking", "Performance Peaking"],
  ["power_training", "Power Training"],
];

const RAG_TAG_OPTIONS: [string, string][] = [
  ["phv_mid", "PHV Mid-Stage"],
  ["phv_pre", "PHV Pre-Stage"],
  ["phv_post", "PHV Post-Stage"],
  ["injury_risk", "Injury Risk"],
  ["exam_period", "Exam Period"],
  ["high_acwr", "High ACWR"],
  ["low_acwr", "Low ACWR"],
  ["recovery_deficit", "Recovery Deficit"],
  ["beginner", "Beginner Athlete"],
  ["match_day", "Match Day"],
  ["post_match", "Post-Match"],
  ["dual_load_high", "Dual Load High"],
  ["sleep_deficit", "Sleep Deficit"],
  ["pain_reported", "Pain Reported"],
  ["hrv_suppressed", "HRV Suppressed"],
  ["detraining_risk", "Detraining Risk"],
];

const SPORT_OPTIONS: [string, string][] = [
  ["football", "Football"],
  ["padel", "Padel"],
  ["basketball", "Basketball"],
  ["tennis", "Tennis"],
  ["athletics", "Athletics"],
];

const PHV_OPTIONS: [string, string][] = [
  ["pre", "Pre-PHV"],
  ["mid", "Mid-PHV"],
  ["post", "Post-PHV"],
];

const AGE_BAND_OPTIONS: [string, string][] = [
  ["U13", "U13"],
  ["U15", "U15"],
  ["U17", "U17"],
  ["U19", "U19+"],
];

/* ---------- helpers ---------- */

function parseArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseArrayToString(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function parseArrayToArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

function toArray(arr: string[]): string[] | null {
  return arr.length > 0 ? arr : null;
}

function toArrayFromString(text: string): string[] | null {
  const arr = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length > 0 ? arr : null;
}

/* ---------- BadgeMultiSelect component ---------- */

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

/* ---------- label lookup maps for select dropdowns ---------- */

const CATEGORY_LABELS: Record<string, string> = {
  safety: "Safety",
  development: "Development",
  recovery: "Recovery",
  performance: "Performance",
  academic: "Academic",
};

const INTENSITY_CAP_LABELS: Record<string, string> = {
  "": "No cap",
  rest: "Rest",
  light: "Light",
  moderate: "Moderate",
  full: "Full",
};

const PRIORITY_OVERRIDE_LABELS: Record<string, string> = {
  "": "No override",
  P0: "P0 - Critical",
  P1: "P1 - High",
  P2: "P2 - Medium",
  P3: "P3 - Low",
};

const EVIDENCE_GRADE_LABELS: Record<string, string> = {
  "": "None",
  A: "A - Strong evidence",
  B: "B - Moderate evidence",
  C: "C - Expert consensus",
};

const MATCH_LABELS: Record<string, string> = {
  all: "ALL",
  any: "ANY",
};

/* ---------- component ---------- */

export function ProtocolForm({ protocolId, initialData }: ProtocolFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Field metadata from API
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [operators, setOperators] = useState<OperatorMeta[]>([]);

  // Section 1: Identity
  const [name, setName] = useState((initialData?.name as string) ?? "");
  const [description, setDescription] = useState((initialData?.description as string) ?? "");
  const [category, setCategory] = useState((initialData?.category as string) ?? "safety");
  const [priority, setPriority] = useState<number>((initialData?.priority as number) ?? 100);
  const [safetyCritical, setSafetyCritical] = useState((initialData?.safety_critical as boolean) ?? false);

  // Section 2: Conditions
  const initConditions = initialData?.conditions as { match?: string; conditions?: Condition[] } | undefined;
  const [conditionMatch, setConditionMatch] = useState<"all" | "any">(
    (initConditions?.match as "all" | "any") ?? "all"
  );
  const [conditions, setConditions] = useState<Condition[]>(
    initConditions?.conditions ?? [{ field: "", operator: "eq", value: "" }]
  );

  // Section 3: Training Modifiers
  const [loadMultiplier, setLoadMultiplier] = useState<string>(
    initialData?.load_multiplier != null ? String(initialData.load_multiplier) : ""
  );
  const [intensityCap, setIntensityCap] = useState<string>(
    (initialData?.intensity_cap as string) ?? ""
  );
  const [contraindications, setContraindications] = useState<string[]>(parseArray(initialData?.contraindications));
  const [requiredElements, setRequiredElements] = useState<string[]>(parseArray(initialData?.required_elements));
  const [sessionCapMinutes, setSessionCapMinutes] = useState<string>(
    initialData?.session_cap_minutes != null ? String(initialData.session_cap_minutes) : ""
  );

  // Section 4: Recommendation Guardrails
  const [blockedRecCategories, setBlockedRecCategories] = useState<string[]>(parseArray(initialData?.blocked_rec_categories));
  const [mandatoryRecCategories, setMandatoryRecCategories] = useState<string[]>(parseArray(initialData?.mandatory_rec_categories));
  const [priorityOverride, setPriorityOverride] = useState<string>(
    (initialData?.priority_override as string) ?? ""
  );
  const [overrideMessage, setOverrideMessage] = useState<string>(
    (initialData?.override_message as string) ?? ""
  );

  // Section 5: RAG Overrides
  const [forcedRagDomains, setForcedRagDomains] = useState<string[]>(parseArray(initialData?.forced_rag_domains));
  const [blockedRagDomains, setBlockedRagDomains] = useState<string[]>(parseArray(initialData?.blocked_rag_domains));
  const [ragConditionTags, setRagConditionTags] = useState<string[]>(parseArrayToArray(initialData?.rag_condition_tags));

  // Section 6: AI Context
  const [aiSystemInjection, setAiSystemInjection] = useState<string>(
    (initialData?.ai_system_injection as string) ?? ""
  );

  // Section 7: Scope Filters
  const [sportFilter, setSportFilter] = useState<string[]>(parseArray(initialData?.sport_filter));
  const [phvFilter, setPhvFilter] = useState<string[]>(parseArray(initialData?.phv_filter));
  const [ageBandFilter, setAgeBandFilter] = useState<string[]>(parseArray(initialData?.age_band_filter));
  const [positionFilter, setPositionFilter] = useState(parseArrayToString(initialData?.position_filter));

  // Section 8: Evidence
  const [evidenceSource, setEvidenceSource] = useState<string>(
    (initialData?.evidence_source as string) ?? ""
  );
  const [evidenceGrade, setEvidenceGrade] = useState<string>(
    (initialData?.evidence_grade as string) ?? ""
  );

  // Section 9: Status
  const [isEnabled, setIsEnabled] = useState((initialData?.is_enabled as boolean) ?? true);
  const isBuiltIn = (initialData?.is_built_in as boolean) ?? false;

  // Load field metadata
  useEffect(() => {
    async function loadFields() {
      const res = await fetch("/api/v1/admin/protocols/fields", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setFields(data.fields ?? []);
        setOperators(data.operators ?? []);
      }
    }
    loadFields();
  }, []);

  /* ---------- field label lookup ---------- */

  const fieldLabelMap: Record<string, string> = {};
  for (const f of fields) {
    fieldLabelMap[f.field] = f.label;
  }

  const operatorLabelMap: Record<string, string> = {};
  for (const op of operators) {
    operatorLabelMap[op.operator] = op.label;
  }

  /* ---------- condition helpers ---------- */

  function updateCondition(index: number, patch: Partial<Condition>) {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  function addCondition() {
    setConditions((prev) => [...prev, { field: "", operator: "eq", value: "" }]);
  }

  function getFieldMeta(fieldName: string): FieldMeta | undefined {
    return fields.find((f) => f.field === fieldName);
  }

  /* ---------- submit ---------- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Protocol name is required");
      return;
    }

    const validConditions = conditions.filter((c) => c.field && c.operator);
    if (validConditions.length === 0) {
      toast.error("At least one condition is required");
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      category,
      priority,
      safety_critical: safetyCritical,
      conditions: {
        match: conditionMatch,
        conditions: validConditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: typeof c.value === "string" && !isNaN(Number(c.value)) && c.value !== ""
            ? Number(c.value)
            : c.value,
        })),
      },
      load_multiplier: loadMultiplier ? parseFloat(loadMultiplier) : null,
      intensity_cap: intensityCap || null,
      contraindications: toArray(contraindications),
      required_elements: toArray(requiredElements),
      session_cap_minutes: sessionCapMinutes ? parseInt(sessionCapMinutes, 10) : null,
      blocked_rec_categories: toArray(blockedRecCategories),
      mandatory_rec_categories: toArray(mandatoryRecCategories),
      priority_override: priorityOverride || null,
      override_message: overrideMessage.trim() || null,
      forced_rag_domains: toArray(forcedRagDomains),
      blocked_rag_domains: toArray(blockedRagDomains),
      rag_condition_tags: toArray(ragConditionTags),
      ai_system_injection: aiSystemInjection.trim() || null,
      sport_filter: toArray(sportFilter),
      phv_filter: toArray(phvFilter),
      age_band_filter: toArray(ageBandFilter),
      position_filter: toArrayFromString(positionFilter),
      evidence_source: evidenceSource.trim() || null,
      evidence_grade: evidenceGrade || null,
      is_enabled: isEnabled,
    };

    const url = protocolId
      ? `/api/v1/admin/protocols/${protocolId}`
      : "/api/v1/admin/protocols";
    const method = protocolId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(protocolId ? "Protocol updated" : "Protocol created");
      router.push("/admin/protocols");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save protocol");
    }

    setSaving(false);
  }

  /* ---------- render ---------- */

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {protocolId ? "Edit Protocol" : "New Protocol"}
          </h1>
          <p className="text-muted-foreground">
            {protocolId ? "Update protocol configuration" : "Create a new performance director protocol"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/protocols")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : protocolId ? "Update Protocol" : "Create Protocol"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Built-in warning */}
      {isBuiltIn && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300 text-sm">
          This is a built-in safety protocol. You can tune thresholds but cannot disable or delete it.
        </div>
      )}

      {/* Section 1: Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Basic protocol information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name *
              <InfoTip text="The protocol name shown in the admin panel and audit logs" />
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., PHV Mid-Stage Safety Gate"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Description
              <InfoTip text="A detailed explanation of what this protocol does, when it should fire, and the sports science rationale" />
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this protocol do and when should it fire?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Category *
                <InfoTip text="Determines how this protocol is grouped and its baseline priority range. Safety (1-20), Development (51-100), Recovery (21-50), Performance (51-100), Academic (15-25)" />
              </Label>
              <Select value={category} onValueChange={(v) => setCategory(v ?? "safety")}>
                <SelectTrigger>
                  <span>{CATEGORY_LABELS[category] ?? category}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="recovery">Recovery</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="academic">Academic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">
                Priority (lower = higher priority)
                <InfoTip text="Lower number = higher authority. When two protocols conflict, the lower priority number wins. Built-in safety: 1-20, Custom safety: 21-50, Standard: 51-100, Experimental: 101-200" />
              </Label>
              <Input
                id="priority"
                type="number"
                min={1}
                max={200}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 100)}
              />
              <p className="text-xs text-muted-foreground">
                1-20: built-in safety, 21-50: custom safety, 51-100: standard, 101-200: experimental
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={safetyCritical} onCheckedChange={setSafetyCritical} />
            <Label>
              Safety Critical
              <InfoTip text="When enabled, forces the AI to use the highest-quality model (Sonnet instead of Haiku) and applies the most conservative decision-making. Use for: growth phase protection, injury risk, dangerous load spikes" />
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Conditions */}
      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
          <CardDescription>
            Define when this protocol activates. Conditions are evaluated against the athlete snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>
              Match:
              <InfoTip text="ALL = every condition must be true for the protocol to fire. ANY = at least one condition being true will trigger the protocol" />
            </Label>
            <Select value={conditionMatch} onValueChange={(v) => setConditionMatch((v ?? "all") as "all" | "any")}>
              <SelectTrigger className="w-[120px]">
                <span>{MATCH_LABELS[conditionMatch] ?? conditionMatch}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL</SelectItem>
                <SelectItem value="any">ANY</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {conditionMatch === "all" ? "All conditions must be true" : "At least one condition must be true"}
            </p>
          </div>

          <div className="space-y-3">
            {conditions.map((condition, index) => {
              const fieldMeta = getFieldMeta(condition.field);
              return (
                <div key={index} className="flex items-start gap-2 p-3 rounded-md border bg-muted/30">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    {/* Field */}
                    <Select
                      value={condition.field}
                      onValueChange={(v) => updateCondition(index, { field: v ?? "" })}
                    >
                      <SelectTrigger>
                        <span>{condition.field ? (fieldLabelMap[condition.field] ?? condition.field) : "Select field"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.field} value={f.field}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Operator */}
                    <Select
                      value={condition.operator}
                      onValueChange={(v) => updateCondition(index, { operator: v ?? "" })}
                    >
                      <SelectTrigger>
                        <span>{condition.operator ? (operatorLabelMap[condition.operator] ?? condition.operator) : "Operator"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {operators.map((op) => (
                          <SelectItem key={op.operator} value={op.operator}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value */}
                    {fieldMeta?.options ? (
                      <Select
                        value={String(condition.value)}
                        onValueChange={(v) => updateCondition(index, { value: v ?? "" })}
                      >
                        <SelectTrigger>
                          <span>{condition.value ? String(condition.value) : "Value"}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {fieldMeta.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={fieldMeta?.type === "number" ? "number" : "text"}
                        value={String(condition.value)}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        placeholder={
                          fieldMeta?.range
                            ? `${fieldMeta.range.min} - ${fieldMeta.range.max}${fieldMeta.unit ? ` ${fieldMeta.unit}` : ""}`
                            : "Value"
                        }
                      />
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 mt-1"
                    onClick={() => removeCondition(index)}
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

      {/* Section 3: Training Modifiers */}
      <Card>
        <CardHeader>
          <CardTitle>Training Modifiers</CardTitle>
          <CardDescription>How this protocol modifies training when active</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="loadMultiplier">
                Load Multiplier (0.0 - 1.0)
                <InfoTip text="Multiplies the athlete's planned training load. 1.0 = full load, 0.5 = half load, 0.7 = 70% of planned load. When multiple protocols fire, the LOWEST multiplier wins (most restrictive)" />
              </Label>
              <Input
                id="loadMultiplier"
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={loadMultiplier}
                onChange={(e) => setLoadMultiplier(e.target.value)}
                placeholder="e.g., 0.5"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Intensity Cap
                <InfoTip text="Maximum training intensity allowed. REST = no training, LIGHT = active recovery only, MODERATE = technical work and aerobic, FULL = no restriction. Most restrictive cap wins when multiple protocols fire" />
              </Label>
              <Select value={intensityCap} onValueChange={(v) => setIntensityCap(v ?? "")}>
                <SelectTrigger>
                  <span>{INTENSITY_CAP_LABELS[intensityCap] ?? (intensityCap || "No cap")}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No cap</SelectItem>
                  <SelectItem value="rest">Rest</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sessionCapMinutes">
              Session Cap (minutes)
              <InfoTip text="Maximum session duration in minutes when this protocol is active. Overrides any longer planned session" />
            </Label>
            <Input
              id="sessionCapMinutes"
              type="number"
              min="0"
              value={sessionCapMinutes}
              onChange={(e) => setSessionCapMinutes(e.target.value)}
              placeholder="e.g., 60"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Contraindications
              <InfoTip text="Exercises that are BLOCKED when this protocol fires. The athlete and AI cannot include these in any training session" />
            </Label>
            <BadgeMultiSelect
              options={CONTRAINDICATION_OPTIONS}
              selected={contraindications}
              onChange={setContraindications}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Required Elements
              <InfoTip text="Exercises that MUST be included in every training session when this protocol fires" />
            </Label>
            <BadgeMultiSelect
              options={REQUIRED_ELEMENT_OPTIONS}
              selected={requiredElements}
              onChange={setRequiredElements}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Recommendation Guardrails */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendation Guardrails</CardTitle>
          <CardDescription>Control which recommendations are allowed or required</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              Blocked Rec Categories
              <InfoTip text="The Recommendation Intelligence Engine (RIE) cannot generate recommendations in these categories while this protocol is active" />
            </Label>
            <BadgeMultiSelect
              options={BLOCKED_REC_OPTIONS}
              selected={blockedRecCategories}
              onChange={setBlockedRecCategories}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Mandatory Rec Categories
              <InfoTip text="The RIE MUST generate at least one recommendation in these categories while this protocol is active" />
            </Label>
            <BadgeMultiSelect
              options={MANDATORY_REC_OPTIONS}
              selected={mandatoryRecCategories}
              onChange={setMandatoryRecCategories}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Priority Override
                <InfoTip text="Override the recommendation priority level. P0 = Critical (red, urgent), P1 = High (orange), P2 = Medium (yellow), P3 = Low (info)" />
              </Label>
              <Select value={priorityOverride} onValueChange={(v) => setPriorityOverride(v ?? "")}>
                <SelectTrigger>
                  <span>{PRIORITY_OVERRIDE_LABELS[priorityOverride] ?? (priorityOverride || "No override")}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No override</SelectItem>
                  <SelectItem value="P0">P0 - Critical</SelectItem>
                  <SelectItem value="P1">P1 - High</SelectItem>
                  <SelectItem value="P2">P2 - Medium</SelectItem>
                  <SelectItem value="P3">P3 - Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="overrideMessage">
                Override Message
                <InfoTip text="Custom message shown to the athlete instead of the AI-generated recommendation text. Keep under 280 characters -- clear, direct, actionable" />
              </Label>
              <Textarea
                id="overrideMessage"
                value={overrideMessage}
                onChange={(e) => setOverrideMessage(e.target.value)}
                placeholder="Message shown when this protocol overrides recommendations"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: RAG Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>RAG Overrides</CardTitle>
          <CardDescription>Control which knowledge domains the AI can access</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              Forced RAG Domains
              <InfoTip text="These sports science knowledge domains will ALWAYS be included in the AI's context when answering questions. Ensures the AI references the right evidence base" />
            </Label>
            <BadgeMultiSelect
              options={FORCED_RAG_OPTIONS}
              selected={forcedRagDomains}
              onChange={setForcedRagDomains}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Blocked RAG Domains
              <InfoTip text="These knowledge domains will be EXCLUDED from the AI's context. Prevents inappropriate advice (e.g., blocking max strength content for PHV-mid athletes)" />
            </Label>
            <BadgeMultiSelect
              options={BLOCKED_RAG_OPTIONS}
              selected={blockedRagDomains}
              onChange={setBlockedRagDomains}
            />
          </div>

          <div className="space-y-2">
            <Label>
              RAG Condition Tags
              <InfoTip text="Tags merged into the RAG query to filter knowledge chunks for this athlete's context. Select all that apply to the scenario this protocol targets" />
            </Label>
            <BadgeMultiSelect
              options={RAG_TAG_OPTIONS}
              selected={ragConditionTags}
              onChange={setRagConditionTags}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 6: AI Context */}
      <Card>
        <CardHeader>
          <CardTitle>AI Context</CardTitle>
          <CardDescription>Instructions injected into the AI system prompt when this protocol is active</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="aiSystemInjection">
              AI System Injection
              <InfoTip text="THIS IS THE MOST POWERFUL FIELD. Whatever you write here becomes a direct instruction to the AI coaching agent. Write as if you're briefing a real coaching assistant. The AI will follow these instructions for every interaction while this protocol is active. Be specific, clear, and include the 'why' behind each instruction" />
            </Label>
            <Textarea
              id="aiSystemInjection"
              value={aiSystemInjection}
              onChange={(e) => setAiSystemInjection(e.target.value)}
              placeholder="Write instructions for the AI coaching agent here. This text is injected into the system prompt when this protocol fires.&#10;&#10;Example: 'This athlete is in a critical PHV growth phase. Never recommend plyometric exercises or high-impact training. Focus on mobility, technique work, and bodyweight exercises only.'"
              rows={6}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 7: Scope Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Scope Filters</CardTitle>
          <CardDescription>Limit this protocol to specific athlete populations. Leave empty for all.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              Sports
              <InfoTip text="Only evaluate this protocol for athletes in these sports. Leave empty to apply to all sports" />
            </Label>
            <BadgeMultiSelect
              options={SPORT_OPTIONS}
              selected={sportFilter}
              onChange={setSportFilter}
            />
          </div>

          <div className="space-y-2">
            <Label>
              PHV Stage
              <InfoTip text="Only evaluate for athletes in these growth phases. Critical for PHV-specific safety protocols" />
            </Label>
            <BadgeMultiSelect
              options={PHV_OPTIONS}
              selected={phvFilter}
              onChange={setPhvFilter}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Age Band
              <InfoTip text="Only evaluate for athletes in these age groups" />
            </Label>
            <BadgeMultiSelect
              options={AGE_BAND_OPTIONS}
              selected={ageBandFilter}
              onChange={setAgeBandFilter}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="positionFilter">
              Positions (comma-separated)
              <InfoTip text="Only evaluate for athletes playing these positions" />
            </Label>
            <Input
              id="positionFilter"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              placeholder="e.g., goalkeeper, striker"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 8: Evidence */}
      <Card>
        <CardHeader>
          <CardTitle>Evidence</CardTitle>
          <CardDescription>Source and quality of the evidence supporting this protocol</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="evidenceSource">
                Evidence Source
                <InfoTip text="Citation for the sports science research supporting this protocol. Include author, year, and key finding. E.g., 'Gabbett 2016: ACWR >1.5 = 2-4x injury risk'" />
              </Label>
              <Input
                id="evidenceSource"
                value={evidenceSource}
                onChange={(e) => setEvidenceSource(e.target.value)}
                placeholder="e.g., Lloyd & Oliver 2012, UEFA Youth Development Guidelines"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Evidence Grade
                <InfoTip text="Quality of evidence. A = Systematic review or RCT, B = Observational study or expert consensus, C = Performance Director experience or emerging research" />
              </Label>
              <Select value={evidenceGrade} onValueChange={(v) => setEvidenceGrade(v ?? "")}>
                <SelectTrigger>
                  <span>{EVIDENCE_GRADE_LABELS[evidenceGrade] ?? (evidenceGrade || "Select grade")}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  <SelectItem value="A">A - Strong evidence</SelectItem>
                  <SelectItem value="B">B - Moderate evidence</SelectItem>
                  <SelectItem value="C">C - Expert consensus</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 9: Status */}
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
                This protocol is built into the system and cannot be deleted
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/protocols")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : protocolId ? "Update Protocol" : "Create Protocol"}
        </Button>
      </div>
    </form>
  );
}
