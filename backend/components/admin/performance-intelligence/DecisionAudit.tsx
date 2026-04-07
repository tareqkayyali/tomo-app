"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Decision { type: string; description: string; rule: string; triggerData: string; time: string; }
interface CalibrationSignal { severity: string; headline: string; body: string; }
interface ProtocolReview { id: string; section: string; rule_key: string; justification: string; citation?: string; observation?: string; status: string; created_at: string; }

interface Stats {
  todaySquadStatus: { green: number; amber: number; red: number };
  recentDecisions: Decision[];
  growthPhaseInterventions: number;
  loadTriggers: number;
  readinessDecisions: number;
  calibrationSignals: CalibrationSignal[];
  systemHealth: { aiActive: boolean; dataFresh: boolean; protectionLoaded: boolean };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return "Yesterday";
}

const SECTIONS = [
  { value: "sport_coaching_context", label: "Sport Science Library" },
  { value: "phv_safety_config", label: "Athlete Safety Rules" },
  { value: "readiness_decision_matrix", label: "Performance Standards / Readiness" },
  { value: "ai_prompt_templates", label: "AI Coaching Language" },
];

export function DecisionAudit() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [reviews, setReviews] = useState<ProtocolReview[]>([]);
  const [filter, setFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Review form state
  const [formSection, setFormSection] = useState("sport_coaching_context");
  const [formRuleKey, setFormRuleKey] = useState("");
  const [formObservation, setFormObservation] = useState("");
  const [formJustification, setFormJustification] = useState("");
  const [formCitation, setFormCitation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function fetchAll() {
    Promise.all([
      fetch("/api/v1/admin/performance-intelligence/stats", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/admin/performance-intelligence/protocol-reviews", { credentials: "include" }).then((r) => r.json()),
    ]).then(([s, r]) => { setStats(s); setReviews(Array.isArray(r) ? r : []); setLastUpdated(new Date()); })
      .catch(() => {});
  }

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const filteredDecisions = filter === "all" ? stats.recentDecisions : stats.recentDecisions.filter((d) => d.type === filter);

  async function submitReview() {
    if (!formJustification.trim()) { toast.error("Scientific justification is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/protocol-reviews", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: formSection, rule_key: formRuleKey, observation: formObservation, justification: formJustification, citation: formCitation }),
      });
      if (res.ok) {
        toast.success("Protocol review logged");
        setFormRuleKey(""); setFormObservation(""); setFormJustification(""); setFormCitation("");
        fetchAll();
      } else toast.error("Failed to submit");
    } catch { toast.error("Failed to submit"); }
    finally { setSubmitting(false); }
  }

  const dotColor: Record<string, string> = { protection: "bg-red-500", load_management: "bg-amber-500", readiness: "bg-blue-500" };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* A: Protocol application summary */}
      <div>
        <h3 className="text-sm font-semibold mb-3">How the AI applied your protocols today</h3>
        <p className="text-xs text-muted-foreground mb-3">A quality check — not a management dashboard. This tells you whether the science is reaching athletes correctly.</p>
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-green-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{stats.growthPhaseInterventions}</p>
              <p className="text-xs text-muted-foreground mt-1">Growth phase interventions</p>
              <p className="text-xs text-muted-foreground">Sessions modified or exercises blocked</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">{stats.loadTriggers}</p>
              <p className="text-xs text-muted-foreground mt-1">Load threshold triggers</p>
              <p className="text-xs text-muted-foreground">Sessions where load protection applied</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{stats.readinessDecisions}</p>
              <p className="text-xs text-muted-foreground mt-1">Readiness assessments</p>
              <p className="text-xs text-muted-foreground">Session types determined by readiness protocol</p>
            </CardContent>
          </Card>
        </div>
        {lastUpdated && <p className="text-xs text-muted-foreground mt-2">Last updated {timeAgo(lastUpdated.toISOString())}</p>}
      </div>

      {/* B: Recent decisions — anonymised */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent decisions — for scientific review</CardTitle>
            <Select value={filter} onValueChange={(v) => setFilter(v || "all")}>
              <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All decisions</SelectItem>
                <SelectItem value="protection">Growth phase</SelectItem>
                <SelectItem value="load_management">Load management</SelectItem>
                <SelectItem value="readiness">Readiness</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDecisions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No decisions logged in the last 24 hours matching this filter.</p>
          ) : (
            <div className="space-y-2">
              {filteredDecisions.map((d, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${dotColor[d.type] || "bg-gray-500"}`} />
                  <div className="flex-1">
                    <p className="text-sm">{d.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{d.rule}</Badge>
                      <span className="text-xs text-muted-foreground">{d.triggerData}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(d.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* C: Calibration signals */}
      {stats.calibrationSignals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Is the science calibrated correctly?</h3>
          <p className="text-xs text-muted-foreground mb-3">Patterns in the AI's decisions that may indicate your protocols need adjustment. These are signals, not problems.</p>
          <div className="space-y-3">
            {stats.calibrationSignals.map((sig, i) => (
              <Card key={i} className={`border-l-2 ${sig.severity === "amber" ? "border-l-amber-500/50" : sig.severity === "red" ? "border-l-red-500/50" : "border-l-green-500/50"}`}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium">{sig.headline}</p>
                  <p className="text-xs text-muted-foreground mt-1">{sig.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* D: Protocol review form + history */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Propose a protocol change</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">If a pattern in the audit suggests a threshold or rule needs scientific review, log it here. All protocol changes are versioned and timestamped.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Protocol section</Label>
              <Select value={formSection} onValueChange={(v) => setFormSection(v || formSection)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Specific rule or threshold</Label>
              <Input value={formRuleKey} onChange={(e) => setFormRuleKey(e.target.value)} className="h-8 text-xs" placeholder="e.g., Load amber threshold" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observation (what you're seeing in the audit)</Label>
            <Textarea value={formObservation} onChange={(e) => setFormObservation(e.target.value)} rows={2} className="text-xs" placeholder="What pattern prompted this review?" />
          </div>
          <div>
            <Label className="text-xs">Proposed change and scientific justification (required)</Label>
            <Textarea value={formJustification} onChange={(e) => setFormJustification(e.target.value)} rows={3} className="text-xs" placeholder="What would you change and why?" />
          </div>
          <div>
            <Label className="text-xs">Supporting citation (optional)</Label>
            <Input value={formCitation} onChange={(e) => setFormCitation(e.target.value)} className="h-8 text-xs" placeholder="e.g., Gabbett, 2016" />
          </div>
          <Button onClick={submitReview} disabled={submitting || !formJustification.trim()} size="sm">
            {submitting ? "Logging..." : "Log protocol review"}
          </Button>
        </CardContent>
      </Card>

      {/* Protocol change history */}
      {reviews.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Protocol change history</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reviews.map((r) => (
                <div key={r.id} className="py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{SECTIONS.find((s) => s.value === r.section)?.label || r.section}</Badge>
                    <span className="text-xs font-medium">{r.rule_key}</span>
                    <Badge variant={r.status === "applied" ? "default" : "secondary"} className="text-xs">{r.status}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">{timeAgo(r.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{r.justification}</p>
                  {r.citation && <p className="text-xs text-muted-foreground italic">{r.citation}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
