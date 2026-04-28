"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageGuide } from "@/components/admin/PageGuide";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { withFrom } from "@/lib/admin/pdNav";
import {
  DIRECTIVE_TYPE_LABEL,
  AUDIENCE_LABEL,
} from "../_components/directiveLabels";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

interface CollisionDirective {
  id: string;
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  priority: number;
  payload: Record<string, unknown>;
  source_excerpt: string | null;
  status: "proposed" | "approved" | "published" | "retired";
  updated_at: string;
}

interface Collision {
  group_key: string;
  directive_type: DirectiveType;
  audience: CollisionDirective["audience"];
  scope_summary: string;
  resolution: "shadow" | "stack";
  note: string;
  winner: CollisionDirective;
  shadowed: CollisionDirective[];
}

function nameOf(d: CollisionDirective): string {
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

export default function ConflictsPage() {
  const sp = useSearchParams();
  const from = sp.get("from");
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/pd/instructions/conflicts", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCollisions((data.collisions ?? []) as Collision[]);
    } catch {
      toast.error("Couldn't load conflicts");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function promote(target: CollisionDirective, winner: CollisionDirective) {
    if (winner.priority <= 0) {
      toast.error(
        "The winning rule is already at the top priority. Raise its priority first, or change scope to give this rule its own lane.",
      );
      return;
    }
    setBusyId(target.id);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${target.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: winner.priority - 1,
          change_reason: "promoted from conflicts page",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Promoted. This rule now wins.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't promote");
    } finally {
      setBusyId(null);
    }
  }

  const shadows = collisions.filter((c) => c.resolution === "shadow");
  const stacks = collisions.filter((c) => c.resolution === "stack");

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Performance Director", href: "/admin/pd/instructions" },
          { label: "Snapshots", href: "/admin/pd/instructions/snapshots" },
          { label: "Conflicts" },
        ]}
        from={from}
      />
      <PageGuide
        summary="Some rules apply on their own; some compete; some stack. This page tells you which is which for every group of overlapping rules in your draft set, so nothing slips through unseen."
        details={[
          "Real conflicts: same type + same scope, and the runtime can only apply one. The lower-priority rule(s) are silently dropped — you'll see them in red below.",
          "Stacked rules: same type + same scope, and the runtime applies all of them (e.g. dashboard cards, alerts, programs rules). No fix needed — shown for visibility only.",
          "Promoting a shadowed rule sets its priority just below the current winner — making it the new winner.",
          "If you want two competing rules to coexist, tighten one rule's scope (e.g. give one a position).",
        ]}
        impact="Shadowed rules don't reach a single athlete. Resolve every red conflict before publishing."
        warning="This page checks rules in your draft set (approved + live). Proposed rules waiting for review are not included."
        storageKey="pd-instructions-conflicts"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shadows.length === 0 && stacks.length === 0 ? (
        <div className="rounded-md border bg-emerald-50/50 border-emerald-200 p-6 text-center">
          <div className="text-base font-medium text-emerald-900">
            No conflicts. Every approved rule has a clean lane.
          </div>
          <div className="mt-1 text-sm text-emerald-800/80">
            Every rule in your draft set will reach the athletes it&rsquo;s scoped to.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {shadows.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">
                Real conflicts ({shadows.length}) — resolve before publishing
              </h2>
              <ul className="space-y-4">
                {shadows.map((c) => {
                  const total = c.shadowed.length + 1;
                  return (
                    <li
                      key={c.group_key}
                      className="rounded-md border-2 border-amber-200 bg-amber-50/30 p-4 space-y-3"
                    >
                      <div>
                        <h3 className="text-sm font-semibold">
                          {DIRECTIVE_TYPE_LABEL[c.directive_type] ?? c.directive_type}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {total} rules compete for: {c.scope_summary}{" "}
                          <span className="text-muted-foreground/70">
                            · audience: {AUDIENCE_LABEL[c.audience]}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-amber-900/80">{c.note}</p>
                      </div>

                      <div className="rounded border-2 border-emerald-200 bg-emerald-50/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="default"
                                className="bg-emerald-600 hover:bg-emerald-600"
                              >
                                Winner
                              </Badge>
                              <span className="text-sm font-medium truncate">
                                {nameOf(c.winner)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Priority {c.winner.priority} · status {c.winner.status}
                            </div>
                          </div>
                          <Link
                            href={withFrom(`/admin/pd/instructions/directives/${c.winner.id}`, "conflicts", from)}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            Edit
                          </Link>
                        </div>
                      </div>

                      <ul className="space-y-2">
                        {c.shadowed.map((s) => (
                          <li
                            key={s.id}
                            className="rounded border-2 border-amber-300 bg-white p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="border-amber-400 text-amber-900"
                                  >
                                    Shadowed
                                  </Badge>
                                  <span className="text-sm font-medium truncate">{nameOf(s)}</span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Priority {s.priority} · status {s.status}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={withFrom(`/admin/pd/instructions/directives/${s.id}`, "conflicts", from)}
                                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                                >
                                  Edit
                                </Link>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => promote(s, c.winner)}
                                  disabled={busyId === s.id || c.winner.priority <= 0}
                                  title={
                                    c.winner.priority <= 0
                                      ? "Winner already at top priority — raise it first, or change scope."
                                      : ""
                                  }
                                >
                                  {busyId === s.id ? "…" : "Promote this rule"}
                                </Button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {stacks.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">
                Stacked rules ({stacks.length}) — all apply, nothing to fix
              </h2>
              <p className="text-xs text-muted-foreground">
                These rule types are additive. The runtime evaluates every matching rule
                independently — there&rsquo;s no winner and no shadow. Listed here for visibility.
              </p>
              <ul className="space-y-3">
                {stacks.map((c) => {
                  const total = c.shadowed.length + 1;
                  const all = [c.winner, ...c.shadowed];
                  return (
                    <li
                      key={c.group_key}
                      className="rounded-md border-2 border-emerald-200 bg-emerald-50/40 p-4 space-y-2"
                    >
                      <div>
                        <h3 className="text-sm font-semibold">
                          {DIRECTIVE_TYPE_LABEL[c.directive_type] ?? c.directive_type}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {total} rules stack for: {c.scope_summary}{" "}
                          <span className="text-muted-foreground/70">
                            · audience: {AUDIENCE_LABEL[c.audience]}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-emerald-900/80">{c.note}</p>
                      </div>
                      <ul className="grid sm:grid-cols-2 gap-2">
                        {all.map((d) => (
                          <li
                            key={d.id}
                            className="rounded border bg-white px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate">{nameOf(d)}</span>
                            <Link
                              href={withFrom(`/admin/pd/instructions/directives/${d.id}`, "conflicts", from)}
                              className="text-blue-700 hover:underline shrink-0"
                            >
                              Edit
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
