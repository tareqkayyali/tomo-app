"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { FieldGuide } from "@/components/admin/FieldGuide";
import { PageGuide } from "@/components/admin/PageGuide";
import { instructionsHelp } from "@/lib/cms-help/instructions";
import {
  PayloadForm,
  defaultPayloadFor,
} from "./PayloadForm";
import {
  DIRECTIVE_TYPE_LABEL,
  DIRECTIVE_TYPE_DESCRIPTION,
  STATUS_LABEL,
  sectionForType,
} from "./directiveLabels";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

export interface DirectiveDraft {
  id?: string;
  document_id: string | null;
  directive_type: DirectiveType;
  audience: "athlete" | "coach" | "parent" | "all";
  sport_scope: string[];
  age_scope: string[];
  phv_scope: string[];
  position_scope: string[];
  mode_scope: string[];
  priority: number;
  payload: Record<string, any>;
  source_excerpt: string | null;
  status: "proposed" | "approved" | "published" | "retired";
  change_reason?: string | null;
}

const AGE_OPTIONS = ["U13", "U15", "U17", "U19", "U21", "senior"];
const PHV_OPTIONS = [
  { value: "pre_phv", label: "Before growth spurt" },
  { value: "mid_phv", label: "During growth spurt" },
  { value: "post_phv", label: "After growth spurt" },
];

function csvToList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
function listToCsv(a: string[] | undefined): string {
  return (a ?? []).join(", ");
}

