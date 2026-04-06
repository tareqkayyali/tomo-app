"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PHVStage {
  name: string;
  offsetMin: number;
  offsetMax: number;
  loadingMultiplier: number;
  trainingPriorities: string[];
  safetyWarnings: string[];
}

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

interface PHVMonitoringAlert {
  condition: string;
  description: string;
  symptoms: string;
  action: string;
  triggerStages: string[];
}

interface PHVSafetyConfig {
  stages: PHVStage[];
  contraindications: PHVContraindication[];
  monitoringAlerts: PHVMonitoringAlert[];
}

export function PHVConfigEditor() {
  const [config, setConfig] = useState<PHVSafetyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedContra, setExpandedContra] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/phv-config", { credentials: "include" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => toast.error("Failed to load PHV config"));
  }, []);

  if (!config) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  function updateStage(idx: number, field: keyof PHVStage, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const stages = [...prev.stages];
      stages[idx] = { ...stages[idx], [field]: value };
      return { ...prev, stages };
    });
  }

  function updateContra(idx: number, field: keyof PHVContraindication, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const contraindications = [...prev.contraindications];
      contraindications[idx] = { ...contraindications[idx], [field]: value };
      return { ...prev, contraindications };
    });
  }

  function addContra() {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        contraindications: [
          ...prev.contraindications,
          { pattern: "", blocked: "", alternative: "", why: "", mechanism: "", progression: "", citation: "", applicableStages: ["mid_phv"] },
        ],
      };
    });
    setExpandedContra(config?.contraindications.length ?? 0);
  }

  function removeContra(idx: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, contraindications: prev.contraindications.filter((_, i) => i !== idx) };
    });
    setExpandedContra(null);
  }

  function updateAlert(idx: number, field: keyof PHVMonitoringAlert, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const monitoringAlerts = [...prev.monitoringAlerts];
      monitoringAlerts[idx] = { ...monitoringAlerts[idx], [field]: value };
      return { ...prev, monitoringAlerts };
    });
  }

  function addAlert() {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        monitoringAlerts: [
          ...prev.monitoringAlerts,
          { condition: "", description: "", symptoms: "", action: "", triggerStages: ["mid_phv"] },
        ],
      };
    });
  }

  function removeAlert(idx: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, monitoringAlerts: prev.monitoringAlerts.filter((_, i) => i !== idx) };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/phv-config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) toast.success("PHV safety config saved");
      else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">PHV Safety Configuration</h3>
          <p className="text-xs text-muted-foreground">Growth stage boundaries, loading multipliers, contraindications, and monitoring alerts</p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Stage Definitions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Stage Definitions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Stage</TableHead>
                <TableHead className="w-24">Offset Min</TableHead>
                <TableHead className="w-24">Offset Max</TableHead>
                <TableHead className="w-28">Loading Mult.</TableHead>
                <TableHead>Training Priorities</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.stages.map((stage, i) => (
                <TableRow key={stage.name}>
                  <TableCell>
                    <Badge
                      variant={stage.name === "mid_phv" ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {stage.name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.1"
                      value={stage.offsetMin}
                      onChange={(e) => updateStage(i, "offsetMin", parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.1"
                      value={stage.offsetMax}
                      onChange={(e) => updateStage(i, "offsetMax", parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={stage.loadingMultiplier}
                      onChange={(e) => updateStage(i, "loadingMultiplier", parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={stage.trainingPriorities.join("\n")}
                      onChange={(e) => updateStage(i, "trainingPriorities", e.target.value.split("\n").filter(Boolean))}
                      rows={2}
                      className="text-xs"
                      placeholder="One per line"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Exercise Contraindications */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Exercise Contraindications</CardTitle>
            <Button variant="outline" size="sm" onClick={addContra}>Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {config.contraindications.map((c, i) => (
            <Card key={i} className="border-dashed">
              <CardHeader
                className="pb-1 pt-3 px-4 cursor-pointer"
                onClick={() => setExpandedContra(expandedContra === i ? null : i)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">{c.blocked || "New"}</Badge>
                    <span className="text-xs text-muted-foreground">→ {c.alternative || "..."}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{expandedContra === i ? "▲" : "▼"}</span>
                </div>
              </CardHeader>
              {expandedContra === i && (
                <CardContent className="px-4 pb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Blocked Exercise</Label>
                      <Input value={c.blocked} onChange={(e) => updateContra(i, "blocked", e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Safe Alternative</Label>
                      <Input value={c.alternative} onChange={(e) => updateContra(i, "alternative", e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Why (explanation for athlete)</Label>
                    <Textarea value={c.why} onChange={(e) => updateContra(i, "why", e.target.value)} rows={2} className="text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Regex Pattern (for detection)</Label>
                    <Input value={c.pattern} onChange={(e) => updateContra(i, "pattern", e.target.value)} className="h-8 text-xs font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Progression (when safe to return)</Label>
                      <Input value={c.progression} onChange={(e) => updateContra(i, "progression", e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Citation</Label>
                      <Input value={c.citation} onChange={(e) => updateContra(i, "citation", e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => removeContra(i)}>Remove</Button>
                </CardContent>
              )}
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Monitoring Alerts */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Monitoring Alerts</CardTitle>
            <Button variant="outline" size="sm" onClick={addAlert}>Add</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.monitoringAlerts.map((a, i) => (
            <Card key={i} className="border-dashed">
              <CardContent className="p-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Condition</Label>
                    <Input value={a.condition} onChange={(e) => updateAlert(i, "condition", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Symptoms</Label>
                    <Input value={a.symptoms} onChange={(e) => updateAlert(i, "symptoms", e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Action</Label>
                  <Textarea value={a.action} onChange={(e) => updateAlert(i, "action", e.target.value)} rows={2} className="text-xs" />
                </div>
                <Button variant="destructive" size="sm" onClick={() => removeAlert(i)}>Remove</Button>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
