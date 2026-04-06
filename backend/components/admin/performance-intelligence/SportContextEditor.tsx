"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface SportCoachingEntry {
  keyMetrics: string;
  loadFramework: string;
  positionNotes: Record<string, string>;
}

type SportCoachingContext = Record<string, SportCoachingEntry>;

interface Sport {
  id: string;
  label: string;
  key?: string;
}

interface Position {
  id: string;
  label: string;
  key: string;
}

export function SportContextEditor() {
  const [config, setConfig] = useState<SportCoachingContext>({});
  const [sports, setSports] = useState<Sport[]>([]);
  const [positions, setPositions] = useState<Record<string, Position[]>>({});
  const [selectedSport, setSelectedSport] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/performance-intelligence/sport-context", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/admin/sports", { credentials: "include" }).then((r) => r.json()),
    ]).then(([cfg, sportList]) => {
      setConfig(cfg);
      const s = Array.isArray(sportList) ? sportList : sportList.data ?? [];
      setSports(s);
      if (s.length > 0) {
        const firstKey = (s[0].key || s[0].label || "").toLowerCase();
        setSelectedSport(firstKey);
        // Fetch positions for all sports
        Promise.all(
          s.map((sp: Sport) =>
            fetch(`/api/v1/admin/positions?sport_id=${sp.id}`, { credentials: "include" })
              .then((r) => r.json())
              .then((p) => ({ key: (sp.key || sp.label || "").toLowerCase(), positions: Array.isArray(p) ? p : p.data ?? [] }))
              .catch(() => ({ key: (sp.key || sp.label || "").toLowerCase(), positions: [] }))
          )
        ).then((results) => {
          const posMap: Record<string, Position[]> = {};
          results.forEach((r) => { posMap[r.key] = r.positions; });
          setPositions(posMap);
        });
      }
      setLoading(false);
    }).catch(() => {
      toast.error("Failed to load config");
      setLoading(false);
    });
  }, []);

  const entry = config[selectedSport] || { keyMetrics: "", loadFramework: "", positionNotes: {} };

  function updateEntry(field: keyof SportCoachingEntry, value: string | Record<string, string>) {
    setConfig((prev) => ({
      ...prev,
      [selectedSport]: { ...entry, [field]: value },
    }));
  }

  function updatePositionNote(posKey: string, value: string) {
    updateEntry("positionNotes", { ...entry.positionNotes, [posKey]: value });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/sport-context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Sport coaching context saved");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const sportPositions = positions[selectedSport] ?? [];

  return (
    <div className="flex gap-6">
      {/* Sport list sidebar */}
      <div className="w-48 shrink-0 space-y-1">
        <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Sports</p>
        {sports.map((sp) => {
          const key = (sp.key || sp.label || "").toLowerCase();
          return (
            <button
              key={sp.id}
              onClick={() => setSelectedSport(key)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                selectedSport === key
                  ? "bg-accent text-accent-foreground font-medium"
                  : "hover:bg-accent/50 text-muted-foreground"
              }`}
            >
              {sp.label}
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold capitalize">{selectedSport}</h3>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save All Sports"}
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Key Performance Metrics</Label>
            <Textarea
              value={entry.keyMetrics}
              onChange={(e) => updateEntry("keyMetrics", e.target.value)}
              placeholder="e.g., Yo-Yo IR1, 10m/30m sprint, CMJ, agility T-test"
              className="mt-1"
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">What metrics matter most for this sport. Injected into AI coaching context.</p>
          </div>

          <div>
            <Label>Load Framework</Label>
            <Textarea
              value={entry.loadFramework}
              onChange={(e) => updateEntry("loadFramework", e.target.value)}
              placeholder="e.g., ACWR model: 7:28 rolling. Match = 1.0 AU reference."
              className="mt-1"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">How training load is modeled for this sport.</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label>Position-Specific Notes</Label>
              <Badge variant="secondary" className="text-xs">{sportPositions.length} positions</Badge>
            </div>
            {sportPositions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No positions configured for this sport.</p>
            ) : (
              <div className="space-y-3">
                {sportPositions.map((pos) => (
                  <Card key={pos.id} className="border-dashed">
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-xs font-medium capitalize">{pos.label || pos.key}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <Textarea
                        value={entry.positionNotes[pos.key] || ""}
                        onChange={(e) => updatePositionNote(pos.key, e.target.value)}
                        placeholder={`Coaching context for ${pos.label || pos.key}...`}
                        rows={2}
                        className="text-sm"
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
