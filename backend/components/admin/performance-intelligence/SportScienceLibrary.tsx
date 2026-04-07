"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PositionConfig {
  id: string; name: string; aerobicPriority: number; strengthPriority: number;
  notes: string; active: boolean; primaryQuality: string; secondaryQuality: string;
  distanceNote: string; developmentPriority: string; trainingEmphasis: string;
}

interface LoadModel {
  matchLoadUnit: number; loadWindowWeeks: number;
  highIntensityThreshold: number; recoveryMinHours: number;
}

interface PerformanceMetric {
  id: string; name: string; shortName: string; whatItTests: string;
  protocol: string; unit: string; category: string;
}

interface SportEntry {
  keyMetrics: string; loadFramework: string; positionNotes: Record<string, string>;
  seasonPhase: string; matchLoadUnit: number; positions: PositionConfig[];
  energySystem: string; energyDescription: string; sessionDuration: number;
  highIntensityActions: string; physicalQualitiesRanking: string[];
  injuryRisks: string[]; loadModel: LoadModel; performanceMetrics: PerformanceMetric[];
}

type Config = Record<string, SportEntry>;

const QUALITIES = ["Aerobic capacity", "Speed / acceleration", "Strength / power", "Agility / change of direction", "Flexibility / mobility"];
const CATEGORIES = ["aerobic", "speed", "strength", "power", "agility", "flexibility"];

