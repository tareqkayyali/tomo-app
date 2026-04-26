"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptLogRow {
  id: string;
  request_id: string;
  athlete_id: string;
  session_id: string;
  turn_index: number;
  agent_type: string;
  intent_id: string | null;
  static_tokens: number;
  dynamic_tokens: number;
  total_tokens: number;
  memory_facts_count: number | null;
  memory_available: boolean;
  validation_warnings: string[];
  created_at: string;
}

interface PromptLogDetail extends PromptLogRow {
  blocks: Record<string, string>;
}

// ── Plain-English section name map ────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  signal_conflict:     "Signal Conflict Check",
  ccrs:                "Readiness & Load Status",
  ccrs_directive:      "Readiness Directive",
  aib:                 "Athlete Intelligence Brief",
  memory:              "Memory — What the Coach Already Knows",
  sport_context:       "Sport & Position",
  performance_layers:  "Performance Layers",
  phv:                 "Growth Stage",
  dual_load:           "Academic + Athletic Load",
  triangle_inputs:     "Triangle Inputs (Coach / Parent)",
  tone:                "Communication Style",
  snapshot:            "Athlete Data Snapshot",
  temporal:            "Schedule & Time Context",
  date_mapping:        "Date Mapping",
  date_rules:          "Date Rules",
  schedule_rules:      "Schedule Rules",
  recs:                "Active Recommendations",
  wearable:            "Wearable Data",
  safety_gate_policy:  "Safety Rules (Active)",
  conflict_mediation:  "Conflict Mediation",
  intent_guidance:     "Intent Guidance",
  conversation_context:"Conversation Context",
  prior_agent_handoff: "Prior Agent Handoff",
  workflow:            "Multi-Step Workflow",
  scheduling_anchor:   "Scheduling Thread Anchor",
  player_context:      "Player Context",
  _other:              "Other (unmapped sections)",
};

// Section display order — safety and identity first, data second
const SECTION_ORDER = [
  "signal_conflict", "ccrs", "aib", "memory",
  "sport_context", "performance_layers", "phv", "dual_load",
  "triangle_inputs", "tone", "snapshot", "temporal",
  "date_mapping", "date_rules", "schedule_rules", "recs",
  "wearable", "safety_gate_policy",
  "conflict_mediation", "intent_guidance", "conversation_context",
  "prior_agent_handoff", "workflow", "scheduling_anchor",
  "player_context", "ccrs_directive", "_other",
];

const WINDOWS = [
  { value: "1",  label: "Last 1 hour"  },
  { value: "6",  label: "Last 6 hours" },
  { value: "24", label: "Last 24 hours"},
  { value: "168",label: "Last 7 days"  },
] as const;

const AGENT_TYPES = [
  "output", "performance", "recovery", "scheduling",
  "triangle", "conflict_mediation",
];

function shortId(id: string) {
  return id.slice(0, 8) + "…";
}

