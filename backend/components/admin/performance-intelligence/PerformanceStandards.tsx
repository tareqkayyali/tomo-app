"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface NormativeRow { id: string; metric_name: string; unit: string; attribute_key: string; }
interface DevelopmentGate { id: string; prerequisite: string; unlocks: string; rationale: string; hardGate: boolean; active: boolean; }
interface GapResponses { belowDeveloping: string; developingToCompetitive: string; aboveCompetitive: string; }
interface ReadinessMatrix { rules: unknown[]; confidenceThresholds: unknown; stalenessHours: number; developmentGates: DevelopmentGate[]; gapResponses: GapResponses; }

const AGE_BANDS = ["U13", "U15", "U17", "U19", "Senior"];
const GAP_OPTIONS: Record<string, string> = {
  focus_development: "Focus development sessions on this quality for 4-6 weeks",
  include_weekly: "Include this quality in every weekly plan until threshold reached",
  flag_primary: "Flag as primary development priority to the athlete",
  maintain_work: "Maintain consistent work on this quality",
  mention_relevant: "Mention in context when relevant to session planning",
  set_secondary: "Set as a secondary goal in the athlete's monthly targets",
  acknowledge_maintain: "Acknowledge as a strength, maintain",
  confidence_anchor: "Use this quality as a confidence anchor in harder sessions",
  no_focus: "No active development focus unless athlete chooses it",
};

