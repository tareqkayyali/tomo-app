"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ── Types ──

interface ComponentStyleEntry {
  fontSize?: number;
  fontWeight?: string;
  letterSpacing?: number;
}

type ComponentStylesConfig = Record<string, ComponentStyleEntry>;

// ── Component Registry ──

interface ComponentDef {
  key: string;
  label: string;
  group: string;
}

const COMPONENT_REGISTRY: ComponentDef[] = [
  // ─── Mastery Tab ───
  { key: "dna_card_overall_number", label: "Overall Number (48)", group: "Mastery — DNA Card" },
  { key: "dna_card_overall_label", label: "OVR Label", group: "Mastery — DNA Card" },
  { key: "dna_card_attribute_label", label: "Attribute Label (PAC)", group: "Mastery — DNA Card" },
  { key: "dna_card_attribute_score", label: "Attribute Score", group: "Mastery — DNA Card" },
  { key: "dna_card_tier_badge", label: "Tier Badge (GOLD)", group: "Mastery — DNA Card" },
  { key: "dna_card_position_badge", label: "Position Badge (ST)", group: "Mastery — DNA Card" },
  { key: "radar_label", label: "Radar Axis Label (PAC)", group: "Mastery — Radar Chart" },
  { key: "radar_score", label: "Radar Score Value", group: "Mastery — Radar Chart" },
  { key: "pillar_title", label: "Pillar Title", group: "Mastery — Pillars" },
  { key: "pillar_value", label: "Pillar Percentile", group: "Mastery — Pillars" },
  { key: "pillar_description", label: "Pillar Description", group: "Mastery — Pillars" },
  { key: "streak_count", label: "Streak Counter", group: "Mastery — Streaks" },
  { key: "streak_label", label: "Streak Label", group: "Mastery — Streaks" },
  { key: "milestone_title", label: "Milestone Title", group: "Mastery — Milestones" },
  { key: "milestone_subtitle", label: "Milestone Subtitle", group: "Mastery — Milestones" },

  // ─── Output Tab ───
  { key: "vital_value", label: "Vital Reading Value", group: "Output — My Vitals" },
  { key: "vital_label", label: "Vital Label", group: "Output — My Vitals" },
  { key: "vital_unit", label: "Vital Unit", group: "Output — My Vitals" },
  { key: "metric_value", label: "Metric Score", group: "Output — My Metrics" },
  { key: "metric_label", label: "Metric Label", group: "Output — My Metrics" },
  { key: "metric_unit", label: "Metric Unit", group: "Output — My Metrics" },
  { key: "benchmark_zone_label", label: "Zone Label (Elite/Good)", group: "Output — Benchmarks" },
  { key: "benchmark_percentile", label: "Percentile Text (P75)", group: "Output — Benchmarks" },
  { key: "benchmark_norm_value", label: "Normative Line Value", group: "Output — Benchmarks" },
  { key: "benchmark_delta", label: "Delta Text (+2.3)", group: "Output — Benchmarks" },
  { key: "program_title", label: "Program Title", group: "Output — My Programs" },
  { key: "program_subtitle", label: "Program Subtitle", group: "Output — My Programs" },
  { key: "drill_name", label: "Drill Name", group: "Output — My Programs" },
  { key: "drill_detail", label: "Drill Detail Text", group: "Output — My Programs" },

  // ─── Timeline Tab ───
  { key: "calendar_day_number", label: "Day Number", group: "Timeline — Calendar" },
  { key: "calendar_day_label", label: "Day Label (Mon)", group: "Timeline — Calendar" },
  { key: "calendar_month_label", label: "Month Label", group: "Timeline — Calendar" },
  { key: "event_title", label: "Event Title", group: "Timeline — Events" },
  { key: "event_time", label: "Event Time", group: "Timeline — Events" },
  { key: "event_detail", label: "Event Detail", group: "Timeline — Events" },
  { key: "insight_title", label: "AI Insight Title", group: "Timeline — Insights" },
  { key: "insight_body", label: "AI Insight Body", group: "Timeline — Insights" },

  // ─── Tomo Chat Tab ───
  { key: "chat_message", label: "Chat Message Text", group: "Tomo Chat" },
  { key: "chat_agent_name", label: "Agent Name Label", group: "Tomo Chat" },
  { key: "chat_chip", label: "Suggestion Chip", group: "Tomo Chat" },
  { key: "chat_timestamp", label: "Message Timestamp", group: "Tomo Chat" },

  // ─── Own It Tab ───
  { key: "rec_card_title", label: "Recommendation Title", group: "Own It — Feed" },
  { key: "rec_card_body", label: "Recommendation Body", group: "Own It — Feed" },
  { key: "rec_card_tag", label: "Recommendation Tag", group: "Own It — Feed" },
  { key: "readiness_score", label: "Readiness Score", group: "Own It — Readiness" },
  { key: "readiness_label", label: "Readiness Label", group: "Own It — Readiness" },
  { key: "focus_tip", label: "Focus Tip Text", group: "Own It — Tips" },

  // ─── Shared / Global ───
  { key: "page_title", label: "Page Title", group: "Shared" },
  { key: "page_subtitle", label: "Page Subtitle", group: "Shared" },
  { key: "card_header", label: "Card Header", group: "Shared" },
  { key: "section_header", label: "Section Header", group: "Shared" },
  { key: "tab_label", label: "Tab Label", group: "Shared" },
  { key: "badge_text", label: "Badge Text", group: "Shared" },
  { key: "button_label", label: "Button Label", group: "Shared" },
  { key: "empty_state", label: "Empty State Text", group: "Shared" },
];

