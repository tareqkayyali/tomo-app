"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface PHVContraindication {
  pattern: string;
  blocked: string;
  alternative: string;
  why: string;
  mechanism: string;
  progression: string;
  citation: string;
  applicableStages: string[];
}

interface MonitoringAlert {
  condition: string;
  description: string;
  symptoms: string;
  action: string;
  triggerStages: string[];
}

interface PHVSafetyConfig {
  stages: { name: string; loadingMultiplier: number; [k: string]: unknown }[];
  contraindications: PHVContraindication[];
  monitoringAlerts: MonitoringAlert[];
}

interface ReadinessRule {
  id: string;
  condition: { readinessRag: string; additionalFactors: { field: string; operator: string; value: string | number | boolean }[] };
  priority: number;
  title: string;
  titleNoTraining: string;
  bodyShort: string;
  bodyShortNoTraining: string;
}

interface ReadinessMatrix {
  rules: ReadinessRule[];
  confidenceThresholds: { fresh: number; wearableOnly: number; stale: number };
  stalenessHours: number;
}

// Exercise status classification (not editable by director)
const BLOCKED_PATTERNS = ["barbell", "depth jump", "drop jump", "olympic", "clean", "snatch", "deadlift", "loaded plyometric"];
const LIMITED_PATTERNS = ["maximal sprint", "box jump"];

function getExerciseStatus(blocked: string): "Blocked" | "Limited" {
  const lower = blocked.toLowerCase();
  for (const p of LIMITED_PATTERNS) {
    if (lower.includes(p)) return "Limited";
  }
  return "Blocked";
}

// Director-friendly rule descriptions
const RULE_DESCRIPTIONS: Record<string, { directorLabel: string }> = {
  red_mid_phv: { directorLabel: "Athlete readiness is low and growth phase is active" },
  red_default: { directorLabel: "Athlete readiness is low. Full rest recommended" },
  amber_high_acwr: { directorLabel: "Athlete is recovering from a load-heavy period. Light day only" },
  amber_default: { directorLabel: "Athlete is partially ready. Light to moderate training only" },
  green_mid_phv: { directorLabel: "Athlete is ready, but growth phase reduces exercise options" },
  green_default: { directorLabel: "All systems green. Full training available" },
};

