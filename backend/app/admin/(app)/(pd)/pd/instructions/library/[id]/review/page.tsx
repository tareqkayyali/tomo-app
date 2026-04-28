"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import {
  DIRECTIVE_TYPE_LABEL,
  AUDIENCE_LABEL,
  STATUS_LABEL,
  SECTIONS,
} from "../../../_components/directiveLabels";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

interface Directive {
  id: string;
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  status: "proposed" | "approved" | "published" | "retired";
  priority: number;
  payload: Record<string, any>;
  source_excerpt: string | null;
  confidence: number | null;
}

export default function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: docId } = use(params);
  const sp = useSearchParams();
  const from = sp.get("from");
  const router = useRouter();
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/admin/pd/instructions/directives?document_id=${docId}&status=proposed`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDirectives(data.directives ?? []);
    } catch {
      toast.error("Couldn't load proposed rules");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [docId]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "approve" }),
      });
      if (!res.ok) throw new Error("Approve failed");
      toast.success("Approved");
      setDirectives((ds) => ds.filter((d) => d.id !== id));
    } catch {
      toast.error("Couldn't approve");
    } finally {
      setBusyId(null);
    }
  }

  async function skip(id: string) {
    if (!confirm("Skip this rule? It will be deleted.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setDirectives((ds) => ds.filter((d) => d.id !== id));
    } catch {
      toast.error("Couldn't skip");
    } finally {
      setBusyId(null);
    }
  }

  async function approveAllInSection(sectionTypes: DirectiveType[]) {
    const targets = directives.filter((d) => sectionTypes.includes(d.directive_type));
    if (targets.length === 0) return;
    if (
      !confirm(`Approve all ${targets.length} rule${targets.length === 1 ? "" : "s"} in this section?`)
    )
      return;
    let ok = 0;
    let fail = 0;
    for (const d of targets) {
      try {
        const res = await fetch(`/api/v1/admin/pd/instructions/directives/${d.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _action: "approve" }),
        });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    if (ok > 0) toast.success(`Approved ${ok}${fail > 0 ? ` (${fail} failed)` : ""}`);
    else toast.error("Couldn't approve any");
    load();
  }

  const grouped = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        items: directives.filter((d) => s.types.includes(d.directive_type)),
      })),
    [directives],
  );

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Performance Director", href: "/admin/pd/instructions" },
          { label: "Methodology Library", href: "/admin/pd/instructions/library" },
          { label: "Document", href: `/admin/pd/instructions/library/${docId}` },
          { label: "Review parsed rules" },
        ]}
        from={from}
      />
      <div className="flex items-center justify-end">
        <Button variant="outline" onClick={() => router.push(`/admin/pd/instructions/library/${docId}`)}>
          ← Back to document
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/30 px-5 py-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tomo read your methodology and pulled out these rules. Approve the ones you want to keep,
          edit the ones that need refining, and skip anything that doesn't fit. Approved rules go
          live the next time you publish a snapshot.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : directives.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No rules waiting for your review. Either you've reviewed them all, or this document
            hasn't been parsed yet.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(
            (s) =>
              s.items.length > 0 && (
                <section key={s.label} className={`rounded-lg border p-4 ${s.accent}`}>
                  <header className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{s.label}</h3>
                      <p className="text-xs text-muted-foreground">
                        {s.items.length} rule{s.items.length === 1 ? "" : "s"} waiting for review.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => approveAllInSection(s.types)}
                    >
                      Approve all in this section
                    </Button>
                  </header>

                  <ul className="space-y-2">
                    {s.items.map((d) => (
                      <li key={d.id} className="rounded border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {DIRECTIVE_TYPE_LABEL[d.directive_type]}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {STATUS_LABEL[d.status]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {AUDIENCE_LABEL[d.audience]}
                                {d.age_scope.length > 0 && ` · ${d.age_scope.join(", ")}`}
                                {d.sport_scope.length > 0 && ` · ${d.sport_scope.join(", ")}`}
                              </span>
                              {typeof d.confidence === "number" && d.confidence < 0.6 && (
                                <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                                  Needs your attention
                                </Badge>
                              )}
                            </div>
                            {d.source_excerpt && (
                              <p className="mt-1 text-xs italic text-muted-foreground line-clamp-3">
                                "{d.source_excerpt}"
                              </p>
                            )}
                            <PayloadPreview payload={d.payload} />
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => approve(d.id)}
                              disabled={busyId === d.id}
                            >
                              Approve
                            </Button>
                            <Link
                              href={`/admin/pd/instructions/directives/${d.id}`}
                              className="inline-flex h-8 items-center justify-center rounded border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
                            >
                              Edit
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => skip(d.id)}
                              disabled={busyId === d.id}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              Skip
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
        </div>
      )}
    </div>
  );
}

/** Renders a 1–2 line plain-English preview of the payload — no JSON. */
function PayloadPreview({ payload }: { payload: Record<string, any> }) {
  const lines: string[] = [];
  // Identity
  if (payload.persona_name) lines.push(`Persona: "${payload.persona_name}".`);
  if (payload.voice_attributes?.length)
    lines.push(`Voice: ${payload.voice_attributes.slice(0, 5).join(", ")}.`);
  // Tone
  if (payload.banned_phrases?.length)
    lines.push(`Banned: ${payload.banned_phrases.slice(0, 3).join(", ")}${payload.banned_phrases.length > 3 ? "…" : ""}.`);
  // PHV / load / safety
  if (payload.blocked_exercises?.length)
    lines.push(`Blocks: ${payload.blocked_exercises.slice(0, 3).join(", ")}${payload.blocked_exercises.length > 3 ? "…" : ""}.`);
  if (payload.advisory_or_blocking)
    lines.push(`Severity: ${payload.advisory_or_blocking}.`);
  if (payload.consecutive_hard_day_limit)
    lines.push(`Max ${payload.consecutive_hard_day_limit} hard days in a row.`);
  if (payload.recovery_gap_hours)
    lines.push(`${payload.recovery_gap_hours}h recovery gap.`);
  // Threshold
  if (payload.metric_name && payload.zone_boundaries) {
    const zb = payload.zone_boundaries;
    lines.push(
      `${payload.metric_name}: green ${zb.green?.[0]}–${zb.green?.[1]}, yellow ${zb.yellow?.[0]}–${zb.yellow?.[1]}, red ${zb.red?.[0]}–${zb.red?.[1]}.`,
    );
  }
  // Routing
  if (payload.intent_id) lines.push(`Intent: ${payload.intent_id} → ${payload.response_pattern ?? ""}.`);
  // Recommendation
  if (payload.blocked_categories?.length)
    lines.push(`Blocked categories: ${payload.blocked_categories.slice(0, 3).join(", ")}.`);
  if (payload.mandatory_categories?.length)
    lines.push(`Always include: ${payload.mandatory_categories.slice(0, 3).join(", ")}.`);
  // Escalation
  if (payload.target_audience && payload.notification_template)
    lines.push(`Alerts ${payload.target_audience}.`);
  // Mode
  if (payload.mode_name) lines.push(`Mode "${payload.mode_name}".`);

  if (lines.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {lines.slice(0, 3).join(" ")}
    </p>
  );
}
