"use client";

/**
 * ProtocolGeneratePanel
 *
 * Plain-text prompt → AI-generated PD protocol draft → flat review form
 * → save via the existing /admin/enterprise/protocols/builder endpoint.
 *
 * Deliberately bypasses the ReactFlow canvas on the builder page so the
 * generator is self-contained and does not rely on the canvas's current
 * serializer (which is flat-field lossy for action/output blocks).
 *
 * After a successful save, the parent page is notified via onSaved()
 * so it can route to the saved protocol's id and load it into the
 * canvas for further hand editing if desired.
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Sparkles, ChevronDown, ChevronUp, X } from "lucide-react";

type GroundingChunk = {
  chunk_id: string;
  title: string;
  domain: string | null;
  evidence_grade: string | null;
};

type ValidationError = { path: string; message: string };

type DraftProtocol = {
  name: string;
  description: string | null;
  category: "safety" | "development" | "recovery" | "performance" | "academic";
  conditions: { match: "all" | "any"; conditions: Array<{ field: string; operator: string; value: unknown }> };
  priority: number;
  load_multiplier: number | null;
  intensity_cap: "rest" | "light" | "moderate" | "full" | null;
  contraindications: string[] | null;
  required_elements: string[] | null;
  session_cap_minutes: number | null;
  blocked_rec_categories: string[] | null;
  mandatory_rec_categories: string[] | null;
  priority_override: "P0" | "P1" | "P2" | "P3" | null;
  override_message: string | null;
  forced_rag_domains: string[] | null;
  blocked_rag_domains: string[] | null;
  rag_condition_tags: Record<string, string> | null;
  ai_system_injection: string | null;
  safety_critical: boolean;
  sport_filter: string[] | null;
  phv_filter: string[] | null;
  age_band_filter: string[] | null;
  position_filter: string[] | null;
  evidence_source: string | null;
  evidence_grade: "A" | "B" | "C" | null;
};

type GenerateResponse = {
  generation_id: string;
  protocol: DraftProtocol | null;
  grounding_chunks: GroundingChunk[];
  model: string;
  cost_usd: number;
  latency_ms: number;
  validation_errors: ValidationError[] | null;
};

type SaveResponse = {
  protocol: { protocol_id: string; name: string };
  dry_run?: {
    skipped: boolean;
    athletes_tested: number;
    athletes_fired: number;
    reason?: string;
  };
  fan_out?: {
    inline_count: number;
    background_queued: number;
    scope_total: number;
  };
};

const SPORTS = ["football", "padel", "athletics", "basketball", "tennis"] as const;
const PHV_STAGES = ["pre", "mid", "post"] as const;
const AGE_BANDS = ["U13", "U15", "U17", "U19", "Senior"] as const;
const CATEGORIES = ["safety", "development", "recovery", "performance", "academic"] as const;
const INTENSITY_CAPS = ["rest", "light", "moderate", "full"] as const;
const PRIORITY_OVERRIDES = ["P0", "P1", "P2", "P3"] as const;
const EVIDENCE_GRADES = ["A", "B", "C"] as const;

export interface ProtocolGeneratePanelProps {
  onSaved?: (protocolId: string, summary: SaveResponse) => void;
}

export default function ProtocolGeneratePanel({ onSaved }: ProtocolGeneratePanelProps) {
  const [open, setOpen] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [sport, setSport] = useState<string>("");
  const [position, setPosition] = useState<string>("");
  const [phvStage, setPhvStage] = useState<string>("");
  const [ageBand, setAgeBand] = useState<string>("");

  const [generating, setGenerating] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProtocol | null>(null);
  const [errors, setErrors] = useState<ValidationError[] | null>(null);
  const [grounding, setGrounding] = useState<GroundingChunk[]>([]);
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  const reset = () => {
    setGenerationId(null);
    setDraft(null);
    setErrors(null);
    setGrounding([]);
    setCostUsd(null);
    setLatencyMs(null);
  };

  async function handleGenerate() {
    if (prompt.trim().length < 10) {
      toast.error("Describe the protocol in at least 10 characters");
      return;
    }
    setGenerating(true);
    reset();

    try {
      const scope_hints: Record<string, string> = {};
      if (sport) scope_hints.sport = sport;
      if (position) scope_hints.position = position;
      if (phvStage) scope_hints.phv_stage = phvStage;
      if (ageBand) scope_hints.age_band = ageBand;

      const res = await fetch("/api/v1/admin/enterprise/protocols/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), scope_hints }),
      });

      const data: GenerateResponse & { error?: string } = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Generation failed");
        return;
      }

      setGenerationId(data.generation_id);
      setGrounding(data.grounding_chunks);
      setCostUsd(data.cost_usd);
      setLatencyMs(data.latency_ms);

      if (data.validation_errors && data.validation_errors.length > 0) {
        setErrors(data.validation_errors);
        toast.error("AI draft failed validation. See errors below.");
        return;
      }

      if (!data.protocol) {
        toast.error("Empty draft returned");
        return;
      }

      setDraft(data.protocol);
      toast.success(`Draft generated in ${data.latency_ms}ms`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDiscard() {
    if (!generationId) {
      reset();
      return;
    }
    try {
      await fetch(
        `/api/v1/admin/enterprise/protocols/generations/${generationId}/discard`,
        { method: "POST" },
      );
    } catch {
      // fire-and-forget; UI still resets
    }
    reset();
    toast.info("Draft discarded");
  }

  async function handleSave() {
    if (!draft || !generationId) return;
    setSaving(true);
    try {
      const res = await fetch(
        "/api/v1/admin/enterprise/protocols/builder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, generation_id: generationId }),
        },
      );
      const data: SaveResponse & { error?: string } = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }

      const dr = data.dry_run;
      const fo = data.fan_out;
      const drMsg = dr && !dr.skipped
        ? `Triggers for ${dr.athletes_fired}/${dr.athletes_tested} test athletes.`
        : "Dry-run skipped.";
      const foMsg = fo
        ? `Refreshing ${fo.inline_count} now (${fo.background_queued} queued).`
        : "";

      toast.success(`Protocol saved. ${drMsg} ${foMsg}`.trim());

      onSaved?.(data.protocol.protocol_id, data);
      reset();
      setPrompt("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function updateDraft<K extends keyof DraftProtocol>(field: K, value: DraftProtocol[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-semibold">Generate from description</span>
          <Badge variant="secondary" className="text-[10px]">
            Sonnet 4 · evidence-grounded
          </Badge>
        </div>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* ── Prompt input ──────────────────────────────────────── */}
          {!draft && !errors && (
            <>
              <div>
                <Label className="text-xs">
                  Describe the protocol in plain English
                </Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. Build a hamstring return-to-play protocol for U17 football midfielders coming off a grade-2 strain."
                  className="mt-1"
                  disabled={generating}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Sport</Label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    disabled={generating}
                    className="mt-1 w-full h-8 rounded border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— Any —</option>
                    {SPORTS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Position</Label>
                  <Input
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    disabled={generating}
                    placeholder="midfielder"
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">PHV stage</Label>
                  <select
                    value={phvStage}
                    onChange={(e) => setPhvStage(e.target.value)}
                    disabled={generating}
                    className="mt-1 w-full h-8 rounded border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— Any —</option>
                    {PHV_STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Age band</Label>
                  <select
                    value={ageBand}
                    onChange={(e) => setAgeBand(e.target.value)}
                    disabled={generating}
                    className="mt-1 w-full h-8 rounded border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— Any —</option>
                    {AGE_BANDS.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <span className="text-[10px] text-muted-foreground">
                  ~$0.02 per draft · cached after first call
                </span>
                <Button size="sm" onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Generating…</>
                  ) : (
                    <><Sparkles className="size-3.5 mr-1.5" />Generate baseline</>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* ── Validation errors ─────────────────────────────────── */}
          {errors && (
            <Card className="p-3 border-destructive/50 bg-destructive/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-destructive">
                  AI draft failed validation
                </span>
                <Button size="sm" variant="ghost" onClick={handleDiscard}>
                  <X className="size-3.5 mr-1" />Dismiss
                </Button>
              </div>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-muted-foreground">
                {errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono text-[11px]">{e.path || "$"}</span>: {e.message}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] mt-2 text-muted-foreground">
                Refine your prompt and try again. The generator is grounded in the condition field dictionary and cannot invent fields.
              </p>
            </Card>
          )}

          {/* ── Draft review + save ───────────────────────────────── */}
          {draft && (
            <DraftReviewForm
              draft={draft}
              grounding={grounding}
              costUsd={costUsd}
              latencyMs={latencyMs}
              saving={saving}
              onChange={updateDraft}
              onDiscard={handleDiscard}
              onSave={handleSave}
            />
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Flat review form ───────────────────────────────────────────────

function DraftReviewForm({
  draft,
  grounding,
  costUsd,
  latencyMs,
  saving,
  onChange,
  onDiscard,
  onSave,
}: {
  draft: DraftProtocol;
  grounding: GroundingChunk[];
  costUsd: number | null;
  latencyMs: number | null;
  saving: boolean;
  onChange: <K extends keyof DraftProtocol>(f: K, v: DraftProtocol[K]) => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const conditionsJson = JSON.stringify(draft.conditions, null, 2);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            Review before save
          </Badge>
          {costUsd !== null && (
            <span className="text-[10px] text-muted-foreground">
              ${costUsd.toFixed(4)} · {latencyMs}ms
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Saving…</>
            ) : (
              "Save protocol"
            )}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Name</Label>
          <Input
            value={draft.name}
            onChange={(e) => onChange("name", e.target.value)}
            className="mt-1 h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <select
            value={draft.category}
            onChange={(e) => onChange("category", e.target.value as DraftProtocol["category"])}
            className="mt-1 w-full h-8 rounded border border-input bg-background px-2 text-sm"
          >
            {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Priority (21–200)</Label>
          <Input
            type="number"
            min={21}
            max={200}
            value={draft.priority}
            onChange={(e) => onChange("priority", parseInt(e.target.value, 10) || 100)}
            className="mt-1 h-8"
          />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <Label className="text-xs">Safety critical</Label>
            <p className="text-[10px] text-muted-foreground">Forces Sonnet tier; requires Grade A</p>
          </div>
          <Switch
            checked={draft.safety_critical}
            onCheckedChange={(v) => onChange("safety_critical", Boolean(v))}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          value={draft.description ?? ""}
          onChange={(e) => onChange("description", e.target.value || null)}
          rows={2}
          className="mt-1 text-xs"
        />
      </div>

      {/* Conditions (read-only JSON preview — edits happen in canvas post-save) */}
      <div>
        <Label className="text-xs">
          Conditions ({draft.conditions.match.toUpperCase()}, {draft.conditions.conditions.length} rule{draft.conditions.conditions.length === 1 ? "" : "s"})
        </Label>
        <pre className="mt-1 rounded border bg-background/50 p-2 text-[11px] font-mono overflow-x-auto max-h-40">
{conditionsJson}
        </pre>
        <p className="text-[10px] text-muted-foreground mt-1">
          Conditions can be edited in the canvas after save.
        </p>
      </div>

      {/* Training modifiers */}
      <SectionHeader title="Training modifiers" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <NumberField
          label="Load multiplier"
          value={draft.load_multiplier}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => onChange("load_multiplier", v)}
        />
        <EnumField
          label="Intensity cap"
          value={draft.intensity_cap}
          options={INTENSITY_CAPS}
          onChange={(v) => onChange("intensity_cap", v as DraftProtocol["intensity_cap"])}
        />
        <NumberField
          label="Session cap (min)"
          value={draft.session_cap_minutes}
          min={0}
          max={240}
          step={5}
          onChange={(v) => onChange("session_cap_minutes", v === null ? null : Math.round(v))}
        />
      </div>
      <TagListField
        label="Contraindications"
        value={draft.contraindications}
        onChange={(v) => onChange("contraindications", v)}
      />
      <TagListField
        label="Required elements"
        value={draft.required_elements}
        onChange={(v) => onChange("required_elements", v)}
      />

      {/* Recommendation guardrails */}
      <SectionHeader title="Recommendation guardrails" />
      <div className="grid grid-cols-2 gap-3">
        <EnumField
          label="Priority override"
          value={draft.priority_override}
          options={PRIORITY_OVERRIDES}
          onChange={(v) => onChange("priority_override", v as DraftProtocol["priority_override"])}
        />
        <div>
          <Label className="text-xs">Override message (athlete-facing)</Label>
          <Input
            value={draft.override_message ?? ""}
            onChange={(e) => onChange("override_message", e.target.value || null)}
            className="mt-1 h-8"
            maxLength={280}
          />
        </div>
      </div>
      <TagListField
        label="Blocked rec categories"
        value={draft.blocked_rec_categories}
        onChange={(v) => onChange("blocked_rec_categories", v)}
      />
      <TagListField
        label="Mandatory rec categories"
        value={draft.mandatory_rec_categories}
        onChange={(v) => onChange("mandatory_rec_categories", v)}
      />

      {/* RAG overrides */}
      <SectionHeader title="RAG overrides" />
      <TagListField
        label="Forced RAG domains"
        value={draft.forced_rag_domains}
        onChange={(v) => onChange("forced_rag_domains", v)}
      />
      <TagListField
        label="Blocked RAG domains"
        value={draft.blocked_rag_domains}
        onChange={(v) => onChange("blocked_rag_domains", v)}
      />

      {/* AI coaching context */}
      <SectionHeader title="AI coaching context" />
      <div>
        <Label className="text-xs">System injection (appended to chat system prompt)</Label>
        <Textarea
          value={draft.ai_system_injection ?? ""}
          onChange={(e) => onChange("ai_system_injection", e.target.value || null)}
          rows={3}
          className="mt-1 text-xs"
          maxLength={1200}
        />
      </div>

      {/* Scope filters */}
      <SectionHeader title="Scope filters" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MultiTagField
          label="Sports"
          value={draft.sport_filter}
          options={[...SPORTS]}
          onChange={(v) => onChange("sport_filter", v)}
        />
        <MultiTagField
          label="PHV stages"
          value={draft.phv_filter}
          options={[...PHV_STAGES]}
          onChange={(v) => onChange("phv_filter", v)}
        />
        <MultiTagField
          label="Age bands"
          value={draft.age_band_filter}
          options={[...AGE_BANDS]}
          onChange={(v) => onChange("age_band_filter", v)}
        />
        <TagListField
          label="Positions"
          value={draft.position_filter}
          onChange={(v) => onChange("position_filter", v)}
        />
      </div>

      {/* Evidence */}
      <SectionHeader title="Evidence" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <Label className="text-xs">Source</Label>
          <Input
            value={draft.evidence_source ?? ""}
            onChange={(e) => onChange("evidence_source", e.target.value || null)}
            className="mt-1 h-8"
          />
        </div>
        <EnumField
          label="Grade"
          value={draft.evidence_grade}
          options={EVIDENCE_GRADES}
          onChange={(v) => onChange("evidence_grade", v as DraftProtocol["evidence_grade"])}
        />
      </div>

      {/* Grounding */}
      {grounding.length > 0 && (
        <div>
          <Label className="text-xs">RAG chunks used as grounding ({grounding.length})</Label>
          <ul className="mt-1 space-y-0.5">
            {grounding.map((c) => (
              <li key={c.chunk_id} className="text-[11px] text-muted-foreground">
                [{c.domain ?? "—"} · Grade {c.evidence_grade ?? "—"}] {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Helper field components ────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-t border-border/50 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder="—"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1 h-8"
      />
    </div>
  );
}

function EnumField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-1 w-full h-8 rounded border border-input bg-background px-2 text-sm"
      >
        <option value="">—</option>
        {options.map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    </div>
  );
}

function TagListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const [input, setInput] = useState("");
  const list = value ?? [];
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1 mt-1">
        {list.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px]"
          >
            {tag}
            <button
              onClick={() => {
                const next = list.filter((_, idx) => idx !== i);
                onChange(next.length ? next : null);
              }}
              className="hover:text-destructive"
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            e.preventDefault();
            onChange([...list, input.trim()]);
            setInput("");
          }
        }}
        placeholder="Type + Enter to add"
        className="mt-1 h-8 text-xs"
      />
    </div>
  );
}

function MultiTagField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[] | null;
  options: string[];
  onChange: (v: string[] | null) => void;
}) {
  const selected = value ?? [];
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1 mt-1">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => {
                const next = active
                  ? selected.filter((s) => s !== opt)
                  : [...selected, opt];
                onChange(next.length ? next : null);
              }}
              className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
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
