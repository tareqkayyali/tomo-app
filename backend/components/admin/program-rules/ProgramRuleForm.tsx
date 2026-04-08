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

interface Condition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

interface ProgramRuleFormProps {
  ruleId?: string;
  initialData?: Record<string, unknown>;
}

/* ---------- info tip ---------- */

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

/* ---------- program catalog (pills) ---------- */

const PROGRAM_OPTIONS: [string, string, string][] = [
  // [id, display name, category]
  ["sprint_linear_10_30", "Linear Sprint (10-30m)", "speed"],
  ["sprint_flying_20_40", "Flying Sprint (20-40m)", "speed"],
  ["sled_resisted_sprint", "Resisted Sled Sprint", "speed"],
  ["strength_lower_compound", "Lower Body Compound", "strength"],
  ["strength_upper_push_pull", "Upper Body Push-Pull", "strength"],
  ["strength_single_leg", "Single-Leg Strength", "strength"],
  ["nordic_hamstring_protocol", "Nordic Hamstring", "injury-prevention"],
  ["plyo_lower_body", "Lower Body Plyometrics", "power"],
  ["agility_cod", "Change of Direction", "agility"],
  ["agility_reactive", "Reactive Agility", "agility"],
  ["endurance_hiit", "HIIT", "endurance"],
  ["endurance_aerobic_base", "Aerobic Base", "endurance"],
  ["power_olympic_lifts", "Olympic Lifts", "power"],
  ["mobility_hip_ankle", "Hip & Ankle Mobility", "mobility"],
  ["acl_prevention_protocol", "ACL Prevention", "injury-prevention"],
  ["groin_copenhagen", "Copenhagen Adductor", "injury-prevention"],
  ["ankle_stability_protocol", "Ankle Stability", "injury-prevention"],
  ["tech_passing_short", "Short Passing", "technical"],
  ["tech_passing_long", "Long Passing", "technical"],
  ["tech_shooting", "Shooting", "technical"],
  ["tech_dribbling", "Dribbling", "technical"],
  ["tech_first_touch", "First Touch", "technical"],
  ["tech_crossing", "Crossing", "technical"],
  ["tech_heading", "Heading", "technical"],
  ["tech_defending_1v1", "1v1 Defending", "technical"],
  ["tech_goalkeeping", "Goalkeeping", "technical"],
  ["tech_set_pieces", "Set Pieces", "technical"],
  ["tech_tactical_positioning", "Positional Play", "technical"],
  ["tech_scanning_decision", "Scanning & Decision", "technical"],
  ["tech_combination_play", "Combination Play", "technical"],
];

const CATEGORY_OPTIONS: [string, string][] = [
  ["speed", "Speed"],
  ["strength", "Strength"],
  ["agility", "Agility"],
  ["endurance", "Endurance"],
  ["power", "Power"],
  ["mobility", "Mobility"],
  ["injury-prevention", "Injury Prevention"],
  ["technical", "Technical"],
  ["recovery", "Recovery"],
];

const CATEGORY_COLORS_MAP: Record<string, string> = {
  speed: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  strength: "bg-red-500/15 text-red-400 border-red-500/30",
  agility: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  endurance: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  power: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  mobility: "bg-green-500/15 text-green-400 border-green-500/30",
  "injury-prevention": "bg-red-500/15 text-red-400 border-red-500/30",
  technical: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  recovery: "bg-green-500/15 text-green-400 border-green-500/30",
};

const POSITION_OPTIONS = ["GK", "CB", "FB", "CM", "CAM", "WM", "ST", "LW", "RW"];
const AGE_BAND_OPTIONS = ["U13", "U15", "U17", "U19", "U21", "SEN", "VET"];
const PHV_OPTIONS = ["pre", "mid", "post", "not_applicable"];
const SPORT_OPTIONS = ["football", "padel", "basketball", "tennis", "athletics"];

/* ---------- badge multi-select ---------- */

