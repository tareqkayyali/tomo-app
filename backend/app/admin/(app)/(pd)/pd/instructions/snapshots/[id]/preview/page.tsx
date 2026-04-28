"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageGuide } from "@/components/admin/PageGuide";
import {
  DIRECTIVE_TYPE_LABEL,
  SECTIONS,
} from "../../../_components/directiveLabels";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

interface ResolvedDirective {
  id: string;
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  phv_scope: string[];
  position_scope: string[];
  mode_scope: string[];
  priority: number;
  payload: Record<string, unknown>;
  source_excerpt: string | null;
  status: string;
  updated_at: string | null;
}

interface DryRunCollision {
  directive_type: DirectiveType;
  scope_summary: string;
  winner: ResolvedDirective;
  shadowed: ResolvedDirective[];
}

interface DryRunSummary {
  directive_type: DirectiveType;
  winner_id: string;
  plain_english: string;
  source_name: string;
}

interface DryRunResponse {
  snapshot: { id: string; label: string; is_live: boolean; published_at: string };
  scope: Record<string, string | null | undefined>;
  matches: ResolvedDirective[];
  collisions: DryRunCollision[];
  summaries: DryRunSummary[];
}

interface RosterAthlete {
  id: string;
  name: string;
  sport: string | null;
  phv_stage: string | null;
  position: string | null;
  mode: string | null;
  age_band: string | null;
}

const AGE_BANDS = ["U13", "U15", "U17", "U19", "U21", "senior", "unknown"];
const PHV_STAGES = [
  { value: "pre_phv", label: "Before growth spurt" },
  { value: "mid_phv", label: "During growth spurt" },
  { value: "post_phv", label: "After growth spurt" },
  { value: "unknown", label: "Unknown" },
];
const AUDIENCES = [
  { value: "athlete", label: "Athlete" },
  { value: "coach", label: "Coach" },
  { value: "parent", label: "Parent" },
];

function nameOf(d: ResolvedDirective): string {
  const p = d.payload ?? {};
  const candidate =
    (typeof p.name === "string" && p.name) ||
    (typeof p.title === "string" && p.title) ||
    (typeof p.label === "string" && p.label);
  if (candidate) return candidate as string;
  if (d.source_excerpt) {
    const t = d.source_excerpt.trim();
    return t.length > 60 ? `${t.slice(0, 60)}…` : t;
  }
  return "(unnamed rule)";
}

