"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import Link from "next/link";

interface SnapshotSummary {
  sport: string | null;
  position: string | null;
  phv_stage: string | null;
  acwr: number | null;
  readiness_rag: string | null;
  readiness_score: number | null;
  dual_load_index: number | null;
  injury_risk_flag: boolean | null;
  wellness_7day_avg: number | null;
}

interface FiredProtocol {
  name: string;
  category: string;
  priority: number;
  safety_critical: boolean;
}

interface TestResult {
  athlete_id: string;
  snapshot_summary: SnapshotSummary;
  protocols_evaluated: number;
  protocols_fired: FiredProtocol[];
  pdContext: Record<string, unknown>;
}

const CATEGORY_COLORS: Record<string, string> = {
  safety: "bg-red-500/15 text-red-400 border-red-500/30",
  development: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  recovery: "bg-green-500/15 text-green-400 border-green-500/30",
  performance: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  academic: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const RAG_COLORS: Record<string, string> = {
  GREEN: "bg-green-500/15 text-green-400",
  YELLOW: "bg-amber-500/15 text-amber-400",
  RED: "bg-red-500/15 text-red-400",
};

export default function ProtocolTestPage() {
  const [athleteId, setAthleteId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function handleRun() {
    if (!athleteId.trim()) {
      toast.error("Athlete ID is required");
      return;
    }

    setRunning(true);
    setResult(null);

    const res = await fetch("/api/v1/admin/protocols/test", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athlete_id: athleteId.trim() }),
    });

    if (res.ok) {
      const data = await res.json();
      setResult(data);
      toast.success(`Evaluation complete: ${data.protocols_fired?.length ?? 0} protocols fired`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to run evaluation");
    }

    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Protocol Simulator</h1>
          <p className="text-muted-foreground">
            Test which protocols fire for a specific athlete
          </p>
        </div>
        <Link href="/admin/protocols">
          <Button variant="outline">Back to Protocols</Button>
        </Link>
      </div>

      <Separator />

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle>Run Evaluation</CardTitle>
          <CardDescription>
            Enter an athlete UUID to evaluate all protocols against their current snapshot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="athleteId">Athlete ID (UUID)</Label>
              <Input
                id="athleteId"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
              />
            </div>
            <Button onClick={handleRun} disabled={running}>
              {running ? "Running..." : "Run Evaluation"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Snapshot Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Athlete Snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Sport</p>
                  <p className="font-medium capitalize">{result.snapshot_summary.sport ?? "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Position</p>
                  <p className="font-medium capitalize">{result.snapshot_summary.position ?? "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">PHV Stage</p>
                  <p className="font-medium">{result.snapshot_summary.phv_stage ?? "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ACWR</p>
                  <p className="font-medium">{result.snapshot_summary.acwr?.toFixed(2) ?? "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Readiness</p>
                  <Badge className={RAG_COLORS[result.snapshot_summary.readiness_rag ?? ""] ?? ""}>
                    {result.snapshot_summary.readiness_rag ?? "N/A"}{" "}
                    {result.snapshot_summary.readiness_score != null && `(${result.snapshot_summary.readiness_score})`}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dual Load Index</p>
                  <p className="font-medium">{result.snapshot_summary.dual_load_index?.toFixed(2) ?? "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Injury Risk Flag</p>
                  <p className="font-medium">
                    {result.snapshot_summary.injury_risk_flag ? (
                      <Badge variant="destructive">YES</Badge>
                    ) : (
                      "No"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Wellness 7-day Avg</p>
                  <p className="font-medium">{result.snapshot_summary.wellness_7day_avg?.toFixed(1) ?? "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fired Protocols */}
          <Card>
            <CardHeader>
              <CardTitle>
                Protocols Fired ({result.protocols_fired.length} / {result.protocols_evaluated})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.protocols_fired.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No protocols fired for this athlete
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Priority</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Safety Critical</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.protocols_fired.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                              p.priority <= 20 ? "bg-red-500/20 text-red-400" :
                              p.priority <= 50 ? "bg-orange-500/20 text-orange-400" :
                              "bg-blue-500/20 text-blue-400"
                            }`}>
                              {p.priority}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={CATEGORY_COLORS[p.category] ?? ""}>
                              {p.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {p.safety_critical && (
                              <Badge variant="destructive" className="text-xs">CRITICAL</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Training Modifiers */}
          {result.pdContext.trainingModifiers && (
            <Card>
              <CardHeader>
                <CardTitle>Training Modifiers</CardTitle>
                <CardDescription>How protocols are affecting this athlete&apos;s training capacity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Load Cap</p>
                    <p className="font-medium text-lg">
                      {((result.pdContext.trainingModifiers as Record<string, unknown>).load_multiplier as number) === 1
                        ? "No restriction"
                        : `${Math.round(((result.pdContext.trainingModifiers as Record<string, unknown>).load_multiplier as number) * 100)}% of normal`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Intensity Cap</p>
                    <Badge className={
                      (result.pdContext.trainingModifiers as Record<string, unknown>).intensity_cap === "rest" ? "bg-red-500/15 text-red-400" :
                      (result.pdContext.trainingModifiers as Record<string, unknown>).intensity_cap === "light" ? "bg-orange-500/15 text-orange-400" :
                      (result.pdContext.trainingModifiers as Record<string, unknown>).intensity_cap === "moderate" ? "bg-amber-500/15 text-amber-400" :
                      "bg-green-500/15 text-green-400"
                    }>
                      {String((result.pdContext.trainingModifiers as Record<string, unknown>).intensity_cap ?? "full").toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Session Cap</p>
                    <p className="font-medium">
                      {(result.pdContext.trainingModifiers as Record<string, unknown>).session_cap_minutes
                        ? `${(result.pdContext.trainingModifiers as Record<string, unknown>).session_cap_minutes} minutes max`
                        : "No limit"}
                    </p>
                  </div>
                </div>
                {((result.pdContext.trainingModifiers as Record<string, unknown>).contraindications as string[])?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">Blocked Exercises</p>
                    <div className="flex flex-wrap gap-2">
                      {((result.pdContext.trainingModifiers as Record<string, unknown>).contraindications as string[]).map((c, i) => (
                        <Badge key={i} variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                          {c.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {((result.pdContext.trainingModifiers as Record<string, unknown>).required_elements as string[])?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">Required Elements</p>
                    <div className="flex flex-wrap gap-2">
                      {((result.pdContext.trainingModifiers as Record<string, unknown>).required_elements as string[]).map((r, i) => (
                        <Badge key={i} variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                          {r.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recommendation Guardrails */}
          {result.pdContext.recGuardrails && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendation Guardrails</CardTitle>
                <CardDescription>What the recommendation engine can and cannot suggest</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!!(result.pdContext.recGuardrails as Record<string, unknown>).override_message && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
                    <p className="text-sm text-amber-400 font-medium">
                      {String((result.pdContext.recGuardrails as Record<string, unknown>).override_message)}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Priority Override</p>
                    <p className="font-medium">
                      {(result.pdContext.recGuardrails as Record<string, unknown>).priority_override
                        ? String((result.pdContext.recGuardrails as Record<string, unknown>).priority_override)
                        : "None"}
                    </p>
                  </div>
                </div>
                {((result.pdContext.recGuardrails as Record<string, unknown>).blocked_categories as string[])?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Blocked Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {((result.pdContext.recGuardrails as Record<string, unknown>).blocked_categories as string[]).map((c, i) => (
                        <Badge key={i} variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                          {c.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {((result.pdContext.recGuardrails as Record<string, unknown>).mandatory_categories as string[])?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Mandatory Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {((result.pdContext.recGuardrails as Record<string, unknown>).mandatory_categories as string[]).map((c, i) => (
                        <Badge key={i} variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                          {c.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {((result.pdContext.recGuardrails as Record<string, unknown>).blocked_categories as string[])?.length === 0 &&
                 ((result.pdContext.recGuardrails as Record<string, unknown>).mandatory_categories as string[])?.length === 0 &&
                 !(result.pdContext.recGuardrails as Record<string, unknown>).priority_override && (
                  <p className="text-sm text-muted-foreground">No guardrails active — full autonomy</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* AI Coaching Directives */}
          {result.pdContext.aiContext && (
            <Card>
              <CardHeader>
                <CardTitle>AI Coaching Directives</CardTitle>
                <CardDescription>How protocols are steering the AI coach</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Safety Critical</p>
                    {(result.pdContext.aiContext as Record<string, unknown>).safety_critical ? (
                      <Badge variant="destructive">YES — Sonnet enforced</Badge>
                    ) : (
                      <p className="font-medium">No</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Model Tier</p>
                    <Badge variant="outline" className={
                      (result.pdContext.aiContext as Record<string, unknown>).model_tier === "sonnet"
                        ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                        : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                    }>
                      {String((result.pdContext.aiContext as Record<string, unknown>).model_tier ?? "haiku").toUpperCase()}
                    </Badge>
                  </div>
                </div>
                {!!(result.pdContext.aiContext as Record<string, unknown>).system_injection &&
                 String((result.pdContext.aiContext as Record<string, unknown>).system_injection).trim() !== "" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">System Prompt Injection</p>
                    <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                      {String((result.pdContext.aiContext as Record<string, unknown>).system_injection)}
                    </div>
                  </div>
                )}
                {(!(result.pdContext.aiContext as Record<string, unknown>).system_injection ||
                  String((result.pdContext.aiContext as Record<string, unknown>).system_injection).trim() === "") &&
                  !(result.pdContext.aiContext as Record<string, unknown>).safety_critical && (
                  <p className="text-sm text-muted-foreground">No directives — AI operating normally</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audit Trail */}
          {(result.pdContext.auditTrail as Array<Record<string, unknown>>)?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Audit Trail — Why Protocols Fired</CardTitle>
                <CardDescription>Condition-by-condition breakdown of each triggered protocol</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(result.pdContext.auditTrail as Array<Record<string, unknown>>).map((entry, i) => (
                  <div key={i} className="rounded-md border p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                        (entry.priority as number) <= 20 ? "bg-red-500/20 text-red-400" :
                        (entry.priority as number) <= 50 ? "bg-orange-500/20 text-orange-400" :
                        "bg-blue-500/20 text-blue-400"
                      }`}>
                        {entry.priority as number}
                      </span>
                      <div>
                        <p className="font-medium">{String(entry.protocol_name)}</p>
                        <Badge variant="outline" className={CATEGORY_COLORS[String(entry.category)] ?? ""}>
                          {String(entry.category)}
                        </Badge>
                      </div>
                    </div>
                    {(entry.triggered_conditions as Array<Record<string, unknown>>)?.length > 0 && (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Field</TableHead>
                              <TableHead>Condition</TableHead>
                              <TableHead>Expected</TableHead>
                              <TableHead>Actual</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(entry.triggered_conditions as Array<Record<string, unknown>>).map((cond, j) => (
                              <TableRow key={j}>
                                <TableCell className="font-mono text-xs">{String(cond.field).replace(/_/g, " ")}</TableCell>
                                <TableCell className="text-xs">{String(cond.operator)}</TableCell>
                                <TableCell className="text-xs">{JSON.stringify(cond.expected)}</TableCell>
                                <TableCell className={`text-xs font-medium ${
                                  cond.actual !== cond.expected ? "text-amber-400" : ""
                                }`}>{JSON.stringify(cond.actual)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Evaluation Metadata */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Evaluated at {result.pdContext.evaluatedAt
                    ? new Date(String(result.pdContext.evaluatedAt)).toLocaleString()
                    : "unknown"}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    const el = document.getElementById("raw-pdcontext");
                    if (el) el.classList.toggle("hidden");
                  }}
                >
                  Toggle Raw JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre id="raw-pdcontext" className="hidden bg-muted/50 rounded-md p-4 overflow-auto max-h-96 text-xs font-mono">
                {JSON.stringify(result.pdContext, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
