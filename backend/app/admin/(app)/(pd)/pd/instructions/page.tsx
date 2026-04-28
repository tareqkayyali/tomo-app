"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageGuide } from "@/components/admin/PageGuide";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { withFrom } from "@/lib/admin/pdNav";
import {
  BUCKETS,
  BUCKET_FOR_TYPE,
  type Bucket,
  type BucketSlug,
} from "@/lib/admin/methodologyBuckets";
import { instructionsHelp } from "@/lib/cms-help/instructions";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

interface DocLite {
  id: string;
  bucket: BucketSlug | null;
  status: "draft" | "under_review" | "published" | "archived";
  updated_at: string;
}

interface DirectiveLite {
  id: string;
  directive_type: DirectiveType;
  status: "proposed" | "approved" | "published" | "retired";
}

interface LiveSnapshotLite {
  id: string;
  label: string;
  published_at: string;
  directives: { directive_type: DirectiveType }[];
}

interface BucketStatus {
  bucket: Bucket;
  /** Methodology docs in this bucket. */
  doc_total: number;
  doc_draft: number;
  doc_published: number;
  doc_latest_updated_at: string | null;
  /** Rules currently in the draft set (approved + published) for this bucket. */
  rules_in_draft: number;
  rules_proposed: number;
  /** Rules currently live in the snapshot for this bucket. */
  rules_in_live: number;
}

