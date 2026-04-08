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

          {/* Full PDContext */}
          <Card>
            <CardHeader>
              <CardTitle>Full PDContext Output</CardTitle>
              <CardDescription>Raw JSON output from the protocol evaluation engine</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted/50 rounded-md p-4 overflow-auto max-h-96 text-xs font-mono">
                {JSON.stringify(result.pdContext, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