function tokenBar(used: number, budget: number = 16000) {
  const pct = Math.min(100, Math.round((used / budget) * 100));
  const colour =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs">{used.toLocaleString()}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PromptInspectorPage() {
  const [hours, setHours] = useState<string>("24");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [athleteId, setAthleteId] = useState("");
  const [logs, setLogs] = useState<PromptLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PromptLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - parseInt(hours) * 3600 * 1000);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        limit: "50",
      });
      if (agentFilter !== "all") params.set("agent_type", agentFilter);
      if (athleteId.trim()) params.set("athlete_id", athleteId.trim());

      const res = await fetch(
        `/api/v1/admin/ai-health/prompt-logs?${params}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setLogs(json.logs ?? []);
      setTotal(json.total ?? 0);
    } catch (e: unknown) {
      toast.error(`Failed to load logs: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [hours, agentFilter, athleteId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  async function loadDetail(requestId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/v1/admin/ai-health/prompt-logs/${requestId}`,
      );
      if (!res.ok) throw new Error(await res.text());
      setSelected(await res.json());
      setExpandedSections(new Set());
    } catch (e: unknown) {
      toast.error(`Failed to load detail: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const orderedSections = selected
    ? [
        ...SECTION_ORDER.filter((k) => k in (selected.blocks ?? {})),
        ...Object.keys(selected.blocks ?? {}).filter(
          (k) => !SECTION_ORDER.includes(k),
        ),
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h2 className="text-lg font-semibold">Prompt Inspector</h2>
        <p className="text-sm text-muted-foreground">
          See exactly what context the AI coach assembled for each conversation
          turn — every block, in plain English.
        </p>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Time window</label>
            <Select value={hours} onValueChange={(v) => setHours(v ?? "24")}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Agent</label>
            <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v ?? "all")}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {AGENT_TYPES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Athlete ID (optional)
            </label>
            <input
              type="text"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              placeholder="uuid…"
              className="h-8 w-64 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="h-8"
          >
            {loading ? "Loading…" : "Search"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Split view: list + detail ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Log list ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Recent turns{" "}
              {total > 0 && (
                <span className="text-muted-foreground font-normal">
                  — {total.toLocaleString()} in window
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {logs.length === 0 && !loading ? (
              <p className="p-4 text-sm text-muted-foreground">
                No prompt logs found for this window.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Turn</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Mem</TableHead>
                      <TableHead className="w-8">⚠</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((row) => {
                      const isActive = selected?.request_id === row.request_id;
                      return (
                        <TableRow
                          key={row.request_id}
                          className={`cursor-pointer transition-colors ${
                            isActive
                              ? "bg-violet-50 dark:bg-violet-950/30"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => loadDetail(row.request_id)}
                        >
                          <TableCell className="font-mono text-xs">
                            #{row.turn_index}
                            <div className="text-muted-foreground">
                              {shortId(row.session_id)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {row.agent_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {tokenBar(row.total_tokens)}
                          </TableCell>
                          <TableCell>
                            {row.memory_available ? (
                              <span className="text-green-600 text-xs font-medium">
                                ✓ {row.memory_facts_count ?? 0}f
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.validation_warnings.length > 0 && (
                              <span className="text-amber-500 text-xs font-bold">
                                {row.validation_warnings.length}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {new Date(row.created_at).toLocaleTimeString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Detail pane ── */}
        <div className="space-y-4">
          {detailLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {!detailLoading && !selected && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Select a turn on the left to see what the coach saw.
              </CardContent>
            </Card>
          )}

          {selected && !detailLoading && (
            <>
              {/* ── Turn header ── */}
              <Card>
                <CardContent className="grid grid-cols-2 gap-3 pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Agent</p>
                    <Badge variant="outline">{selected.agent_type}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Turn</p>
                    <p className="font-medium">#{selected.turn_index}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Intent</p>
                    <p className="font-mono text-xs">
                      {selected.intent_id ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Static tokens</p>
                    <p className="tabular-nums">{selected.static_tokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dynamic tokens</p>
                    <p className="tabular-nums">{selected.dynamic_tokens.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total tokens</p>
                    <p className="tabular-nums font-semibold">
                      {selected.total_tokens.toLocaleString()}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-xs text-muted-foreground">Session</p>
                    <p className="font-mono text-xs break-all">{selected.session_id}</p>
                  </div>
                </CardContent>
              </Card>

              {/* ── Validation warnings ── */}
              {selected.validation_warnings.length > 0 && (
                <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                  <CardHeader className="pb-1 pt-3">
                    <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
                      ⚠ Validation Warnings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <ul className="space-y-1">
                      {selected.validation_warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-300">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* ── Memory summary ── */}
              <div className="flex items-center gap-2 text-sm">
                {selected.memory_available ? (
                  <Badge variant="outline" className="text-green-700 border-green-300">
                    ✓ Memory active — {selected.memory_facts_count ?? 0} facts injected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Memory not available this turn
                  </Badge>
                )}
              </div>

              {/* ── Block sections ── */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Context blocks assembled ({orderedSections.length} sections)
                </p>
                {orderedSections.map((key) => {
                  const label = SECTION_LABELS[key] ?? key;
                  const content = selected.blocks[key] ?? "";
                  const expanded = expandedSections.has(key);
                  const preview = content.slice(0, 220);
                  const isTruncated = content.length > 220;

                  return (
                    <Card key={key} className="overflow-hidden">
                      <button
                        className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-muted/40 transition-colors"
                        onClick={() => toggleSection(key)}
                      >
                        <span className="text-sm font-medium">{label}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          {content.length.toLocaleString()} chars{" "}
                          {expanded ? "▲" : "▼"}
                        </span>
                      </button>
                      {expanded && (
                        <CardContent className="border-t pb-3 pt-2">
                          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground font-mono overflow-x-auto max-h-96 overflow-y-auto">
                            {content}
                          </pre>
                        </CardContent>
                      )}
                      {!expanded && (
                        <CardContent className="border-t pb-3 pt-2">
                          <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">
                            {preview}
                            {isTruncated && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSection(key);
                                }}
                                className="text-violet-600 hover:underline ml-1"
                              >
                                …show more
                              </button>
                            )}
                          </p>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