function classifyBucket(slug: BucketSlug, docs: DocLite[], dirs: DirectiveLite[], liveDirs: { directive_type: DirectiveType }[]): BucketStatus {
  const bucket = BUCKETS.find((b) => b.slug === slug)!;
  const docsForBucket = docs.filter((d) => d.bucket === slug);
  const dirsForBucket = dirs.filter((d) => BUCKET_FOR_TYPE[d.directive_type] === slug);
  const liveDirsForBucket = liveDirs.filter((d) => BUCKET_FOR_TYPE[d.directive_type] === slug);
  const latest = docsForBucket
    .map((d) => d.updated_at)
    .sort()
    .reverse()[0] ?? null;
  return {
    bucket,
    doc_total: docsForBucket.length,
    doc_draft: docsForBucket.filter((d) => d.status === "draft").length,
    doc_published: docsForBucket.filter((d) => d.status === "published").length,
    doc_latest_updated_at: latest,
    rules_in_draft: dirsForBucket.filter(
      (d) => d.status === "approved" || d.status === "published",
    ).length,
    rules_proposed: dirsForBucket.filter((d) => d.status === "proposed").length,
    rules_in_live: liveDirsForBucket.length,
  };
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

export default function InstructionsOverviewPage() {
  const [statuses, setStatuses] = useState<BucketStatus[] | null>(null);
  const [liveSnap, setLiveSnap] = useState<LiveSnapshotLite | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [docsRes, dirsRes, liveRes] = await Promise.all([
          fetch("/api/v1/admin/pd/instructions/documents", { credentials: "include" }),
          fetch("/api/v1/admin/pd/instructions/directives", { credentials: "include" }),
          fetch("/api/v1/admin/pd/instructions/snapshots/live", { credentials: "include" }),
        ]);
        if (!docsRes.ok || !dirsRes.ok) {
          throw new Error("Failed to load methodology library or rules.");
        }
        const docs = ((await docsRes.json()).documents ?? []) as DocLite[];
        const dirs = ((await dirsRes.json()).directives ?? []) as DirectiveLite[];
        const live: LiveSnapshotLite | null = liveRes.ok
          ? ((await liveRes.json()) as LiveSnapshotLite)
          : null;
        const liveDirs = live?.directives ?? [];
        if (!cancelled) {
          setLiveSnap(live);
          setStatuses(BUCKETS.map((b) => classifyBucket(b.slug, docs, dirs, liveDirs)));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (!statuses) return null;
    return {
      bucketsWithDocs: statuses.filter((s) => s.doc_total > 0).length,
      bucketsLive: statuses.filter((s) => s.rules_in_live > 0).length,
      bucketsEmpty: statuses.filter((s) => s.doc_total === 0 && s.rules_in_draft === 0).length,
      ruleProposed: statuses.reduce((acc, s) => acc + s.rules_proposed, 0),
    };
  }, [statuses]);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Performance Director" }]} />
      <PageGuide {...instructionsHelp.hub.page} />

      {/* Snapshot status strip */}
      <div className="rounded-md border bg-background p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">
            {liveSnap ? (
              <>
                Live snapshot:{" "}
                <Link
                  href={`/admin/pd/instructions/snapshots/${liveSnap.id}`}
                  className="text-blue-700 hover:underline"
                >
                  {liveSnap.label}
                </Link>
              </>
            ) : (
              "No snapshot live yet — author your first methodology below"
            )}
          </div>
          {liveSnap && (
            <div className="text-xs text-muted-foreground">
              {liveSnap.directives.length} rule{liveSnap.directives.length === 1 ? "" : "s"} ·
              published {new Date(liveSnap.published_at).toLocaleDateString()} ·{" "}
              {totals?.bucketsLive ?? 0} of 14 buckets active
            </div>
          )}
          {totals && totals.ruleProposed > 0 && (
            <div className="text-xs text-amber-700">
              {totals.ruleProposed} rule{totals.ruleProposed === 1 ? "" : "s"} waiting for your review
            </div>
          )}
        </div>
        <Link
          href="/admin/pd/instructions/snapshots"
          className="text-xs underline text-blue-700 hover:text-blue-900"
        >
          Manage snapshots →
        </Link>
      </div>

      {/* Bucket dashboard */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold">Methodology buckets</h2>
            <p className="text-sm text-muted-foreground">
              14 buckets cover the full Tomo experience. Each bucket is its own methodology document
              that evolves over time. {totals && (
                <>
                  <span className="font-medium">{totals.bucketsWithDocs}</span> drafted ·{" "}
                  <span className="font-medium">{totals.bucketsLive}</span> active in live ·{" "}
                  <span className="font-medium">{totals.bucketsEmpty}</span> empty
                </>
              )}
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!statuses ? (
          <p className="text-sm text-muted-foreground">Loading bucket status…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {statuses.map((s) => (
              <BucketCard key={s.bucket.slug} status={s} />
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/admin/pd/instructions/library"
          className="rounded-lg border bg-background p-4 transition-shadow hover:shadow-sm"
        >
          <div className="text-sm font-semibold">All methodology documents</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Open the full library, including legacy free-form docs.
          </p>
        </Link>
        <Link
          href="/admin/pd/instructions/directives"
          className="rounded-lg border bg-background p-4 transition-shadow hover:shadow-sm"
        >
          <div className="text-sm font-semibold">All rules</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Review and approve the typed rules Tomo follows.
          </p>
        </Link>
        <Link
          href="/admin/pd/instructions/conflicts"
          className="rounded-lg border bg-background p-4 transition-shadow hover:shadow-sm"
        >
          <div className="text-sm font-semibold">Conflicts</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Check shadowed and stacking rules across buckets.
          </p>
        </Link>
      </div>
    </div>
  );
}

function BucketCard({ status }: { status: BucketStatus }) {
  const { bucket } = status;
  const tone =
    status.rules_in_live > 0
      ? "border-emerald-300 bg-emerald-50/50"
      : status.doc_total > 0 || status.rules_in_draft > 0
        ? "border-amber-300 bg-amber-50/50"
        : "border-dashed border-muted bg-muted/20";

  return (
    <div className={`rounded-lg border-2 p-4 space-y-3 transition-shadow hover:shadow-sm ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{bucket.label}</div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{bucket.summary}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Docs</dt>
          <dd className="font-medium">
            {status.doc_total}
            {status.doc_draft > 0 && (
              <span className="ml-1 text-amber-700">· {status.doc_draft} draft</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rules</dt>
          <dd className="font-medium">
            {status.rules_in_draft}
            {status.rules_proposed > 0 && (
              <span className="ml-1 text-amber-700">· {status.rules_proposed} review</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">In live</dt>
          <dd className={`font-medium ${status.rules_in_live > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
            {status.rules_in_live}
          </dd>
        </div>
      </dl>

      <div className="text-xs text-muted-foreground">
        Cadence: {bucket.cadence}
        {status.doc_latest_updated_at && (
          <> · last edited {formatDate(status.doc_latest_updated_at)}</>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {status.doc_total > 0 ? (
          <Link
            href={withFrom(
              `/admin/pd/instructions/library?bucket=${bucket.slug}`,
              "library",
            )}
            className="inline-flex h-7 items-center rounded border bg-background px-2 text-xs font-medium hover:bg-muted"
          >
            Open methodology
          </Link>
        ) : null}
        <Link
          href={`/admin/pd/instructions/library?bucket=${bucket.slug}&create=1`}
          className="inline-flex h-7 items-center rounded border bg-background px-2 text-xs font-medium hover:bg-muted"
        >
          {status.doc_total === 0 ? "+ Add methodology" : "+ New doc"}
        </Link>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BucketStatus }) {
  if (status.rules_in_live > 0) {
    return (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 shrink-0">
        Active in live
      </Badge>
    );
  }
  if (status.rules_in_draft > 0) {
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-900 shrink-0">
        Approved · not live
      </Badge>
    );
  }
  if (status.doc_total > 0) {
    return (
      <Badge variant="secondary" className="shrink-0">
        Drafted
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-dashed text-muted-foreground shrink-0">
      Empty
    </Badge>
  );
}
