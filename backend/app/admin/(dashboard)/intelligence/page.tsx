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

export default function IntelligencePage() {
  const [athletes, setAthletes] = useState<AthleteIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);

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
