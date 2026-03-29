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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

// ── Types ──

interface ColorRule {
  green: string;
  yellow: string;
  red: string;
}

interface Pill {
  id: string;
  enabled: boolean;
  label: string;
  emoji: string;
  dataSource: string;
  format: string;
  emptyValue: string;
  tapAction?: string;
  tapHint?: string;
  colorRules?: ColorRule;
}

interface Flag {
  id: string;
  enabled: boolean;
  message: string;
  condition: string;
  icon: string;
  color: string;
  priority: number;
}

interface Chip {
  id: string;
  enabled: boolean;
  label: string;
  message: string;
  condition: string;
  priority: number;
}

interface GreetingConfig {
  enabled: boolean;
  showEmoji: boolean;
  customPrefix: string;
}

interface TodayConfig {
  enabled: boolean;
  maxEvents: number;
  showEventTime: boolean;
  showRestDayMessage: boolean;
  restDayMessage: string;
}

interface DashboardConfig {
  greeting: GreetingConfig;
  pills: Pill[];
  flags: Flag[];
  chips: Chip[];
  todaySection: TodayConfig;
  newUserMessage: string;
}

interface DataSource {
  field: string;
  label: string;
  group: string;
}

// ── Helpers ──

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

function extractOperator(rule?: string): string {
  if (!rule) return "";
  const match = rule.match(/^(>=|<=|>|<|==|!=)/);
  return match?.[1] ?? "";
}

function extractValue(rule?: string): string {
  if (!rule) return "";
  const match = rule.match(/^(?:>=|<=|>|<|==|!=)\s*(.+)$/);
  return match?.[1]?.trim() ?? "";
}

function composeRule(operator: string, value: string): string {
  if (!operator || !value) return "";
  return `${operator} ${value}`;
}

function extractField(condition: string): string {
  if (!condition) return "";
  const match = condition.match(/^(.+?)\s*(?:>=|<=|>|<|==|!=)/);
  return match?.[1]?.trim() ?? "";
}

function extractCondValue(condition: string): string {
  if (!condition) return "";
  const match = condition.match(/(?:>=|<=|>|<|==|!=)\s*(.+)$/);
  return match?.[1]?.trim() ?? "";
}

// ── Main Page ──

