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
import { Textarea } from "@/components/ui/textarea";
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

interface PillarMetric {
  key: string;
  label: string;
  weight: number;
}

interface Pillar {
  id: string;
  name: string;
  emoji: string;
  colorTheme: string;
  enabled: boolean;
  priority: number;
  athleteDescription: string;
  metrics: PillarMetric[];
}

interface RadarAxis {
  key: string;
  label: string;
  color: string;
  pillarIds: string[];
}

interface AvailableMetric {
  key: string;
  label: string;
}

interface MasteryConfig {
  pillars: Pillar[];
  radarAxes: RadarAxis[];
  availableMetrics?: AvailableMetric[];
}

const COLOR_THEMES = [
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "teal", label: "Teal" },
  { value: "blue", label: "Blue" },
  { value: "red", label: "Red" },
  { value: "green", label: "Green" },
  { value: "purple", label: "Purple" },
];

// ── Main Page ──

export default function MasteryPillarsPage() {
  const [config, setConfig] = useState<MasteryConfig | null>(null);
  const [availableMetrics, setAvailableMetrics] = useState<AvailableMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/mastery-config", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.availableMetrics) {
          setAvailableMetrics(data.availableMetrics);
        }
        setConfig(data);
      }
    } catch {
      toast.error("Failed to load mastery config");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  function updatePillar(index: number, field: keyof Pillar, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const pillars = [...prev.pillars];
      pillars[index] = { ...pillars[index], [field]: value };
      return { ...prev, pillars };
    });
  }

  function updateMetric(
    pillarIndex: number,
    metricIndex: number,
    field: keyof PillarMetric,
    value: string | number
  ) {
    setConfig((prev) => {
      if (!prev) return prev;
      const pillars = [...prev.pillars];
      const metrics = [...pillars[pillarIndex].metrics];
      metrics[metricIndex] = { ...metrics[metricIndex], [field]: value };
      pillars[pillarIndex] = { ...pillars[pillarIndex], metrics };
      return { ...prev, pillars };
    });
  }

  function removeMetric(pillarIndex: number, metricIndex: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      const pillars = [...prev.pillars];
      const metrics = pillars[pillarIndex].metrics.filter(
        (_, i) => i !== metricIndex
      );
      pillars[pillarIndex] = { ...pillars[pillarIndex], metrics };
      return { ...prev, pillars };
    });
  }

  function addMetric(pillarIndex: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      const pillars = [...prev.pillars];
      const metrics = [
        ...pillars[pillarIndex].metrics,
        { key: "", label: "", weight: 1.0 },
      ];
      pillars[pillarIndex] = { ...pillars[pillarIndex], metrics };
      return { ...prev, pillars };
    });
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/mastery-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Mastery pillar config saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save mastery config");
    }
    setSaving(false);
  }

  if (loading || !config) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading mastery pillar config...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Mastery Pillars
          </h1>
          <p className="text-muted-foreground">
            Configure the 7 mastery pillars, their metrics, weights, and radar
            chart axes
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Config"}
        </Button>
      </div>

      {/* Explanatory overview */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-4 pb-3">
          <h3 className="font-semibold text-sm mb-2">How Mastery Pillars Work</h3>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
            <li><strong>7 Pillars</strong> define the athlete&apos;s physical mastery profile — each pillar groups related performance metrics</li>
            <li><strong>Metrics</strong> are the individual tests/measurements (e.g., 10m Sprint, 1RM Squat) that feed into each pillar</li>
            <li><strong>Weight (0.0 – 1.0)</strong> controls how much each metric impacts the pillar&apos;s average percentile — higher weight = more influence</li>
            <li><strong>6-Axis Radar</strong> on the DNA card maps from these 7 pillars: MOB axis combines Mobility + Body Composition</li>
            <li><strong>Disable</strong> a pillar to hide it from the player&apos;s Mastery page — disabled pillars don&apos;t affect the radar or overall rating</li>
            <li><strong>Priority</strong> controls display order — lower number = shows first</li>
          </ul>
          <Separator className="my-3" />
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="font-medium text-foreground">Radar Mapping:</span>
              <div className="text-muted-foreground mt-1 space-y-0.5">
                <div>🟡 PAC ← Speed &amp; Acceleration</div>
                <div>🟠 POW ← Power &amp; Explosiveness</div>
                <div>🔵 AGI ← Agility &amp; CoD</div>
              </div>
            </div>
            <div>
              <span className="font-medium text-foreground">&nbsp;</span>
              <div className="text-muted-foreground mt-1 space-y-0.5">
                <div>🔷 END ← Aerobic Engine</div>
                <div>🔴 STR ← Strength</div>
                <div>🟢 MOB ← Mobility + Body Comp</div>
              </div>
            </div>
            <div>
              <span className="font-medium text-foreground">Tier Thresholds:</span>
              <div className="text-muted-foreground mt-1 space-y-0.5">
                <div>🥉 Bronze: 0–29</div>
                <div>🥈 Silver: 30–59</div>
                <div>🥇 Gold: 60–84</div>
                <div>💎 Diamond: 85+</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {config.pillars.map((pillar, pIdx) => (
          <Card key={pillar.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <span>{pillar.emoji}</span>
                {pillar.name}
                {!pillar.enabled && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    (disabled)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Name, Emoji, Color, Priority, Enabled */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={pillar.name}
                    onChange={(e) => updatePillar(pIdx, "name", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Emoji</Label>
                  <Input
                    value={pillar.emoji}
                    onChange={(e) =>
                      updatePillar(pIdx, "emoji", e.target.value)
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Color Theme
                  </Label>
                  <Select
                    value={pillar.colorTheme}
                    onValueChange={(val) => {
                      if (val) updatePillar(pIdx, "colorTheme", val);
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_THEMES.map((ct) => (
                        <SelectItem key={ct.value} value={ct.value}>
                          {ct.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Priority
                  </Label>
                  <Input
                    type="number"
                    value={pillar.priority}
                    onChange={(e) =>
                      updatePillar(pIdx, "priority", Number(e.target.value))
                    }
                    className="mt-1"
                    min={1}
                    max={10}
                  />
                </div>
                <div className="flex flex-col">
                  <Label className="text-xs text-muted-foreground">
                    Enabled
                  </Label>
                  <div className="mt-2">
                    <Switch
                      checked={pillar.enabled}
                      onCheckedChange={(checked) =>
                        updatePillar(pIdx, "enabled", checked)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Athlete Description */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Athlete Description
                </Label>
                <Textarea
                  value={pillar.athleteDescription}
                  onChange={(e) =>
                    updatePillar(pIdx, "athleteDescription", e.target.value)
                  }
                  className="mt-1"
                  rows={2}
                />
              </div>

              <Separator />

              {/* Metrics Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Metrics</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addMetric(pIdx)}
                  >
                    + Add Metric
                  </Button>
                </div>

                {pillar.metrics.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No metrics configured for this pillar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Header row */}
                    <div className="grid grid-cols-[2fr_1fr_80px_40px] gap-2 text-xs text-muted-foreground font-medium px-1">
                      <span>Metric</span>
                      <span>Label</span>
                      <span>Weight</span>
                      <span></span>
                    </div>
                    {pillar.metrics.map((metric, mIdx) => (
                      <div
                        key={mIdx}
                        className="grid grid-cols-[2fr_1fr_80px_40px] gap-2 items-center"
                      >
                        <Select
                          value={metric.key || "_empty"}
                          onValueChange={(val) => {
                            const v = (val ?? "") as string;
                            const selected = availableMetrics.find(m => m.key === v);
                            updateMetric(pIdx, mIdx, "key", v === "_empty" ? "" : v);
                            if (selected) updateMetric(pIdx, mIdx, "label", selected.label);
                          }}
                        >
                          <SelectTrigger className="text-sm h-9">
                            <SelectValue placeholder="Select metric..." />
                          </SelectTrigger>
                          <SelectContent className="min-w-[320px] max-h-[300px]">
                            <SelectItem value="_empty">— Select metric —</SelectItem>
                            {availableMetrics.map((am) => (
                              <SelectItem key={am.key} value={am.key} className="text-sm py-2">
                                <span className="font-medium">{am.label}</span>
                                <span className="text-muted-foreground ml-2 text-xs">({am.key})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={metric.label}
                          onChange={(e) =>
                            updateMetric(pIdx, mIdx, "label", e.target.value)
                          }
                          placeholder="Display Label"
                          className="text-xs"
                        />
                        <Input
                          type="number"
                          value={metric.weight}
                          onChange={(e) =>
                            updateMetric(
                              pIdx,
                              mIdx,
                              "weight",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          min={0}
                          max={1}
                          step={0.1}
                          className="text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-8 w-8 p-0"
                          onClick={() => removeMetric(pIdx, mIdx)}
                        >
                          X
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
