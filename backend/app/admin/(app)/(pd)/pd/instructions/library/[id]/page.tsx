"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageGuide } from "@/components/admin/PageGuide";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { instructionsHelp } from "@/lib/cms-help/instructions";

interface Doc {
  id: string;
  title: string;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  source_format: "markdown" | "pdf" | "docx" | "plain";
  source_text: string | null;
  source_file_url: string | null;
  status: "draft" | "under_review" | "published" | "archived";
  version: number;
  updated_at: string;
}

const STATUS_LABEL: Record<Doc["status"], string> = {
  draft: "Working copy",
  under_review: "Ready for review",
  published: "Live",
  archived: "Archived",
};

export default function DocumentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Editable fields
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<Doc["audience"]>("all");
  const [sourceText, setSourceText] = useState("");
  const [status, setStatus] = useState<Doc["status"]>("draft");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/documents/${id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Document not found");
          router.push("/admin/pd/instructions/library");
          return;
        }
        throw new Error(await res.text());
      }
      const data: Doc = await res.json();
      setDoc(data);
      setTitle(data.title);
      setAudience(data.audience);
      setSourceText(data.source_text ?? "");
      setStatus(data.status);
      setDirty(false);
    } catch (err) {
      toast.error("Couldn't load this document");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Mark dirty when any field changes from saved value
  useEffect(() => {
    if (!doc) return;
    const isDirty =
      title !== doc.title ||
      audience !== doc.audience ||
      sourceText !== (doc.source_text ?? "") ||
      status !== doc.status;
    setDirty(isDirty);
  }, [doc, title, audience, sourceText, status]);

  async function save() {
    if (!doc) return;
    if (!title.trim()) {
      toast.error("Title can't be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/documents/${doc.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          audience,
          source_format: "markdown",
          source_text: sourceText,
          status,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Save failed");
      }
      const updated: Doc = await res.json();
      setDoc(updated);
      setDirty(false);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc() {
    if (!doc) return;
    if (!confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/documents/${doc.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Deleted");
      router.push("/admin/pd/instructions/library");
    } catch (err) {
      toast.error("Couldn't delete");
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!doc) return null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb-ish header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/admin/pd/instructions/library"
            className="text-muted-foreground hover:text-foreground"
          >
            Methodology Library
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{doc.title}</span>
          <Badge variant={status === "published" ? "default" : "secondary"} className="ml-2">
            {STATUS_LABEL[status]}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600">Unsaved changes</span>
          )}
          <Button variant="ghost" onClick={() => load()} disabled={saving || !dirty}>
            Discard
          </Button>
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <PageGuide {...instructionsHelp.document_editor.page} />

      {/* Edit grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Main editor column */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source_text">Methodology</Label>
            <Textarea
              id="source_text"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              rows={24}
              className="font-mono text-sm leading-relaxed"
              placeholder="Write or paste your methodology in plain language…"
            />
            <FieldGuide {...instructionsHelp.document_editor.fields!.source_text!} />
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="rounded-md border bg-background p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="audience">Who does this document affect?</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Doc["audience"])}>
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

            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Doc["status"])}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Working copy</SelectItem>
                  <SelectItem value="under_review">Ready for review</SelectItem>
                  <SelectItem value="published">Live</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <FieldGuide {...instructionsHelp.document_editor.fields!.status!} />
            </div>
          </div>

          <ParsePanel doc={doc} dirty={dirty} />

          <Link
            href={`/admin/pd/instructions/directives/new?document_id=${doc.id}`}
            className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            + Hand-author a rule for this document
          </Link>

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={deleteDoc}
          >
            Delete this document
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ParsePanel ─────────────────────────────────────────────────────────────

interface ParseResponse {
  raw_count: number;
  persisted: number;
  duplicates_skipped: number;
  validation_errors: { directive_type?: string; source_excerpt?: string; message: string }[];
  cost_usd: number;
  latency_ms: number;
}

function ParsePanel({ doc, dirty }: { doc: Doc; dirty: boolean }) {
  const router = useRouter();
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);

  async function runParse() {
    if (dirty) {
      toast.error("Save your changes before parsing — the parser reads the saved version.");
      return;
    }
    if (!doc.source_text || doc.source_text.trim().length < 30) {
      toast.error("Add some methodology text first — even a paragraph is fine.");
      return;
    }

    setParsing(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/admin/pd/instructions/parse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: doc.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? err.detail ?? "Parsing failed");
      }
      const data: ParseResponse = await res.json();
      setResult(data);
      if (data.persisted > 0) {
        toast.success(`Found ${data.persisted} rule${data.persisted === 1 ? "" : "s"}.`);
      } else if (data.raw_count === 0) {
        toast("No new rules found in this document.");
      } else {
        toast.success("Done — see the results below.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't parse the document");
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="rounded-md border bg-background p-4 space-y-3">
      <div className="text-sm font-medium">Turn this into rules</div>
      <p className="text-xs text-muted-foreground">
        Tomo will read your methodology and pull out every rule it can find — grouped into
        the five categories you'll review next. Nothing goes live until you publish.
      </p>

      <Button onClick={runParse} disabled={parsing} className="w-full">
        {parsing ? "Reading your methodology…" : "Parse my methodology"}
      </Button>

      {parsing && (
        <p className="text-xs text-muted-foreground italic">
          Reading your document… identifying coaching rules… this usually takes 10–30 seconds.
        </p>
      )}

      {result && !parsing && (
        <div className="space-y-2 rounded border bg-muted/30 p-3">
          <p className="text-xs">
            <strong>{result.persisted}</strong> new rule{result.persisted === 1 ? "" : "s"} added.
            {result.duplicates_skipped > 0 && (
              <> {result.duplicates_skipped} duplicate{result.duplicates_skipped === 1 ? "" : "s"} skipped.</>
            )}
            {result.validation_errors.length > 0 && (
              <> {result.validation_errors.length} couldn't be parsed cleanly — see notes below.</>
            )}
          </p>
          {result.persisted > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                router.push(`/admin/pd/instructions/library/${doc.id}/review`)
              }
            >
              Review the rules I just got →
            </Button>
          )}
          {result.validation_errors.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {result.validation_errors.length} item{result.validation_errors.length === 1 ? "" : "s"} needed your attention
              </summary>
              <ul className="mt-2 space-y-1.5 pl-4">
                {result.validation_errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.directive_type ?? "unknown type"}:</span> {e.message}
                    {e.source_excerpt && (
                      <p className="italic line-clamp-2">"{e.source_excerpt}"</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
