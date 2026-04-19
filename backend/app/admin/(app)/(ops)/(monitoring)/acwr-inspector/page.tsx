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
import { PageGuide } from "@/components/admin/PageGuide";
import { acwrInspectorHelp } from "@/lib/cms-help/acwr-inspector";

/* ---------- types ---------- */

interface Athlete {
  id: string;
  name: string;
  email: string;
  sport: string;
  position: string;
}

interface ComputedACWR {
  acwr: number;
  atl_7day: number;
  ctl_28day: number;
  athletic_load_7day: number;
  academic_load_7day: number;
  injury_risk_flag: "GREEN" | "AMBER" | "RED";
}

interface Intermediate {
  acute_sum: number;
  chronic_sum: number;
  acute_days_with_data: number;
  chronic_days_with_data: number;
  academic_weight: number;
}

interface Thresholds {
  safe_low: number;
  safe_high: number;
  danger_high: number;
}

interface DailyRow {
  date: string;
  training_au: number;
  academic_au: number;
  academic_weighted: number;
  combined_au: number;
  session_count: number;
  is_acute_window: boolean;
}

interface InspectorResult {
  athlete: Athlete;
  computed: ComputedACWR;
  intermediate: Intermediate;
  thresholds: Thresholds;
  snapshot_current: Record<string, unknown> | null;
  daily_breakdown: DailyRow[];
}

/* ---------- helpers ---------- */

const RAG_COLORS: Record<string, string> = {
  GREEN: "bg-green-500/15 text-green-400 border-green-500/30",
  AMBER: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  RED: "bg-red-500/15 text-red-400 border-red-500/30",
};

