"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AthleteIntelligence {
  athlete_id: string;
  name: string;
  sport: string;
  tomo_intelligence_score: number | null;
  adaptation_coefficient: number | null;
  compliance_rate: number | null;
  session_consistency: number | null;
  recovery_response: number | null;
  academic_athletic_balance: number | null;
  coaching_approach: string | null;
}

function ScoreBadge({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value == null) return <Badge variant="outline">N/A</Badge>;
  const pct = (value / max) * 100;
  const variant = pct >= 70 ? "default" : pct >= 40 ? "secondary" : "destructive";
  return <Badge variant={variant}>{typeof value === "number" && value <= 1 ? `${Math.round(value * 100)}%` : Math.round(value)}</Badge>;
}

/* ── Formula Reference Panel ── */
function FormulaReference({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Card>
      <CardHeader className="cursor-pointer pb-2" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Formula Reference</CardTitle>
          <span className="text-muted-foreground text-sm">{open ? "Hide" : "Show"}</span>
        </div>
        <CardDescription>How each metric is computed (28-day rolling window, $0 AI cost)</CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="space-y-6 text-sm">
          {/* TIS */}
          <div>
            <h3 className="font-semibold mb-1">Tomo Intelligence Score (TIS) &mdash; 0-100</h3>
            <p className="text-muted-foreground mb-2">
              Composite gamification metric. Equal-weighted average of 4 pillars:
            </p>
            <code className="block bg-muted rounded-md px-3 py-2 text-xs mb-3">
              TIS = Engagement * 0.25 + Performance * 0.25 + Wellbeing * 0.25 + Academic Balance * 0.25
            </code>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Engagement */}
              <div className="border rounded-lg p-3">
                <h4 className="font-medium text-orange-500 mb-1">1. Engagement (0-100)</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-2">
                  E = checkinRate*40 + chatFreq*30 + streakScore*30
                </code>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li><strong>checkinRate</strong> = min(1, checkins / 28) &mdash; daily check-in target</li>
                  <li><strong>chatFreq</strong> = min(1, chatSessions / 20) &mdash; ~5 sessions/week</li>
                  <li><strong>streakScore</strong> = min(1, streakDays / 30) &mdash; 30-day streak = max</li>
                </ul>
              </div>

              {/* Performance */}
              <div className="border rounded-lg p-3">
                <h4 className="font-medium text-green-500 mb-1">2. Performance (0-100)</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-2">
                  P = clamp(50 + improvement * 200, 20, 100)
                </code>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>Split test scores into first-half / second-half averages</li>
                  <li><strong>improvement</strong> = (secondAvg - firstAvg) / firstAvg</li>
                  <li>Needs 3+ tests in 28 days. Default: 50 if insufficient data</li>
                </ul>
              </div>

              {/* Wellbeing */}
              <div className="border rounded-lg p-3">
                <h4 className="font-medium text-cyan-500 mb-1">3. Wellbeing (0-100)</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-2">
                  W = clamp(wellnessAvg*0.4 + sleepScore*0.4 + trendBonus + 10, 0, 100)
                </code>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li><strong>wellnessAvg</strong> = 7-day wellness rolling average from snapshot</li>
                  <li><strong>sleepScore</strong> = 90 (&ge;8h), 70 (&ge;7h), 50 (&ge;6h), 30 (&lt;6h)</li>
                  <li><strong>trendBonus</strong> = +10 improving, -10 declining, 0 stable</li>
                </ul>
              </div>

              {/* Academic Balance */}
              <div className="border rounded-lg p-3">
                <h4 className="font-medium text-yellow-500 mb-1">4. Academic Balance (0-100)</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-2">
                  DLI sweet spot: 30-60 = high score, extremes penalized
                </code>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li><strong>DLI 30-60</strong>: score = 80 + (60 - |DLI - 45|) / 15 * 20</li>
                  <li><strong>DLI &lt; 30</strong>: score = 40 + DLI (under-engaged)</li>
                  <li><strong>DLI &gt; 60</strong>: score = max(20, 100 - DLI) (overloaded)</li>
                </ul>
              </div>
            </div>
          </div>

          <hr />

          {/* Behavioral Fingerprint */}
          <div>
            <h3 className="font-semibold mb-1">Behavioral Fingerprint &mdash; 4 dimensions (0-1 each)</h3>
            <p className="text-muted-foreground mb-2">
              Deterministic behavioral profile. Injected into AI coaching system prompt.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-1">Compliance Rate</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-1">
                  min(1, checkinsLast28d / 28)
                </code>
                <p className="text-xs text-muted-foreground">Daily check-in adherence. 1.0 = checked in every day.</p>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-1">Session Consistency</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-1">
                  max(0, 1 - CV of weekly training load)
                </code>
                <p className="text-xs text-muted-foreground">Inverse of coefficient of variation across 4 weekly load sums. 1.0 = identical load every week.</p>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-1">Recovery Response</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-1">
                  rebounds / lowDays (readiness &lt; 40 followed by +10 next day)
                </code>
                <p className="text-xs text-muted-foreground">How quickly readiness bounces back after a low day. 1.0 = always bounces back next day. Default 0.7 if no low days.</p>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="font-medium mb-1">Academic-Athletic Balance</h4>
                <code className="block bg-muted rounded px-2 py-1 text-xs mb-1">
                  1 - |normAcademic - normAthletic|
                </code>
                <p className="text-xs text-muted-foreground">Both loads normalized to max. 1.0 = equal investment in academics and athletics.</p>
              </div>
            </div>
          </div>

          <hr />

          {/* Coaching Approach */}
          <div>
            <h3 className="font-semibold mb-1">Coaching Approach &mdash; auto-generated label</h3>
            <p className="text-muted-foreground text-xs">
              Rule-based text injected into the AI system prompt. Derived from thresholds:
              compliance &ge; 0.8 = &ldquo;highly compliant&rdquo;, &lt; 0.5 = &ldquo;needs encouragement&rdquo;;
              consistency &ge; 0.7 = &ldquo;consistent trainer&rdquo;, &lt; 0.4 = &ldquo;irregular pattern&rdquo;;
              recovery &ge; 0.6 = &ldquo;fast recovery&rdquo;, else &ldquo;needs extra rest&rdquo;;
              balance &lt; 0.4 = &ldquo;academic-first tendency&rdquo;.
            </p>
          </div>

          <hr />

          {/* Data Sources */}
          <div>
            <h3 className="font-semibold mb-1">Data Sources & Refresh</h3>
            <div className="grid gap-2 md:grid-cols-3 text-xs text-muted-foreground">
              <div className="border rounded-lg p-2">
                <strong className="text-foreground">Tables read</strong>
                <p>checkins, phone_test_sessions, athlete_snapshots, chat_sessions, athlete_daily_load, athlete_longitudinal_memory</p>
              </div>
              <div className="border rounded-lg p-2">
                <strong className="text-foreground">Window</strong>
                <p>28-day rolling. Recomputed on demand or via weekly pg_cron.</p>
              </div>
              <div className="border rounded-lg p-2">
                <strong className="text-foreground">Cost</strong>
                <p>$0 &mdash; fully deterministic, no AI calls. Safe for bulk recomputation.</p>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function IntelligencePage() {
  const [athletes, setAthletes] = useState<AthleteIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/intelligence");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAthletes(data.athletes ?? []);
    } catch (err) {
      toast.error("Failed to load intelligence data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRecompute = async (athleteId?: string) => {
    setComputing(true);
    try {
      const res = await fetch("/api/v1/admin/compute-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(athleteId ? { athlete_id: athleteId } : {}),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Recomputed ${data.count ?? 1} athlete(s)`);
        await fetchData();
      } else {
        toast.error(data.error || "Recompute failed");
      }
    } catch {
      toast.error("Recompute request failed");
    } finally {
      setComputing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="h-9 w-64" /><Skeleton className="mt-2 h-5 w-96" /></div>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Intelligence Scores</h1>
          <p className="text-muted-foreground">
            TIS, behavioral fingerprint, and adaptation coefficient for all athletes.
          </p>
        </div>
        <Button onClick={() => handleRecompute()} disabled={computing}>
          {computing ? "Computing..." : "Recompute All"}
        </Button>
      </div>

      {/* Formula Reference — collapsible */}
      <FormulaReference open={showFormulas} onToggle={() => setShowFormulas(!showFormulas)} />

      {athletes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No athletes with intelligence data. Click &quot;Recompute All&quot; to generate scores.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {athletes.map((a) => (
            <Card key={a.athlete_id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{a.name || a.athlete_id.slice(0, 8)}</CardTitle>
                    <CardDescription>{a.sport || "Unknown sport"}</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">TIS</div>
                      <div className="text-2xl font-bold">{a.tomo_intelligence_score != null ? Math.round(a.tomo_intelligence_score) : "—"}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleRecompute(a.athlete_id)} disabled={computing}>
                      Recompute
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Adaptation:</span>
                    <ScoreBadge value={a.adaptation_coefficient} max={1} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Compliance:</span>
                    <ScoreBadge value={a.compliance_rate} max={1} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Consistency:</span>
                    <ScoreBadge value={a.session_consistency} max={1} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Recovery:</span>
                    <ScoreBadge value={a.recovery_response} max={1} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Balance:</span>
                    <ScoreBadge value={a.academic_athletic_balance} max={1} />
                  </div>
                </div>
                {a.coaching_approach && (
                  <p className="mt-2 text-sm text-muted-foreground">{a.coaching_approach}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