export function SportScienceLibrary() {
  const [config, setConfig] = useState<Config>({});
  const [selectedSport, setSelectedSport] = useState("");
  const [loading, setLoading] = useState(true);
  const [newRisk, setNewRisk] = useState("");
  const saveRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/sport-context", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setConfig(data); const keys = Object.keys(data); if (keys.length) setSelectedSport(keys[0]); setLoading(false); })
      .catch(() => { toast.error("Failed to load"); setLoading(false); });
  }, []);

  const debouncedSave = useCallback((c: Config) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      const res = await fetch("/api/v1/admin/performance-intelligence/sport-context", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c),
      });
      if (res.ok) toast.success("Saved"); else toast.error("Save failed");
    }, 800);
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const entry: SportEntry = config[selectedSport] || {
    keyMetrics: "", loadFramework: "", positionNotes: {}, seasonPhase: "in_season",
    matchLoadUnit: 1.0, positions: [], energySystem: "mixed", energyDescription: "",
    sessionDuration: 90, highIntensityActions: "", physicalQualitiesRanking: [...QUALITIES],
    injuryRisks: [], loadModel: { matchLoadUnit: 1.0, loadWindowWeeks: 4, highIntensityThreshold: 70, recoveryMinHours: 48 },
    performanceMetrics: [],
  };

  function update(field: string, value: unknown) {
    const c = { ...config, [selectedSport]: { ...entry, [field]: value } };
    setConfig(c); debouncedSave(c);
  }

  function updatePosition(idx: number, field: string, value: unknown) {
    const positions = [...entry.positions];
    positions[idx] = { ...positions[idx], [field]: value };
    update("positions", positions);
  }

  function addPosition() {
    const positions = [...entry.positions, { id: `pos_${Date.now()}`, name: "New Position", aerobicPriority: 5, strengthPriority: 5, notes: "", active: true, primaryQuality: "", secondaryQuality: "", distanceNote: "", developmentPriority: "", trainingEmphasis: "" }];
    update("positions", positions);
  }

  function moveQuality(idx: number, dir: -1 | 1) {
    const ranking = [...entry.physicalQualitiesRanking];
    const target = idx + dir;
    if (target < 0 || target >= ranking.length) return;
    [ranking[idx], ranking[target]] = [ranking[target], ranking[idx]];
    update("physicalQualitiesRanking", ranking);
  }

  function addRisk() {
    if (!newRisk.trim()) return;
    update("injuryRisks", [...entry.injuryRisks, newRisk.trim()]);
    setNewRisk("");
  }

  function removeRisk(idx: number) {
    update("injuryRisks", entry.injuryRisks.filter((_, i) => i !== idx));
  }

  function updateLoadModel(field: string, value: number) {
    update("loadModel", { ...entry.loadModel, [field]: value });
  }

  function updateMetric(idx: number, field: string, value: string) {
    const metrics = [...entry.performanceMetrics];
    metrics[idx] = { ...metrics[idx], [field]: value };
    update("performanceMetrics", metrics);
  }

  function addMetric() {
    const metrics = [...entry.performanceMetrics, { id: `m_${Date.now()}`, name: "", shortName: "", whatItTests: "", protocol: "", unit: "", category: "aerobic" }];
    update("performanceMetrics", metrics);
  }

  function removeMetric(idx: number) {
    update("performanceMetrics", entry.performanceMetrics.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* A: Sport selector */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(config).map((key) => (
          <button key={key} onClick={() => setSelectedSport(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors capitalize ${selectedSport === key ? "bg-green-500/15 border-green-500/50 text-green-400" : "border-border text-muted-foreground hover:bg-accent/50"}`}>
            {key}
          </button>
        ))}
      </div>

      {/* B: Physical demands profile */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Physical demands of this sport</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">The AI uses this to contextualise every training recommendation and understand what 'fit for this sport' actually means.</p>

          <div>
            <Label className="text-xs">Primary energy system</Label>
            <div className="flex gap-2 mt-1">
              {(["aerobic_dominant", "mixed", "anaerobic_dominant"] as const).map((es) => (
                <button key={es} onClick={() => update("energySystem", es)}
                  className={`px-3 py-1.5 rounded text-xs border transition-colors ${entry.energySystem === es ? "bg-green-500/15 border-green-500/50 text-green-400" : "border-border text-muted-foreground hover:bg-accent/50"}`}>
                  {es.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Energy demands description</Label>
            <Textarea value={entry.energyDescription} onChange={(e) => update("energyDescription", e.target.value)} rows={2} className="text-xs mt-1" placeholder="Describe the energy demands of this sport..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Typical session duration (minutes)</Label>
              <Input type="number" value={entry.sessionDuration} onChange={(e) => update("sessionDuration", parseInt(e.target.value) || 90)} className="h-8 text-xs mt-1 w-24" />
            </div>
            <div>
              <Label className="text-xs">High-intensity actions per session</Label>
              <Input value={entry.highIntensityActions} onChange={(e) => update("highIntensityActions", e.target.value)} className="h-8 text-xs mt-1" placeholder="e.g., 60-80 high-intensity runs, 15-20 sprints" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Key physical qualities (ranked by importance — highest first)</Label>
            <div className="space-y-1 mt-1">
              {entry.physicalQualitiesRanking.map((q, i) => (
                <div key={q} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <span className="text-xs flex-1">{q}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveQuality(i, -1)} disabled={i === 0}>↑</Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveQuality(i, 1)} disabled={i === entry.physicalQualitiesRanking.length - 1}>↓</Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Primary injury risks</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {entry.injuryRisks.map((risk, i) => (
                <Badge key={i} variant="secondary" className="text-xs cursor-pointer" onClick={() => removeRisk(i)}>{risk} ×</Badge>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              <Input value={newRisk} onChange={(e) => setNewRisk(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRisk()} className="h-7 text-xs w-48" placeholder="Add risk..." />
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRisk}>Add</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* C: Position intelligence */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Position-specific demands</h3>
          <Button variant="outline" size="sm" onClick={addPosition}>Add position</Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">The AI adjusts its coaching based on an athlete's position. Define what makes each position physically distinct.</p>
        <div className="space-y-3">
          {entry.positions.map((pos, i) => (
            <Card key={pos.id} className={pos.active ? "" : "opacity-50"}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Input value={pos.name} onChange={(e) => updatePosition(i, "name", e.target.value)} className="h-8 text-sm font-medium w-48 border-none px-0 focus-visible:ring-0" />
                  <Switch checked={pos.active} onCheckedChange={(v) => updatePosition(i, "active", v)} className="scale-75" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Primary physical quality</Label>
                    <Select value={pos.primaryQuality} onValueChange={(v) => updatePosition(i, "primaryQuality", v || "")}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{QUALITIES.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Secondary quality</Label>
                    <Select value={pos.secondaryQuality} onValueChange={(v) => updatePosition(i, "secondaryQuality", v || "")}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>{QUALITIES.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Distance / volume note</Label>
                    <Input value={pos.distanceNote} onChange={(e) => updatePosition(i, "distanceNote", e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Key development priority</Label>
                    <Input value={pos.developmentPriority} onChange={(e) => updatePosition(i, "developmentPriority", e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Typical training emphasis</Label>
                  <Input value={pos.trainingEmphasis} onChange={(e) => updatePosition(i, "trainingEmphasis", e.target.value)} className="h-7 text-xs" placeholder="e.g., 50% aerobic, 25% speed, 25% agility" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* D: Load model */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Training load model</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">How the AI understands and measures training stress for this sport.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Match load reference (training units)</Label>
              <Input type="number" step="0.1" value={entry.loadModel.matchLoadUnit} onChange={(e) => updateLoadModel("matchLoadUnit", parseFloat(e.target.value) || 1)} className="h-8 text-xs mt-1 w-24" />
              <p className="text-xs text-muted-foreground mt-1">All sessions are expressed as a fraction of this.</p>
            </div>
            <div>
              <Label className="text-xs">Load comparison window (weeks)</Label>
              <Input type="number" value={entry.loadModel.loadWindowWeeks} onChange={(e) => updateLoadModel("loadWindowWeeks", parseInt(e.target.value) || 4)} className="h-8 text-xs mt-1 w-24" />
              <p className="text-xs text-muted-foreground mt-1">Standard: 7-day acute vs 28-day chronic.</p>
            </div>
            <div>
              <Label className="text-xs">High-intensity threshold (% of match load)</Label>
              <Input type="number" value={entry.loadModel.highIntensityThreshold} onChange={(e) => updateLoadModel("highIntensityThreshold", parseInt(e.target.value) || 70)} className="h-8 text-xs mt-1 w-24" />
            </div>
            <div>
              <Label className="text-xs">Minimum recovery between high-intensity sessions (hours)</Label>
              <Input type="number" value={entry.loadModel.recoveryMinHours} onChange={(e) => updateLoadModel("recoveryMinHours", parseInt(e.target.value) || 48)} className="h-8 text-xs mt-1 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* E: Performance metrics */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Performance tests and metrics</CardTitle>
            <Button variant="outline" size="sm" onClick={addMetric}>Add metric</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">The specific tests the AI refers to when discussing fitness, gaps, and targets.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Short name</TableHead>
                <TableHead className="text-xs">What it tests</TableHead>
                <TableHead className="text-xs">Unit</TableHead>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.performanceMetrics.map((m, i) => (
                <TableRow key={m.id}>
                  <TableCell><Input value={m.name} onChange={(e) => updateMetric(i, "name", e.target.value)} className="h-7 text-xs border-none p-0" /></TableCell>
                  <TableCell><Input value={m.shortName} onChange={(e) => updateMetric(i, "shortName", e.target.value)} className="h-7 text-xs border-none p-0 w-20" /></TableCell>
                  <TableCell><Input value={m.whatItTests} onChange={(e) => updateMetric(i, "whatItTests", e.target.value)} className="h-7 text-xs border-none p-0" /></TableCell>
                  <TableCell><Input value={m.unit} onChange={(e) => updateMetric(i, "unit", e.target.value)} className="h-7 text-xs border-none p-0 w-20" /></TableCell>
                  <TableCell>
                    <Select value={m.category} onValueChange={(v) => updateMetric(i, "category", v || "aerobic")}>
                      <SelectTrigger className="h-7 text-xs border-none p-0"><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeMetric(i)}>×</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
