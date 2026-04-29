"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { PageGuide } from "@/components/admin/PageGuide";
import { instructionsHelp } from "@/lib/cms-help/instructions";
import { withFrom } from "@/lib/admin/pdNav";
import {
  BUCKETS,
  BUCKET_BY_SLUG,
  type BucketSlug,
} from "@/lib/admin/methodologyBuckets";

type Audience = "athlete" | "coach" | "parent" | "all";

export default function NewMethodologyDocumentPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialBucket = (sp.get("bucket") as BucketSlug | null) ?? "";
  const from = sp.get("from");
  const trail = sp.get("trail");

  const [title, setTitle] = useState("");
  const [bucket, setBucket] = useState<BucketSlug | "">(initialBucket);
  const [audience, setAudience] = useState<Audience>("all");
  const [sourceText, setSourceText] = useState("");
  const [saving, setSaving] = useState(false);
  /** Has the PD typed in source text yet? Once they have, we stop overwriting
   *  it when they switch bucket (don't clobber their work). */
  const [sourceDirty, setSourceDirty] = useState(false);

  // Pre-fill the starter template when a bucket is initially set via URL.
  useEffect(() => {
    if (initialBucket && BUCKET_BY_SLUG[initialBucket] && !sourceText) {
      setSourceText(BUCKET_BY_SLUG[initialBucket].starter_template);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleBucketChange(slug: BucketSlug | "") {
    setBucket(slug);
    if (!sourceDirty && slug && BUCKET_BY_SLUG[slug]) {
      setSourceText(BUCKET_BY_SLUG[slug].starter_template);
    }
  }

  function handleSourceChange(value: string) {
    setSourceText(value);
    setSourceDirty(true);
  }

  const selectedBucket = bucket && BUCKET_BY_SLUG[bucket as BucketSlug];

  const breadcrumbItems = useMemo(
    () => [
      { label: "Performance Director", href: "/admin/pd/instructions" },
      { label: "Methodology Library", href: "/admin/pd/instructions/library" },
      { label: "New document" },
    ],
    [],
  );

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("Please give your document a title.");
      return;
    }
    if (!sourceText.trim()) {
      toast.error("Add some methodology text — even a paragraph is fine to start.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/pd/instructions/documents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          audience,
          bucket: bucket || null,
          source_format: "markdown",
          source_text: sourceText,
          status: "draft",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detailString =
          typeof err?.detail === "string"
            ? err.detail
            : err?.details && typeof err.details === "object"
              ? JSON.stringify(err.details)
              : "";
        const message =
          (typeof err?.error === "string" && err.error) ||
          detailString ||
          `Save failed (status ${res.status})`;
        throw new Error(message);
      }
      const created = await res.json();
      toast.success("Document created. Opening the editor…");
      router.push(`/admin/pd/instructions/library/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create document");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    router.push("/admin/pd/instructions/library");
  }

  return (
    <div className="space-y-5">
      <Breadcrumbs items={breadcrumbItems} from={from} trail={trail} />

      <PageGuide
        summary="Create a new methodology document. Pick a bucket so the parser only emits rules in that bucket — keeps your library clean and avoids cross-bucket conflicts."
        details={[
          "Title is for your library — call it whatever helps you find it later.",
          "Bucket is optional but strongly recommended. Each bucket comes with a starter prose template you can edit.",
          "Audience determines who the rules in this document apply to by default — athletes, coaches, parents, or everyone.",
          "Status starts as 'Working copy' (draft) — nothing goes live until you publish a snapshot.",
        ]}
        impact="Once saved, the document opens in the editor where you can refine the text and run the parser to extract rules."
        storageKey="pd-instructions-library-new"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Main column */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Tomo Coaching Methodology v1"
            />
            <FieldGuide {...instructionsHelp.document_editor.fields!.title!} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source_text">Your methodology</Label>
            <Textarea
              id="source_text"
              value={sourceText}
              onChange={(e) => handleSourceChange(e.target.value)}
              rows={20}
              placeholder={`Write or paste your methodology in plain language.\n\nFor example:\n\nTomo speaks like a steady, knowledgeable coach. Never use phrases like "great effort" or "fantastic work".\n\nFor athletes going through a growth spurt, never recommend max-effort lifts or depth jumps...`}
              className="font-mono text-xs"
            />
            <FieldGuide {...instructionsHelp.document_editor.fields!.source_text!} />
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="rounded-md border bg-background p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bucket">Bucket</Label>
              <Select
                value={bucket || "__none"}
                onValueChange={(v) =>
                  handleBucketChange(v === "__none" ? "" : (v as BucketSlug))
                }
              >
                <SelectTrigger id="bucket">
                  <SelectValue placeholder="Pick a bucket (recommended)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">
                    No bucket (legacy free-form)
                  </SelectItem>
                  {BUCKETS.map((b) => (
                    <SelectItem key={b.slug} value={b.slug}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBucket && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {selectedBucket.summary}
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      What this bucket covers
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-muted-foreground">
                      {selectedBucket.scope.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                    {selectedBucket.not_this_bucket.length > 0 && (
                      <>
                        <p className="mt-2 text-muted-foreground italic">Not this bucket:</p>
                        <ul className="mt-0.5 space-y-0.5 list-disc list-inside text-muted-foreground">
                          {selectedBucket.not_this_bucket.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </details>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audience">Who does this affect?</Label>
              <Select
                value={audience}
                onValueChange={(v) => setAudience(v as Audience)}
              >
                <SelectTrigger id="audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="athlete">Athletes only</SelectItem>
                  <SelectItem value="coach">Coaches only</SelectItem>
                  <SelectItem value="parent">Parents only</SelectItem>
                </SelectContent>
              </Select>
              <FieldGuide {...instructionsHelp.document_editor.fields!.audience!} />
            </div>

            <div className="text-xs text-muted-foreground">
              Status starts as <span className="font-medium">Working copy</span> — change it
              after saving from the editor.
            </div>
          </div>

          <div className="rounded-md border bg-background p-4 space-y-2">
            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? "Saving…" : "Create document"}
            </Button>
            <Button
              variant="ghost"
              onClick={handleCancel}
              disabled={saving}
              className="w-full"
            >
              Cancel
            </Button>
            <p className="text-xs text-muted-foreground">
              Or jump straight to{" "}
              <Link
                href={withFrom("/admin/pd/instructions/library", "library")}
                className="underline hover:text-foreground"
              >
                the library
              </Link>{" "}
              to pick an existing document.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