export default function ProactiveDashboardPage() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [chipConditions, setChipConditions] = useState<
    { value: string; label: string }[]
  >([]);
  const [formatOptions, setFormatOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [emojiOptions, setEmojiOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [iconOptions, setIconOptions] = useState<
    { value: string; label: string; emoji: string }[]
  >([]);
  const [operatorOptions, setOperatorOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [chatCommands, setChatCommands] = useState<
    { value: string; label: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track which pills/chips have custom tap action / message selected
  const [customTapAction, setCustomTapAction] = useState<Record<number, boolean>>({});
  const [customChipMessage, setCustomChipMessage] = useState<Record<number, boolean>>({});
  // Track which flags use comparison mode
  const [flagComparisonMode, setFlagComparisonMode] = useState<Record<number, boolean>>({});

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/dashboard-config", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const {
          dataSources: ds,
          chipConditions: cc,
          formatOptions: fo,
          emojiOptions: eo,
          iconOptions: io,
          operatorOptions: oo,
          chatCommands: cmds,
          ...configFields
        } = data;
        setConfig(configFields as DashboardConfig);
        setDataSources(ds ?? []);
        setChipConditions(cc ?? []);
        setFormatOptions(fo ?? []);
        setEmojiOptions(eo ?? []);
        setIconOptions(io ?? []);
        setOperatorOptions(oo ?? []);
        setChatCommands(cmds ?? []);
      } else {
        toast.error("Failed to load dashboard config");
      }
    } catch {
      toast.error("Failed to load dashboard config");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ── Greeting helpers ──

  function updateGreeting(field: keyof GreetingConfig, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, greeting: { ...prev.greeting, [field]: value } };
    });
  }

  // ── Today helpers ──

  function updateToday(field: keyof TodayConfig, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, todaySection: { ...prev.todaySection, [field]: value } };
    });
  }

  // ── Pill helpers ──

  function addPill() {
    setConfig((prev) => {
      if (!prev || prev.pills.length >= 6) return prev;
      const newPill: Pill = {
        id: generateId("pill"),
        enabled: true,
        label: "New Pill",
        emoji: "",
        dataSource: "",
        format: "number",
        emptyValue: "\u2014",
        tapAction: "",
        tapHint: "",
        colorRules: { green: "", yellow: "", red: "" },
      };
      return { ...prev, pills: [...prev.pills, newPill] };
    });
  }

  function removePill(index: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, pills: prev.pills.filter((_, i) => i !== index) };
    });
  }

  function updatePill(index: number, field: string, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const pills = [...prev.pills];
      pills[index] = { ...pills[index], [field]: value };
      return { ...prev, pills };
    });
  }

  function updatePillColorRuleStructured(
    index: number,
    ruleField: keyof ColorRule,
    operator: string,
    value: string
  ) {
    const composed = composeRule(operator, value);
    setConfig((prev) => {
      if (!prev) return prev;
      const pills = [...prev.pills];
      pills[index] = {
        ...pills[index],
        colorRules: {
          green: "",
          yellow: "",
          red: "",
          ...pills[index].colorRules,
          [ruleField]: composed,
        },
      };
      return { ...prev, pills };
    });
  }

  function movePill(fromIndex: number, toIndex: number) {
    if (toIndex < 0) return;
    setConfig((prev) => {
      if (!prev || toIndex >= prev.pills.length) return prev;
      const pills = [...prev.pills];
      const [moved] = pills.splice(fromIndex, 1);
      pills.splice(toIndex, 0, moved);
      return { ...prev, pills };
    });
  }

  // ── Flag helpers ──

  function addFlag() {
    setConfig((prev) => {
      if (!prev) return prev;
      const newFlag: Flag = {
        id: generateId("flag"),
        enabled: true,
        message: "",
        condition: "",
        icon: "alert-circle",
        color: "#E74C3C",
        priority: (prev.flags.length + 1) * 10,
      };
      return { ...prev, flags: [...prev.flags, newFlag] };
    });
  }

  function removeFlag(index: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, flags: prev.flags.filter((_, i) => i !== index) };
    });
  }

  function updateFlag(index: number, field: string, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const flags = [...prev.flags];
      flags[index] = { ...flags[index], [field]: value };
      return { ...prev, flags };
    });
  }

  function updateFlagConditionPart(
    index: number,
    field: string,
    operator: string,
    value: string
  ) {
    const condition =
      field && operator && value ? `${field} ${operator} ${value}` : "";
    updateFlag(index, "condition", condition);
  }

  // ── Chip helpers ──

  function addChip() {
    setConfig((prev) => {
      if (!prev) return prev;
      const newChip: Chip = {
        id: generateId("chip"),
        enabled: true,
        label: "New Chip",
        message: "",
        condition: "always",
        priority: (prev.chips.length + 1) * 10,
      };
      return { ...prev, chips: [...prev.chips, newChip] };
    });
  }

  function removeChip(index: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, chips: prev.chips.filter((_, i) => i !== index) };
    });
  }

  function updateChip(index: number, field: string, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const chips = [...prev.chips];
      chips[index] = { ...chips[index], [field]: value };
      return { ...prev, chips };
    });
  }

  // ── Save ──

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/dashboard-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Dashboard config saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save dashboard config");
    }
    setSaving(false);
  }

  // ── Loading state ──

  if (loading || !config) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading dashboard config...
      </div>
    );
  }

  // ── Group data sources by group ──

  const dataSourceGroups = dataSources.reduce<Record<string, DataSource[]>>(
    (acc, ds) => {
      const g = ds.group || "Other";
      if (!acc[g]) acc[g] = [];
      acc[g].push(ds);
      return acc;
    },
    {}
  );

  // ── Render ──

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Proactive Dashboard
          </h1>
          <p className="text-muted-foreground">
            Configure the greeting, status pills, flags, smart chips, and today
            section for the athlete dashboard
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Config"}
        </Button>
      </div>

      {/* ── Section 1: Greeting ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Greeting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.greeting.enabled}
                onCheckedChange={(checked) =>
                  updateGreeting("enabled", checked)
                }
              />
              <Label className="text-sm">Enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.greeting.showEmoji}
                onCheckedChange={(checked) =>
                  updateGreeting("showEmoji", checked)
                }
              />
              <Label className="text-sm">Show Emoji</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Custom Prefix
            </Label>
            <Input
              value={config.greeting.customPrefix}
              onChange={(e) =>
                updateGreeting("customPrefix", e.target.value)
              }
              placeholder="Leave blank for auto time-based greeting"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Status Pills ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Status Pills</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure the data pills shown at the top of the dashboard (max 6)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.pills.map((pill, pIdx) => {
            const isCustomTap =
              customTapAction[pIdx] ||
              (pill.tapAction &&
                !chatCommands.some((c) => c.value === pill.tapAction));

            return (
              <div
                key={pill.id}
                className={`border rounded-lg p-4 space-y-3 ${
                  !pill.enabled ? "opacity-50" : ""
                }`}
              >
                {/* Row 1: Enabled, Label, Emoji, Reorder */}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={pill.enabled}
                    onCheckedChange={(checked) =>
                      updatePill(pIdx, "enabled", checked)
                    }
                  />
                  <div className="flex-1">
                    <Input
                      value={pill.label}
                      onChange={(e) =>
                        updatePill(pIdx, "label", e.target.value)
                      }
                      placeholder="Label"
                    />
                  </div>
                  <Select
                    value={pill.emoji || "_none"}
                    onValueChange={(val) =>
                      updatePill(pIdx, "emoji", val === "_none" ? "" : val)
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="Pick..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {emojiOptions.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.value} {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={pIdx === 0}
                    onClick={() => movePill(pIdx, pIdx - 1)}
                  >
                    &uarr;
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={pIdx === config.pills.length - 1}
                    onClick={() => movePill(pIdx, pIdx + 1)}
                  >
                    &darr;
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => removePill(pIdx)}
                  >
                    X
                  </Button>
                </div>

                {/* Row 2: DataSource, Format */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Data Source
                    </Label>
                    <Select
                      value={pill.dataSource || "_empty"}
                      onValueChange={(val) =>
                        updatePill(
                          pIdx,
                          "dataSource",
                          val === "_empty" ? "" : val
                        )
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select data source..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value="_empty">
                          -- Select data source --
                        </SelectItem>
                        {Object.entries(dataSourceGroups).map(
                          ([group, sources]) => (
                            <div key={group}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                {group}
                              </div>
                              {sources.map((ds) => (
                                <SelectItem key={ds.field} value={ds.field}>
                                  {ds.label}
                                </SelectItem>
                              ))}
                            </div>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Format
                    </Label>
                    <Select
                      value={pill.format || "_empty"}
                      onValueChange={(val) =>
                        updatePill(pIdx, "format", val === "_empty" ? "" : val)
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select format..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_empty">
                          -- Select format --
                        </SelectItem>
                        {formatOptions.map((fo) => (
                          <SelectItem key={fo.value} value={fo.value}>
                            {fo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 3: Empty Value, Tap Action, Tap Hint */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Empty Value
                    </Label>
                    <Input
                      value={pill.emptyValue}
                      onChange={(e) =>
                        updatePill(pIdx, "emptyValue", e.target.value)
                      }
                      placeholder={"\u2014"}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Tap Action
                    </Label>
                    <Select
                      value={
                        chatCommands.some((c) => c.value === pill.tapAction)
                          ? pill.tapAction!
                          : pill.tapAction
                          ? "_custom"
                          : "_none"
                      }
                      onValueChange={(val) => {
                        if (val === "_none") {
                          updatePill(pIdx, "tapAction", "");
                          setCustomTapAction((prev) => ({
                            ...prev,
                            [pIdx]: false,
                          }));
                        } else if (val === "_custom") {
                          setCustomTapAction((prev) => ({
                            ...prev,
                            [pIdx]: true,
                          }));
                        } else {
                          updatePill(pIdx, "tapAction", val);
                          setCustomTapAction((prev) => ({
                            ...prev,
                            [pIdx]: false,
                          }));
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="No action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No action</SelectItem>
                        {chatCommands.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="_custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                    {isCustomTap && (
                      <Input
                        value={pill.tapAction ?? ""}
                        onChange={(e) =>
                          updatePill(pIdx, "tapAction", e.target.value)
                        }
                        placeholder="Custom chat message"
                        className="mt-1"
                      />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Tap Hint
                    </Label>
                    <Input
                      value={pill.tapHint}
                      onChange={(e) =>
                        updatePill(pIdx, "tapHint", e.target.value)
                      }
                      placeholder="Optional: hint text"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Row 4: Color Rules */}
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Color Rules
                  </summary>
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <div>
                      <Label className="text-xs text-green-600">
                        Green Condition
                      </Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Select
                          value={
                            extractOperator(pill.colorRules?.green) || "_none"
                          }
                          onValueChange={(val) =>
                            updatePillColorRuleStructured(
                              pIdx,
                              "green",
                              val === "_none" ? "" : (val ?? ""),
                              extractValue(pill.colorRules?.green)
                            )
                          }
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue placeholder="Op" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">--</SelectItem>
                            {operatorOptions.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.1"
                          className="w-20"
                          value={extractValue(pill.colorRules?.green)}
                          onChange={(e) =>
                            updatePillColorRuleStructured(
                              pIdx,
                              "green",
                              extractOperator(pill.colorRules?.green),
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-yellow-600">
                        Yellow Condition
                      </Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Select
                          value={
                            extractOperator(pill.colorRules?.yellow) || "_none"
                          }
                          onValueChange={(val) =>
                            updatePillColorRuleStructured(
                              pIdx,
                              "yellow",
                              val === "_none" ? "" : (val ?? ""),
                              extractValue(pill.colorRules?.yellow)
                            )
                          }
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue placeholder="Op" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">--</SelectItem>
                            {operatorOptions.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.1"
                          className="w-20"
                          value={extractValue(pill.colorRules?.yellow)}
                          onChange={(e) =>
                            updatePillColorRuleStructured(
                              pIdx,
                              "yellow",
                              extractOperator(pill.colorRules?.yellow),
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-red-600">
                        Red Condition
                      </Label>
                      <div className="flex items-center gap-1 mt-1">
                        <Select
                          value={
                            extractOperator(pill.colorRules?.red) || "_none"
                          }
                          onValueChange={(val) =>
                            updatePillColorRuleStructured(
                              pIdx,
                              "red",
                              val === "_none" ? "" : (val ?? ""),
                              extractValue(pill.colorRules?.red)
                            )
                          }
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue placeholder="Op" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">--</SelectItem>
                            {operatorOptions.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.1"
                          className="w-20"
                          value={extractValue(pill.colorRules?.red)}
                          onChange={(e) =>
                            updatePillColorRuleStructured(
                              pIdx,
                              "red",
                              extractOperator(pill.colorRules?.red),
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            );
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={addPill}
            disabled={config.pills.length >= 6}
          >
            + Add Pill
          </Button>
        </CardContent>
      </Card>

      {/* ── Section 3: Flags / Alerts ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Flags</CardTitle>
          <p className="text-sm text-muted-foreground">
            Alert messages shown based on conditions (only the highest priority
            flag is displayed)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.flags.map((flag, fIdx) => {
            const isNamedCondition = chipConditions.some(
              (c) => c.value === flag.condition
            );
            const showComparison =
              flagComparisonMode[fIdx] ||
              (!isNamedCondition && flag.condition !== "");

            return (
              <div
                key={flag.id}
                className={`border rounded-lg p-4 space-y-3 ${
                  !flag.enabled ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={(checked) =>
                      updateFlag(fIdx, "enabled", checked)
                    }
                  />
                  <div className="flex-1">
                    <Input
                      value={flag.message}
                      onChange={(e) =>
                        updateFlag(fIdx, "message", e.target.value)
                      }
                      placeholder="Alert message"
                    />
                  </div>
                  {/* Flag Icon dropdown */}
                  <Select
                    value={flag.icon || "_none"}
                    onValueChange={(val) =>
                      updateFlag(fIdx, "icon", val === "_none" ? "" : val)
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Pick icon..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No icon</SelectItem>
                      {iconOptions.map((ic) => (
                        <SelectItem key={ic.value} value={ic.value}>
                          {ic.emoji} {ic.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="w-16">
                    <Input
                      type="color"
                      value={flag.color}
                      onChange={(e) =>
                        updateFlag(fIdx, "color", e.target.value)
                      }
                      className="h-9 p-1"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      value={flag.priority}
                      onChange={(e) =>
                        updateFlag(fIdx, "priority", Number(e.target.value))
                      }
                      placeholder="Priority"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => removeFlag(fIdx)}
                  >
                    X
                  </Button>
                </div>

                {/* Flag Condition — named dropdown + data comparison builder */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">
                    Condition
                  </Label>
                  <Select
                    value={
                      isNamedCondition
                        ? flag.condition
                        : showComparison
                        ? "_comparison"
                        : "_none"
                    }
                    onValueChange={(val) => {
                      if (val === "_comparison") {
                        setFlagComparisonMode((prev) => ({
                          ...prev,
                          [fIdx]: true,
                        }));
                      } else if (val === "_none") {
                        updateFlag(fIdx, "condition", "");
                        setFlagComparisonMode((prev) => ({
                          ...prev,
                          [fIdx]: false,
                        }));
                      } else {
                        updateFlag(fIdx, "condition", val);
                        setFlagComparisonMode((prev) => ({
                          ...prev,
                          [fIdx]: false,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Condition..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No condition</SelectItem>
                      {chipConditions.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="_comparison">
                        Data comparison...
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {showComparison && (
                    <div className="flex items-center gap-1">
                      <Select
                        value={extractField(flag.condition) || "_none"}
                        onValueChange={(val) =>
                          updateFlagConditionPart(
                            fIdx,
                            val === "_none" ? "" : (val ?? ""),
                            extractOperator(flag.condition),
                            extractCondValue(flag.condition)
                          )
                        }
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Field..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="_none">-- Field --</SelectItem>
                          {dataSources.map((ds) => (
                            <SelectItem key={ds.field} value={ds.field}>
                              {ds.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={extractOperator(flag.condition) || "_none"}
                        onValueChange={(val) =>
                          updateFlagConditionPart(
                            fIdx,
                            extractField(flag.condition),
                            val === "_none" ? "" : (val ?? ""),
                            extractCondValue(flag.condition)
                          )
                        }
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue placeholder="Op" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">--</SelectItem>
                          {operatorOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-20"
                        value={extractCondValue(flag.condition)}
                        onChange={(e) =>
                          updateFlagConditionPart(
                            fIdx,
                            extractField(flag.condition),
                            extractOperator(flag.condition),
                            e.target.value
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <Button variant="outline" size="sm" onClick={addFlag}>
            + Add Flag
          </Button>
        </CardContent>
      </Card>

      {/* ── Section 4: Smart Chips ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Smart Chips</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quick action buttons shown below the dashboard (max 3 shown, picked
            by priority and condition)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.chips.map((chip, cIdx) => {
            const isCustomMessage =
              customChipMessage[cIdx] ||
              (chip.message &&
                !chatCommands.some((c) => c.value === chip.message));

            return (
              <div
                key={chip.id}
                className={`border rounded-lg p-4 space-y-3 ${
                  !chip.enabled ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Switch
                    checked={chip.enabled}
                    onCheckedChange={(checked) =>
                      updateChip(cIdx, "enabled", checked)
                    }
                  />
                  <div className="w-40">
                    <Input
                      value={chip.label}
                      onChange={(e) =>
                        updateChip(cIdx, "label", e.target.value)
                      }
                      placeholder="Label"
                    />
                  </div>
                  <div className="flex-1">
                    <Select
                      value={
                        chatCommands.some((c) => c.value === chip.message)
                          ? chip.message
                          : chip.message
                          ? "_custom"
                          : "_none"
                      }
                      onValueChange={(val) => {
                        if (val === "_none") {
                          updateChip(cIdx, "message", "");
                          setCustomChipMessage((prev) => ({
                            ...prev,
                            [cIdx]: false,
                          }));
                        } else if (val === "_custom") {
                          setCustomChipMessage((prev) => ({
                            ...prev,
                            [cIdx]: true,
                          }));
                        } else {
                          updateChip(cIdx, "message", val);
                          setCustomChipMessage((prev) => ({
                            ...prev,
                            [cIdx]: false,
                          }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chat command..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No message</SelectItem>
                        {chatCommands.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="_custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>
                    {isCustomMessage && (
                      <Input
                        value={chip.message}
                        onChange={(e) =>
                          updateChip(cIdx, "message", e.target.value)
                        }
                        placeholder="Custom chat message"
                        className="mt-1"
                      />
                    )}
                  </div>
                  <div className="w-40">
                    <Select
                      value={chip.condition || "_empty"}
                      onValueChange={(val) =>
                        updateChip(
                          cIdx,
                          "condition",
                          val === "_empty" ? "" : val
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Condition..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_empty">-- Condition --</SelectItem>
                        {chipConditions.map((cc) => (
                          <SelectItem key={cc.value} value={cc.value}>
                            {cc.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      value={chip.priority}
                      onChange={(e) =>
                        updateChip(cIdx, "priority", Number(e.target.value))
                      }
                      placeholder="Priority"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    onClick={() => removeChip(cIdx)}
                  >
                    X
                  </Button>
                </div>
              </div>
            );
          })}

          <Button variant="outline" size="sm" onClick={addChip}>
            + Add Chip
          </Button>
        </CardContent>
      </Card>

      {/* ── Section 5: Today Section ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Today Section</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.todaySection.enabled}
                onCheckedChange={(checked) =>
                  updateToday("enabled", checked)
                }
              />
              <Label className="text-sm">Enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.todaySection.showEventTime}
                onCheckedChange={(checked) =>
                  updateToday("showEventTime", checked)
                }
              />
              <Label className="text-sm">Show Event Time</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.todaySection.showRestDayMessage}
                onCheckedChange={(checked) =>
                  updateToday("showRestDayMessage", checked)
                }
              />
              <Label className="text-sm">Show Rest Day Message</Label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">
                Max Events
              </Label>
              <Input
                type="number"
                value={config.todaySection.maxEvents}
                onChange={(e) =>
                  updateToday("maxEvents", Number(e.target.value))
                }
                min={1}
                max={10}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Rest Day Message
              </Label>
              <Input
                value={config.todaySection.restDayMessage}
                onChange={(e) =>
                  updateToday("restDayMessage", e.target.value)
                }
                placeholder="Rest day — recovery focus"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 6: New User Message ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">New User Message</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={config.newUserMessage}
            onChange={(e) =>
              setConfig((prev) =>
                prev ? { ...prev, newUserMessage: e.target.value } : prev
              )
            }
            placeholder="Welcome message for new users"
          />
        </CardContent>
      </Card>

      {/* ── Bottom Save Button ── */}
      <Separator />
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? "Saving..." : "Save Config"}
        </Button>
      </div>
    </div>
  );
}