export function DirectiveForm({
  initial,
  mode,
  documentId,
}: {
  initial: DirectiveDraft;
  mode: "create" | "edit";
  documentId?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DirectiveDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [shadowedBy, setShadowedBy] = useState<{
    winner: { id: string; payload: Record<string, unknown>; source_excerpt: string | null; priority: number };
    directive_type: DirectiveType;
  } | null>(null);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !initial.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/admin/pd/instructions/conflicts?for=${initial.id}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setShadowedBy(data.collision ?? null);
        }
      } catch {
        // silent — banner is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
    // re-check after each save (priority/scope edits can change shadow status)
  }, [mode, initial.id, saving]);

  async function promoteAboveWinner() {
    if (!shadowedBy || !initial.id) return;
    if (shadowedBy.winner.priority <= 0) {
      toast.error(
        "The winning rule is already at the top priority. Raise its priority first, or change scope to give this rule its own lane.",
      );
      return;
    }
    setPromoting(true);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${initial.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: shadowedBy.winner.priority - 1,
          change_reason: "promoted from shadow banner",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Promoted. This rule now wins.");
      setDraft((d) => ({ ...d, priority: shadowedBy.winner.priority - 1 }));
      setShadowedBy(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't promote");
    } finally {
      setPromoting(false);
    }
  }

  function shadowWinnerName(): string {
    if (!shadowedBy) return "";
    const p = shadowedBy.winner.payload ?? {};
    const candidate =
      (typeof p.name === "string" && p.name) ||
      (typeof p.title === "string" && p.title) ||
      (typeof p.label === "string" && p.label);
    if (candidate) return candidate as string;
    if (shadowedBy.winner.source_excerpt) {
      const t = shadowedBy.winner.source_excerpt.trim();
      return t.length > 60 ? `${t.slice(0, 60)}…` : t;
    }
    return "another rule";
  }

  function update<K extends keyof DirectiveDraft>(key: K, value: DirectiveDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const url =
        mode === "create"
          ? "/api/v1/admin/pd/instructions/directives"
          : `/api/v1/admin/pd/instructions/directives/${draft.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const body =
        mode === "create"
          ? { ...draft, document_id: documentId ?? draft.document_id ?? null }
          : {
              payload: draft.payload,
              audience: draft.audience,
              sport_scope: draft.sport_scope,
              age_scope: draft.age_scope,
              phv_scope: draft.phv_scope,
              position_scope: draft.position_scope,
              mode_scope: draft.mode_scope,
              priority: draft.priority,
              source_excerpt: draft.source_excerpt,
              status: draft.status,
              change_reason: draft.change_reason ?? null,
            };

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? err.detail ?? "Save failed");
      }
      const saved = await res.json();
      toast.success(mode === "create" ? "Rule created" : "Saved");
      router.push(`/admin/pd/instructions/directives/${saved.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!draft.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${draft.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "approve" }),
      });
      if (!res.ok) throw new Error("Approve failed");
      const updated = await res.json();
      setDraft((d) => ({ ...d, status: updated.status }));
      toast.success("Approved");
    } catch (err) {
      toast.error("Couldn't approve");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDirective() {
    if (!draft.id) return;
    if (!confirm("Delete this rule? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/v1/admin/pd/instructions/directives/${draft.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Deleted");
      router.push("/admin/pd/instructions/directives");
    } catch (err) {
      toast.error("Couldn't delete");
    }
  }

  return (
    <div className="space-y-5">
      {shadowedBy && (
        <div className="rounded-md border-2 border-amber-200 bg-amber-50/70 p-4 space-y-2">
          <div className="text-sm font-semibold text-amber-900">
            Heads up — this rule is currently shadowed.
          </div>
          <p className="text-sm text-amber-900/90">
            It won&rsquo;t apply to any athlete until you change scope or raise priority.
            Right now &lsquo;<span className="font-medium">{shadowWinnerName()}</span>&rsquo;
            ({DIRECTIVE_TYPE_LABEL[shadowedBy.directive_type]}) wins for the same audience and scope.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Link
              href={`/admin/pd/instructions/directives/${shadowedBy.winner.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open the winner
            </Link>
            <Button
              size="sm"
              onClick={promoteAboveWinner}
              disabled={promoting || shadowedBy.winner.priority <= 0}
              title={
                shadowedBy.winner.priority <= 0
                  ? "Winner already at top priority — raise it first, or change scope."
                  : ""
              }
            >
              {promoting ? "Promoting…" : "Promote this rule"}
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/admin/pd/instructions/directives"
            className="text-muted-foreground hover:text-foreground"
          >
            Rules
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{DIRECTIVE_TYPE_LABEL[draft.directive_type]}</span>
          {mode === "edit" && (
            <Badge variant="outline" className="ml-2">
              {STATUS_LABEL[draft.status]}
            </Badge>
          )}
          <Badge variant="secondary" className="ml-1">
            {sectionForType(draft.directive_type)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {mode === "edit" && draft.status === "proposed" && (
            <Button variant="outline" onClick={approve} disabled={saving}>
              Approve
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create rule" : "Save"}
          </Button>
        </div>
      </div>

      <PageGuide {...instructionsHelp.directive_editor.page} />

      <p className="text-sm text-muted-foreground">
        {DIRECTIVE_TYPE_DESCRIPTION[draft.directive_type]}
      </p>

      {/* Two-column form */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Left: type-specific essentials */}
        <div className="space-y-4 rounded-md border bg-background p-5">
          <div className="text-sm font-semibold">Rule details</div>
          <PayloadForm
            type={draft.directive_type}
            payload={draft.payload}
            onChange={(next) => update("payload", next)}
          />
        </div>

        {/* Right: scope, status, source */}
        <div className="space-y-4">
          <div className="rounded-md border bg-background p-4 space-y-3">
            <div className="text-sm font-semibold">Where this rule applies</div>

            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select
                value={draft.audience}
                onValueChange={(v) => update("audience", v as DirectiveDraft["audience"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="athlete">Athletes only</SelectItem>
                  <SelectItem value="coach">Coaches only</SelectItem>
                  <SelectItem value="parent">Parents only</SelectItem>
                </SelectContent>
              </Select>
              <FieldGuide {...instructionsHelp.directive_editor.fields!.audience!} />
            </div>

            <div className="space-y-1.5">
              <Label>Sports (comma-separated, leave empty for all)</Label>
              <Input
                value={listToCsv(draft.sport_scope)}
                onChange={(e) => update("sport_scope", csvToList(e.target.value))}
                placeholder="e.g. football, basketball"
              />
              <FieldGuide {...instructionsHelp.directive_editor.fields!.sport_scope!} />
            </div>

            <div className="space-y-1.5">
              <Label>Age groups (comma-separated, leave empty for all)</Label>
              <Input
                value={listToCsv(draft.age_scope)}
                onChange={(e) =>
                  update(
                    "age_scope",
                    csvToList(e.target.value).filter((x) => AGE_OPTIONS.includes(x))
                  )
                }
                placeholder="e.g. U13, U15"
              />
              <FieldGuide {...instructionsHelp.directive_editor.fields!.age_scope!} />
            </div>

            <div className="space-y-1.5">
              <Label>Growth-spurt stages (leave empty for all)</Label>
              <Input
                value={listToCsv(draft.phv_scope)}
                onChange={(e) =>
                  update(
                    "phv_scope",
                    csvToList(e.target.value).filter((x) =>
                      PHV_OPTIONS.map((p) => p.value).includes(x)
                    )
                  )
                }
                placeholder="e.g. mid_phv"
              />
              <FieldGuide {...instructionsHelp.directive_editor.fields!.phv_scope!} />
            </div>

            <div className="space-y-1.5">
              <Label>Positions (comma-separated, leave empty for all)</Label>
              <Input
                value={listToCsv(draft.position_scope)}
                onChange={(e) => update("position_scope", csvToList(e.target.value))}
                placeholder="e.g. striker, defender, goalkeeper"
              />
              <FieldGuide
                text="Use the position labels you record in the athlete profile."
                example="e.g. striker, defender, midfielder, goalkeeper, ALL"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Modes (comma-separated, leave empty for all)</Label>
              <Input
                value={listToCsv(draft.mode_scope)}
                onChange={(e) => update("mode_scope", csvToList(e.target.value))}
                placeholder="e.g. build, taper, recovery"
              />
              <FieldGuide
                text="The training modes this rule applies in."
                example="e.g. build, taper, recovery, pre_match"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Input
                type="number"
                value={draft.priority}
                onChange={(e) => update("priority", Number(e.target.value))}
              />
              <FieldGuide {...instructionsHelp.directive_editor.fields!.priority!} />
            </div>
          </div>

          <div className="rounded-md border bg-background p-4 space-y-3">
            <div className="text-sm font-semibold">Provenance</div>
            <div className="space-y-1.5">
              <Label>Source quote (optional)</Label>
              <Textarea
                rows={3}
                value={draft.source_excerpt ?? ""}
                onChange={(e) => update("source_excerpt", e.target.value)}
                placeholder="Paste the sentence from your methodology that this rule comes from."
              />
              <FieldGuide {...instructionsHelp.directive_editor.fields!.source_excerpt!} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => update("status", v as DirectiveDraft["status"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposed">Waiting for review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="published">Live</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
              <FieldGuide {...instructionsHelp.directive_editor.fields!.status!} />
            </div>
          </div>

          {mode === "edit" && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={deleteDirective}
            >
              Delete this rule
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Build a fresh draft for a chosen type — used by the "new" page. */
export function freshDraft(type: DirectiveType, documentId?: string | null): DirectiveDraft {
  return {
    document_id: documentId ?? null,
    directive_type: type,
    audience: "all",
    sport_scope: [],
    age_scope: [],
    phv_scope: [],
    position_scope: [],
    mode_scope: [],
    priority: 100,
    payload: defaultPayloadFor(type),
    source_excerpt: null,
    status: "proposed",
  };
}
