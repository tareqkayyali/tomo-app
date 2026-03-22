"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// ── Types ──

interface RuleCondition {
  field: string;
  operator: string;
  value: string | number;
}

interface RuleAction {
  type: string;
  value: string;
}

interface Rule {
  id: string;
  name: string;
  emoji: string;
  enabled: boolean;
  builtIn: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

// ── Field type (matches snapshotFieldRegistry.ts FieldEntry) ──

interface FieldEntry {
  value: string;
  dbColumn: string;
  label: string;
  type: "number" | "string" | "json";
}

// Fallback fields in case API is unreachable (backward compat)
const FALLBACK_FIELDS: FieldEntry[] = [
  { value: "acwr", dbColumn: "acwr", label: "ACWR", type: "number" },
  { value: "readinessScore", dbColumn: "readiness_score", label: "Readiness Score", type: "number" },
  { value: "readinessRag", dbColumn: "readiness_rag", label: "Readiness RAG", type: "string" },
  { value: "hrvRatio", dbColumn: "__derived__", label: "HRV Ratio (today/baseline)", type: "number" },
  { value: "sleepQuality", dbColumn: "sleep_quality", label: "Sleep Quality (0-10)", type: "number" },
  { value: "dualLoadIndex", dbColumn: "dual_load_index", label: "Dual Load Index", type: "number" },
  { value: "injuryRiskFlag", dbColumn: "injury_risk_flag", label: "Injury Risk Flag", type: "string" },
  { value: "trainingAgeWeeks", dbColumn: "training_age_weeks", label: "Training Age (weeks)", type: "number" },
];

const OPERATORS = [
  { value: ">", label: ">" },
  { value: ">=", label: ">=" },
  { value: "<", label: "<" },
  { value: "<=", label: "<=" },
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
];

const ACTION_TYPES = [
  { value: "reduce_load", label: "Reduce Load to %" },
  { value: "block_category", label: "Block Category" },
  { value: "boost_priority", label: "Boost Priority" },
  { value: "log", label: "Log Message" },
];

const BUILT_IN_RULES: Rule[] = [
  { id: "acwr_danger", name: "ACWR Danger Zone", emoji: "🔴", enabled: true, builtIn: true,
    conditions: [{ field: "acwr", operator: ">", value: 1.5 }],
    actions: [{ type: "reduce_load", value: "50" }, { type: "log", value: "ACWR danger zone — drastic load reduction to 50%" }] },
  { id: "acwr_high", name: "ACWR High Zone", emoji: "🟡", enabled: true, builtIn: true,
    conditions: [{ field: "acwr", operator: ">", value: 1.3 }],
    actions: [{ type: "reduce_load", value: "70" }, { type: "log", value: "ACWR elevated — moderate reduction to 70%" }] },
  { id: "readiness_red", name: "Readiness RED", emoji: "🔴", enabled: true, builtIn: true,
    conditions: [{ field: "readinessRag", operator: "=", value: "RED" }],
    actions: [{ type: "reduce_load", value: "50" }, { type: "block_category", value: "sprint" }, { type: "block_category", value: "power" }, { type: "block_category", value: "plyometric" }, { type: "log", value: "Readiness RED — 50% load, high-intensity blocked" }] },
  { id: "readiness_amber", name: "Readiness AMBER", emoji: "🟡", enabled: true, builtIn: true,
    conditions: [{ field: "readinessRag", operator: "=", value: "AMBER" }],
    actions: [{ type: "reduce_load", value: "75" }, { type: "log", value: "Readiness AMBER — max 75% load" }] },
  { id: "hrv_suppressed", name: "HRV Suppressed", emoji: "💓", enabled: true, builtIn: true,
    conditions: [{ field: "hrvRatio", operator: "<", value: 0.7 }],
    actions: [{ type: "reduce_load", value: "60" }, { type: "log", value: "HRV severely suppressed — cap at 60%" }] },
  { id: "hrv_mild", name: "HRV Mildly Suppressed", emoji: "💓", enabled: true, builtIn: true,
    conditions: [{ field: "hrvRatio", operator: "<", value: 0.85 }],
    actions: [{ type: "reduce_load", value: "80" }, { type: "log", value: "HRV slightly suppressed — cap at 80%" }] },
  { id: "sleep_poor", name: "Poor Sleep", emoji: "😴", enabled: true, builtIn: true,
    conditions: [{ field: "sleepQuality", operator: "<", value: 5 }],
    actions: [{ type: "reduce_load", value: "80" }, { type: "log", value: "Poor sleep — reduce volume by 20%" }] },
  { id: "dual_load_high", name: "Dual Load High", emoji: "⚖️", enabled: true, builtIn: true,
    conditions: [{ field: "dualLoadIndex", operator: ">", value: 80 }],
    actions: [{ type: "reduce_load", value: "70" }, { type: "log", value: "Dual load high — cap at 70%" }] },
  { id: "injury_risk_high", name: "Injury Risk High", emoji: "🩹", enabled: true, builtIn: true,
    conditions: [{ field: "injuryRiskFlag", operator: "=", value: "high" }],
    actions: [{ type: "reduce_load", value: "60" }, { type: "log", value: "Injury risk HIGH — cap at 60%" }] },
  { id: "training_age_beginner", name: "Training Age Beginner", emoji: "🌱", enabled: true, builtIn: true,
    conditions: [{ field: "trainingAgeWeeks", operator: "<", value: 8 }],
    actions: [{ type: "reduce_load", value: "70" }, { type: "block_category", value: "power" }, { type: "log", value: "Beginner — reduced volume, no power exercises" }] },
];

// ── Defaults ──

const DEFAULTS = {
  ownItRec: {
    stalenessHours: 24, minCount: 4, maxCount: 6, minDiversity: 4,
    checkinStalenessHours: 24, staleConfidence: 0.5, freshConfidence: 0.9,
  },
  programRefresh: {
    stalenessHours: 24, minPrograms: 8, maxPrograms: 15,
    mandatoryRange: [3, 5], highRange: [3, 5], mediumRange: [2, 5],
  },
  rules: [...BUILT_IN_RULES],
};

type Config = typeof DEFAULTS;

// ── Helper: summarize conditions ──

function summarizeConditions(conditions: RuleCondition[], fields: FieldEntry[]): string {
  return conditions.map((c) => {
    const f = fields.find((f) => f.value === c.field);
    return `${f?.label || c.field} ${c.operator} ${c.value}`;
  }).join(" AND ");
}

// ── Rule Card Component ──

function RuleCard({ rule, onChange, onDelete, fields }: { rule: Rule; onChange: (r: Rule) => void; onDelete?: () => void; fields: FieldEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  function updateCondition(i: number, patch: Partial<RuleCondition>) {
    const next = [...rule.conditions];
    next[i] = { ...next[i], ...patch };
    onChange({ ...rule, conditions: next });
  }

  function updateAction(i: number, patch: Partial<RuleAction>) {
    const next = [...rule.actions];
    next[i] = { ...next[i], ...patch };
    onChange({ ...rule, actions: next });
  }

  return (
    <Card className={!rule.enabled ? "opacity-50" : ""}>
      {/* Collapsed header */}
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-lg">{rule.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">{rule.name}</CardTitle>
                {rule.builtIn && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Built-in</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                IF {summarizeConditions(rule.conditions, fields)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <Switch checked={rule.enabled} onCheckedChange={(v) => onChange({ ...rule, enabled: v })} />
            <span className="text-muted-foreground text-xs">{expanded ? "▾" : "▸"}</span>
          </div>
        </div>
      </CardHeader>

      {/* Expanded editor */}
      {expanded && (
        <CardContent className="pt-0">
          {/* Rule name + emoji */}
          <div className="flex gap-3 mb-4 pt-2 border-t">
            <div className="space-y-1">
              <Label className="text-xs">Emoji</Label>
              <Input value={rule.emoji} onChange={(e) => onChange({ ...rule, emoji: e.target.value })} className="h-8 w-16 text-center" />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Rule Name</Label>
              <Input value={rule.name} onChange={(e) => onChange({ ...rule, name: e.target.value })} className="h-8" />
            </div>
          </div>

          {/* Conditions (IF) */}
          <div className="mb-4">
            <Label className="text-xs font-semibold text-green-700 mb-2 block">IF (all conditions must be true)</Label>
            {rule.conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                {i > 0 && <span className="text-xs text-muted-foreground w-8">AND</span>}
                {i === 0 && <span className="text-xs text-muted-foreground w-8">IF</span>}
                <select value={cond.field} onChange={(e) => updateCondition(i, { field: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-sm flex-1">
                  {fields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select value={cond.operator} onChange={(e) => updateCondition(i, { operator: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-sm w-16">
                  {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <Input value={cond.value} onChange={(e) => {
                  const num = parseFloat(e.target.value);
                  updateCondition(i, { value: isNaN(num) ? e.target.value : num });
                }} className="h-8 w-24" />
                {rule.conditions.length > 1 && (
                  <button onClick={() => onChange({ ...rule, conditions: rule.conditions.filter((_, idx) => idx !== i) })} className="text-destructive text-sm hover:text-destructive/80">✕</button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => onChange({ ...rule, conditions: [...rule.conditions, { field: "acwr", operator: ">", value: 0 }] })}>
              + Add Condition
            </Button>
          </div>

          {/* Actions (THEN) */}
          <div className="mb-4">
            <Label className="text-xs font-semibold text-blue-700 mb-2 block">THEN (actions to take)</Label>
            {rule.actions.map((act, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground w-12">{i === 0 ? "THEN" : "AND"}</span>
                <select value={act.type} onChange={(e) => updateAction(i, { type: e.target.value })} className="h-8 rounded-md border bg-background px-2 text-sm">
                  {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                <Input value={act.value} onChange={(e) => updateAction(i, { value: e.target.value })} className="h-8 flex-1" placeholder={act.type === "reduce_load" ? "e.g. 50 (percent)" : act.type === "block_category" ? "e.g. sprint" : "value"} />
                {rule.actions.length > 1 && (
                  <button onClick={() => onChange({ ...rule, actions: rule.actions.filter((_, idx) => idx !== i) })} className="text-destructive text-sm hover:text-destructive/80">✕</button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => onChange({ ...rule, actions: [...rule.actions, { type: "log", value: "" }] })}>
              + Add Action
            </Button>
          </div>

          {/* Delete (custom rules only) */}
          {!rule.builtIn && onDelete && (
            <div className="pt-2 border-t">
              <Button variant="destructive" size="sm" onClick={onDelete}>Delete Rule</Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Num Field ──

function NumField({ value, onChange, step = 1, label }: { value: number; onChange: (v: number) => void; step?: number; label: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type="number" value={value} step={step} className="h-8 w-28" onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

// ── Main Page ──

export default function RecommendationEnginePage() {
  const [config, setConfig] = useState<Config>(structuredClone(DEFAULTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<FieldEntry[]>(FALLBACK_FIELDS);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch fields and config in parallel
      const [fieldsRes, configRes] = await Promise.all([
        fetch("/api/v1/admin/snapshot-fields"),
        fetch("/api/v1/content/ui-config?key=recommendation_engine"),
      ]);

      if (fieldsRes.ok) {
        const fieldsData = await fieldsRes.json();
        if (Array.isArray(fieldsData) && fieldsData.length > 0) {
          setFields(fieldsData);
        }
      }

      if (configRes.ok) {
        const data = await configRes.json();
        if (data && Object.keys(data).length > 0) {
          const merged = deepMerge(structuredClone(DEFAULTS), data);
          // Ensure rules exist (backward compat)
          if (!merged.rules || merged.rules.length === 0) {
            merged.rules = [...BUILT_IN_RULES];
          }
          setConfig(merged);
        }
      }
    } catch { /* use defaults */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/ui-config", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_key: "recommendation_engine", config_value: config }),
      });
      if (res.ok) {
        toast.success("Recommendation engine config saved");
        try { await fetch("/api/v1/content/recommendation-config?clearCache=true"); } catch { /* ok */ }
      } else { toast.error("Failed to save"); }
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  }

  function handleReset() {
    setConfig(structuredClone(DEFAULTS));
    toast.info("Reset to defaults — click Save to persist");
  }

  function updateRule(index: number, rule: Rule) {
    setConfig((prev) => {
      const next = [...prev.rules];
      next[index] = rule;
      return { ...prev, rules: next };
    });
  }

  function deleteRule(index: number) {
    setConfig((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
  }

  function addRule() {
    const id = `custom_${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      rules: [...prev.rules, {
        id, name: "New Rule", emoji: "⚙️", enabled: true, builtIn: false,
        conditions: [{ field: "acwr", operator: ">", value: 0 }],
        actions: [{ type: "reduce_load", value: "80" }],
      }],
    }));
  }

  function updateOwnIt(key: string, value: any) {
    setConfig((prev) => ({ ...prev, ownItRec: { ...prev.ownItRec, [key]: value } }));
  }
  function updateProgramRefresh(key: string, value: any) {
    setConfig((prev) => ({ ...prev, programRefresh: { ...prev.programRefresh, [key]: value } }));
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading configuration...</div>;

  const builtInRules = config.rules.filter((r) => r.builtIn);
  const customRules = config.rules.filter((r) => !r.builtIn);

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recommendation Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">Visual rule builder for training program guardrails and recommendations</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>Reset Defaults</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Config"}</Button>
        </div>
      </div>

      {/* Section 1: Rule Builder */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Guardrail Rules</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Each rule evaluates athlete data and applies actions (load caps, category blocks). Click a rule to edit its IF/THEN formula.
        </p>

        {/* Built-in rules */}
        <div className="space-y-3">
          {builtInRules.map((rule) => {
            const idx = config.rules.findIndex((r) => r.id === rule.id);
            return <RuleCard key={rule.id} rule={rule} onChange={(r) => updateRule(idx, r)} fields={fields} />;
          })}
        </div>

        {/* Custom rules */}
        {customRules.length > 0 && (
          <>
            <h3 className="text-sm font-semibold mt-6 mb-2 text-muted-foreground">Custom Rules</h3>
            <div className="space-y-3">
              {customRules.map((rule) => {
                const idx = config.rules.findIndex((r) => r.id === rule.id);
                return <RuleCard key={rule.id} rule={rule} onChange={(r) => updateRule(idx, r)} onDelete={() => deleteRule(idx)} fields={fields} />;
              })}
            </div>
          </>
        )}

        <Button variant="outline" className="mt-4" onClick={addRule}>+ Add New Rule</Button>
      </section>

      {/* Section 2: Own It Rec Parameters */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Own It — Recommendation Parameters</h2>
        <p className="text-xs text-muted-foreground mb-4">Controls for AI-generated personalized recommendations in the Own It feed</p>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { key: "stalenessHours", label: "Refresh Interval (hours)", step: 1 },
                { key: "minCount", label: "Min Recommendations", step: 1 },
                { key: "maxCount", label: "Max Recommendations", step: 1 },
                { key: "minDiversity", label: "Min Diversity (aspects)", step: 1 },
                { key: "checkinStalenessHours", label: "Check-in Staleness (hours)", step: 1 },
                { key: "staleConfidence", label: "Stale Data Confidence", step: 0.05 },
                { key: "freshConfidence", label: "Fresh Data Confidence", step: 0.05 },
              ].map((f) => (
                <NumField key={f.key} value={(config.ownItRec as any)[f.key]} onChange={(v) => updateOwnIt(f.key, v)} step={f.step} label={f.label} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 3: Program Refresh Parameters */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Program Refresh Parameters</h2>
        <p className="text-xs text-muted-foreground mb-4">Controls for AI-powered training program selection and prioritization</p>
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <NumField value={config.programRefresh.stalenessHours} onChange={(v) => updateProgramRefresh("stalenessHours", v)} step={1} label="Refresh Interval (hours)" />
              <NumField value={config.programRefresh.minPrograms} onChange={(v) => updateProgramRefresh("minPrograms", v)} step={1} label="Min Programs" />
              <NumField value={config.programRefresh.maxPrograms} onChange={(v) => updateProgramRefresh("maxPrograms", v)} step={1} label="Max Programs" />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
              {(["mandatoryRange", "highRange", "mediumRange"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground capitalize">{key.replace("Range", "")} Count Range</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" value={config.programRefresh[key][0]} className="h-8 w-16" onChange={(e) => updateProgramRefresh(key, [parseInt(e.target.value) || 0, config.programRefresh[key][1]])} />
                    <span className="text-muted-foreground">–</span>
                    <Input type="number" value={config.programRefresh[key][1]} className="h-8 w-16" onChange={(e) => updateProgramRefresh(key, [config.programRefresh[key][0], parseInt(e.target.value) || 0])} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ── Helpers ──

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key]) && typeof target[key] === "object" && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}
