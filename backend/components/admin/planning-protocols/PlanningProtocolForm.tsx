"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

/* ---------- constants ---------- */

const SEVERITY_OPTIONS: {
  value: string;
  label: string;
  colors: string;
  selectedColors: string;
}[] = [
  {
    value: "MANDATORY",
    label: "Mandatory",
    colors: "bg-red-500/15 text-red-400 border-red-500/30",
    selectedColors: "bg-red-500 text-white border-red-500",
  },
  {
    value: "ADVISORY",
    label: "Advisory",
    colors: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    selectedColors: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "INFO",
    label: "Info",
    colors: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    selectedColors: "bg-blue-500 text-white border-blue-500",
  },
];

const CATEGORY_OPTIONS: {
  value: string;
  label: string;
  colors: string;
  selectedColors: string;
}[] = [
  {
    value: "safety",
    label: "Safety",
    colors: "bg-red-500/15 text-red-400 border-red-500/30",
    selectedColors: "bg-red-500 text-white border-red-500",
  },
  {
    value: "load_management",
    label: "Load Management",
    colors: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    selectedColors: "bg-orange-500 text-white border-orange-500",
  },
  {
    value: "recovery",
    label: "Recovery",
    colors: "bg-green-500/15 text-green-400 border-green-500/30",
    selectedColors: "bg-green-500 text-white border-green-500",
  },
  {
    value: "academic",
    label: "Academic",
    colors: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    selectedColors: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "scheduling",
    label: "Scheduling",
    colors: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    selectedColors: "bg-blue-500 text-white border-blue-500",
  },
  {
    value: "performance",
    label: "Performance",
    colors: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    selectedColors: "bg-purple-500 text-white border-purple-500",
  },
];

const SPORT_OPTIONS: { value: string; label: string }[] = [
  { value: "football", label: "Football" },
  { value: "padel", label: "Padel" },
  { value: "basketball", label: "Basketball" },
  { value: "tennis", label: "Tennis" },
  { value: "athletics", label: "Athletics" },
];

const TRIGGER_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "acwr", label: "ACWR" },
  { value: "training_monotony", label: "Training Monotony" },
  { value: "training_strain", label: "Training Strain" },
  { value: "dual_load_index", label: "Dual Load Index" },
  { value: "readiness_score", label: "Readiness Score" },
  { value: "readiness_rag", label: "Readiness RAG" },
  { value: "sleep_hours", label: "Sleep Hours" },
  { value: "sleep_debt_3d", label: "Sleep Debt (3d)" },
  { value: "hrv_today_ms", label: "HRV Today" },
  { value: "active_injury_count", label: "Active Injury Count" },
  { value: "exam_proximity_score", label: "Exam Proximity Score" },
  { value: "athlete_mode", label: "Athlete Mode" },
  { value: "phv_stage", label: "PHV Stage" },
  { value: "checkin_consistency_7d", label: "Check-in Consistency (7d)" },
  { value: "data_confidence_score", label: "Data Confidence Score" },
  { value: "days_since_last_session", label: "Days Since Last Session" },
  { value: "matches_next_7d", label: "Matches Next 7 Days" },
  { value: "in_exam_period", label: "In Exam Period" },
];

const OPERATOR_OPTIONS: { value: string; label: string }[] = [
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
];

const ACTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "reduce_load", label: "Reduce Load" },
  { value: "suggest", label: "Suggest Action" },
  { value: "block_intensity", label: "Block Intensity" },
  { value: "schedule_recovery", label: "Schedule Recovery" },
  { value: "boost_study", label: "Boost Study" },
  { value: "alert", label: "Alert" },
];

/* ---------- types ---------- */

interface TriggerCondition {
  field: string;
  operator: string;
  value: string;
}

interface PlanningProtocolFormProps {
  protocolId?: string;
  initialData?: Record<string, unknown>;
}

/* ---------- helpers ---------- */

function parseTriggerConditions(raw: unknown): TriggerCondition[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: Record<string, unknown>) => ({
    field: String(c.field ?? ""),
    operator: String(c.operator ?? "gt"),
    value: String(c.value ?? ""),
  }));
}

function parseActions(raw: unknown): { type: string; suggest: string; amount: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { type: "", suggest: "", amount: "" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    type: String(obj.type ?? ""),
    suggest: String(obj.suggest ?? ""),
    amount: obj.amount !== undefined ? String(obj.amount) : "",
  };
}

/* ---------- component ---------- */

