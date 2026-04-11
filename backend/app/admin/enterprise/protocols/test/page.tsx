"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { protocolsHelp } from "@/lib/cms-help/protocols";

/**
 * Protocol Simulator — Phase 10
 * Test protocol conditions against sample or real athlete snapshots.
 * PDs can see which protocols would fire for a given athlete state,
 * verify priority ordering, and check for conflicts.
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface AthleteSnapshot {
  readiness_rag: "RED" | "AMBER" | "GREEN";
  acwr: number;
  phv_stage: "pre" | "mid" | "post" | "adult";
  sport: string;
  age_band: string;
  injury_status: "none" | "minor" | "moderate" | "severe";
  days_since_match: number;
  sleep_score: number;
  soreness_score: number;
  stress_score: number;
  training_load_7d: number;
}

interface ProtocolCondition {
  field: string;
  operator: string;
  value: string | number | string[];
}

interface ProtocolConditionSet {
  match: "all" | "any";
  conditions: ProtocolCondition[];
}

interface Protocol {
  protocol_id: string;
  name: string;
  category: string;
  priority: number;
  safety_critical: boolean;
  is_built_in: boolean;
  conditions: ProtocolConditionSet;
  intensity_cap: string | null;
  load_multiplier: number | null;
  contraindications: string[] | null;
  required_elements: string[] | null;
  session_cap_minutes: number | null;
  institution_id: string | null;
}

interface SimulationResult {
  protocol: Protocol;
  fired: boolean;
  reason: string;
}

// ── Default snapshot presets ────────────────────────────────────────────────

const PRESETS: Record<string, AthleteSnapshot> = {
  healthy_green: {
    readiness_rag: "GREEN",
    acwr: 1.0,
    phv_stage: "post",
    sport: "football",
    age_band: "U17",
    injury_status: "none",
    days_since_match: 3,
    sleep_score: 8,
    soreness_score: 3,
    stress_score: 3,
    training_load_7d: 450,
  },
  red_overloaded: {
    readiness_rag: "RED",
    acwr: 1.8,
    phv_stage: "mid",
    sport: "football",
    age_band: "U15",
    injury_status: "none",
    days_since_match: 1,
    sleep_score: 4,
    soreness_score: 8,
    stress_score: 7,
    training_load_7d: 800,
  },
  mid_phv_amber: {
    readiness_rag: "AMBER",
    acwr: 1.3,
    phv_stage: "mid",
    sport: "basketball",
    age_band: "U15",
    injury_status: "minor",
    days_since_match: 2,
    sleep_score: 6,
    soreness_score: 6,
    stress_score: 5,
    training_load_7d: 550,
  },
  post_match_recovery: {
    readiness_rag: "AMBER",
    acwr: 1.1,
    phv_stage: "adult",
    sport: "padel",
    age_band: "Senior",
    injury_status: "none",
    days_since_match: 0,
    sleep_score: 7,
    soreness_score: 7,
    stress_score: 4,
    training_load_7d: 400,
  },
  exam_period: {
    readiness_rag: "GREEN",
    acwr: 0.8,
    phv_stage: "pre",
    sport: "tennis",
    age_band: "U13",
    injury_status: "none",
    days_since_match: 5,
    sleep_score: 6,
    soreness_score: 2,
    stress_score: 8,
    training_load_7d: 200,
  },
};

// ── Condition evaluator ────────────────────────────────────────────────────

function evaluateCondition(
  condition: ProtocolCondition,
  snapshot: AthleteSnapshot
): boolean {
  const fieldValue = (snapshot as unknown as Record<string, unknown>)[condition.field];
  if (fieldValue === undefined) return false;

  const { operator, value } = condition;

  switch (operator) {
    case "eq":
      return fieldValue === value;
    case "neq":
      return fieldValue !== value;
    case "gt":
      return typeof fieldValue === "number" && fieldValue > Number(value);
    case "gte":
      return typeof fieldValue === "number" && fieldValue >= Number(value);
    case "lt":
      return typeof fieldValue === "number" && fieldValue < Number(value);
    case "lte":
      return typeof fieldValue === "number" && fieldValue <= Number(value);
    case "in":
      return Array.isArray(value) && value.includes(String(fieldValue));
    case "not_in":
      return Array.isArray(value) && !value.includes(String(fieldValue));
    default:
      return false;
  }
}

function evaluateProtocol(
  protocol: Protocol,
  snapshot: AthleteSnapshot
): { fired: boolean; reason: string } {
  // Check scope filters first
  if (
    protocol.conditions?.conditions == null ||
    protocol.conditions.conditions.length === 0
  ) {
    return { fired: false, reason: "No conditions defined" };
  }

  const { match, conditions } = protocol.conditions;
  const results = conditions.map((c) => ({
    condition: c,
    passed: evaluateCondition(c, snapshot),
  }));

  const fired =
    match === "all"
      ? results.every((r) => r.passed)
      : results.some((r) => r.passed);

  const failedConditions = results
    .filter((r) => !r.passed)
    .map(
      (r) =>
        `${r.condition.field} ${r.condition.operator} ${JSON.stringify(r.condition.value)}`
    );
  const passedConditions = results
    .filter((r) => r.passed)
    .map(
      (r) =>
        `${r.condition.field} ${r.condition.operator} ${JSON.stringify(r.condition.value)}`
    );

  if (fired) {
    return {
      fired: true,
      reason: `All conditions met: ${passedConditions.join(", ")}`,
    };
  }

  return {
    fired: false,
    reason:
      match === "all"
        ? `Failed: ${failedConditions.join(", ")}`
        : `No conditions matched`,
  };
}

// ── Resolved output ────────────────────────────────────────────────────────

interface ResolvedOutput {
  intensity_cap: string;
  load_multiplier: number;
  session_cap_minutes: number | null;
  contraindications: string[];
  required_elements: string[];
  active_protocols: string[];
}

function resolveOutputs(fired: Protocol[]): ResolvedOutput {
  // Sort by priority (lower = higher authority)
  const sorted = [...fired].sort((a, b) => a.priority - b.priority);

  let intensity_cap = "full";
  let load_multiplier = 1.0;
  let session_cap_minutes: number | null = null;
  const contraindications = new Set<string>();
  const required_elements = new Set<string>();

  for (const p of sorted) {
    // Intensity cap: most restrictive
    const capOrder = ["rest", "light", "moderate", "full"];
    if (
      p.intensity_cap &&
      capOrder.indexOf(p.intensity_cap) < capOrder.indexOf(intensity_cap)
    ) {
      intensity_cap = p.intensity_cap;
    }
    // Load multiplier: minimum
    if (p.load_multiplier != null) {
      load_multiplier = Math.min(load_multiplier, p.load_multiplier);
    }
    // Session cap: minimum
    if (p.session_cap_minutes != null) {
      session_cap_minutes =
        session_cap_minutes == null
          ? p.session_cap_minutes
          : Math.min(session_cap_minutes, p.session_cap_minutes);
    }
    // Contraindications: union
    p.contraindications?.forEach((c) => contraindications.add(c));
    // Required elements: union
    p.required_elements?.forEach((e) => required_elements.add(e));
  }

  return {
    intensity_cap,
    load_multiplier,
    session_cap_minutes,
    contraindications: Array.from(contraindications),
    required_elements: Array.from(required_elements),
    active_protocols: sorted.map((p) => p.name),
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ProtocolSimulatorPage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<AthleteSnapshot>(
    PRESETS.healthy_green
  );
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [resolved, setResolved] = useState<ResolvedOutput | null>(null);
  const [selectedPreset, setSelectedPreset] = useState("healthy_green");

  useEffect(() => {
    fetchProtocols();
  }, []);

  async function fetchProtocols() {
    try {
      const res = await fetch(
        "/api/v1/admin/enterprise/protocols/builder"
      );
      if (!res.ok) throw new Error("Failed to fetch protocols");
      const data = await res.json();
      setProtocols(data.protocols || []);
    } catch {
      // Fallback: use sample protocols for demo
      setProtocols(getSampleProtocols());
    } finally {
      setLoading(false);
    }
  }

  function runSimulation() {
    const simResults: SimulationResult[] = protocols
      .filter((p) => p.conditions?.conditions)
      .map((protocol) => {
        const { fired, reason } = evaluateProtocol(protocol, snapshot);
        return { protocol, fired, reason };
      });

    // Sort: fired first, then by priority
    simResults.sort((a, b) => {
      if (a.fired !== b.fired) return a.fired ? -1 : 1;
      return a.protocol.priority - b.protocol.priority;
    });

    setResults(simResults);

    const firedProtocols = simResults
      .filter((r) => r.fired)
      .map((r) => r.protocol);
    setResolved(firedProtocols.length > 0 ? resolveOutputs(firedProtocols) : null);

    const firedCount = firedProtocols.length;
    if (firedCount > 0) {
      toast.success(
        `${firedCount} protocol${firedCount > 1 ? "s" : ""} activated`
      );
    } else {
      toast.info("No protocols activated for this snapshot");
    }
  }

  function applyPreset(key: string) {
    setSelectedPreset(key);
    setSnapshot(PRESETS[key]);
    setResults([]);
    setResolved(null);
  }

  function updateField(field: keyof AthleteSnapshot, value: string | number) {
    setSnapshot((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Protocol Simulator</h1>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  const firedCount = results.filter((r) => r.fired).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Protocol Simulator</h1>
        <PageGuide {...protocolsHelp.simulator.page} />
        <p className="text-muted-foreground">
          Test protocol conditions against sample athlete snapshots. See which
          protocols fire and how outputs resolve.
        </p>
      </div>

      {/* Preset selector */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(PRESETS).map(([key]) => (
          <Button
            key={key}
            variant={selectedPreset === key ? "default" : "outline"}
            size="sm"
            onClick={() => applyPreset(key)}
          >
            {key.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      {/* Snapshot editor */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-4">Athlete Snapshot</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div>
            <Label className="text-xs">Readiness</Label>
            <Select
              value={snapshot.readiness_rag}
              onValueChange={(v) => v && updateField("readiness_rag", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GREEN">GREEN</SelectItem>
                <SelectItem value="AMBER">AMBER</SelectItem>
                <SelectItem value="RED">RED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ACWR</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="3"
              value={snapshot.acwr}
              onChange={(e) =>
                updateField("acwr", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <Label className="text-xs">PHV Stage</Label>
            <Select
              value={snapshot.phv_stage}
              onValueChange={(v) => v && updateField("phv_stage", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pre">Pre</SelectItem>
                <SelectItem value="mid">Mid</SelectItem>
                <SelectItem value="post">Post</SelectItem>
                <SelectItem value="adult">Adult</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sport</Label>
            <Select
              value={snapshot.sport}
              onValueChange={(v) => v && updateField("sport", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="football">Football</SelectItem>
                <SelectItem value="padel">Padel</SelectItem>
                <SelectItem value="basketball">Basketball</SelectItem>
                <SelectItem value="tennis">Tennis</SelectItem>
                <SelectItem value="athletics">Athletics</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Age Band</Label>
            <Select
              value={snapshot.age_band}
              onValueChange={(v) => v && updateField("age_band", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="U13">U13</SelectItem>
                <SelectItem value="U15">U15</SelectItem>
                <SelectItem value="U17">U17</SelectItem>
                <SelectItem value="U19">U19</SelectItem>
                <SelectItem value="Senior">Senior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Injury</Label>
            <Select
              value={snapshot.injury_status}
              onValueChange={(v) => v && updateField("injury_status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Days Since Match</Label>
            <Input
              type="number"
              min="0"
              value={snapshot.days_since_match}
              onChange={(e) =>
                updateField("days_since_match", parseInt(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <Label className="text-xs">Sleep Score</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="10"
              value={snapshot.sleep_score}
              onChange={(e) =>
                updateField("sleep_score", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <Label className="text-xs">Soreness</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="10"
              value={snapshot.soreness_score}
              onChange={(e) =>
                updateField("soreness_score", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <Label className="text-xs">Stress</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="10"
              value={snapshot.stress_score}
              onChange={(e) =>
                updateField("stress_score", parseFloat(e.target.value) || 0)
              }
            />
          </div>
          <div>
            <Label className="text-xs">Weekly Load</Label>
            <Input
              type="number"
              min="0"
              value={snapshot.training_load_7d}
              onChange={(e) =>
                updateField(
                  "training_load_7d",
                  parseFloat(e.target.value) || 0
                )
              }
            />
          </div>
          <div className="flex items-end">
            <Button onClick={runSimulation} className="w-full">
              Run Simulation
            </Button>
          </div>
        </div>
      </Card>

      {/* Resolved output */}
      {resolved && (
        <Card className="p-4 border-l-4 border-l-blue-500">
          <h2 className="text-sm font-semibold mb-3">
            Resolved Output — {firedCount} Protocol
            {firedCount > 1 ? "s" : ""} Active
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Intensity Cap</p>
              <Badge
                variant={
                  resolved.intensity_cap === "rest"
                    ? "destructive"
                    : resolved.intensity_cap === "light"
                      ? "secondary"
                      : "outline"
                }
                className="text-sm mt-1"
              >
                {resolved.intensity_cap.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Load Multiplier</p>
              <p className="text-lg font-bold mt-1">
                {(resolved.load_multiplier * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Session Cap</p>
              <p className="text-lg font-bold mt-1">
                {resolved.session_cap_minutes
                  ? `${resolved.session_cap_minutes}min`
                  : "None"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Blocked</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {resolved.contraindications.length > 0 ? (
                  resolved.contraindications.map((c) => (
                    <Badge key={c} variant="destructive" className="text-xs">
                      {c}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Required</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {resolved.required_elements.length > 0 ? (
                  resolved.required_elements.map((e) => (
                    <Badge key={e} variant="default" className="text-xs">
                      {e}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Protocol evaluation results */}
      {results.length > 0 && (
        <Card>
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-3">
              Protocol Evaluation ({results.length} evaluated)
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Status</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Intensity Cap</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow
                    key={r.protocol.protocol_id}
                    className={r.fired ? "bg-green-500/5" : "opacity-60"}
                  >
                    <TableCell>
                      <div
                        className={`h-3 w-3 rounded-full ${
                          r.fired ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {r.protocol.name}
                        {r.protocol.safety_critical && (
                          <Badge variant="destructive" className="text-xs">
                            Safety
                          </Badge>
                        )}
                        {r.protocol.is_built_in && (
                          <Badge variant="outline" className="text-xs">
                            Built-in
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {r.protocol.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      P{r.protocol.priority}
                    </TableCell>
                    <TableCell>
                      {r.protocol.intensity_cap ? (
                        <Badge variant="secondary" className="text-xs">
                          {r.protocol.intensity_cap}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                      {r.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {results.length === 0 && (
        <Card className="p-8 text-center border-dashed">
          <p className="text-muted-foreground text-sm">
            Configure an athlete snapshot and click &quot;Run Simulation&quot; to
            see which protocols would activate.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {protocols.length} protocols loaded
          </p>
        </Card>
      )}
    </div>
  );
}

// ── Sample protocols for demo when API not available ───────────────────────

function getSampleProtocols(): Protocol[] {
  return [
    {
      protocol_id: "p1",
      name: "RED Readiness — Full Block",
      category: "safety",
      priority: 1,
      safety_critical: true,
      is_built_in: true,
      conditions: {
        match: "all",
        conditions: [
          { field: "readiness_rag", operator: "eq", value: "RED" },
        ],
      },
      intensity_cap: "rest",
      load_multiplier: 0.0,
      contraindications: [
        "barbell_squat",
        "deadlift",
        "plyometrics",
        "sprints",
      ],
      required_elements: ["active_recovery", "mobility"],
      session_cap_minutes: 30,
      institution_id: null,
    },
    {
      protocol_id: "p2",
      name: "Mid-PHV Safety Gate",
      category: "safety",
      priority: 2,
      safety_critical: true,
      is_built_in: true,
      conditions: {
        match: "all",
        conditions: [
          { field: "phv_stage", operator: "eq", value: "mid" },
        ],
      },
      intensity_cap: "moderate",
      load_multiplier: 0.7,
      contraindications: [
        "barbell_back_squat",
        "heavy_deadlift",
        "olympic_lifts",
        "depth_jumps",
      ],
      required_elements: ["bodyweight_squat", "band_resistance"],
      session_cap_minutes: 60,
      institution_id: null,
    },
    {
      protocol_id: "p3",
      name: "High ACWR Deload",
      category: "safety",
      priority: 5,
      safety_critical: true,
      is_built_in: true,
      conditions: {
        match: "all",
        conditions: [
          { field: "acwr", operator: "gte", value: 1.5 },
        ],
      },
      intensity_cap: "light",
      load_multiplier: 0.5,
      contraindications: ["high_intensity_intervals"],
      required_elements: ["recovery_session"],
      session_cap_minutes: 45,
      institution_id: null,
    },
    {
      protocol_id: "p4",
      name: "Post-Match Recovery",
      category: "recovery",
      priority: 30,
      safety_critical: false,
      is_built_in: false,
      conditions: {
        match: "all",
        conditions: [
          { field: "days_since_match", operator: "lte", value: 1 },
        ],
      },
      intensity_cap: "light",
      load_multiplier: 0.6,
      contraindications: [],
      required_elements: ["foam_rolling", "cold_water_immersion"],
      session_cap_minutes: 40,
      institution_id: null,
    },
    {
      protocol_id: "p5",
      name: "Injury Modifier — Moderate",
      category: "safety",
      priority: 10,
      safety_critical: false,
      is_built_in: true,
      conditions: {
        match: "all",
        conditions: [
          { field: "injury_status", operator: "eq", value: "moderate" },
        ],
      },
      intensity_cap: "light",
      load_multiplier: 0.4,
      contraindications: ["contact_drills", "plyometrics"],
      required_elements: ["rehab_protocol"],
      session_cap_minutes: 30,
      institution_id: null,
    },
    {
      protocol_id: "p6",
      name: "High Stress — Sleep Focus",
      category: "recovery",
      priority: 60,
      safety_critical: false,
      is_built_in: false,
      conditions: {
        match: "any",
        conditions: [
          { field: "stress_score", operator: "gte", value: 7 },
          { field: "sleep_score", operator: "lte", value: 5 },
        ],
      },
      intensity_cap: "moderate",
      load_multiplier: 0.8,
      contraindications: [],
      required_elements: ["breathing_exercise"],
      session_cap_minutes: null,
      institution_id: null,
    },
    {
      protocol_id: "p7",
      name: "AMBER Readiness — Monitor",
      category: "development",
      priority: 50,
      safety_critical: false,
      is_built_in: true,
      conditions: {
        match: "all",
        conditions: [
          { field: "readiness_rag", operator: "eq", value: "AMBER" },
        ],
      },
      intensity_cap: "moderate",
      load_multiplier: 0.8,
      contraindications: [],
      required_elements: [],
      session_cap_minutes: null,
      institution_id: null,
    },
  ];
}