export default function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const sp = useSearchParams();

  const audience = sp.get("audience") || "athlete";
  const sport = sp.get("sport") || "";
  const ageBand = sp.get("age_band") || "";
  const phvStage = sp.get("phv_stage") || "";
  const position = sp.get("position") || "";
  const mode = sp.get("mode") || "";

  const [data, setData] = useState<DryRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [roster, setRoster] = useState<RosterAthlete[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (audience) p.set("audience", audience);
    if (sport) p.set("sport", sport);
    if (ageBand) p.set("age_band", ageBand);
    if (phvStage) p.set("phv_stage", phvStage);
    if (position) p.set("position", position);
    if (mode) p.set("mode", mode);
    return p.toString();
  }, [audience, sport, ageBand, phvStage, position, mode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/admin/pd/instructions/snapshots/${id}/dry-run?${queryString}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as DryRunResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Dry-run failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, queryString]);

  function setParam(key: string, value: string | null | undefined) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    router.replace(`/admin/pd/instructions/snapshots/${id}/preview?${p.toString()}`);
  }

  function applyAthlete(a: RosterAthlete) {
    const p = new URLSearchParams();
    p.set("audience", "athlete");
    if (a.sport) p.set("sport", a.sport);
    if (a.age_band) p.set("age_band", a.age_band);
    if (a.phv_stage) p.set("phv_stage", a.phv_stage);
    if (a.position) p.set("position", a.position);
    if (a.mode) p.set("mode", a.mode);
    router.replace(`/admin/pd/instructions/snapshots/${id}/preview?${p.toString()}`);
  }

  async function loadRoster() {
    if (rosterLoaded) return;
    try {
      const res = await fetch("/api/v1/admin/pd/instructions/athletes-roster", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRoster((json.athletes ?? []) as RosterAthlete[]);
      setRosterLoaded(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load roster");
    }
  }

  // Pre-index matches by directive_type for left column.
  const matchesByType = useMemo(() => {
    const map = new Map<DirectiveType, ResolvedDirective[]>();
    for (const d of data?.matches ?? []) {
      const arr = map.get(d.directive_type as DirectiveType);
      if (arr) arr.push(d);
      else map.set(d.directive_type as DirectiveType, [d]);
    }
    return map;
  }, [data]);

  const collisionsByType = useMemo(() => {
    const map = new Map<DirectiveType, DryRunCollision>();
    for (const c of data?.collisions ?? []) map.set(c.directive_type, c);
    return map;
  }, [data]);

  return (
    <div className="space-y-5">
      <PageGuide
        summary="Pick a real athlete or build a profile to see exactly which rules apply, who wins, and how Tomo will behave for that athlete. Use this before publishing to sanity-check the methodology end-to-end."
        details={[
          "The left column lists every rule that matches this profile, grouped the same way as the Rules page.",
          "When two rules of the same type both apply, the lower-priority one wins — the others are shown as shadowed.",
          "The right column is a plain-English summary of how Tomo will reply, what it'll block, and what it'll show this athlete.",
          "URL is shareable — copy it and paste it to a colleague to compare the same profile.",
        ]}
        impact="What this page shows is exactly what the runtime will apply. If something looks wrong here, fix the rule, not the page."
        storageKey="pd-instructions-dry-run"
      />

      <div className="rounded-md border bg-background p-4">
        <Tabs defaultValue="build">
          <TabsList>
            <TabsTrigger value="build">Build a profile</TabsTrigger>
            <TabsTrigger value="pick" onClick={loadRoster}>Pick an athlete</TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select value={audience} onValueChange={(v) => setParam("audience", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sport</Label>
                <Input
                  value={sport}
                  onChange={(e) => setParam("sport", e.target.value)}
                  placeholder="e.g. football"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Age band</Label>
                <Select value={ageBand || "__none"} onValueChange={(v) => setParam("age_band", v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Any</SelectItem>
                    {AGE_BANDS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Growth stage</Label>
                <Select value={phvStage || "__none"} onValueChange={(v) => setParam("phv_stage", v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Any</SelectItem>
                    {PHV_STAGES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Position</Label>
                <Input
                  value={position}
                  onChange={(e) => setParam("position", e.target.value)}
                  placeholder="e.g. striker"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Input
                  value={mode}
                  onChange={(e) => setParam("mode", e.target.value)}
                  placeholder="e.g. build"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pick" className="pt-3">
            {!rosterLoaded ? (
              <p className="text-sm text-muted-foreground">Loading athletes…</p>
            ) : roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No athletes in the roster yet. Use &lsquo;Build a profile&rsquo; instead.
              </p>
            ) : (
              <ul className="divide-y rounded border bg-background max-h-72 overflow-y-auto">
                {roster.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[a.sport, a.age_band, a.position, a.mode].filter(Boolean).join(" · ") || "no scope data"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => applyAthlete(a)}>
                      Use this athlete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {data && (
        <div className="text-xs text-muted-foreground">
          Snapshot: <span className="font-medium">{data.snapshot.label}</span>
          {data.snapshot.is_live && <Badge className="ml-2" variant="default">Live</Badge>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: what applies */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">What applies to this athlete</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Resolving…</p>
          ) : (
            SECTIONS.map((section) => (
              <div
                key={section.label}
                className={`rounded-md border ${section.accent} p-3 space-y-2`}
              >
                <div className="text-sm font-semibold">{section.label}</div>
                <div className="space-y-2">
                  {section.types.map((t) => {
                    const matches = matchesByType.get(t) ?? [];
                    const collision = collisionsByType.get(t);
                    if (matches.length === 0) {
                      return (
                        <div
                          key={t}
                          className="rounded border bg-white/40 p-2 text-xs text-muted-foreground"
                        >
                          <span className="font-medium text-muted-foreground/80">
                            {DIRECTIVE_TYPE_LABEL[t]}:
                          </span>{" "}
                          No rules in this category apply.
                        </div>
                      );
                    }
                    if (matches.length === 1) {
                      const d = matches[0];
                      return (
                        <div
                          key={t}
                          className="rounded border-2 border-emerald-200 bg-white/70 p-2 text-xs"
                        >
                          <div className="font-medium text-emerald-900">
                            ✓ {DIRECTIVE_TYPE_LABEL[t]}
                          </div>
                          <Link
                            href={`/admin/pd/instructions/directives/${d.id}`}
                            className="text-foreground hover:underline"
                          >
                            {nameOf(d)}
                          </Link>
                        </div>
                      );
                    }
                    // 2+ matches → winner + shadowed
                    const winner = collision?.winner ?? matches[0];
                    const shadowed = collision?.shadowed ?? matches.slice(1);
                    return (
                      <div key={t} className="space-y-1">
                        <div className="rounded border-2 border-emerald-200 bg-white/70 p-2 text-xs">
                          <div className="font-medium text-emerald-900">
                            ✓ {DIRECTIVE_TYPE_LABEL[t]} (winner)
                          </div>
                          <Link
                            href={`/admin/pd/instructions/directives/${winner.id}`}
                            className="text-foreground hover:underline"
                          >
                            {nameOf(winner)}
                          </Link>
                        </div>
                        {shadowed.map((s) => (
                          <div
                            key={s.id}
                            className="rounded border-2 border-amber-200 bg-white/40 p-2 text-xs"
                          >
                            <div className="font-medium text-amber-900">
                              Shadowed — {DIRECTIVE_TYPE_LABEL[t]}
                            </div>
                            <Link
                              href={`/admin/pd/instructions/directives/${s.id}`}
                              className="text-foreground hover:underline"
                            >
                              {nameOf(s)}
                            </Link>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right: how Tomo will behave */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">How Tomo will behave</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Resolving…</p>
          ) : (data?.summaries ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules apply to this profile. Tomo will fall back to default behavior.
            </p>
          ) : (
            <ul className="space-y-2">
              {(data?.summaries ?? []).map((s) => (
                <li key={s.directive_type} className="rounded border bg-background p-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {DIRECTIVE_TYPE_LABEL[s.directive_type] ?? s.directive_type}
                  </div>
                  <p className="mt-1 text-sm">{s.plain_english}</p>
                  <Link
                    href={`/admin/pd/instructions/directives/${s.winner_id}`}
                    className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                  >
                    Source: {s.source_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