export function PlanningProtocolForm({
  protocolId,
  initialData,
}: PlanningProtocolFormProps) {
  const router = useRouter();
  const isEdit = !!protocolId;

  const [name, setName] = useState((initialData?.name as string) ?? "");
  const [description, setDescription] = useState(
    (initialData?.description as string) ?? ""
  );
  const [severity, setSeverity] = useState(
    (initialData?.severity as string) ?? "ADVISORY"
  );
  const [category, setCategory] = useState(
    (initialData?.category as string) ?? "safety"
  );

  // Structured trigger conditions
  const [conditions, setConditions] = useState<TriggerCondition[]>(
    parseTriggerConditions(initialData?.trigger_conditions)
  );

  // Structured actions
  const initActions = parseActions(initialData?.actions);
  const [actionType, setActionType] = useState(initActions.type);
  const [actionSuggest, setActionSuggest] = useState(initActions.suggest);
  const [actionAmount, setActionAmount] = useState(initActions.amount);

  const [scientificBasis, setScientificBasis] = useState(
    (initialData?.scientific_basis as string) ?? ""
  );
  const [sportFilter, setSportFilter] = useState<string[]>(
    (initialData?.sport_filter as string[]) ?? []
  );
  const [isEnabled, setIsEnabled] = useState(
    initialData?.is_enabled !== undefined
      ? (initialData.is_enabled as boolean)
      : true
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleSport(sport: string) {
    setSportFilter((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  function updateCondition(idx: number, patch: Partial<TriggerCondition>) {
    setConditions((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  }

  function removeCondition(idx: number) {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  }

  function addCondition() {
    setConditions((prev) => [...prev, { field: "acwr", operator: "gt", value: "" }]);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    // Build trigger conditions array from structured state
    const triggerConditionsPayload = conditions
      .filter((c) => c.field && c.value !== "")
      .map((c) => ({
        field: c.field,
        operator: c.operator,
        value: isNaN(Number(c.value)) ? c.value : Number(c.value),
      }));

    // Build actions object from structured state
    const actionsPayload: Record<string, unknown> = {};
    if (actionType) actionsPayload.type = actionType;
    if (actionSuggest.trim()) actionsPayload.suggest = actionSuggest.trim();
    if (actionAmount !== "") actionsPayload.amount = Number(actionAmount);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      severity,
      category,
      trigger_conditions: triggerConditionsPayload,
      actions: actionsPayload,
      scientific_basis: scientificBasis.trim() || null,
      sport_filter: sportFilter.length > 0 ? sportFilter : null,
      is_enabled: isEnabled,
    };

    setSaving(true);

    const url = isEdit
      ? `/api/v1/admin/planning-protocols/${protocolId}`
      : "/api/v1/admin/planning-protocols";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(
        isEdit ? `"${name}" updated` : `"${name}" created`
      );
      router.push("/admin/planning-protocols");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || `Failed to ${isEdit ? "update" : "create"} protocol`);
    }

    setSaving(false);
  }

  async function handleDelete() {
    if (!protocolId) return;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    setDeleting(true);
    const res = await fetch(`/api/v1/admin/planning-protocols/${protocolId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${name}" deleted`);
      router.push("/admin/planning-protocols");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete protocol");
    }
    setDeleting(false);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/admin/planning-protocols"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to Planning Protocols
      </Link>

      <h1 className="text-3xl font-bold tracking-tight">
        {isEdit ? "Edit Planning Protocol" : "New Planning Protocol"}
      </h1>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Protocol name, description, and classification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PHV Load Reduction"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this protocol do?"
              className="min-h-[80px]"
            />
          </div>

          <Separator />

          {/* Severity pills */}
          <div>
            <Label>Severity</Label>
            <div className="flex gap-2 mt-1.5">
              {SEVERITY_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                    severity === opt.value ? opt.selectedColors : opt.colors
                  }`}
                  onClick={() => setSeverity(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Category pills */}
          <div>
            <Label>Category</Label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {CATEGORY_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                    category === opt.value ? opt.selectedColors : opt.colors
                  }`}
                  onClick={() => setCategory(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            <Label className="cursor-pointer" onClick={() => setIsEnabled(!isEnabled)}>
              {isEnabled ? "Enabled" : "Disabled"}
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Trigger Conditions — human-readable */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Conditions</CardTitle>
          <CardDescription>
            Define when this protocol activates. All conditions must be met (AND logic).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {conditions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No conditions defined. Add a condition below.
            </p>
          )}
          {conditions.map((cond, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={cond.field}
                onChange={(e) => updateCondition(idx, { field: e.target.value })}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TRIGGER_FIELD_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={cond.operator}
                onChange={(e) => updateCondition(idx, { operator: e.target.value })}
                className="flex h-9 w-20 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {OPERATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Input
                value={cond.value}
                onChange={(e) => updateCondition(idx, { value: e.target.value })}
                placeholder="Value"
                className="w-32"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive/80"
                onClick={() => removeCondition(idx)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCondition}
          >
            + Add Condition
          </Button>
        </CardContent>
      </Card>

      {/* Actions — human-readable */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            Define what this protocol does when triggered
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Action Type</Label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {ACTION_TYPE_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                    actionType === opt.value
                      ? "bg-foreground text-background border-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setActionType(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label>Suggestion / Message</Label>
            <Textarea
              value={actionSuggest}
              onChange={(e) => setActionSuggest(e.target.value)}
              placeholder="e.g. Training monotony high — scheduled deload recommended to prevent overtraining"
              className="min-h-[60px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Human-readable suggestion shown to the athlete or coach
            </p>
          </div>

          {(actionType === "reduce_load" || actionType === "boost_study") && (
            <div>
              <Label>Amount (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                placeholder="e.g. 40"
                className="w-32"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Percentage adjustment (e.g. 40 = reduce load by 40%)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scientific Basis & Sport Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>
            Scientific references and sport applicability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Scientific Basis / Reference</Label>
            <Textarea
              value={scientificBasis}
              onChange={(e) => setScientificBasis(e.target.value)}
              placeholder="e.g. Based on Lloyd &amp; Oliver (2012) youth periodization model..."
              className="min-h-[100px]"
            />
          </div>

          <Separator />

          <div>
            <Label>Sport Filter</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Select which sports this protocol applies to. Leave empty for all
              sports.
            </p>
            <div className="flex gap-2 flex-wrap">
              {SPORT_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                    sportFilter.includes(opt.value)
                      ? "bg-foreground text-background border-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => toggleSport(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {isEdit && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Protocol"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/admin/planning-protocols">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Create Protocol"}
          </Button>
        </div>
      </div>
    </div>
  );
}
