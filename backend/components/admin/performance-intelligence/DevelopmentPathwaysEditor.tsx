"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface NormativeRow {
  id: string;
  metric_name: string;
  unit: string;
  attribute_key: string;
  age_min: number;
  age_max: number;
}

interface DevelopmentGate {
  id: string;
  prerequisite: string;
  unlocks: string;
  active: boolean;
}

interface GapConfig {
  minorThreshold: number;
  minorBehavior: string;
  significantThreshold: number;
  significantBehavior: string;
  gates: DevelopmentGate[];
}

const AGE_BANDS = ["U13", "U15", "U17", "U19", "Senior"];

const MINOR_BEHAVIORS = [
  "Tomo adds targeted development sessions during the week",
  "Tomo sends a nudge to the athlete's daily plan",
  "Tomo notifies coach only (no athlete message)",
];

const SIGNIFICANT_BEHAVIORS = [
  "Tomo flags to coach and reprioritises in the weekly plan",
  "Tomo creates a 4-week development block focused on this quality",
  "Tomo notifies parent and coach (Triangle alert)",
];

const DEFAULT_GATES: DevelopmentGate[] = [
  { id: "g1", prerequisite: "Achieve Yo-Yo Level 16 before progressing to high-intensity strength block", unlocks: "High-intensity strength block", active: true },
  { id: "g2", prerequisite: "Nordic curl prerequisite required before introducing max sprint volume", unlocks: "Maximum sprint volume", active: true },
  { id: "g3", prerequisite: "12 weeks minimum training age before any loaded plyometrics", unlocks: "Loaded plyometric exercises", active: true },
];

const CATEGORY_MAP: Record<string, string> = {
  pace: "Speed", speed: "Speed", sprint: "Speed",
  power: "Power", cmj: "Power", jump: "Power",
  endurance: "Aerobic", aerobic: "Aerobic", vo2: "Aerobic",
  agility: "Agility",
  strength: "Strength", squat: "Strength", nordic: "Strength",
};

export function DevelopmentPathwaysEditor() {
  const [activeAgeBands, setActiveAgeBands] = useState<string[]>(["U17", "U19"]);
  const [benchmarks, setBenchmarks] = useState<NormativeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [gapConfig, setGapConfig] = useState<GapConfig>({
    minorThreshold: 10,
    minorBehavior: MINOR_BEHAVIORS[0],
    significantThreshold: 20,
    significantBehavior: SIGNIFICANT_BEHAVIORS[0],
    gates: DEFAULT_GATES,
  });

  useEffect(() => {
    // Load normative data for benchmarks
    fetch("/api/v1/admin/normative-data", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setBenchmarks(data.rows || data || []);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, []);

  function toggleAgeBand(band: string) {
    setActiveAgeBands((prev) =>
      prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band]
    );
  }

  function getCategory(row: NormativeRow): string {
    const key = (row.attribute_key || row.metric_name || "").toLowerCase();
    for (const [k, v] of Object.entries(CATEGORY_MAP)) {
      if (key.includes(k)) return v;
    }
    return "Other";
  }

  function updateGate(idx: number, field: keyof DevelopmentGate, value: unknown) {
    setGapConfig((prev) => {
      const gates = [...prev.gates];
      gates[idx] = { ...gates[idx], [field]: value };
      return { ...prev, gates };
    });
  }

  function addGate() {
    setGapConfig((prev) => ({
      ...prev,
      gates: [...prev.gates, { id: `g_${Date.now()}`, prerequisite: "", unlocks: "", active: true }],
    }));
  }

  function removeGate(idx: number) {
    setGapConfig((prev) => ({
      ...prev,
      gates: prev.gates.filter((_, i) => i !== idx),
    }));
  }

  if (loading) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Section A — Age band selector */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Active age groups in your squad</h3>
        <div className="flex gap-2">
          {AGE_BANDS.map((band) => (
            <button
              key={band}
              onClick={() => toggleAgeBand(band)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeAgeBands.includes(band)
                  ? "bg-green-500/15 border-green-500/50 text-green-400"
                  : "border-border text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {band}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Select the age groups in your programme. Inactive groups are hidden from athletes but configuration is preserved.</p>
      </div>

      {/* Section B — Benchmarks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Performance benchmarks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            These benchmarks come from your normative data. Edit targets in the Normative Data page.
          </p>
          <div className="text-xs bg-blue-500/10 border border-blue-500/20 rounded p-2 mb-3 text-blue-300">
            Relative strength targets are always in multiples of bodyweight, never absolute kg.
          </div>
          {benchmarks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No benchmarks loaded. Add normative data via the Normative Data page.</p>
          ) : (
            <div className="space-y-1">
              {benchmarks.slice(0, 15).map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs w-16 justify-center">{getCategory(row)}</Badge>
                    <span className="text-sm">{row.metric_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{row.unit}</span>
                </div>
              ))}
              {benchmarks.length > 15 && (
                <p className="text-xs text-muted-foreground pt-2">
                  Showing 15 of {benchmarks.length} benchmarks. Manage all in Normative Data.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section C — Gap response */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Small gap detected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Threshold (% below target)</Label>
              <Input
                type="number"
                value={gapConfig.minorThreshold}
                onChange={(e) => setGapConfig((p) => ({ ...p, minorThreshold: parseInt(e.target.value) || 10 }))}
                className="h-8 text-xs w-20"
              />
            </div>
            <div>
              <Label className="text-xs">What Tomo does</Label>
              <Select value={gapConfig.minorBehavior} onValueChange={(v) => setGapConfig((p) => ({ ...p, minorBehavior: v || p.minorBehavior }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MINOR_BEHAVIORS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Significant gap detected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Threshold (% below target)</Label>
              <Input
                type="number"
                value={gapConfig.significantThreshold}
                onChange={(e) => setGapConfig((p) => ({ ...p, significantThreshold: parseInt(e.target.value) || 20 }))}
                className="h-8 text-xs w-20"
              />
            </div>
            <div>
              <Label className="text-xs">What Tomo does</Label>
              <Select value={gapConfig.significantBehavior} onValueChange={(v) => setGapConfig((p) => ({ ...p, significantBehavior: v || p.significantBehavior }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIGNIFICANT_BEHAVIORS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section D — Development gates */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Development gates (milestone prerequisites)</CardTitle>
            <Button variant="outline" size="sm" onClick={addGate}>Add gate</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {gapConfig.gates.map((gate, i) => (
            <div key={gate.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
              <Switch
                checked={gate.active}
                onCheckedChange={(v) => updateGate(i, "active", v)}
                className="mt-1 scale-75"
              />
              <div className="flex-1 space-y-1">
                <Input
                  value={gate.prerequisite}
                  onChange={(e) => updateGate(i, "prerequisite", e.target.value)}
                  className="h-7 text-xs"
                  placeholder="Prerequisite (what must be achieved first)"
                />
                <Input
                  value={gate.unlocks}
                  onChange={(e) => updateGate(i, "unlocks", e.target.value)}
                  className="h-7 text-xs"
                  placeholder="Unlocks (what becomes available)"
                />
              </div>
              <Badge variant={gate.active ? "default" : "secondary"} className="text-xs mt-1">
                {gate.active ? "Active" : "Paused"}
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => removeGate(i)}>
                Remove
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