function BadgeMultiSelect({
  options,
  selected,
  onChange,
  colorMap,
}: {
  options: [string, string][];
  selected: string[];
  onChange: (val: string[]) => void;
  colorMap?: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([value, label]) => {
        const isSelected = selected.includes(value);
        const colorClass = colorMap?.[value] ?? (isSelected ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border");
        return (
          <button
            key={value}
            type="button"
            onClick={() => {
              onChange(isSelected ? selected.filter((v) => v !== value) : [...selected, value]);
            }}
            className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
              isSelected ? colorClass : "bg-muted/50 text-muted-foreground/60 border-border/50 hover:bg-muted"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- program multi-select with category grouping ---------- */

function ProgramMultiSelect({
  selected,
  onChange,
  label,
}: {
  selected: string[];
  onChange: (val: string[]) => void;
  label: string;
}) {
  // Group by category
  const grouped: Record<string, [string, string][]> = {};
  for (const [id, name, cat] of PROGRAM_OPTIONS) {
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push([id, name]);
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {Object.entries(grouped).map(([category, programs]) => (
        <div key={category} className="space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {category}
          </div>
          <div className="flex flex-wrap gap-1">
            {programs.map(([id, name]) => {
              const isSelected = selected.includes(id);
              const colorClass = CATEGORY_COLORS_MAP[category] ?? "";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(isSelected ? selected.filter((v) => v !== id) : [...selected, id]);
                  }}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                    isSelected ? colorClass : "bg-muted/30 text-muted-foreground/50 border-border/30 hover:bg-muted/60"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- operators ---------- */

const OPERATORS: [string, string][] = [
  ["gt", ">"],
  ["gte", ">="],
  ["lt", "<"],
  ["lte", "<="],
  ["eq", "="],
  ["neq", "!="],
  ["in", "in"],
  ["not_in", "not in"],
];

/* ---------- main form ---------- */

export default function ProgramRuleForm({ ruleId, initialData }: ProgramRuleFormProps) {
  const router = useRouter();
  const isEdit = !!ruleId;
  const [saving, setSaving] = useState(false);
  const [fieldMeta, setFieldMeta] = useState<FieldMeta[]>([]);

  // Form state
  const [name, setName] = useState((initialData?.name as string) ?? "");
  const [description, setDescription] = useState((initialData?.description as string) ?? "");
  const [category, setCategory] = useState((initialData?.category as string) ?? "safety");
  const [priority, setPriority] = useState((initialData?.priority as number) ?? 100);
  const [matchMode, setMatchMode] = useState<"all" | "any">(
    (initialData?.conditions as any)?.match ?? "all"
  );
  const [conditions, setConditions] = useState<Condition[]>(
    (initialData?.conditions as any)?.conditions ?? [{ field: "readiness_rag", operator: "eq", value: "RED" }]
  );

  // Program guidance
  const [mandatoryPrograms, setMandatoryPrograms] = useState<string[]>(
    (initialData?.mandatory_programs as string[]) ?? []
  );
  const [highPriorityPrograms, setHighPriorityPrograms] = useState<string[]>(
    (initialData?.high_priority_programs as string[]) ?? []
  );
  const [blockedPrograms, setBlockedPrograms] = useState<string[]>(
    (initialData?.blocked_programs as string[]) ?? []
  );
  const [prioritizeCategories, setPrioritizeCategories] = useState<string[]>(
    (initialData?.prioritize_categories as string[]) ?? []
  );
  const [blockCategories, setBlockCategories] = useState<string[]>(
    (initialData?.block_categories as string[]) ?? []
  );

  // Prescription overrides
  const [loadMultiplier, setLoadMultiplier] = useState<string>(
    initialData?.load_multiplier != null ? String(initialData.load_multiplier) : ""
  );
  const [sessionCapMinutes, setSessionCapMinutes] = useState<string>(
    initialData?.session_cap_minutes != null ? String(initialData.session_cap_minutes) : ""
  );
  const [frequencyCap, setFrequencyCap] = useState<string>(
    initialData?.frequency_cap != null ? String(initialData.frequency_cap) : ""
  );
  const [intensityCap, setIntensityCap] = useState<string>(
    (initialData?.intensity_cap as string) ?? ""
  );

  // AI guidance
  const [aiGuidanceText, setAiGuidanceText] = useState<string>(
    (initialData?.ai_guidance_text as string) ?? ""
  );
  const [safetyCritical, setSafetyCritical] = useState(
    (initialData?.safety_critical as boolean) ?? false
  );

  // Scope
  const [sportFilter, setSportFilter] = useState<string[]>(
    (initialData?.sport_filter as string[]) ?? []
  );
  const [phvFilter, setPhvFilter] = useState<string[]>(
    (initialData?.phv_filter as string[]) ?? []
  );
  const [ageBandFilter, setAgeBandFilter] = useState<string[]>(
    (initialData?.age_band_filter as string[]) ?? []
  );
  const [positionFilter, setPositionFilter] = useState<string[]>(
    (initialData?.position_filter as string[]) ?? []
  );

  // Metadata
  const [evidenceSource, setEvidenceSource] = useState(
    (initialData?.evidence_source as string) ?? ""
  );
  const [evidenceGrade, setEvidenceGrade] = useState(
    (initialData?.evidence_grade as string) ?? ""
  );
  const [isEnabled, setIsEnabled] = useState(
    (initialData?.is_enabled as boolean) ?? true
  );

  const isBuiltIn = (initialData?.is_built_in as boolean) ?? false;

  // Load condition field metadata from protocols API
  useEffect(() => {
    fetch("/api/v1/admin/protocols/fields", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setFieldMeta(data.fields ?? []))
      .catch(() => {});
  }, []);

  const fieldLookup = Object.fromEntries(fieldMeta.map((f) => [f.field, f]));

  function addCondition() {
    setConditions([...conditions, { field: "acwr", operator: "gt", value: "" }]);
  }

  function removeCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  function updateCondition(index: number, key: keyof Condition, val: unknown) {
    const updated = [...conditions];
    (updated[index] as any)[key] = val;
    setConditions(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body: Record<string, unknown> = {
      name,
      description: description || null,
      category,
      priority,
      conditions: { match: matchMode, conditions },
      mandatory_programs: mandatoryPrograms,
      high_priority_programs: highPriorityPrograms,
      blocked_programs: blockedPrograms,
      prioritize_categories: prioritizeCategories,
      block_categories: blockCategories,
      load_multiplier: loadMultiplier ? Number(loadMultiplier) : null,
      session_cap_minutes: sessionCapMinutes ? Number(sessionCapMinutes) : null,
      frequency_cap: frequencyCap ? Number(frequencyCap) : null,
      intensity_cap: intensityCap || null,
      ai_guidance_text: aiGuidanceText || null,
      safety_critical: safetyCritical,
      sport_filter: sportFilter.length > 0 ? sportFilter : null,
      phv_filter: phvFilter.length > 0 ? phvFilter : null,
      age_band_filter: ageBandFilter.length > 0 ? ageBandFilter : null,
      position_filter: positionFilter.length > 0 ? positionFilter : null,
      is_enabled: isEnabled,
      evidence_source: evidenceSource || null,
      evidence_grade: evidenceGrade || null,
    };

    if (isEdit) body.rule_id = ruleId;

    const res = await fetch("/api/v1/admin/program-rules", {
      method: isEdit ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (res.ok) {
      toast.success(isEdit ? "Rule updated" : "Rule created");
      router.push("/admin/program-rules");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to save");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {isBuiltIn && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
          This is a built-in rule. You can modify it but cannot delete it.
        </div>
      )}

      {/* ── Section 1: Basic Info ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
          <CardDescription>Rule identity and classification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v ?? "safety")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safety">Safety</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="recovery">Recovery</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="injury_prevention">Injury Prevention</SelectItem>
                    <SelectItem value="position_specific">Position Specific</SelectItem>
                    <SelectItem value="load_management">Load Management</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority (lower = higher)</Label>
                <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Explain what this rule does and when it applies..."
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Conditions ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Activation Conditions
            <InfoTip text="Same condition DSL as PD Protocols. When ALL/ANY conditions match for an athlete, this rule's program guidance is applied." />
          </CardTitle>
          <CardDescription>When should this rule fire?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Match mode:</Label>
            <Select value={matchMode} onValueChange={(v) => setMatchMode(v as "all" | "any")}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ALL conditions</SelectItem>
                <SelectItem value="any">ANY condition</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {conditions.map((cond, i) => {
            const meta = fieldLookup[cond.field];
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {i === 0 && <Label className="text-xs">Field</Label>}
                  <Select value={cond.field} onValueChange={(v) => updateCondition(i, "field", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fieldMeta.map((f) => (
                        <SelectItem key={f.field} value={f.field}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  {i === 0 && <Label className="text-xs">Operator</Label>}
                  <Select value={cond.operator} onValueChange={(v) => updateCondition(i, "operator", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map(([op, label]) => (
                        <SelectItem key={op} value={op}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4">
                  {i === 0 && <Label className="text-xs">Value</Label>}
                  {meta?.options ? (
                    <Select
                      value={String(cond.value)}
                      onValueChange={(v) => updateCondition(i, "value", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {meta.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={String(cond.value)}
                      onChange={(e) => {
                        const v = meta?.type === "number" ? Number(e.target.value) : e.target.value;
                        updateCondition(i, "value", v);
                      }}
                      placeholder={meta?.unit ? `${meta.unit}` : "value"}
                    />
                  )}
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCondition(i)}
                    disabled={conditions.length <= 1}
                    className="text-destructive"
                  >
                    x
                  </Button>
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={addCondition}>
            + Add Condition
          </Button>
        </CardContent>
      </Card>

      {/* ── Section 3: Program Guidance ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Program Guidance
            <InfoTip text="Select programs from the catalog. Mandatory = always assigned. High Priority = elevated in ranking. Blocked = excluded from recommendations." />
          </CardTitle>
          <CardDescription>Which programs should be assigned, prioritized, or blocked?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProgramMultiSelect
            label="Mandatory Programs (MUST be assigned)"
            selected={mandatoryPrograms}
            onChange={setMandatoryPrograms}
          />
          <Separator />
          <ProgramMultiSelect
            label="High Priority Programs (elevated ranking)"
            selected={highPriorityPrograms}
            onChange={setHighPriorityPrograms}
          />
          <Separator />
          <ProgramMultiSelect
            label="Blocked Programs (excluded from recommendations)"
            selected={blockedPrograms}
            onChange={setBlockedPrograms}
          />
          <Separator />
          <div>
            <Label className="text-xs">Prioritize Categories</Label>
            <InfoTip text="All programs in these categories get elevated priority." />
            <div className="mt-2">
              <BadgeMultiSelect
                options={CATEGORY_OPTIONS}
                selected={prioritizeCategories}
                onChange={setPrioritizeCategories}
                colorMap={CATEGORY_COLORS_MAP}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Block Categories</Label>
            <InfoTip text="All programs in these categories are excluded." />
            <div className="mt-2">
              <BadgeMultiSelect
                options={CATEGORY_OPTIONS}
                selected={blockCategories}
                onChange={setBlockCategories}
                colorMap={CATEGORY_COLORS_MAP}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: Prescription Constraints ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Prescription Constraints
            <InfoTip text="Applied to ALL assigned programs when this rule fires. Most restrictive value wins when multiple rules fire." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Load Multiplier</Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={loadMultiplier}
                onChange={(e) => setLoadMultiplier(e.target.value)}
                placeholder="e.g. 0.75"
              />
            </div>
            <div>
              <Label className="text-xs">Intensity Cap</Label>
              <Select value={intensityCap} onValueChange={(v) => setIntensityCap(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="No cap" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="rest">Rest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Session Cap (min)</Label>
              <Input
                type="number"
                value={sessionCapMinutes}
                onChange={(e) => setSessionCapMinutes(e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            <div>
              <Label className="text-xs">Frequency Cap (sessions/week)</Label>
              <Input
                type="number"
                value={frequencyCap}
                onChange={(e) => setFrequencyCap(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: AI Guidance ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            AI Guidance
            <InfoTip text="This text is injected into the AI prompt when this rule fires. Use it to provide nuanced guidance the AI should follow." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">AI Guidance Text</Label>
            <Textarea
              value={aiGuidanceText}
              onChange={(e) => setAiGuidanceText(e.target.value)}
              rows={4}
              placeholder="Provide guidance for the AI program selection engine..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={safetyCritical} onCheckedChange={setSafetyCritical} />
            <Label className="text-xs">Safety Critical (AI cannot override this rule)</Label>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 6: Scope Filters ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Scope Filters
            <InfoTip text="Pre-filter: rule only evaluates for athletes matching these criteria. Empty = applies to all." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Sport</Label>
            <div className="mt-1">
              <BadgeMultiSelect
                options={SPORT_OPTIONS.map((s) => [s, s.charAt(0).toUpperCase() + s.slice(1)])}
                selected={sportFilter}
                onChange={setSportFilter}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">PHV Stage</Label>
            <div className="mt-1">
              <BadgeMultiSelect
                options={PHV_OPTIONS.map((s) => [s, s.replace('_', ' ')])}
                selected={phvFilter}
                onChange={setPhvFilter}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Age Band</Label>
            <div className="mt-1">
              <BadgeMultiSelect
                options={AGE_BAND_OPTIONS.map((s) => [s, s])}
                selected={ageBandFilter}
                onChange={setAgeBandFilter}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Position</Label>
            <div className="mt-1">
              <BadgeMultiSelect
                options={POSITION_OPTIONS.map((s) => [s, s])}
                selected={positionFilter}
                onChange={setPositionFilter}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 7: Metadata & Status ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata & Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Evidence Source</Label>
              <Input
                value={evidenceSource}
                onChange={(e) => setEvidenceSource(e.target.value)}
                placeholder="e.g. Gabbett 2016; LTAD Framework"
              />
            </div>
            <div>
              <Label className="text-xs">Evidence Grade</Label>
              <Select value={evidenceGrade} onValueChange={(v) => setEvidenceGrade(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Strong evidence</SelectItem>
                  <SelectItem value="B">B — Moderate evidence</SelectItem>
                  <SelectItem value="C">C — Expert opinion</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            <Label className="text-xs">Enabled</Label>
            {isEnabled ? (
              <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Active</Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Submit ── */}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Update Rule" : "Create Rule"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/program-rules")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
