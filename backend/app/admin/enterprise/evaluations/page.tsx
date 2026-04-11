"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageGuide } from "@/components/admin/PageGuide";
import { evaluationsHelp } from "@/lib/cms-help/evaluations";

/**
 * Enterprise Evaluation & Annotation
 * Browse AI eval suite results, PHV safety gate status, and production conversation quality.
 * Phase 10 will add the PD annotation interface and LangSmith dataset pipeline.
 */

interface EvalSuiteResult {
  suite: string;
  name: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  hardGatePass: boolean;
}

interface RecentConversation {
  session_id: string;
  athlete_name: string;
  sport: string;
  agent: string;
  message_count: number;
  last_message_at: string;
  has_safety_flag: boolean;
}

export default function EvaluationsPage() {
  const [suites, setSuites] = useState<EvalSuiteResult[]>([]);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvalData();
  }, []);

  async function fetchEvalData() {
    try {
      const res = await fetch("/api/v1/admin/enterprise/evaluations");
      if (res.ok) {
        const data = await res.json();
        setSuites(data.suites || []);
        setConversations(data.conversations || []);
      } else {
        // API not wired yet — use baseline data from Phase 6 eval
        setSuites(getBaselineSuites());
      }
    } catch {
      // Fallback to baseline data
      setSuites(getBaselineSuites());
    } finally {
      setLoading(false);
    }
  }

  /** Baseline from Phase 6 eval report until live pipeline is wired */
  function getBaselineSuites(): EvalSuiteResult[] {
    return [
      {
        suite: "S1",
        name: "Routing Accuracy",
        total: 40,
        passed: 34,
        failed: 6,
        passRate: 0.85,
        hardGatePass: true,
      },
      {
        suite: "S2",
        name: "PHV Safety",
        total: 30,
        passed: 30,
        failed: 0,
        passRate: 1.0,
        hardGatePass: true,
      },
      {
        suite: "S3",
        name: "Coaching Specificity",
        total: 40,
        passed: 28,
        failed: 12,
        passRate: 0.7,
        hardGatePass: true,
      },
      {
        suite: "S4",
        name: "Protocol Citation",
        total: 30,
        passed: 21,
        failed: 9,
        passRate: 0.7,
        hardGatePass: true,
      },
      {
        suite: "S5",
        name: "Context Continuity",
        total: 20,
        passed: 16,
        failed: 4,
        passRate: 0.8,
        hardGatePass: true,
      },
      {
        suite: "S6",
        name: "Card Format Validation",
        total: 30,
        passed: 24,
        failed: 6,
        passRate: 0.8,
        hardGatePass: true,
      },
      {
        suite: "S7",
        name: "RAG Knowledge",
        total: 30,
        passed: 21,
        failed: 9,
        passRate: 0.7,
        hardGatePass: true,
      },
      {
        suite: "S8",
        name: "Edge Cases & Safety",
        total: 30,
        passed: 30,
        failed: 0,
        passRate: 1.0,
        hardGatePass: true,
      },
    ];
  }

  const totalScenarios = suites.reduce((sum, s) => sum + s.total, 0);
  const totalPassed = suites.reduce((sum, s) => sum + s.passed, 0);
  const overallPassRate = totalScenarios > 0 ? totalPassed / totalScenarios : 0;
  const phvSuite = suites.find((s) => s.suite === "S2");
  const allHardGatesPass = suites.every((s) => s.hardGatePass);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Evaluations</h1>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Evaluation & Annotation</h1>
        <PageGuide {...evaluationsHelp.dashboard.page} />
        <p className="text-muted-foreground">
          AI eval suite results, PHV safety gate, and conversation quality
          monitoring
        </p>
      </div>

      {/* Deploy gate status */}
      <Card
        className={`p-4 border-l-4 ${
          allHardGatesPass && overallPassRate >= 0.7
            ? "border-l-green-500"
            : "border-l-red-500"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Deploy Gate Status</h2>
            <p className="text-xs text-muted-foreground mt-1">
              PHV safety = 100% (hard gate) + overall pass rate &ge; 70%
            </p>
          </div>
          <Badge
            variant={
              allHardGatesPass && overallPassRate >= 0.7
                ? "default"
                : "destructive"
            }
            className="text-sm px-3 py-1"
          >
            {allHardGatesPass && overallPassRate >= 0.7
              ? "PASS — Safe to Deploy"
              : "BLOCKED — Fix Required"}
          </Badge>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">
            Total Scenarios
          </p>
          <p className="text-2xl font-bold">{totalScenarios}</p>
          <p className="text-xs text-muted-foreground mt-1">
            across {suites.length} suites
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">
            Overall Pass Rate
          </p>
          <p className="text-2xl font-bold">
            {(overallPassRate * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalPassed}/{totalScenarios} passed
          </p>
        </Card>
        <Card
          className={`p-4 border-l-4 ${
            phvSuite?.passRate === 1.0
              ? "border-l-green-500"
              : "border-l-red-500"
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase">
            PHV Safety Gate
          </p>
          <p className="text-2xl font-bold">
            {phvSuite
              ? `${(phvSuite.passRate * 100).toFixed(0)}%`
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Hard gate — must be 100%
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">
            Hard Gate Failures
          </p>
          <p className="text-2xl font-bold">
            {suites.filter((s) => !s.hardGatePass).length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {allHardGatesPass ? "All gates passing" : "Action required"}
          </p>
        </Card>
      </div>

      {/* Suite breakdown */}
      <Card>
        <div className="p-4">
          <h2 className="text-sm font-semibold mb-3">Suite Breakdown</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Suite</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Passed</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Pass Rate</TableHead>
                <TableHead>Gate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suites.map((s) => (
                <TableRow key={s.suite}>
                  <TableCell className="font-mono text-sm">{s.suite}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-green-600 dark:text-green-400">
                    {s.passed}
                  </TableCell>
                  <TableCell
                    className={
                      s.failed > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    }
                  >
                    {s.failed}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s.passRate >= 0.85
                              ? "bg-green-500"
                              : s.passRate >= 0.7
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${s.passRate * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono">
                        {(s.passRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.hardGatePass ? "outline" : "destructive"}
                      className="text-xs"
                    >
                      {s.hardGatePass ? "PASS" : "FAIL"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Recent conversations (live data when API wired) */}
      {conversations.length > 0 && (
        <Card>
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-3">
              Recent Conversations (for annotation)
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Athlete</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Safety</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((c) => (
                  <TableRow key={c.session_id}>
                    <TableCell className="font-medium">
                      {c.athlete_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {c.sport}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {c.agent}
                    </TableCell>
                    <TableCell>{c.message_count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.last_message_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {c.has_safety_flag ? (
                        <Badge variant="destructive" className="text-xs">
                          Flagged
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Clean
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Placeholder for Phase 10 annotation */}
      <Card className="p-8 text-center border-dashed">
        <p className="text-muted-foreground text-sm">
          PD Annotation Interface — Phase 10
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Rate AI responses 1-5, annotate conversations, feed into LangSmith
          labeled dataset pipeline
        </p>
      </Card>
    </div>
  );
}
