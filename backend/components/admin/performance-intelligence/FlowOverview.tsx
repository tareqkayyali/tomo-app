"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Stats {
  sportsConfigured: number;
  phvStages: number;
  contraindications: number;
  monitoringAlerts: number;
  readinessRules: number;
  promptBlocks: number;
  enabledPromptBlocks: number;
}

interface Props {
  onNavigateTab: (tab: string) => void;
}

const LAYERS = [
  {
    id: "intent",
    tab: "sport-context",
    title: "Layer 1 — Intent Classification",
    description: "3-tier cascade: Exact match ($0) → Haiku classifier (~$0.0001) → Sonnet orchestrator",
    color: "border-cyan-500/50",
    statKey: null as null,
    readOnly: true,
  },
  {
    id: "snapshot",
    tab: "sport-context",
    title: "Layer 2 — Athlete Snapshot",
    description: "Pre-computed athlete state: load, readiness, PHV, benchmarks, wellness, injury flags",
    color: "border-blue-500/50",
    stats: (s: Stats) => [
      { label: "Sports configured", value: s.sportsConfigured },
    ],
  },
  {
    id: "guardrails",
    tab: "readiness-matrix",
    title: "Layer 3 — Deterministic Guardrails",
    description: "Non-negotiable safety rules enforced before AI generates any response",
    color: "border-orange-500/50",
    stats: (s: Stats) => [
      { label: "Readiness rules", value: s.readinessRules },
    ],
  },
  {
    id: "ai-response",
    tab: "prompt-templates",
    title: "Layer 4 — AI Response Generation",
    description: "System prompt assembled from static + dynamic context blocks, sport-aware coaching",
    color: "border-purple-500/50",
    stats: (s: Stats) => [
      { label: "Prompt blocks", value: `${s.enabledPromptBlocks}/${s.promptBlocks} enabled` },
    ],
  },
  {
    id: "phv-filter",
    tab: "phv-config",
    title: "Layer 5 — PHV Safety Filter",
    description: "Post-response safety scan for growth-stage athletes with education-first approach",
    color: "border-red-500/50",
    stats: (s: Stats) => [
      { label: "PHV stages", value: s.phvStages },
      { label: "Contraindications", value: s.contraindications },
      { label: "Monitoring alerts", value: s.monitoringAlerts },
    ],
  },
];

export function FlowOverview({ onNavigateTab }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/stats", { credentials: "include" })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      <p className="text-sm text-muted-foreground text-center mb-6">
        Click any layer to edit its configuration. Every athlete message flows through these 5 layers top-to-bottom.
      </p>

      {LAYERS.map((layer, i) => (
        <div key={layer.id}>
          <Card
            className={`border ${layer.color} cursor-pointer transition-colors hover:bg-accent/5`}
            onClick={() => onNavigateTab(layer.tab)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{layer.title}</CardTitle>
                {layer.readOnly && (
                  <Badge variant="outline" className="text-xs">Read-only</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">{layer.description}</p>
              {stats && layer.stats && (
                <div className="flex gap-2 flex-wrap">
                  {layer.stats(stats).map((s) => (
                    <Badge key={s.label} variant="secondary" className="text-xs">
                      {s.label}: {s.value}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {i < LAYERS.length - 1 && (
            <div className="flex justify-center py-1">
              <span className="text-muted-foreground text-lg">↓</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
