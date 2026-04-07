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

interface PHVContraindication { pattern: string; blocked: string; alternative: string; why: string; mechanism: string; progression: string; citation: string; applicableStages: string[]; }
interface MonitoringAlert { condition: string; description: string; symptoms: string; action: string; triggerStages: string[]; }
interface LoadThresholds { amberPercent: number; redPercent: number; hrvPercent: number; dualStressCap: number; sleepHours: number; beginnerWeeks: number; }
interface PHVStage { name: string; loadingMultiplier: number; flexibilityEmphasis: boolean; coreStabilityEmphasis: boolean; [k: string]: unknown; }
interface PHVConfig { stages: PHVStage[]; contraindications: PHVContraindication[]; monitoringAlerts: MonitoringAlert[]; loadThresholds: LoadThresholds; }
interface ReadinessRule { id: string; condition: { readinessRag: string; additionalFactors: { field: string; operator: string; value: string | number | boolean }[] }; priority: number; title: string; titleNoTraining: string; bodyShort: string; bodyShortNoTraining: string; aiBehaviour: string; }
interface ReadinessMatrix { rules: ReadinessRule[]; confidenceThresholds: { fresh: number; wearableOnly: number; stale: number }; stalenessHours: number; developmentGates: unknown[]; gapResponses: unknown; }

const RULE_DESCRIPTIONS: Record<string, string> = {
  red_mid_phv: "Low readiness + rapid growth phase active",
  red_default: "Low readiness signal (sleep, recovery, wellness all below threshold)",
  amber_high_acwr: "Moderate readiness + load spike detected",
  amber_default: "Moderate readiness (mixed signals)",
  green_mid_phv: "Good readiness + rapid growth phase active",
  green_default: "All readiness signals in normal range",
};

const THRESHOLD_META = [
  { key: "amberPercent", label: "Load spike — warning zone", desc: "This week's load exceeds the 4-week average by more than:", unit: "%", citation: "Gabbett, 2016 — the training-injury prevention paradox", aiAction: "Flags the load spike to the athlete. Reduces next session intensity. Adds extra recovery content." },
  { key: "redPercent", label: "Load spike — critical zone", desc: "This week's load exceeds the 4-week average by more than:", unit: "%", citation: "Hulin et al., 2016 — acute:chronic workload ratio and injury risk", aiAction: "Blocks high-intensity sessions. Recommends active recovery only." },
  { key: "hrvPercent", label: "Recovery suppression", desc: "Morning recovery indicator is below the athlete's 7-day baseline by more than:", unit: "%", citation: "Plews et al., 2013 — HRV guided training", aiAction: "Caps session intensity at 60%. Prioritises sleep and recovery advice." },
  { key: "dualStressCap", label: "Combined stress (training + academic)", desc: "Combined athletic and academic stress index exceeds:", unit: "%", citation: "Tomo dual-load model (internal validation study)", aiAction: "Caps athletic load at 75% of planned session." },
  { key: "sleepHours", label: "Sleep deficit", desc: "Athlete reports below:", unit: "hours sleep", citation: "Simpson et al., 2017 — sleep and athlete performance", aiAction: "Reduces session intensity by 20-30%. Prioritises sleep education." },
  { key: "beginnerWeeks", label: "New athlete protection", desc: "Athlete has less than:", unit: "weeks of structured training", citation: "Maffulli et al., 2011 — overuse injury in young athletes", aiAction: "Caps all sessions at 70%. Cannot be overridden. Expires automatically." },
];

