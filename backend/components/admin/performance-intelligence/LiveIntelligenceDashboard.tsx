"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Decision {
  type: string;
  athlete: string;
  description: string;
  time: string;
}

interface Stats {
  todaySquadStatus: { green: number; amber: number; red: number };
  recentDecisions: Decision[];
  overridesThisWeek: number;
  systemHealth: { aiActive: boolean; dataFresh: boolean; protectionLoaded: boolean };
  sportsConfigured: number;
  phvStages: number;
  contraindications: number;
  readinessRules: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return "Yesterday";
}

function decisionDotColor(type: string): string {
  if (type === "protection") return "bg-red-500";
  if (type === "load_management") return "bg-amber-500";
  return "bg-green-500";
}

export function LiveIntelligenceDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  function fetchStats() {
    fetch("/api/v1/admin/performance-intelligence/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setStats(data); setLastUpdated(new Date()); })
      .catch(() => {});
  }

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const squad = stats.todaySquadStatus;
  const health = stats.systemHealth;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Section A — Squad status */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Today's squad status</h3>
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-green-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{squad.green}</p>
              <p className="text-sm text-muted-foreground mt-1">Ready to train</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{squad.amber}</p>
              <p className="text-sm text-muted-foreground mt-1">Modified session</p>
            </CardContent>
          </Card>
          <Card className="border-red-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-red-400">{squad.red}</p>
              <p className="text-sm text-muted-foreground mt-1">Rest recommended</p>
            </CardContent>
          </Card>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground mt-2">Last updated {timeAgo(lastUpdated.toISOString())}</p>
        )}
      </div>

      {/* Section B — Decision feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tomo decisions in the last 24 hours</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentDecisions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No decisions logged in the last 24 hours. Your squad is either all in full training or no athletes have checked in yet today.</p>
          ) : (
            <div className="space-y-2">
              {stats.recentDecisions.map((d, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${decisionDotColor(d.type)}`} />
                  <div className="flex-1">
                    <p className="text-sm">{d.description} — <span className="text-muted-foreground">{d.athlete}</span></p>
                    <p className="text-xs text-muted-foreground">{timeAgo(d.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section C — Override */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <p className="text-sm font-medium">Disagree with a recommendation?</p>
          <p className="text-xs text-muted-foreground mt-1">If Tomo's recommendation conflicts with your coaching judgement, you can override it here. All overrides are logged with your reason and factored into how the system learns over time.</p>
          <div className="flex items-center justify-between mt-3">
            <Button variant="outline" size="sm">Review this week's decisions</Button>
            <span className="text-xs text-muted-foreground">Overrides this week: {stats.overridesThisWeek}</span>
          </div>
        </CardContent>
      </Card>

      {/* Section D — System health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">System status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${health.aiActive ? "bg-green-500" : "bg-amber-500"}`} />
              <span className="text-sm">AI coaching active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${health.dataFresh ? "bg-green-500" : "bg-amber-500"}`} />
              <span className="text-sm">Athlete data current</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${health.protectionLoaded ? "bg-green-500" : "bg-amber-500"}`} />
              <span className="text-sm">Protection rules loaded</span>
            </div>
          </div>
          {(!health.aiActive || !health.dataFresh || !health.protectionLoaded) && (
            <p className="text-xs text-amber-400 mt-3">Contact your Tomo administrator — some coaching intelligence may be operating on default settings rather than your custom configuration.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
