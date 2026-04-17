"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ── Types ──

interface VisibilityCondition {
  field: string;
  operator: string;
  value: string;
}

interface DashboardSectionData {
  id?: string;
  section_key: string;
  display_name: string;
  component_type: string;
  sort_order: number;
  visibility: { match: "all" | "any"; conditions: VisibilityCondition[] } | null;
  config: string; // JSON string for editing
  coaching_text: string;
  sport_filter: string[];
  is_enabled: boolean;
}

const COMPONENT_TYPES = [
  { value: "signal_hero", label: "Signal Hero" },
  { value: "status_ring", label: "Status Ring" },
  { value: "kpi_row", label: "KPI Row" },
  { value: "sparkline_row", label: "Sparkline Row" },
  { value: "dual_load", label: "Dual Load" },
  { value: "benchmark", label: "Benchmark" },
  { value: "rec_list", label: "Recommendation List" },
  { value: "event_list", label: "Event List" },
  { value: "growth_card", label: "Growth Card" },
  { value: "engagement_bar", label: "Engagement Bar" },
  { value: "protocol_banner", label: "Protocol Banner" },
  { value: "custom_card", label: "Custom Card" },
];

const OPERATORS = [
  { value: "eq", label: "Equals (eq)" },
  { value: "neq", label: "Not Equal (neq)" },
  { value: "gt", label: "Greater Than (gt)" },
  { value: "gte", label: "Greater or Equal (gte)" },
  { value: "lt", label: "Less Than (lt)" },
  { value: "lte", label: "Less or Equal (lte)" },
  { value: "in", label: "In Array (in)" },
  { value: "not_in", label: "Not In Array (not_in)" },
];

const CONDITION_FIELDS = [
  "readiness_score", "readiness_rag", "sleep_hours", "sleep_debt_3d",
  "soreness", "energy", "mood", "academic_stress", "acwr",
  "consecutive_red_days", "dual_load_index", "days_to_next_exam",
  "days_to_next_match", "phv_stage", "hrv_ratio", "hrv_morning_ms",
  "has_active_protocol", "current_streak",
];

const SPORTS = ["football", "soccer", "basketball", "tennis", "padel", "athletics"];

interface DashboardSectionFormProps {
  /** If editing, pass the section ID */
  sectionId?: string;
}

