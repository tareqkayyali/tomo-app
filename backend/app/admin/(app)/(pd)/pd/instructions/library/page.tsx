"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageGuide } from "@/components/admin/PageGuide";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { withFrom } from "@/lib/admin/pdNav";
import { BUCKET_BY_SLUG, type BucketSlug } from "@/lib/admin/methodologyBuckets";
import { instructionsHelp } from "@/lib/cms-help/instructions";

interface Doc {
  id: string;
  title: string;
  audience: "athlete" | "coach" | "parent" | "all";
  bucket: BucketSlug | null;
  source_format: "markdown" | "pdf" | "docx" | "plain";
  status: "draft" | "under_review" | "published" | "archived";
  updated_at: string;
}

const STATUS_LABEL: Record<Doc["status"], string> = {
  draft: "Working copy",
  under_review: "Ready for review",
  published: "Live",
  archived: "Archived",
};

const STATUS_VARIANT: Record<Doc["status"], "default" | "secondary" | "outline"> = {
  draft: "secondary",
  under_review: "outline",
  published: "default",
  archived: "outline",
};

const AUDIENCE_LABEL: Record<Doc["audience"], string> = {
  athlete: "Athletes",
  coach: "Coaches",
  parent: "Parents",
  all: "Everyone",
};

export default function LibraryPage() {
  const sp = useSearchParams();
  const filterBucket = sp.get("bucket") as BucketSlug | null;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  /** Build the New-document href, forwarding the current bucket filter. */
  const newDocHref = filterBucket
    ? `/admin/pd/instructions/library/new?bucket=${filterBucket}`
    : "/admin/pd/instructions/library/new";

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/pd/instructions/documents", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDocs(data.documents ?? []);
    } catch (err) {
      toast.error("Couldn't load your methodology library");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleDocs = useMemo(() => {
    if (!filterBucket) return docs;
    return docs.filter((d) => d.bucket === filterBucket);
  }, [docs, filterBucket]);

  async function handleDelete(d: Doc) {
    if (
      !confirm(
        `Delete "${d.title}"?\n\nThe document will be removed. Rules already parsed from it stay in your rules list — only the source document is deleted.`,
      )
    ) {
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

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: "Performance Director", href: "/admin/pd/instructions" },
          { label: "Methodology Library" },
        ]}
      />
      <PageGuide {...instructionsHelp.library.page} />

      {filterBucket && BUCKET_BY_SLUG[filterBucket] && (
        <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3 flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="text-blue-900">
            Filtered to bucket:{" "}
            <span className="font-semibold">{BUCKET_BY_SLUG[filterBucket].label}</span> —{" "}
            {visibleDocs.length} document{visibleDocs.length === 1 ? "" : "s"}
          </div>
          <Link
            href="/admin/pd/instructions/library"
            className="text-blue-700 hover:underline font-medium"
          >
            Show all buckets →
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Your methodology documents</h2>
        <Link
          href={newDocHref}
          className={buttonVariants({ variant: "default" })}
        >
          + New document
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visibleDocs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No methodology documents yet. Tap <strong>+ New document</strong> above to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last edited</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDocs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={withFrom(`/admin/pd/instructions/library/${d.id}`, "library")}
                      className="hover:underline"
                    >
                      {d.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.bucket && BUCKET_BY_SLUG[d.bucket] ? (
                      BUCKET_BY_SLUG[d.bucket].label
                    ) : (
                      <span className="italic">No bucket</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {AUDIENCE_LABEL[d.audience]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(d.updated_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={withFrom(`/admin/pd/instructions/library/${d.id}`, "library")}
                        className="inline-flex h-8 items-center rounded px-2 text-sm font-medium hover:bg-muted"
                      >
                        Edit
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(d)}
                        className="text-destructive hover:text-destructive"
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
