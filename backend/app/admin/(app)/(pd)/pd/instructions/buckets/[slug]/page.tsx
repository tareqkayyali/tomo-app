"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageGuide } from "@/components/admin/PageGuide";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { withFrom } from "@/lib/admin/pdNav";
import { BUCKET_BY_SLUG, type BucketSlug } from "@/lib/admin/methodologyBuckets";
import {
  DIRECTIVE_TYPE_LABEL,
  AUDIENCE_LABEL,
  STATUS_LABEL,
} from "../../_components/directiveLabels";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

interface Doc {
  id: string;
  title: string;
  bucket: BucketSlug | null;
  audience: "athlete" | "coach" | "parent" | "all";
  status: "draft" | "under_review" | "published" | "archived";
  updated_at: string;
}

interface Directive {
  id: string;
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  position_scope: string[];
  mode_scope: string[];
  priority: number;
  payload: Record<string, unknown>;
  source_excerpt: string | null;
  status: "proposed" | "approved" | "published" | "retired";
  updated_at: string;
}

interface LiveSnapshotLite {
  id: string;
  label: string;
  directives: { id: string; directive_type: DirectiveType }[];
}

const STATUS_VARIANT: Record<Directive["status"], "default" | "secondary" | "outline"> = {
  proposed: "secondary",
  approved: "outline",
  published: "default",
  retired: "outline",
};

const DOC_STATUS_LABEL: Record<Doc["status"], string> = {
  draft: "Working copy",
  under_review: "Ready for review",
  published: "Live",
  archived: "Archived",
};