export function AthleteProtectionEditor() {
  const [phvConfig, setPhvConfig] = useState<PHVSafetyConfig | null>(null);
  const [readinessConfig, setReadinessConfig] = useState<ReadinessMatrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [growthProtectionEnabled, setGrowthProtectionEnabled] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/performance-intelligence/phv-config", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/admin/performance-intelligence/readiness-matrix", { credentials: "include" }).then((r) => r.json()),
    ]).then(([phv, readiness]) => {
      setPhvConfig(phv);
      setReadinessConfig(readiness);
    }).catch(() => toast.error("Failed to load protection config"));
  }, []);

  if (!phvConfig || !readinessConfig) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const midStage = phvConfig.stages.find((s) => s.name === "mid_phv");
  const multiplier = midStage?.loadingMultiplier ?? 0.6;

  function updateAlternative(idx: number, value: string) {
    setPhvConfig((prev) => {
      if (!prev) return prev;
      const contraindications = [...prev.contraindications];
      contraindications[idx] = { ...contraindications[idx], alternative: value };
      return { ...prev, contraindications };
    });
  }

  function updateAlertAction(idx: number, value: string) {
    setPhvConfig((prev) => {
      if (!prev) return prev;
      const monitoringAlerts = [...prev.monitoringAlerts];
      monitoringAlerts[idx] = { ...monitoringAlerts[idx], action: value };
      return { ...prev, monitoringAlerts };
    });
  }

  function updateRuleTitle(idx: number, field: "title" | "titleNoTraining", value: string) {
    setReadinessConfig((prev) => {
      if (!prev) return prev;
      const rules = [...prev.rules];
      rules[idx] = { ...rules[idx], [field]: value };
      return { ...prev, rules };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/v1/admin/performance-intelligence/phv-config", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(phvConfig),
        }),
        fetch("/api/v1/admin/performance-intelligence/readiness-matrix", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(readinessConfig),
        }),
      ]);
      if (r1.ok && r2.ok) toast.success("Protection settings saved");
      else toast.error("Some settings failed to save");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  }

  const priorityLabels: Record<number, string> = { 1: "Urgent", 2: "Standard", 3: "Low priority" };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Athlete Protection</h3>
          <p className="text-xs text-muted-foreground">Safety rules, growth phase protection, and readiness responses</p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save all"}
        </Button>
      </div>

      {/* Section A — Growth phase protection */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Protect athletes in their rapid growth phase</p>
              <p className="text-xs text-muted-foreground mt-1">When an athlete is in their fastest growth period, Tomo automatically reduces training load, removes high-risk exercises from plans, and adds extra flexibility and core work.</p>
            </div>
            <Switch checked={growthProtectionEnabled} onCheckedChange={setGrowthProtectionEnabled} />
          </div>
          <div className="bg-muted/30 rounded p-3 space-y-1">
            <p className="text-xs">During rapid growth, Tomo reduces training intensity to <span className="font-semibold text-amber-400">{Math.round(multiplier * 100)}%</span> of normal</p>
            <p className="text-xs text-muted-foreground">This value is based on Mirwald et al. (2002) growth research. Contact the Tomo team to discuss adjustments for your programme.</p>
          </div>
        </CardContent>
      </Card>

      {/* Section B — Blocked/Limited exercises */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Exercises during rapid growth phase</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">The blocked/limited status of these exercises is based on peer-reviewed research and cannot be changed here. You can customise the suggested alternative for each.</p>
          <div className="space-y-2">
            {phvConfig.contraindications.map((c, i) => {
              const status = getExerciseStatus(c.blocked);
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className="w-48 shrink-0 flex items-center gap-2">
                    <Badge variant={status === "Blocked" ? "destructive" : "default"} className="text-xs w-16 justify-center">
                      {status}
                    </Badge>
                    <span className="text-sm">{c.blocked}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">→</span>
                  <Input
                    value={c.alternative}
                    onChange={(e) => updateAlternative(i, e.target.value)}
                    className="h-7 text-xs flex-1"
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section C — Growth conditions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Conditions that need special attention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {phvConfig.monitoringAlerts.map((alert, i) => (
            <Card key={i} className="border-dashed">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{alert.condition}</p>
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                </div>
                <Textarea
                  value={alert.action}
                  onChange={(e) => updateAlertAction(i, e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Section D — Load protection rules */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">When should Tomo reduce training load?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Load spike vs last 4 weeks</p>
                <p className="text-xs text-muted-foreground">Flags to athlete and coach. Blocks high-intensity sessions at red level.</p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Warning at</Label>
                <Input type="number" defaultValue={30} className="h-7 text-xs w-14" />
                <span className="text-xs">%</span>
                <Label className="text-xs text-muted-foreground ml-2">Block at</Label>
                <Input type="number" defaultValue={50} className="h-7 text-xs w-14" />
                <span className="text-xs">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Combined stress (training + school)</p>
                <p className="text-xs text-muted-foreground">Reduces athletic load automatically when academic stress is elevated.</p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Cap at</Label>
                <Input type="number" defaultValue={75} className="h-7 text-xs w-14" />
                <span className="text-xs">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Poor sleep quality</p>
                <p className="text-xs text-muted-foreground">Shifts next session to active recovery. Notifies coach.</p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">After</Label>
                <Input type="number" defaultValue={3} className="h-7 text-xs w-14" />
                <span className="text-xs">poor nights</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Wellness trend declining</p>
                <p className="text-xs text-muted-foreground">Reduces session intensity to 70%. Sends wellbeing check message.</p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Below</Label>
                <Input type="number" defaultValue={5} className="h-7 text-xs w-14" />
                <span className="text-xs">avg over 7 days</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">New athlete (first 12 weeks)</p>
                <p className="text-xs text-muted-foreground">Beginner protection: all sessions capped at 70% of standard load. Auto-expires at week 13.</p>
              </div>
              <Badge variant="secondary" className="text-xs">Always active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section E — Readiness rules */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">How Tomo reads an athlete's daily readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Tomo evaluates these in order — the first matching rule wins. The order and conditions are fixed. You can customise the message your athletes see.</p>
          <div className="space-y-3">
            {readinessConfig.rules.map((rule, i) => {
              const desc = RULE_DESCRIPTIONS[rule.id] || { directorLabel: "Custom rule" };
              return (
                <Card key={rule.id} className="border-dashed">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs w-6 h-6 rounded-full justify-center p-0">
                        {i + 1}
                      </Badge>
                      <Badge variant={rule.priority === 1 ? "destructive" : rule.priority === 2 ? "default" : "secondary"} className="text-xs">
                        {priorityLabels[rule.priority] || `P${rule.priority}`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{desc.directorLabel}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">What Tomo says (training day)</Label>
                        <Input
                          value={rule.title}
                          onChange={(e) => updateRuleTitle(i, "title", e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">What Tomo says (rest day)</Label>
                        <Input
                          value={rule.titleNoTraining}
                          onChange={(e) => updateRuleTitle(i, "titleNoTraining", e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
