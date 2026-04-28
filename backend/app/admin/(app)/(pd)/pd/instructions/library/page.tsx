"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageGuide } from "@/components/admin/PageGuide";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { instructionsHelp } from "@/lib/cms-help/instructions";

interface Doc {
  id: string;
  title: string;
  audience: "athlete" | "coach" | "parent" | "all";
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
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create dialog state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<Doc["audience"]>("all");
  const [sourceText, setSourceText] = useState("");

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

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("Please give your document a title");
      return;
    }
    if (!sourceText.trim()) {
      toast.error("Please add some methodology text — even a paragraph is fine to start");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/v1/admin/pd/instructions/documents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          audience,
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
        console.error("[doc create] failed:", { status: res.status, body: err });
        throw new Error(message);
      }
      const created = await res.json();
      toast.success("Created. Opening the editor…");
      setOpen(false);
      setTitle("");
      setSourceText("");
      setAudience("all");
      router.push(`/admin/pd/instructions/library/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create document");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageGuide {...instructionsHelp.library.page} />

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Your methodology documents</h2>
        <Button onClick={() => setOpen(true)}>+ New document</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New methodology document</DialogTitle>
              <DialogDescription>
                Give your document a title and start writing. You can save and come back to it
                anytime — nothing goes live until you publish.
              </DialogDescription>
            </DialogHeader>

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
                <Label htmlFor="audience">Who does this document affect?</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as Doc["audience"])}>
                  <SelectTrigger id="audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone (athletes, coaches, parents)</SelectItem>
                    <SelectItem value="athlete">Athletes only</SelectItem>
                    <SelectItem value="coach">Coaches only</SelectItem>
                    <SelectItem value="parent">Parents only</SelectItem>
                  </SelectContent>
                </Select>
                <FieldGuide {...instructionsHelp.document_editor.fields!.audience!} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="source_text">Your methodology</Label>
                <Textarea
                  id="source_text"
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  rows={10}
                  placeholder={`Write or paste your methodology in plain language. For example:

Tomo speaks like a steady, knowledgeable coach. Never use phrases like "great effort" or "fantastic work".

For athletes going through a growth spurt, never recommend max-effort lifts or depth jumps...`}
                />
                <FieldGuide {...instructionsHelp.document_editor.fields!.source_text!} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Saving…" : "Create document"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No methodology documents yet. Click <strong>+ New document</strong> to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last edited</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/pd/instructions/library/${d.id}`}
                      className="hover:underline"
                    >
                      {d.title}
                    </Link>
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
                  <TableCell>
                    <Link
                      href={`/admin/pd/instructions/library/${d.id}`}
                      className="inline-flex h-8 items-center rounded px-2 text-sm font-medium hover:bg-muted"
                    >
                      Open
                    </Link>
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
