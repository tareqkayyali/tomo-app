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

interface PositionConfig {
  id: string;
  name: string;
  aerobicPriority: number;
  strengthPriority: number;
  notes: string;
  active: boolean;
}

interface SportEntry {
  keyMetrics: string;
  loadFramework: string;
  positionNotes: Record<string, string>;
  seasonPhase: string;
  matchLoadUnit: number;
  positions: PositionConfig[];
}

type Config = Record<string, SportEntry>;

const SEASON_PHASES = [
  { id: "pre_season", label: "Pre-season", color: "bg-blue-500/20 border-blue-500/40 text-blue-300", description: "Tomo builds aerobic base and introduces strength progressively. Match sharpness sessions increase through the phase." },
  { id: "in_season", label: "In-season", color: "bg-green-500/20 border-green-500/40 text-green-300", description: "Tomo prioritises match readiness and limits heavy strength work automatically. Recovery between matches is the primary concern." },
  { id: "playoffs", label: "Playoffs", color: "bg-amber-500/20 border-amber-500/40 text-amber-300", description: "Tomo reduces training volume and maximises recovery. Only sharpness and mental readiness sessions are recommended." },
  { id: "off_season", label: "Off-season", color: "bg-gray-500/20 border-gray-500/40 text-gray-300", description: "Tomo focuses on rebuilding foundations — aerobic base, strength, and addressing benchmark gaps from the season." },
];

export function SquadSportEditor() {
  const [config, setConfig] = useState<Config>({});
  const [selectedSport, setSelectedSport] = useState("");
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/sport-context", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        const keys = Object.keys(data);
        if (keys.length > 0) setSelectedSport(keys[0]);
        setLoading(false);
      })
      .catch(() => { toast.error("Failed to load"); setLoading(false); });
  }, []);

  const debouncedSave = useCallback((newConfig: Config) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/v1/admin/performance-intelligence/sport-context", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newConfig),
        });
        if (res.ok) toast.success("Saved");
        else toast.error("Save failed");
      } catch { toast.error("Save failed"); }
    }, 800);
  }, []);

  const immediateSave = useCallback(async (newConfig: Config) => {
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/sport-context", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) toast.success("Saved");
      else toast.error("Save failed");
    } catch { toast.error("Save failed"); }
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const entry: SportEntry = config[selectedSport] || {
    keyMetrics: "", loadFramework: "", positionNotes: {},
    seasonPhase: "in_season", matchLoadUnit: 1.0, positions: [],
  };

  function update(field: string, value: unknown) {
    const newConfig = { ...config, [selectedSport]: { ...entry, [field]: value } };
    setConfig(newConfig);
    debouncedSave(newConfig);
  }

  function setPhase(phase: string) {
    const newConfig = { ...config, [selectedSport]: { ...entry, seasonPhase: phase } };
    setConfig(newConfig);
    immediateSave(newConfig);
  }

  function updatePosition(idx: number, field: keyof PositionConfig, value: unknown) {
    const positions = [...entry.positions];
    positions[idx] = { ...positions[idx], [field]: value };
    const newConfig = { ...config, [selectedSport]: { ...entry, positions } };
    setConfig(newConfig);
    debouncedSave(newConfig);
  }

  function addPosition() {
    const id = `pos_${Date.now()}`;
    const positions = [...entry.positions, { id, name: "New Position", aerobicPriority: 5, strengthPriority: 5, notes: "", active: true }];
    const newConfig = { ...config, [selectedSport]: { ...entry, positions } };
    setConfig(newConfig);
    immediateSave(newConfig);
  }

  const sportKeys = Object.keys(config);
  const currentPhase = SEASON_PHASES.find((p) => p.id === entry.seasonPhase) || SEASON_PHASES[1];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Section A — Sport pills */}
      <div className="flex flex-wrap gap-2">
        {sportKeys.map((key) => (
          <button
            key={key}
            onClick={() => setSelectedSport(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors capitalize ${
              selectedSport === key
                ? "bg-green-500/15 border-green-500/50 text-green-400"
                : "border-border text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Section B — Season phase bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Current season phase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex rounded-lg overflow-hidden border">
            {SEASON_PHASES.map((phase) => (
              <button
                key={phase.id}
                onClick={() => setPhase(phase.id)}
                className={`flex-1 py-2.5 px-3 text-xs font-medium transition-colors border-r last:border-r-0 ${
                  entry.seasonPhase === phase.id
                    ? phase.color + " border-current"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {phase.label}
                {entry.seasonPhase === phase.id && <span className="ml-1 opacity-70">← now</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{currentPhase.description}</p>
        </CardContent>
      </Card>

      {/* Section C — Position groups */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Positions</h3>
          <Button variant="outline" size="sm" onClick={addPosition}>Add position</Button>
        </div>
        <div className="space-y-3">
          {entry.positions.map((pos, i) => (
            <Card key={pos.id} className={pos.active ? "" : "opacity-50"}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Input
                    value={pos.name}
                    onChange={(e) => updatePosition(i, "name", e.target.value)}
                    className="h-8 text-sm font-medium w-48 border-none px-0 focus-visible:ring-0"
                  />
                  <div className="flex items-center gap-2">
                    <Badge variant={pos.active ? "default" : "secondary"} className="text-xs">
                      {pos.active ? "Active" : "Inactive"}
                    </Badge>
                    <Switch
                      checked={pos.active}
                      onCheckedChange={(v) => updatePosition(i, "active", v)}
                      className="scale-75"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Aerobic priority</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min={1} max={10} value={pos.aerobicPriority}
                        onChange={(e) => updatePosition(i, "aerobicPriority", parseInt(e.target.value))}
                        className="flex-1 accent-green-500"
                      />
                      <span className="text-xs font-mono w-5 text-center">{pos.aerobicPriority}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Strength priority</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min={1} max={10} value={pos.strengthPriority}
                        onChange={(e) => updatePosition(i, "strengthPriority", parseInt(e.target.value))}
                        className="flex-1 accent-green-500"
                      />
                      <span className="text-xs font-mono w-5 text-center">{pos.strengthPriority}</span>
                    </div>
                  </div>
                </div>
                <Textarea
                  value={pos.notes}
                  onChange={(e) => updatePosition(i, "notes", e.target.value)}
                  placeholder="What Tomo emphasises for this position..."
                  rows={2}
                  className="text-xs"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section D — Match reference */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Match load = 1.0 unit</p>
            <p className="text-xs text-muted-foreground mt-1">All training intensity is scaled relative to a competitive match. A pre-match session sits at 0.6–0.8 units to protect freshness.</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Rest day target: 48h minimum</p>
            <p className="text-xs text-muted-foreground mt-1">Tomo flags schedule conflicts when high-intensity sessions are too close together. You can adjust this window in Athlete Protection.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