export function PerformanceStandards() {
  const [benchmarks, setBenchmarks] = useState<NormativeRow[]>([]);
  const [readinessConfig, setReadinessConfig] = useState<ReadinessMatrix | null>(null);
  const [sportFilter, setSportFilter] = useState("football");
  const [ageBand, setAgeBand] = useState("U17");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/normative-data", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/admin/performance-intelligence/readiness-matrix", { credentials: "include" }).then((r) => r.json()),
    ]).then(([norm, matrix]) => {
      setBenchmarks(norm.rows || norm || []);
      setReadinessConfig(matrix);
      setLoading(false);
    }).catch(() => { toast.error("Failed to load"); setLoading(false); });
  }, []);

  if (loading || !readinessConfig) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  function updateGate(idx: number, field: keyof DevelopmentGate, value: unknown) {
    setReadinessConfig((prev) => {
      if (!prev) return prev;
      const gates = [...prev.developmentGates];
      gates[idx] = { ...gates[idx], [field]: value };
      return { ...prev, developmentGates: gates };
    });
  }

  function addGate() {
    setReadinessConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, developmentGates: [...prev.developmentGates, { id: `g_${Date.now()}`, prerequisite: "", unlocks: "", rationale: "", hardGate: true, active: true }] };
    });
  }

  function removeGate(idx: number) {
    setReadinessConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, developmentGates: prev.developmentGates.filter((_, i) => i !== idx) };
    });
  }

  function moveGate(idx: number, dir: -1 | 1) {
    setReadinessConfig((prev) => {
      if (!prev) return prev;
      const gates = [...prev.developmentGates];
      const target = idx + dir;
      if (target < 0 || target >= gates.length) return prev;
      [gates[idx], gates[target]] = [gates[target], gates[idx]];
      return { ...prev, developmentGates: gates };
    });
  }

  function updateGapResponse(field: keyof GapResponses, value: string) {
    setReadinessConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, gapResponses: { ...prev.gapResponses, [field]: value } };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/readiness-matrix", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(readinessConfig),
      });
      if (res.ok) toast.success("Standards saved"); else toast.error("Save failed");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Performance Standards</h3>
          <p className="text-xs text-muted-foreground">The scientific benchmarks the AI uses to assess athlete progress</p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">{saving ? "Saving..." : "Save"}</Button>
      </div>

      {/* A: Filters */}
      <div className="flex gap-3 items-center">
        <Select value={sportFilter} onValueChange={(v) => setSportFilter(v || sportFilter)}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="football">Football</SelectItem><SelectItem value="padel">Padel</SelectItem><SelectItem value="athletics">Athletics</SelectItem><SelectItem value="basketball">Basketball</SelectItem><SelectItem value="tennis">Tennis</SelectItem></SelectContent>
        </Select>
        <div className="flex gap-1">
          {AGE_BANDS.map((b) => (
            <button key={b} onClick={() => setAgeBand(b)} className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${ageBand === b ? "bg-green-500/15 border-green-500/50 text-green-400" : "border-border text-muted-foreground hover:bg-accent/50"}`}>{b}</button>
          ))}
        </div>
      </div>

      {/* B: Benchmark table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Performance benchmarks</CardTitle></CardHeader>
        <CardContent>
          <div className="text-xs bg-blue-500/10 border border-blue-500/20 rounded p-2 mb-3 text-blue-300">
            All strength standards use multiples of bodyweight, never absolute kilograms. This ensures benchmarks are meaningful for athletes of any size or age.
          </div>
          {benchmarks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No benchmarks loaded. Add normative data via the Normative Data page.</p>
          ) : (
            <div className="space-y-1">
              {benchmarks.slice(0, 20).map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs w-16 justify-center">{row.attribute_key || "—"}</Badge>
                    <span className="text-sm">{row.metric_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{row.unit}</span>
                </div>
              ))}
              {benchmarks.length > 20 && <p className="text-xs text-muted-foreground pt-2">Showing 20 of {benchmarks.length}. Manage all in Normative Data.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* C: Development gates */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Prerequisite milestones</CardTitle>
            <Button variant="outline" size="sm" onClick={addGate}>Add gate</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Scientific sequencing: some training types should not be introduced until an athlete has established the physical foundations. The AI enforces these sequences when recommending programmes.</p>
          <div className="space-y-3">
            {readinessConfig.developmentGates.map((gate, i) => (
              <Card key={gate.id} className="border-dashed">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveGate(i, -1)} disabled={i === 0}>↑</Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveGate(i, 1)} disabled={i === readinessConfig.developmentGates.length - 1}>↓</Button>
                      <Badge variant={gate.hardGate ? "destructive" : "secondary"} className="text-xs">{gate.hardGate ? "Hard gate" : "Recommended"}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Hard gate</Label>
                      <Switch checked={gate.hardGate} onCheckedChange={(v) => updateGate(i, "hardGate", v)} className="scale-75" />
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeGate(i)}>Remove</Button>
                    </div>
                  </div>
                  <Input value={gate.prerequisite} onChange={(e) => updateGate(i, "prerequisite", e.target.value)} className="h-7 text-xs" placeholder="What the athlete must achieve first" />
                  <Input value={gate.unlocks} onChange={(e) => updateGate(i, "unlocks", e.target.value)} className="h-7 text-xs" placeholder="What training type becomes available" />
                  <Textarea value={gate.rationale} onChange={(e) => updateGate(i, "rationale", e.target.value)} rows={2} className="text-xs" placeholder="Scientific rationale (1-2 sentences)" />
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* D: Gap response logic */}
      <div>
        <h3 className="text-sm font-semibold mb-2">How the AI responds to benchmark gaps</h3>
        <p className="text-xs text-muted-foreground mb-3">Define what the AI does when an athlete's test results fall below each threshold level.</p>
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-red-400">Below Developing threshold</CardTitle></CardHeader>
            <CardContent>
              <Select value={readinessConfig.gapResponses.belowDeveloping} onValueChange={(v) => updateGapResponse("belowDeveloping", v || readinessConfig.gapResponses.belowDeveloping)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(GAP_OPTIONS).slice(0, 3).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-amber-400">Developing to Competitive</CardTitle></CardHeader>
            <CardContent>
              <Select value={readinessConfig.gapResponses.developingToCompetitive} onValueChange={(v) => updateGapResponse("developingToCompetitive", v || readinessConfig.gapResponses.developingToCompetitive)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(GAP_OPTIONS).slice(3, 6).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-green-400">At or above Competitive</CardTitle></CardHeader>
            <CardContent>
              <Select value={readinessConfig.gapResponses.aboveCompetitive} onValueChange={(v) => updateGapResponse("aboveCompetitive", v || readinessConfig.gapResponses.aboveCompetitive)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(GAP_OPTIONS).slice(6).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
