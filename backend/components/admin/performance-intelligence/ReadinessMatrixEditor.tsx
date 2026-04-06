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

interface ReadinessCondition {
  readinessRag: "RED" | "AMBER" | "GREEN";
  additionalFactors: { field: string; operator: string; value: string | number | boolean }[];
}

interface ReadinessRule {
  id: string;
  condition: ReadinessCondition;
  priority: number;
  title: string;
  titleNoTraining: string;
  bodyShort: string;
  bodyShortNoTraining: string;
}

interface ReadinessDecisionMatrix {
  rules: ReadinessRule[];
  confidenceThresholds: { fresh: number; wearableOnly: number; stale: number };
  stalenessHours: number;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: "destructive",
  2: "default",
  3: "secondary",
  4: "outline",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "P1 — Urgent",
  2: "P2 — Today",
  3: "P3 — This Week",
  4: "P4 — Informational",
};

export function ReadinessMatrixEditor() {
  const [config, setConfig] = useState<ReadinessDecisionMatrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRule, setExpandedRule] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/readiness-matrix", { credentials: "include" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => toast.error("Failed to load readiness matrix"));
  }, []);

  if (!config) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  function updateRule(idx: number, field: keyof ReadinessRule, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const rules = [...prev.rules];
      rules[idx] = { ...rules[idx], [field]: value };
      return { ...prev, rules };
    });
  }

  function updateConditionRag(idx: number, rag: "RED" | "AMBER" | "GREEN") {
    setConfig((prev) => {
      if (!prev) return prev;
      const rules = [...prev.rules];
      rules[idx] = { ...rules[idx], condition: { ...rules[idx].condition, readinessRag: rag } };
      return { ...prev, rules };
    });
  }

  function moveRule(idx: number, dir: -1 | 1) {
    setConfig((prev) => {
      if (!prev) return prev;
      const rules = [...prev.rules];
      const target = idx + dir;
      if (target < 0 || target >= rules.length) return prev;
      [rules[idx], rules[target]] = [rules[target], rules[idx]];
      return { ...prev, rules };
    });
    setExpandedRule(null);
  }

  function addRule() {
    setConfig((prev) => {
      if (!prev) return prev;
      const newRule: ReadinessRule = {
        id: `rule_${Date.now()}`,
        condition: { readinessRag: "AMBER", additionalFactors: [] },
        priority: 2,
        title: "New Rule",
        titleNoTraining: "New Rule (Rest Day)",
        bodyShort: "",
        bodyShortNoTraining: "",
      };
      return { ...prev, rules: [...prev.rules, newRule] };
    });
    setExpandedRule(config?.rules.length ?? 0);
  }

  function removeRule(idx: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, rules: prev.rules.filter((_, i) => i !== idx) };
    });
    setExpandedRule(null);
  }

  function updateConfidence(field: "fresh" | "wearableOnly" | "stale", value: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, confidenceThresholds: { ...prev.confidenceThresholds, [field]: value } };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/readiness-matrix", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) toast.success("Readiness matrix saved");
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

  const ragColors: Record<string, string> = { RED: "destructive", AMBER: "default", GREEN: "secondary" };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Readiness Decision Matrix</h3>
          <p className="text-xs text-muted-foreground">First-match-wins: rules are evaluated top-to-bottom, first matching rule determines the recommendation</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addRule}>Add Rule</Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Decision Rules */}
      <div className="space-y-2">
        {config.rules.map((rule, i) => (
          <Card key={rule.id} className="border-dashed">
            <CardHeader
              className="pb-1 pt-3 px-4 cursor-pointer"
              onClick={() => setExpandedRule(expandedRule === i ? null : i)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono w-5">#{i + 1}</span>
                  <Badge variant={ragColors[rule.condition.readinessRag] as "default"} className="text-xs">
                    {rule.condition.readinessRag}
                  </Badge>
                  {rule.condition.additionalFactors.map((f, fi) => (
                    <Badge key={fi} variant="outline" className="text-xs">
                      {f.field} {f.operator} {String(f.value)}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground">→</span>
                  <Badge variant={PRIORITY_COLORS[rule.priority] as "default"} className="text-xs">
                    {PRIORITY_LABELS[rule.priority]}
                  </Badge>
                  <span className="text-xs font-medium">{rule.title}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); moveRule(i, -1); }} disabled={i === 0}>↑</Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); moveRule(i, 1); }} disabled={i === config.rules.length - 1}>↓</Button>
                  <span className="text-xs text-muted-foreground ml-1">{expandedRule === i ? "▲" : "▼"}</span>
                </div>
              </div>
            </CardHeader>
            {expandedRule === i && (
              <CardContent className="px-4 pb-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Readiness RAG</Label>
                    <Select value={rule.condition.readinessRag} onValueChange={(v) => updateConditionRag(i, v as "RED" | "AMBER" | "GREEN")}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RED">RED</SelectItem>
                        <SelectItem value="AMBER">AMBER</SelectItem>
                        <SelectItem value="GREEN">GREEN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Priority</Label>
                    <Select value={String(rule.priority)} onValueChange={(v) => updateRule(i, "priority", parseInt(v || "2"))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((p) => (
                          <SelectItem key={p} value={String(p)}>{PRIORITY_LABELS[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Additional Factor</Label>
                    <Input
                      value={rule.condition.additionalFactors.map((f) => `${f.field}${f.operator}${f.value}`).join(", ")}
                      onChange={(e) => {
                        const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                        const factors = parts.map((p) => {
                          const match = p.match(/^(\w+)([><=!]+)(.+)$/);
                          if (!match) return null;
                          const val = isNaN(Number(match[3])) ? match[3] : Number(match[3]);
                          return { field: match[1], operator: match[2], value: val };
                        }).filter(Boolean) as ReadinessCondition["additionalFactors"];
                        setConfig((prev) => {
                          if (!prev) return prev;
                          const rules = [...prev.rules];
                          rules[i] = { ...rules[i], condition: { ...rules[i].condition, additionalFactors: factors } };
                          return { ...prev, rules };
                        });
                      }}
                      className="h-8 text-xs font-mono"
                      placeholder="e.g., acwr>1.3, phvStage=mid_phv"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Title (has training)</Label>
                    <Input value={rule.title} onChange={(e) => updateRule(i, "title", e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Title (no training)</Label>
                    <Input value={rule.titleNoTraining} onChange={(e) => updateRule(i, "titleNoTraining", e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Body (has training)</Label>
                    <Textarea value={rule.bodyShort} onChange={(e) => updateRule(i, "bodyShort", e.target.value)} rows={2} className="text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Body (no training)</Label>
                    <Textarea value={rule.bodyShortNoTraining} onChange={(e) => updateRule(i, "bodyShortNoTraining", e.target.value)} rows={2} className="text-xs" />
                  </div>
                </div>
                <Button variant="destructive" size="sm" onClick={() => removeRule(i)}>Remove Rule</Button>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Confidence Thresholds */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Confidence Thresholds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">Fresh Check-in</Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={config.confidenceThresholds.fresh}
                onChange={(e) => updateConfidence("fresh", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">Recent checkin (&lt;12h)</p>
            </div>
            <div>
              <Label className="text-xs">Wearable Only</Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={config.confidenceThresholds.wearableOnly}
                onChange={(e) => updateConfidence("wearableOnly", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">Wearable data, stale checkin (&gt;12h)</p>
            </div>
            <div>
              <Label className="text-xs">Stale / No Data</Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={config.confidenceThresholds.stale}
                onChange={(e) => updateConfidence("stale", parseFloat(e.target.value) || 0)}
                className="h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">No checkin or data too old</p>
            </div>
            <div>
              <Label className="text-xs">Staleness Hours</Label>
              <Input
                type="number"
                value={config.stalenessHours}
                onChange={(e) => setConfig((prev) => prev ? { ...prev, stalenessHours: parseInt(e.target.value) || 24 } : prev)}
                className="h-8 text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">Hours until data is considered stale</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