export function AthleteSafetyRules() {
  const [phvConfig, setPhvConfig] = useState<PHVConfig | null>(null);
  const [readinessConfig, setReadinessConfig] = useState<ReadinessMatrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [justification, setJustification] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/performance-intelligence/phv-config", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/admin/performance-intelligence/readiness-matrix", { credentials: "include" }).then((r) => r.json()),
    ]).then(([phv, matrix]) => { setPhvConfig(phv); setReadinessConfig(matrix); })
      .catch(() => toast.error("Failed to load"));
  }, []);

  if (!phvConfig || !readinessConfig) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const midStage = phvConfig.stages.find((s) => s.name === "mid_phv");
  const multiplier = midStage?.loadingMultiplier ?? 0.6;

  function updateAlternative(idx: number, value: string) {
    setPhvConfig((p) => p ? { ...p, contraindications: p.contraindications.map((c, i) => i === idx ? { ...c, alternative: value } : c) } : p);
  }

  function updateThreshold(key: string, value: number) {
    setPhvConfig((p) => p ? { ...p, loadThresholds: { ...p.loadThresholds, [key]: value } } : p);
  }

  function updateRuleTitle(idx: number, field: "title" | "titleNoTraining", value: string) {
    setReadinessConfig((p) => p ? { ...p, rules: p.rules.map((r, i) => i === idx ? { ...r, [field]: value } : r) } : p);
  }

  function updateConfidence(field: "fresh" | "wearableOnly" | "stale", value: number) {
    setReadinessConfig((p) => p ? { ...p, confidenceThresholds: { ...p.confidenceThresholds, [field]: value } } : p);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/v1/admin/performance-intelligence/phv-config", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(phvConfig) }),
        fetch("/api/v1/admin/performance-intelligence/readiness-matrix", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(readinessConfig) }),
      ]);
      if (r1.ok && r2.ok) toast.success("Safety rules saved"); else toast.error("Some settings failed");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div><h3 className="font-semibold">Athlete Safety Rules</h3><p className="text-xs text-muted-foreground">Non-negotiable safety protocols the AI enforces for every developing athlete</p></div>
        <Button onClick={handleSave} disabled={saving} size="sm">{saving ? "Saving..." : "Save all"}</Button>
      </div>

      {/* A: Growth phase protocol */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Rapid growth phase — protocol</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted/30 rounded p-3 text-xs text-muted-foreground space-y-1">
            <p><b>Based on:</b> Mirwald et al. (2002) biological maturation model</p>
            <p><b>Highest-risk window:</b> -1.0 to +1.0 years from peak height velocity</p>
            <p><b>Primary risks:</b> Growth plate stress, bone-muscle length mismatch, reduced coordination, elevated injury susceptibility</p>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <Label className="text-xs">Training load reduction to:</Label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-bold text-amber-400">{Math.round(multiplier * 100)}%</span>
                <span className="text-xs text-muted-foreground">of standard load</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">(Faigenbaum et al., 2009 — load guidelines for adolescents)</p>
            </div>
          </div>
          {midStage && (
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={midStage.flexibilityEmphasis} onCheckedChange={(v) => { const stages = [...phvConfig.stages]; const idx = stages.findIndex((s) => s.name === "mid_phv"); if (idx >= 0) stages[idx] = { ...stages[idx], flexibilityEmphasis: v }; setPhvConfig({ ...phvConfig, stages }); }} />
                <Label className="text-xs">Add flexibility and mobility work to every session</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={midStage.coreStabilityEmphasis} onCheckedChange={(v) => { const stages = [...phvConfig.stages]; const idx = stages.findIndex((s) => s.name === "mid_phv"); if (idx >= 0) stages[idx] = { ...stages[idx], coreStabilityEmphasis: v }; setPhvConfig({ ...phvConfig, stages }); }} />
                <Label className="text-xs">Prioritise core and stability exercises</Label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B: Contraindicated exercises */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Exercises during rapid growth phase</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Status classifications are based on peer-reviewed evidence. The safe alternative for each exercise is editable.</p>
          <div className="space-y-2">
            {phvConfig.contraindications.map((c, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                <div className="w-44 shrink-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={c.blocked.toLowerCase().includes("sprint") || c.blocked.toLowerCase().includes("box") ? "default" : "destructive"} className="text-xs w-16 justify-center">
                      {c.blocked.toLowerCase().includes("sprint") || c.blocked.toLowerCase().includes("box") ? "Limited" : "Blocked"}
                    </Badge>
                    <span className="text-sm">{c.blocked}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{c.citation}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 mt-1">→</span>
                <div className="flex-1">
                  <Input value={c.alternative} onChange={(e) => updateAlternative(i, e.target.value)} className="h-7 text-xs" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* C: Growth conditions */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Specific conditions during growth</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {phvConfig.monitoringAlerts.map((alert, i) => (
            <Card key={i} className="border-dashed">
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-medium">{alert.condition}</p>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
                <Textarea value={alert.action} onChange={(e) => { const alerts = [...phvConfig.monitoringAlerts]; alerts[i] = { ...alerts[i], action: e.target.value }; setPhvConfig({ ...phvConfig, monitoringAlerts: alerts }); }} rows={2} className="text-xs" />
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* D: Load safety thresholds */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Training load safety thresholds</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">The load boundaries that trigger automatic AI intervention. Grounded in sports science research.</p>
          <div className="space-y-4">
            {THRESHOLD_META.map((t) => (
              <div key={t.key} className="flex items-start justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                  <p className="text-xs text-muted-foreground mt-1">AI action: {t.aiAction}</p>
                  <p className="text-xs text-muted-foreground italic">{t.citation}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {t.key === "beginnerWeeks" ? (
                    <Badge variant="secondary" className="text-xs">{phvConfig.loadThresholds[t.key as keyof LoadThresholds]} {t.unit}</Badge>
                  ) : (
                    <>
                      <Input type="number" value={phvConfig.loadThresholds[t.key as keyof LoadThresholds]} onChange={(e) => updateThreshold(t.key, parseFloat(e.target.value) || 0)} className="h-7 text-xs w-16" />
                      <span className="text-xs text-muted-foreground">{t.unit}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* E: Readiness decision protocol */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Athlete readiness — decision protocol</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">The scientific decision tree the AI applies each morning. Rules are evaluated in priority order — the first matching rule determines the response. Only the athlete-facing titles are editable.</p>
          <div className="space-y-3">
            {readinessConfig.rules.map((rule, i) => (
              <Card key={rule.id} className="border-dashed">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs w-6 h-6 rounded-full justify-center p-0">{i + 1}</Badge>
                    <Badge variant={rule.priority === 1 ? "destructive" : rule.priority === 2 ? "default" : "secondary"} className="text-xs">P{rule.priority}</Badge>
                    <span className="text-xs text-muted-foreground">{RULE_DESCRIPTIONS[rule.id] || "Custom rule"}</span>
                  </div>
                  {rule.aiBehaviour && <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">AI behaviour: {rule.aiBehaviour}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Athlete sees (training day)</Label>
                      <Input value={rule.title} onChange={(e) => updateRuleTitle(i, "title", e.target.value)} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Athlete sees (rest day)</Label>
                      <Input value={rule.titleNoTraining} onChange={(e) => updateRuleTitle(i, "titleNoTraining", e.target.value)} className="h-7 text-xs" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-4">
            <h4 className="text-xs font-medium mb-2">Confidence thresholds</h4>
            <div className="grid grid-cols-3 gap-4">
              <div><Label className="text-xs">Fresh data (&lt;12h)</Label><Input type="number" step="0.05" min={0} max={1} value={readinessConfig.confidenceThresholds.fresh} onChange={(e) => updateConfidence("fresh", parseFloat(e.target.value) || 0)} className="h-7 text-xs mt-1" /></div>
              <div><Label className="text-xs">Older data (12-24h)</Label><Input type="number" step="0.05" min={0} max={1} value={readinessConfig.confidenceThresholds.wearableOnly} onChange={(e) => updateConfidence("wearableOnly", parseFloat(e.target.value) || 0)} className="h-7 text-xs mt-1" /></div>
              <div><Label className="text-xs">Stale / no data (&gt;24h)</Label><Input type="number" step="0.05" min={0} max={1} value={readinessConfig.confidenceThresholds.stale} onChange={(e) => updateConfidence("stale", parseFloat(e.target.value) || 0)} className="h-7 text-xs mt-1" /></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
