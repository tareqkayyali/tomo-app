"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageGuide } from "@/components/admin/PageGuide";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { withFrom } from "@/lib/admin/pdNav";
import {
  DIRECTIVE_TYPE_LABEL,
  AUDIENCE_LABEL,
  SECTIONS,
} from "../../_components/directiveLabels";
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

interface SnapshotResponse {
  id: string;
  label: string;
  notes: string | null;
  directive_count: number;
  is_live: boolean;
  published_at: string;
  retired_at: string | null;
  directives: ResolvedDirective[];
}

function nameOf(d: ResolvedDirective): string {
  const p = d.payload ?? {};
  const candidate =
    (typeof p.name === "string" && p.name) ||
    (typeof p.title === "string" && p.title) ||
    (typeof p.label === "string" && p.label);
  if (candidate) return candidate as string;
  if (d.source_excerpt) {
    const t = d.source_excerpt.trim();
    return t.length > 80 ? `${t.slice(0, 80)}…` : t;
  }
  return "(unnamed rule)";
}

function describeScope(d: ResolvedDirective): string {
  const parts: string[] = [];
  if (d.position_scope.length) parts.push(d.position_scope.join("/"));
  if (d.age_scope.length) parts.push(d.age_scope.join("/"));
  if (d.sport_scope.length) parts.push(d.sport_scope.join("/"));
  if (d.phv_scope.length) parts.push(`(${d.phv_scope.join("/")})`);
  if (d.mode_scope.length) parts.push(`mode: ${d.mode_scope.join("/")}`);
  if (parts.length === 0) return d.audience === "all" ? "Everyone" : AUDIENCE_LABEL[d.audience];
  return parts.join(" · ");
}

export default function SnapshotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const sp = useSearchParams();
  const from = sp.get("from");
  const trail = sp.get("trail");

  const [snap, setSnap] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/admin/pd/instructions/snapshots/${id}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as SnapshotResponse;
        if (!cancelled) setSnap(data);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Couldn't load snapshot");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const grouped = useMemo(() => {
    const all = snap?.directives ?? [];
    return SECTIONS.map((section) => ({
      ...section,
      items: all.filter((d) => section.types.includes(d.directive_type)),
    }));
  }, [snap]);

  const breadcrumbLabel = snap ? snap.label : id === "live" ? "Live snapshot" : "Snapshot";

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Performance Director", href: "/admin/pd/instructions" },
          { label: "Snapshots", href: "/admin/pd/instructions/snapshots" },
          { label: breadcrumbLabel },
        ]}
        from={from}
        trail={trail}
      />

      <PageGuide
        summary="Everything in this snapshot — read-only. This is exactly the rule set the runtime sees (or saw, for retired snapshots). Click any rule to view its current state in your editable rules list."
        details={[
          "Snapshots are immutable: edits to a rule won't retroactively change a snapshot. Editing a rule only affects future snapshots.",
          "Use the dry-run preview to see how this snapshot behaves for a specific athlete.",
        ]}
        impact="If you spot something wrong here on the live snapshot, fix the rule, then publish a new snapshot — rollback gets you back if needed."
        storageKey="pd-instructions-snapshot-detail"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !snap ? (
        <p className="text-sm text-muted-foreground">Snapshot not found.</p>
      ) : (
        <>
          <div className="rounded-md border bg-background p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{snap.label}</span>
                {snap.is_live && <Badge variant="default">Live</Badge>}
                {snap.retired_at && !snap.is_live && (
                  <Badge variant="outline" className="text-xs">
                    Retired
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {snap.directive_count} rule{snap.directive_count === 1 ? "" : "s"} · published{" "}
                {new Date(snap.published_at).toLocaleString()}
                {snap.retired_at && (
                  <> · retired {new Date(snap.retired_at).toLocaleString()}</>
                )}
              </div>
              {snap.notes && (
                <p className="text-xs italic text-muted-foreground">{snap.notes}</p>
              )}
            </div>
            <Link
              href={withFrom(
                `/admin/pd/instructions/snapshots/${id}/preview`,
                "snapshots",
              )}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Try in dry-run →
            </Link>
          </div>

          <div className="space-y-4">
            {grouped.map((section) => (
              <section
                key={section.label}
                className={`rounded-lg border p-4 ${section.accent}`}
              >
                <header className="mb-3">
                  <h3 className="text-sm font-semibold">{section.label}</h3>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </header>
                {section.items.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">
                    No rules in this category.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {section.items.map((d) => (
                      <li
                        key={d.id}
                        className="rounded border bg-background p-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {DIRECTIVE_TYPE_LABEL[d.directive_type]}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {describeScope(d)}
                            </span>
                            <span className="text-xs text-muted-foreground/70">
                              · priority {d.priority}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{nameOf(d)}</p>
                        </div>
                        <Link
                          href={withFrom(
                            `/admin/pd/instructions/directives/${d.id}`,
                            "snapshots",
                          )}
                          className="inline-flex h-7 items-center rounded px-2 text-xs font-medium hover:bg-muted shrink-0"
                        >
                          View rule →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