function formatDate(d: string) {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/* ---------- component ---------- */

export default function ACWRInspectorPage() {
  const [athleteId, setAthleteId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InspectorResult | null>(null);

  async function handleInspect() {
    const id = athleteId.trim();
    if (!id) {
      toast.error("Enter an athlete UUID");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(
        `/api/v1/admin/acwr-inspector?athlete_id=${encodeURIComponent(id)}`,
        { credentials: "include" }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || `Failed to inspect (${res.status})`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch {
      toast.error("Network error");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ACWR Inspector</h1>
        <p className="text-muted-foreground">
          Look up any athlete and see exactly how their ACWR was calculated
        </p>
      </div>

      <PageGuide {...acwrInspectorHelp.page.page} />

      {/* Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label>Athlete UUID</Label>
              <Input
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                placeholder="e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                onKeyDown={(e) => e.key === "Enter" && handleInspect()}
              />
            </div>
            <Button onClick={handleInspect} disabled={loading}>
              {loading ? "Loading..." : "Inspect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Athlete Info */}
          <Card>
            <CardHeader>
              <CardTitle>Athlete</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{result.athlete.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sport</p>
                  <p className="font-medium capitalize">
                    {result.athlete.sport}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Position</p>
                  <p className="font-medium capitalize">
                    {result.athlete.position}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Mode</p>
                  <p className="font-medium capitalize">
                    {(result.snapshot_current?.athlete_mode as string) ??
                      "balanced"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ACWR Result */}
          <Card>
            <CardHeader>
              <CardTitle>ACWR Result</CardTitle>
              <CardDescription>
                Live calculation from the 28-day daily load table
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                {/* ACWR */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    ACWR
                  </p>
                  <p className="text-4xl font-bold tabular-nums">
                    {result.computed.acwr.toFixed(2)}
                  </p>
                  <Badge
                    variant="outline"
                    className={`mt-2 ${RAG_COLORS[result.computed.injury_risk_flag]}`}
                  >
                    {result.computed.injury_risk_flag}
                  </Badge>
                </div>

                {/* ATL */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    ATL (7d avg)
                  </p>
                  <p className="text-3xl font-semibold tabular-nums">
                    {result.computed.atl_7day}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    AU/day
                  </p>
                </div>

                {/* CTL */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    CTL (28d avg)
                  </p>
                  <p className="text-3xl font-semibold tabular-nums">
                    {result.computed.ctl_28day}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    AU/day
                  </p>
                </div>

                {/* Training Load */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Training (7d)
                  </p>
                  <p className="text-3xl font-semibold tabular-nums">
                    {result.computed.athletic_load_7day}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">AU total</p>
                </div>

                {/* Academic Load */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Academic (7d)
                  </p>
                  <p className="text-3xl font-semibold tabular-nums">
                    {result.computed.academic_load_7day}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">AU raw</p>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Intermediate Calculation */}
              <div>
                <p className="text-sm font-medium mb-3">
                  Calculation Breakdown
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1.5">
                    <p className="font-medium">Acute (7-day)</p>
                    <p className="text-muted-foreground">
                      Sum of combined daily loads:{" "}
                      <span className="font-mono text-foreground">
                        {result.intermediate.acute_sum}
                      </span>{" "}
                      AU
                    </p>
                    <p className="text-muted-foreground">
                      Days with data:{" "}
                      <span className="font-mono text-foreground">
                        {result.intermediate.acute_days_with_data}
                      </span>{" "}
                      / 7
                    </p>
                    <p className="text-muted-foreground">
                      ATL = {result.intermediate.acute_sum} / 7 ={" "}
                      <span className="font-mono text-foreground">
                        {result.computed.atl_7day}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-4 py-3 space-y-1.5">
                    <p className="font-medium">Chronic (28-day)</p>
                    <p className="text-muted-foreground">
                      Sum of combined daily loads:{" "}
                      <span className="font-mono text-foreground">
                        {result.intermediate.chronic_sum}
                      </span>{" "}
                      AU
                    </p>
                    <p className="text-muted-foreground">
                      Days with data:{" "}
                      <span className="font-mono text-foreground">
                        {result.intermediate.chronic_days_with_data}
                      </span>{" "}
                      / 28
                    </p>
                    <p className="text-muted-foreground">
                      CTL = {result.intermediate.chronic_sum} / 28 ={" "}
                      <span className="font-mono text-foreground">
                        {result.computed.ctl_28day}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  ACWR = ATL / CTL = {result.computed.atl_7day} /{" "}
                  {result.computed.ctl_28day} ={" "}
                  <span className="font-mono font-medium text-foreground">
                    {result.computed.acwr.toFixed(2)}
                  </span>
                </p>
              </div>

              <Separator className="my-6" />

              {/* Thresholds */}
              <div>
                <p className="text-sm font-medium mb-3">Risk Thresholds</p>
                <div className="flex gap-3 flex-wrap">
                  <Badge
                    variant="outline"
                    className="bg-green-500/15 text-green-400 border-green-500/30 px-3 py-1"
                  >
                    GREEN: {result.thresholds.safe_low} -{" "}
                    {result.thresholds.safe_high}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-amber-500/15 text-amber-400 border-amber-500/30 px-3 py-1"
                  >
                    AMBER: &lt; {result.thresholds.safe_low} or{" "}
                    {result.thresholds.safe_high} - {result.thresholds.danger_high}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-red-500/15 text-red-400 border-red-500/30 px-3 py-1"
                  >
                    RED: &gt; {result.thresholds.danger_high}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Snapshot Comparison */}
          {result.snapshot_current && (
            <Card>
              <CardHeader>
                <CardTitle>Stored Snapshot Comparison</CardTitle>
                <CardDescription>
                  Compare the live calculation above against what's currently
                  stored in the athlete's snapshot
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Snapshot (stored)</TableHead>
                        <TableHead>Computed (live)</TableHead>
                        <TableHead>Match</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        {
                          label: "ACWR",
                          stored: result.snapshot_current.acwr,
                          computed: result.computed.acwr,
                        },
                        {
                          label: "ATL (7d)",
                          stored: result.snapshot_current.atl_7day,
                          computed: result.computed.atl_7day,
                        },
                        {
                          label: "CTL (28d)",
                          stored: result.snapshot_current.ctl_28day,
                          computed: result.computed.ctl_28day,
                        },
                        {
                          label: "Athletic Load (7d)",
                          stored:
                            result.snapshot_current.athletic_load_7day,
                          computed: result.computed.athletic_load_7day,
                        },
                        {
                          label: "Injury Risk Flag",
                          stored:
                            result.snapshot_current.injury_risk_flag,
                          computed: result.computed.injury_risk_flag,
                        },
                      ].map((row) => {
                        const match =
                          String(row.stored) === String(row.computed);
                        return (
                          <TableRow key={row.label}>
                            <TableCell className="font-medium">
                              {row.label}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {row.stored != null ? String(row.stored) : "-"}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {String(row.computed)}
                            </TableCell>
                            <TableCell>
                              {match ? (
                                <span className="text-green-400 text-sm">
                                  Yes
                                </span>
                              ) : (
                                <span className="text-amber-400 text-sm font-medium">
                                  Stale
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {result.snapshot_current.snapshot_at != null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Snapshot last updated:{" "}
                    {new Date(
                      result.snapshot_current.snapshot_at as string
                    ).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Daily Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>28-Day Daily Load Breakdown</CardTitle>
              <CardDescription>
                Each row shows one day of aggregated load. The 7-day acute
                window is highlighted. Combined = Training + (Academic x{" "}
                {result.intermediate.academic_weight}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.daily_breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No daily load data found for the last 28 days
                </p>
              ) : (
                <div className="rounded-md border max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">
                          Training AU
                        </TableHead>
                        <TableHead className="text-right">
                          Academic AU
                        </TableHead>
                        <TableHead className="text-right">
                          Academic (weighted)
                        </TableHead>
                        <TableHead className="text-right">
                          Combined AU
                        </TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead>Window</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.daily_breakdown.map((day) => (
                        <TableRow
                          key={day.date}
                          className={
                            day.is_acute_window ? "bg-primary/5" : ""
                          }
                        >
                          <TableCell className="font-medium text-sm">
                            {formatDate(day.date)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {day.training_au || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {day.academic_au || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {day.academic_weighted || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {day.combined_au}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {day.session_count || "-"}
                          </TableCell>
                          <TableCell>
                            {day.is_acute_window && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-primary/10 text-primary border-primary/30"
                              >
                                Acute
                              </Badge>
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
        </>
      )}
    </div>
  );
}