function ruleName(d: Directive): string {
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

function describeScope(d: Directive): string {
  const parts: string[] = [];
  if (d.position_scope.length) parts.push(d.position_scope.join("/"));
  if (d.age_scope.length) parts.push(d.age_scope.join("/"));
  if (d.sport_scope.length) parts.push(d.sport_scope.join("/"));
  if (d.mode_scope.length) parts.push(`mode: ${d.mode_scope.join("/")}`);
  if (parts.length === 0) return d.audience === "all" ? "Everyone" : AUDIENCE_LABEL[d.audience];
  return parts.join(" · ");
}

export default function BucketDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const sp = useSearchParams();
  const from = sp.get("from");
  const trail = sp.get("trail");
  const bucket = BUCKET_BY_SLUG[slug as BucketSlug];

  const [docs, setDocs] = useState<Doc[]>([]);
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [docsRes, dirsRes, liveRes] = await Promise.all([
        fetch("/api/v1/admin/pd/instructions/documents", { credentials: "include" }),
        fetch("/api/v1/admin/pd/instructions/directives", { credentials: "include" }),
        fetch("/api/v1/admin/pd/instructions/snapshots/live", { credentials: "include" }),
      ]);
      if (!docsRes.ok || !dirsRes.ok) throw new Error("Couldn't load bucket data.");
      const allDocs = ((await docsRes.json()).documents ?? []) as Doc[];
      const allDirs = ((await dirsRes.json()).directives ?? []) as Directive[];
      const live: LiveSnapshotLite | null = liveRes.ok
        ? ((await liveRes.json()) as LiveSnapshotLite)
        : null;
      setDocs(allDocs.filter((d) => d.bucket === slug));
      const owned = new Set<DirectiveType>(bucket?.owns ?? []);
      setDirectives(allDirs.filter((d) => owned.has(d.directive_type)));
      const liveSet = new Set<string>();
      for (const d of live?.directives ?? []) {
        if (owned.has(d.directive_type)) liveSet.add(d.id);
      }
      setLiveIds(liveSet);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load this bucket");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (bucket) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const grouped = useMemo(() => {
    const map = new Map<DirectiveType, Directive[]>();
    for (const d of directives) {
      const arr = map.get(d.directive_type);
      if (arr) arr.push(d);
      else map.set(d.directive_type, [d]);
    }
    // Sort each group by status (proposed → approved → published) then priority
    const statusOrder: Record<Directive["status"], number> = {
      proposed: 0,
      approved: 1,
      published: 2,
      retired: 3,
    };
    for (const [k, v] of map) {
      v.sort(
        (a, b) =>
          statusOrder[a.status] - statusOrder[b.status] || a.priority - b.priority,
      );
      map.set(k, v);
    }
    return map;
  }, [directives]);

  if (!bucket) {
    return (
      <div className="space-y-3">
        <Breadcrumbs
          items={[
            { label: "Performance Director", href: "/admin/pd/instructions" },
            { label: "Unknown bucket" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          No bucket with slug &ldquo;{slug}&rdquo;. Try one from the{" "}
          <Link href="/admin/pd/instructions" className="underline">
            overview
          </Link>
          .
        </p>
      </div>
    );
  }

  async function deleteDoc(d: Doc) {
    if (!confirm(`Delete "${d.title}"? Rules already parsed from it stay in your rules list.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/documents/${d.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Document deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  async function deleteRule(d: Directive) {
    if (
      !confirm(
        `Delete this rule?\n\n${DIRECTIVE_TYPE_LABEL[d.directive_type]}: ${ruleName(d)}\n\nIt won't be in any future snapshot.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${d.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Rule deleted");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete");
    }
  }

  const fromSlug = `bucket_${bucket.slug}`;
  const ruleCounts = {
    total: directives.length,
    proposed: directives.filter((d) => d.status === "proposed").length,
    approved: directives.filter((d) => d.status === "approved").length,
    inLive: liveIds.size,
  };

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Performance Director", href: "/admin/pd/instructions" },
          { label: bucket.label },
        ]}
        from={from}
        trail={trail}
      />

      <PageGuide
        summary={bucket.summary}
        details={[
          ...bucket.scope.map((s) => `In scope: ${s}`),
          ...bucket.not_this_bucket.map((s) => `Not this bucket: ${s}`),
        ]}
        impact={`Update cadence: ${bucket.cadence}.`}
        storageKey={`pd-instructions-bucket-${bucket.slug}`}
      />

      <div className="rounded-md border bg-background p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">{bucket.label}</div>
          <div className="text-xs text-muted-foreground">
            {docs.length} document{docs.length === 1 ? "" : "s"} · {ruleCounts.total} rule
            {ruleCounts.total === 1 ? "" : "s"} ({ruleCounts.inLive} in live snapshot)
            {ruleCounts.proposed > 0 && (
              <span className="ml-1 text-amber-700">· {ruleCounts.proposed} waiting for review</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Owns rule types:{" "}
            {bucket.owns.map((t) => DIRECTIVE_TYPE_LABEL[t]).join(", ")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/pd/instructions/library/new?bucket=${bucket.slug}`}
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            + Add methodology
          </Link>
        </div>
      </div>

      {/* Documents */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Methodology documents</h2>
          {docs.length > 0 && (
            <Link
              href={`/admin/pd/instructions/library?bucket=${bucket.slug}`}
              className="text-xs text-blue-700 hover:underline"
            >
              Open in library →
            </Link>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : docs.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No methodology document in this bucket yet.
            </p>
            <Link
              href={`/admin/pd/instructions/library/new?bucket=${bucket.slug}`}
              className="mt-2 inline-flex h-7 items-center rounded border bg-background px-2 text-xs font-medium hover:bg-muted"
            >
              + Add the first methodology
            </Link>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded border bg-background p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={withFrom(`/admin/pd/instructions/library/${d.id}`, fromSlug)}
                      className="text-sm font-medium hover:underline"
                    >
                      {d.title}
                    </Link>
                    <Badge variant="outline" className="text-xs">
                      {DOC_STATUS_LABEL[d.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {AUDIENCE_LABEL[d.audience]}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last edited {new Date(d.updated_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={withFrom(`/admin/pd/instructions/library/${d.id}`, fromSlug)}
                    className="inline-flex h-7 items-center rounded px-2 text-xs font-medium hover:bg-muted"
                  >
                    Edit
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteDoc(d)}
                    className="text-destructive hover:text-destructive"
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rules */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Rules in this bucket</h2>
          {directives.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Grouped by rule type
            </span>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : directives.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">
              No rules in this bucket yet. Add a methodology document and parse it to generate rules.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bucket.owns.map((type) => {
              const items = grouped.get(type) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={type} className="rounded-md border bg-background p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {DIRECTIVE_TYPE_LABEL[type]} ({items.length})
                  </div>
                  <ul className="space-y-1.5">
                    {items.map((d) => {
                      const isLive = liveIds.has(d.id);
                      return (
                        <li
                          key={d.id}
                          className={`rounded border p-2 flex items-start justify-between gap-2 ${
                            isLive ? "border-emerald-200 bg-emerald-50/30" : "bg-background"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={withFrom(
                                  `/admin/pd/instructions/directives/${d.id}`,
                                  fromSlug,
                                )}
                                className="text-sm font-medium hover:underline"
                              >
                                {ruleName(d)}
                              </Link>
                              <Badge
                                variant={STATUS_VARIANT[d.status]}
                                className="text-xs"
                              >
                                {STATUS_LABEL[d.status]}
                              </Badge>
                              {isLive && (
                                <Badge
                                  variant="default"
                                  className="bg-emerald-600 hover:bg-emerald-600 text-xs"
                                >
                                  In live
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {describeScope(d)} · priority {d.priority}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Link
                              href={withFrom(
                                `/admin/pd/instructions/directives/${d.id}`,
                                fromSlug,
                              )}
                              className="inline-flex h-7 items-center rounded px-2 text-xs font-medium hover:bg-muted"
                            >
                              Edit
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteRule(d)}
                              className="text-destructive hover:text-destructive"
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