const FONT_WEIGHTS = [
  { value: "300", label: "Light (300)" },
  { value: "400", label: "Regular (400)" },
  { value: "500", label: "Medium (500)" },
  { value: "600", label: "SemiBold (600)" },
  { value: "700", label: "Bold (700)" },
];

const DEFAULTS: ComponentStylesConfig = {
  // Mastery — DNA Card
  dna_card_overall_number: { fontSize: 48, fontWeight: "700", letterSpacing: 0 },
  dna_card_overall_label: { fontSize: 12, fontWeight: "600", letterSpacing: 2 },
  dna_card_attribute_label: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  dna_card_attribute_score: { fontSize: 22, fontWeight: "700", letterSpacing: 0 },
  dna_card_tier_badge: { fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  dna_card_position_badge: { fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  // Mastery — Radar Chart
  radar_label: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  radar_score: { fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  // Mastery — Pillars
  pillar_title: { fontSize: 15, fontWeight: "600", letterSpacing: 0 },
  pillar_value: { fontSize: 11, fontWeight: "600", letterSpacing: 0 },
  pillar_description: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  // Mastery — Streaks
  streak_count: { fontSize: 28, fontWeight: "700", letterSpacing: 0 },
  streak_label: { fontSize: 12, fontWeight: "500", letterSpacing: 0.5 },
  // Mastery — Milestones
  milestone_title: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  milestone_subtitle: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  // Output — Vitals
  vital_value: { fontSize: 24, fontWeight: "700", letterSpacing: 0 },
  vital_label: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  vital_unit: { fontSize: 11, fontWeight: "400", letterSpacing: 0 },
  // Output — Metrics
  metric_value: { fontSize: 20, fontWeight: "700", letterSpacing: 0 },
  metric_label: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  metric_unit: { fontSize: 11, fontWeight: "400", letterSpacing: 0 },
  // Output — Benchmarks
  benchmark_zone_label: { fontSize: 9, fontWeight: "400", letterSpacing: 0 },
  benchmark_percentile: { fontSize: 10, fontWeight: "600", letterSpacing: 0 },
  benchmark_norm_value: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  benchmark_delta: { fontSize: 11, fontWeight: "500", letterSpacing: 0 },
  // Output — Programs
  program_title: { fontSize: 16, fontWeight: "600", letterSpacing: 0 },
  program_subtitle: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  drill_name: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  drill_detail: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  // Timeline — Calendar
  calendar_day_number: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  calendar_day_label: { fontSize: 10, fontWeight: "500", letterSpacing: 0.5 },
  calendar_month_label: { fontSize: 13, fontWeight: "600", letterSpacing: 0 },
  // Timeline — Events
  event_title: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  event_time: { fontSize: 12, fontWeight: "500", letterSpacing: 0 },
  event_detail: { fontSize: 12, fontWeight: "400", letterSpacing: 0 },
  // Timeline — Insights
  insight_title: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  insight_body: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  // Tomo Chat
  chat_message: { fontSize: 14, fontWeight: "400", letterSpacing: 0 },
  chat_agent_name: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  chat_chip: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  chat_timestamp: { fontSize: 10, fontWeight: "400", letterSpacing: 0 },
  // Own It — Feed
  rec_card_title: { fontSize: 15, fontWeight: "600", letterSpacing: 0 },
  rec_card_body: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  rec_card_tag: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  // Own It — Readiness
  readiness_score: { fontSize: 36, fontWeight: "700", letterSpacing: 0 },
  readiness_label: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  // Own It — Tips
  focus_tip: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  // Shared
  page_title: { fontSize: 36, fontWeight: "700", letterSpacing: -0.72 },
  page_subtitle: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  card_header: { fontSize: 14, fontWeight: "600", letterSpacing: 0 },
  section_header: { fontSize: 16, fontWeight: "600", letterSpacing: 0 },
  tab_label: { fontSize: 14, fontWeight: "500", letterSpacing: 0 },
  badge_text: { fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  button_label: { fontSize: 10, fontWeight: "600", letterSpacing: 0.8 },
  empty_state: { fontSize: 14, fontWeight: "400", letterSpacing: 0 },
};

// ── Tab filter for groups ──

const GROUP_TABS = [
  { key: "all", label: "All" },
  { key: "mastery", label: "Mastery" },
  { key: "output", label: "Output" },
  { key: "timeline", label: "Timeline" },
  { key: "chat", label: "Tomo Chat" },
  { key: "ownit", label: "Own It" },
  { key: "shared", label: "Shared" },
];

function matchesTab(group: string, tab: string): boolean {
  if (tab === "all") return true;
  if (tab === "mastery") return group.startsWith("Mastery");
  if (tab === "output") return group.startsWith("Output");
  if (tab === "timeline") return group.startsWith("Timeline");
  if (tab === "chat") return group.startsWith("Tomo Chat");
  if (tab === "ownit") return group.startsWith("Own It");
  if (tab === "shared") return group === "Shared";
  return true;
}

// ── Style Editor Row ──

function StyleEditorRow({
  def,
  style,
  onChange,
}: {
  def: ComponentDef;
  style: ComponentStyleEntry;
  onChange: (key: string, field: keyof ComponentStyleEntry, value: number | string) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-b-0">
      <div className="w-52 shrink-0">
        <p className="text-sm font-medium">{def.label}</p>
        <p className="text-xs text-muted-foreground font-mono">{def.key}</p>
      </div>

      <div className="flex items-center gap-3 flex-1">
        <div className="w-24">
          <Label className="text-xs text-muted-foreground">Size</Label>
          <Input
            type="number"
            value={style.fontSize ?? ""}
            onChange={(e) => onChange(def.key, "fontSize", Number(e.target.value))}
            className="mt-1 h-8 text-sm"
            min={6}
            max={72}
            step={1}
          />
        </div>

        <div className="w-40">
          <Label className="text-xs text-muted-foreground">Weight</Label>
          <Select
            value={style.fontWeight ?? "400"}
            onValueChange={(val) => {
              if (val) onChange(def.key, "fontWeight", val);
            }}
          >
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-28">
          <Label className="text-xs text-muted-foreground">Spacing</Label>
          <Input
            type="number"
            value={style.letterSpacing ?? 0}
            onChange={(e) => onChange(def.key, "letterSpacing", Number(e.target.value))}
            className="mt-1 h-8 text-sm"
            min={-2}
            max={10}
            step={0.1}
          />
        </div>

        {/* Live preview text */}
        <div className="flex-1 flex items-center justify-center">
          <span
            style={{
              fontSize: style.fontSize ?? 14,
              fontWeight: (style.fontWeight ?? "400") as React.CSSProperties["fontWeight"],
              letterSpacing: style.letterSpacing ?? 0,
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            Aa
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function ComponentStylesPage() {
  const [config, setConfig] = useState<ComponentStylesConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/content/ui-config?key=component_styles");
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          setConfig({ ...DEFAULTS, ...data });
        }
      }
    } catch {
      // Use defaults
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  function handleChange(
    key: string,
    field: keyof ComponentStyleEntry,
    value: number | string
  ) {
    setConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/ui-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config_key: "component_styles",
          config_value: config,
        }),
      });
      if (res.ok) {
        toast.success("Component styles saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save component styles");
    }
    setSaving(false);
  }

  function handleReset() {
    setConfig(DEFAULTS);
    toast.info("Reset to default values (not saved yet)");
  }

  // Filter registry by active tab then group
  const filteredRegistry = COMPONENT_REGISTRY.filter((def) =>
    matchesTab(def.group, activeTab)
  );

  const groups = filteredRegistry.reduce<Record<string, ComponentDef[]>>((acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading component styles...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Component Styles</h1>
          <p className="text-muted-foreground">
            Override font size, weight, and letter-spacing per UI component across all tabs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset Defaults
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Styles"}
          </Button>
        </div>
      </div>

      {/* Tab filter */}
      <div className="border-b">
        <div className="flex gap-0">
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {COMPONENT_REGISTRY.filter((d) => matchesTab(d.group, tab.key)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {Object.entries(groups).map(([groupName, defs]) => (
        <Card key={groupName}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{groupName}</CardTitle>
          </CardHeader>
          <CardContent>
            {defs.map((def) => (
              <StyleEditorRow
                key={def.key}
                def={def}
                style={config[def.key] ?? {}}
                onChange={handleChange}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {Object.keys(groups).length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No components in this tab
        </div>
      )}
    </div>
  );
}