export default function DashboardSectionForm({ sectionId }: DashboardSectionFormProps) {
  const router = useRouter();
  const isEditing = !!sectionId;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  // ── Form state ──
  const [sectionKey, setSectionKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [componentType, setComponentType] = useState("custom_card");
  const [sortOrder, setSortOrder] = useState(500);
  const [isEnabled, setIsEnabled] = useState(true);
  const [coachingText, setCoachingText] = useState("");
  const [configJson, setConfigJson] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);

  // Visibility
  const [hasVisibility, setHasVisibility] = useState(false);
  const [visibilityMatch, setVisibilityMatch] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<VisibilityCondition[]>([]);

  // Sport filter
  const [selectedSports, setSelectedSports] = useState<string[]>([]);

  // ── Load existing section for edit mode ──
  useEffect(() => {
    if (!sectionId) return;

    async function load() {
      const res = await fetch(`/api/v1/admin/dashboard-sections/${sectionId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to load section");
        router.push("/admin/dashboard-sections");
        return;
      }
      const data = await res.json();
      setSectionKey(data.section_key ?? "");
      setDisplayName(data.display_name ?? "");
      setComponentType(data.component_type ?? "custom_card");
      setSortOrder(data.sort_order ?? 0);
      setIsEnabled(data.is_enabled ?? true);
      setCoachingText(data.coaching_text ?? "");
      setConfigJson(JSON.stringify(data.config ?? {}, null, 2));
      setSelectedSports(data.sport_filter ?? []);

      if (data.visibility) {
        setHasVisibility(true);
        setVisibilityMatch(data.visibility.match ?? "all");
        setConditions(
          (data.visibility.conditions ?? []).map((c: any) => ({
            field: c.field ?? "",
            operator: c.operator ?? "eq",
            value: typeof c.value === "string" ? c.value : JSON.stringify(c.value),
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, [sectionId, router]);

  // ── Validate config JSON on change ──
  useEffect(() => {
    try {
      JSON.parse(configJson);
      setConfigError(null);
    } catch {
      setConfigError("Invalid JSON");
    }
  }, [configJson]);

  // ── Condition helpers ──
  function addCondition() {
    setConditions([...conditions, { field: "readiness_score", operator: "gte", value: "60" }]);
  }

  function updateCondition(index: number, updates: Partial<VisibilityCondition>) {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  }

  function removeCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  // ── Sport filter toggle ──
  function toggleSport(sport: string) {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  // ── Submit ──
  async function handleSubmit() {
    if (!sectionKey.trim()) {
      toast.error("Section key is required");
      return;
    }
    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }
    if (configError) {
      toast.error("Fix the config JSON before saving");
      return;
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configJson);
    } catch {
      toast.error("Config must be valid JSON");
      return;
    }

    // Parse condition values — try number first, then boolean, then string
    const parsedConditions = conditions.map((c) => {
      let value: unknown = c.value;
      if (c.value === "true") value = true;
      else if (c.value === "false") value = false;
      else if (c.value === "null") value = null;
      else if (!isNaN(Number(c.value)) && c.value.trim() !== "") value = Number(c.value);
      // Handle array values for in/not_in operators
      else if ((c.operator === "in" || c.operator === "not_in") && c.value.startsWith("[")) {
        try { value = JSON.parse(c.value); } catch { /* keep as string */ }
      }
      return { field: c.field, operator: c.operator, value };
    });

    const payload: Record<string, unknown> = {
      section_key: sectionKey.trim().toLowerCase().replace(/\s+/g, "_"),
      display_name: displayName.trim(),
      component_type: componentType,
      sort_order: sortOrder,
      is_enabled: isEnabled,
      config,
      coaching_text: coachingText.trim() || null,
      sport_filter: selectedSports.length > 0 ? selectedSports : null,
      visibility: hasVisibility && parsedConditions.length > 0
        ? { match: visibilityMatch, conditions: parsedConditions }
        : null,
    };

    setSaving(true);

    const url = isEditing
      ? `/api/v1/admin/dashboard-sections/${sectionId}`
      : "/api/v1/admin/dashboard-sections";

    const res = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (res.ok) {
      toast.success(isEditing ? "Section updated" : "Section created");
      router.push("/admin/dashboard-sections");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save section");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading section...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditing ? "Edit Section" : "New Dashboard Section"}
          </h1>
          <p className="text-muted-foreground">
            {isEditing
              ? `Editing ${sectionKey}`
              : "Add a new section to the mobile dashboard"}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/admin/dashboard-sections")}>
          Cancel
        </Button>
      </div>

      {/* ── Identity ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Identity</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="section_key">Section Key</Label>
            <Input
              id="section_key"
              value={sectionKey}
              onChange={(e) => setSectionKey(e.target.value)}
              placeholder="e.g. weekly_trends"
              disabled={isEditing}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier (lowercase, underscores). Cannot change after creation.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Weekly Trends"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Component Type</Label>
            <Select value={componentType} onValueChange={(v) => setComponentType(v ?? "custom_card")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPONENT_TYPES.map((ct) => (
                  <SelectItem key={ct.value} value={ct.value}>
                    {ct.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              min={0}
              max={10000}
            />
            <p className="text-xs text-muted-foreground">
              Lower = higher on screen. Use increments of 100.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          <Label>Enabled</Label>
        </div>
      </section>

      <Separator />

      {/* ── Configuration (JSON) ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Component Config</h2>
        <p className="text-sm text-muted-foreground">
          JSON configuration passed to the mobile component. Shape depends on the component type.
        </p>
        <Textarea
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={10}
          className="font-mono text-sm"
        />
        {configError && (
          <p className="text-sm text-destructive">{configError}</p>
        )}
      </section>

      <Separator />

      {/* ── Coaching Text ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Coaching Text</h2>
        <p className="text-sm text-muted-foreground">
          Optional text interpolated against athlete snapshot. Use {"{field}"} placeholders
          (e.g. {"{readiness_score}"}, {"{sleep_hours}"}, {"{phv_stage}"}).
        </p>
        <Textarea
          value={coachingText}
          onChange={(e) => setCoachingText(e.target.value)}
          rows={3}
          placeholder="e.g. Your readiness is {readiness_score}. Focus on recovery today."
        />
      </section>

      <Separator />

      {/* ── Visibility Conditions ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Visibility Conditions</h2>
            <p className="text-sm text-muted-foreground">
              When empty, section is always visible.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={hasVisibility} onCheckedChange={setHasVisibility} />
            <Label>Conditional</Label>
          </div>
        </div>

        {hasVisibility && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="flex items-center gap-2">
              <Label>Show when</Label>
              <Select
                value={visibilityMatch}
                onValueChange={(v) => setVisibilityMatch((v ?? "all") as "all" | "any")}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  <SelectItem value="any">ANY</SelectItem>
                </SelectContent>
              </Select>
              <Label>conditions are met:</Label>
            </div>

            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={c.field}
                  onValueChange={(v) => updateCondition(i, { field: v ?? "readiness_score" })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_FIELDS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={c.operator}
                  onValueChange={(v) => updateCondition(i, { operator: v ?? "eq" })}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={c.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  className="w-[120px]"
                  placeholder="value"
                />

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeCondition(i)}
                >
                  X
                </Button>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addCondition}>
              + Add Condition
            </Button>
          </div>
        )}
      </section>

      <Separator />

      {/* ── Sport Filter ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Sport Filter</h2>
        <p className="text-sm text-muted-foreground">
          Leave empty to show for all sports. Select specific sports to restrict visibility.
        </p>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((sport) => (
            <Badge
              key={sport}
              variant={selectedSports.includes(sport) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleSport(sport)}
            >
              {sport}
            </Badge>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Save ── */}
      <div className="flex items-center gap-4 pb-12">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving..." : isEditing ? "Update Section" : "Create Section"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/admin/dashboard-sections")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
