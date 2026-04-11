"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

/**
 * Knowledge Editor — Phase 10
 * Rich text editor for sports science knowledge chunks using Tiptap.
 * Features:
 * - Evidence citation embedding (journal references, grade A/B/C)
 * - Auto-embedding via Voyage AI on save
 * - Version history
 * - Domain/tag management
 * - Entity linkage
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface KnowledgeChunk {
  chunk_id: string;
  title: string;
  content: string;
  domain: string;
  subdomain: string | null;
  evidence_grade: "A" | "B" | "C" | null;
  primary_source: string | null;
  athlete_summary: string | null;
  phv_stages: string[] | null;
  age_groups: string[] | null;
  sports: string[] | null;
  tags: string[] | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface Citation {
  id: string;
  author: string;
  year: string;
  title: string;
  journal: string;
  grade: "A" | "B" | "C";
}

// ── Constants ──────────────────────────────────────────────────────────────

const DOMAINS = [
  "READINESS",
  "LOAD_MANAGEMENT",
  "PHV",
  "RECOVERY",
  "NUTRITION",
  "STRENGTH",
  "SPEED",
  "AGILITY",
  "INJURY_PREVENTION",
  "MENTAL_PERFORMANCE",
  "PERIODIZATION",
  "SLEEP",
];

const PHV_STAGES = ["pre", "mid", "post", "adult"];
const AGE_GROUPS = ["U13", "U15", "U17", "U19", "Senior"];
const SPORTS = ["football", "padel", "basketball", "tennis", "athletics"];

// ── Toolbar Component ──────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `px-2 py-1 text-xs rounded transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:bg-accent"
    }`;

  return (
    <div className="flex gap-1 flex-wrap border-b pb-2 mb-2">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btnClass(editor.isActive("bold"))}
      >
        B
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btnClass(editor.isActive("italic"))}
      >
        I
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={btnClass(editor.isActive("strike"))}
      >
        S
      </button>
      <div className="w-px bg-border mx-1" />
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        className={btnClass(editor.isActive("heading", { level: 2 }))}
      >
        H2
      </button>
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        className={btnClass(editor.isActive("heading", { level: 3 }))}
      >
        H3
      </button>
      <div className="w-px bg-border mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btnClass(editor.isActive("bulletList"))}
      >
        List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btnClass(editor.isActive("orderedList"))}
      >
        1. List
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btnClass(editor.isActive("blockquote"))}
      >
        Quote
      </button>
      <div className="w-px bg-border mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        className={btnClass(editor.isActive("highlight"))}
      >
        Highlight
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={btnClass(editor.isActive("codeBlock"))}
      >
        Code
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btnClass(false)}
      >
        HR
      </button>
    </div>
  );
}

// ── Multi-select tag input ─────────────────────────────────────────────────

function TagMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1 mt-1">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() =>
                onChange(
                  isSelected
                    ? selected.filter((s) => s !== opt)
                    : [...selected, opt]
                )
              }
              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Citation Dialog ────────────────────────────────────────────────────────

function CitationDialog({
  citations,
  onAdd,
  onRemove,
}: {
  citations: Citation[];
  onAdd: (c: Citation) => void;
  onRemove: (id: string) => void;
}) {
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [title, setTitle] = useState("");
  const [journal, setJournal] = useState("");
  const [grade, setGrade] = useState<"A" | "B" | "C">("B");

  function handleAdd() {
    if (!author || !year || !title) {
      toast.error("Author, year, and title are required");
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      author,
      year,
      title,
      journal,
      grade,
    });
    setAuthor("");
    setYear("");
    setTitle("");
    setJournal("");
  }

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="outline" size="sm" />}
      >
        Citations ({citations.length})
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Evidence Citations</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Existing citations */}
          {citations.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {citations.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-2 p-2 rounded bg-muted text-xs"
                >
                  <div>
                    <p className="font-medium">
                      {c.author} ({c.year})
                    </p>
                    <p className="text-muted-foreground">{c.title}</p>
                    {c.journal && (
                      <p className="text-muted-foreground italic">{c.journal}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        c.grade === "A"
                          ? "default"
                          : c.grade === "B"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-xs"
                    >
                      Grade {c.grade}
                    </Badge>
                    <button
                      onClick={() => onRemove(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      x
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new citation */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Author(s)</Label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Gabbett TJ"
              />
            </div>
            <div>
              <Label className="text-xs">Year</Label>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2016"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="The training-injury prevention paradox..."
              />
            </div>
            <div>
              <Label className="text-xs">Journal</Label>
              <Input
                value={journal}
                onChange={(e) => setJournal(e.target.value)}
                placeholder="BJSM"
              />
            </div>
            <div>
              <Label className="text-xs">Evidence Grade</Label>
              <Select
                value={grade}
                onValueChange={(v) => setGrade(v as "A" | "B" | "C")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — Strong RCT</SelectItem>
                  <SelectItem value="B">
                    B — Observational / Consensus
                  </SelectItem>
                  <SelectItem value="C">C — Emerging / PD Experience</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleAdd} size="sm" className="w-full">
            Add Citation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function KnowledgeEditorPage() {
  const searchParams = useSearchParams();
  const chunkId = searchParams.get("id");

  const [loading, setLoading] = useState(!!chunkId);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("READINESS");
  const [subdomain, setSubdomain] = useState("");
  const [evidenceGrade, setEvidenceGrade] = useState<string>("B");
  const [primarySource, setPrimarySource] = useState("");
  const [athleteSummary, setAthleteSummary] = useState("");
  const [phvStages, setPhvStages] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [sports, setSports] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [version, setVersion] = useState(1);

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder:
          "Write your sports science knowledge here. Use headings, lists, and citations to structure the content...",
      }),
      Highlight,
      Typography,
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[300px] focus:outline-none p-3",
      },
    },
  });

  // Load existing chunk if editing
  useEffect(() => {
    if (chunkId) {
      fetchChunk(chunkId);
    }
  }, [chunkId]);

  async function fetchChunk(id: string) {
    try {
      const res = await fetch(
        `/api/v1/admin/enterprise/knowledge/chunks?id=${id}`
      );
      if (!res.ok) throw new Error("Failed to fetch chunk");
      const data = await res.json();
      const chunk: KnowledgeChunk = data.chunk;
      setTitle(chunk.title);
      setDomain(chunk.domain);
      setSubdomain(chunk.subdomain || "");
      setEvidenceGrade(chunk.evidence_grade || "B");
      setPrimarySource(chunk.primary_source || "");
      setAthleteSummary(chunk.athlete_summary || "");
      setPhvStages(chunk.phv_stages || []);
      setAgeGroups(chunk.age_groups || []);
      setSports(chunk.sports || []);
      setTags(chunk.tags || []);
      setVersion(chunk.version);
      editor?.commands.setContent(chunk.content);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load chunk";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!editor?.getHTML()) {
      toast.error("Content is required");
      return;
    }

    setSaving(true);
    try {
      const body = {
        chunk_id: chunkId || undefined,
        title: title.trim(),
        content: editor.getHTML(),
        domain,
        subdomain: subdomain || null,
        evidence_grade: evidenceGrade,
        primary_source: primarySource || null,
        athlete_summary: athleteSummary || null,
        phv_stages: phvStages.length > 0 ? phvStages : null,
        age_groups: ageGroups.length > 0 ? ageGroups : null,
        sports: sports.length > 0 ? sports : null,
        tags: tags.length > 0 ? tags : null,
        citations,
      };

      const method = chunkId ? "PATCH" : "POST";
      const url = "/api/v1/admin/enterprise/knowledge/chunks";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const data = await res.json();
      toast.success(
        chunkId
          ? `Updated (v${data.version || version + 1})`
          : "Knowledge chunk created — embedding will auto-generate"
      );

      if (!chunkId && data.chunk_id) {
        // Redirect to edit mode with new ID
        window.history.replaceState(
          null,
          "",
          `/admin/enterprise/knowledge/editor?id=${data.chunk_id}`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [
    title,
    editor,
    chunkId,
    domain,
    subdomain,
    evidenceGrade,
    primarySource,
    athleteSummary,
    phvStages,
    ageGroups,
    sports,
    tags,
    citations,
    version,
  ]);

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Knowledge Editor</h1>
        <Skeleton className="h-12" />
        <Skeleton className="h-64" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {chunkId ? "Edit Knowledge Chunk" : "New Knowledge Chunk"}
          </h1>
          <p className="text-muted-foreground">
            {chunkId
              ? `Editing chunk v${version}`
              : "Create a new sports science knowledge entry"}
          </p>
        </div>
        <div className="flex gap-2">
          <CitationDialog
            citations={citations}
            onAdd={(c) => setCitations([...citations, c])}
            onRemove={(id) =>
              setCitations(citations.filter((c) => c.id !== id))
            }
          />
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : chunkId ? "Update" : "Create"}
          </Button>
        </div>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <Label className="text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ACWR — Training Load Management for Young Athletes"
          />
        </div>
        <div>
          <Label className="text-xs">Domain</Label>
          <Select value={domain} onValueChange={(v) => v && setDomain(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOMAINS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Evidence Grade</Label>
          <Select value={evidenceGrade} onValueChange={(v) => v && setEvidenceGrade(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A — Strong RCT</SelectItem>
              <SelectItem value="B">B — Observational</SelectItem>
              <SelectItem value="C">C — Emerging</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Rich text editor */}
      <Card className="p-4">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} />
      </Card>

      {/* Athlete summary */}
      <Card className="p-4">
        <Label className="text-xs font-semibold">
          Athlete Summary (plain language for the athlete)
        </Label>
        <Textarea
          value={athleteSummary}
          onChange={(e) => setAthleteSummary(e.target.value)}
          placeholder="Training load is like a gas tank — push too hard too fast and you risk breaking down. The ACWR ratio helps us track if you're in the safe zone..."
          rows={3}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          This summary is shown to athletes in AI responses. Write at the
          athlete&apos;s level.
        </p>
      </Card>

      {/* Scope filters */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold">Scope &amp; Applicability</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TagMultiSelect
            label="PHV Stages"
            options={PHV_STAGES}
            selected={phvStages}
            onChange={setPhvStages}
          />
          <TagMultiSelect
            label="Age Groups"
            options={AGE_GROUPS}
            selected={ageGroups}
            onChange={setAgeGroups}
          />
          <TagMultiSelect
            label="Sports"
            options={SPORTS}
            selected={sports}
            onChange={setSports}
          />
        </div>

        {/* Subdomain + source */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Subdomain</Label>
            <Input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="e.g., acwr_monitoring, phv_exercise_selection"
            />
          </div>
          <div>
            <Label className="text-xs">Primary Source</Label>
            <Input
              value={primarySource}
              onChange={(e) => setPrimarySource(e.target.value)}
              placeholder="Gabbett 2016, LTAD Framework"
            />
          </div>
        </div>

        {/* Custom tags */}
        <div>
          <Label className="text-xs">Tags</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              placeholder="Add tag..."
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={addTag}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs gap-1">
                  {tag}
                  <button
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="ml-1 hover:text-destructive"
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Citations summary */}
      {citations.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">
            Evidence Citations ({citations.length})
          </h3>
          <div className="space-y-1">
            {citations.map((c, i) => (
              <p key={c.id} className="text-xs text-muted-foreground">
                [{i + 1}] {c.author} ({c.year}). {c.title}.{" "}
                {c.journal && <em>{c.journal}.</em>}{" "}
                <Badge
                  variant={
                    c.grade === "A"
                      ? "default"
                      : c.grade === "B"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-xs ml-1"
                >
                  {c.grade}
                </Badge>
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* Auto-embedding info */}
      <p className="text-xs text-muted-foreground text-center">
        Saving will auto-generate a Voyage AI embedding (512-dim) and update the
        search vector for full-text retrieval. The RAG retriever will include
        this chunk in relevant queries.
      </p>
    </div>
  );
}
