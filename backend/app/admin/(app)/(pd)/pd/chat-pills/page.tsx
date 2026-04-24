"use client";

/**
 * CMS Admin — Chat Pills
 *
 * Manages the `chat_pills` ui_config row:
 *   - Empty State: Fixed (pick 4) vs Dynamic (top-used), with defaultFallbackIds.
 *   - Library: full CRUD for pills (label, message, tags, priority, enabled).
 *   - In-Response: flag toggles (enabled, shadowMode, maxPerResponse).
 *
 * Mirrors the contract in backend/lib/chatPills/{schema,types,defaults}.ts.
 * Save roundtrips through POST /api/v1/admin/chat-pills → Zod → DB.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

// ── Types mirroring backend/lib/chatPills/types.ts ──────────────────────

interface ChatPill {
  id: string;
  label: string;
  message: string;
  enabled: boolean;
  allowInEmptyState: boolean;
  allowInResponse: boolean;
  tags: string[];
  excludeTags: string[];
  priority: number;
}

interface ChatPillsConfig {
  version: 1;
  emptyState: {
    mode: "fixed" | "dynamic";
    fixedIds: string[];
    defaultFallbackIds: string[];
  };
  inResponse: {
    enabled: boolean;
    maxPerResponse: number;
    shadowMode: boolean;
  };
  library: ChatPill[];
}

interface TagTaxonomy {
  categories: Record<string, readonly string[]>;
  labels: Record<string, string>;
  all: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function emptyPill(): ChatPill {
  return {
    id: "",
    label: "",
    message: "",
    enabled: true,
    allowInEmptyState: true,
    allowInResponse: true,
    tags: [],
    excludeTags: [],
    priority: 5,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 64);
}

// ── Tag Picker ──────────────────────────────────────────────────────────

function TagPicker({
  value,
  onChange,
  taxonomy,
  label,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  taxonomy: TagTaxonomy;
  label: string;
}) {
  const selected = new Set(value);
  const toggle = (tag: string) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-3 rounded-md border p-3 max-h-80 overflow-y-auto">
        {Object.entries(taxonomy.categories).map(([cat, tags]) => (
          <div key={cat}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {cat.replace(/_/g, " ")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = selected.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggle(t)}
                    className={[
                      "text-xs px-2 py-1 rounded-md border transition-colors",
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent hover:bg-muted border-border",
                    ].join(" ")}
                  >
                    {taxonomy.labels[t] ?? t}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {value.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {value.length} selected
        </div>
      )}
    </div>
  );
}

// ── Pill Editor Dialog ──────────────────────────────────────────────────

function PillEditor({
  open,
  onOpenChange,
  initial,
  taxonomy,
  existingIds,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ChatPill | null;
  taxonomy: TagTaxonomy;
  existingIds: Set<string>;
  onSave: (pill: ChatPill) => void;
}) {
  const [pill, setPill] = useState<ChatPill>(initial ?? emptyPill());
  const isNew = !initial;

  useEffect(() => {
    setPill(initial ?? emptyPill());
  }, [initial, open]);

  const set = <K extends keyof ChatPill>(key: K, value: ChatPill[K]) =>
    setPill((p) => ({ ...p, [key]: value }));

  const validate = (): string | null => {
    if (!pill.id) return "ID is required";
    if (!/^[a-z0-9_]+$/.test(pill.id)) return "ID must be lowercase slug (a-z, 0-9, underscore)";
    if (isNew && existingIds.has(pill.id)) return "ID already exists";
    if (!pill.label || pill.label.length > 24) return "Label 1–24 chars";
    if (!pill.message || pill.message.length > 200) return "Message 1–200 chars";
    if (pill.priority < 1 || pill.priority > 10) return "Priority must be 1–10";
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    onSave(pill);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Pill" : `Edit Pill — ${initial?.label}`}</DialogTitle>
          <DialogDescription>
            Pill IDs are immutable once telemetry references them. Pick it carefully.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pill-label">Label</Label>
              <Input
                id="pill-label"
                value={pill.label}
                maxLength={24}
                onChange={(e) => {
                  const v = e.target.value;
                  set("label", v);
                  if (isNew && !pill.id) set("id", slugify(v));
                }}
              />
            </div>
            <div>
              <Label htmlFor="pill-id">ID</Label>
              <Input
                id="pill-id"
                value={pill.id}
                onChange={(e) => set("id", e.target.value)}
                disabled={!isNew}
                placeholder="my_pill_id"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="pill-message">Prompt (sent to AI when tapped)</Label>
            <Input
              id="pill-message"
              value={pill.message}
              onChange={(e) => set("message", e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={pill.enabled}
                onCheckedChange={(v) => set("enabled", v)}
              />
              <Label>Enabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={pill.allowInEmptyState}
                onCheckedChange={(v) => set("allowInEmptyState", v)}
              />
              <Label>Empty state</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={pill.allowInResponse}
                onCheckedChange={(v) => set("allowInResponse", v)}
              />
              <Label>In response</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="pill-priority">Priority (1–10; higher wins ties)</Label>
            <Input
              id="pill-priority"
              type="number"
              min={1}
              max={10}
              value={pill.priority}
              onChange={(e) => set("priority", Number(e.target.value) || 5)}
            />
          </div>

          <TagPicker
            label="Tags (pill matches when response has any of these)"
            value={pill.tags}
            onChange={(t) => set("tags", t)}
            taxonomy={taxonomy}
          />

          <TagPicker
            label="Exclude Tags (pill is skipped if response has any of these)"
            value={pill.excludeTags}
            onChange={(t) => set("excludeTags", t)}
            taxonomy={taxonomy}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{isNew ? "Create" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Fixed-ID picker (4 dropdowns) ───────────────────────────────────────

function FixedIdsPicker({
  label,
  value,
  eligible,
  onChange,
}: {
  label: string;
  value: string[];
  eligible: ChatPill[];
  onChange: (next: string[]) => void;
}) {
  const slots = [0, 1, 2, 3];
  const duplicates = new Set(
    value.filter((id, i) => value.indexOf(id) !== i && id)
  );

  const handleSlot = (i: number, id: string) => {
    const next = [...value];
    next[i] = id;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((i) => {
          const current = value[i] ?? "";
          const isDupe = duplicates.has(current);
          return (
            <div key={i}>
              <div className="text-xs text-muted-foreground mb-1">Slot {i + 1}</div>
              <Select
                value={current}
                onValueChange={(v) => v && handleSlot(i, v)}
              >
                <SelectTrigger className={isDupe ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select a pill" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isDupe && (
                <div className="text-xs text-destructive mt-1">Duplicate</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ChatPillsAdminPage() {
  const [config, setConfig] = useState<ChatPillsConfig | null>(null);
  const [taxonomy, setTaxonomy] = useState<TagTaxonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState<ChatPill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/chat-pills", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data.config as ChatPillsConfig);
      setTaxonomy(data.taxonomy as TagTaxonomy);
    } catch (e) {
      toast.error(`Failed to load config: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const eligibleForEmptyState = useMemo(
    () =>
      (config?.library ?? []).filter((p) => p.enabled && p.allowInEmptyState),
    [config]
  );

  const existingIds = useMemo(
    () => new Set((config?.library ?? []).map((p) => p.id)),
    [config]
  );

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/chat-pills", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ? JSON.stringify(err.detail) : err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Chat pills saved");
    } catch (e) {
      toast.error(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config || !taxonomy) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  const updateLibrary = (updater: (lib: ChatPill[]) => ChatPill[]) =>
    setConfig((c) => (c ? { ...c, library: updater(c.library) } : c));

  const handleSavePill = (pill: ChatPill) => {
    updateLibrary((lib) => {
      const idx = lib.findIndex((p) => p.id === pill.id);
      if (idx >= 0) {
        const next = [...lib];
        next[idx] = pill;
        return next;
      }
      return [...lib, pill];
    });
  };

  const handleDeletePill = (id: string) => {
    if (!confirm(`Delete pill "${id}"? This cannot be undone.`)) return;
    updateLibrary((lib) => lib.filter((p) => p.id !== id));
  };

  const setEmptyState = <K extends keyof ChatPillsConfig["emptyState"]>(
    key: K,
    value: ChatPillsConfig["emptyState"][K]
  ) =>
    setConfig((c) =>
      c ? { ...c, emptyState: { ...c.emptyState, [key]: value } } : c
    );

  const setInResponse = <K extends keyof ChatPillsConfig["inResponse"]>(
    key: K,
    value: ChatPillsConfig["inResponse"][K]
  ) =>
    setConfig((c) =>
      c ? { ...c, inResponse: { ...c.inResponse, [key]: value } } : c
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chat Pills</h1>
          <p className="text-muted-foreground">
            {config.library.length} pills · mode:{" "}
            <span className="font-medium">{config.emptyState.mode}</span> · in-response:{" "}
            <span className="font-medium">
              {config.inResponse.enabled ? "on" : "off"}
            </span>
            {config.inResponse.shadowMode ? " (shadow)" : ""}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <Tabs defaultValue="empty-state">
        <TabsList>
          <TabsTrigger value="empty-state">Empty State</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="in-response">In-Response</TabsTrigger>
        </TabsList>

        {/* ── Empty State ──────────────────────────── */}
        <TabsContent value="empty-state" className="space-y-6">
          <div className="rounded-md border p-6 space-y-4">
            <div>
              <div className="font-semibold mb-2">Mode</div>
              <div className="flex gap-2">
                <Button
                  variant={config.emptyState.mode === "fixed" ? "default" : "outline"}
                  onClick={() => setEmptyState("mode", "fixed")}
                >
                  Fixed
                </Button>
                <Button
                  variant={config.emptyState.mode === "dynamic" ? "default" : "outline"}
                  onClick={() => setEmptyState("mode", "dynamic")}
                >
                  Dynamic
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {config.emptyState.mode === "fixed"
                  ? "Every user sees the same 4 pills you pick below."
                  : "Each user sees their 4 most-tapped pills from the last 60 days, padded with the fallback list below."}
              </p>
            </div>

            {config.emptyState.mode === "fixed" && (
              <FixedIdsPicker
                label="Pick 4 pills to display for everyone"
                value={config.emptyState.fixedIds}
                eligible={eligibleForEmptyState}
                onChange={(v) => setEmptyState("fixedIds", v)}
              />
            )}

            <FixedIdsPicker
              label="Fallback (used to pad Dynamic mode when history is short)"
              value={config.emptyState.defaultFallbackIds}
              eligible={eligibleForEmptyState}
              onChange={(v) => setEmptyState("defaultFallbackIds", v)}
            />
          </div>
        </TabsContent>

        {/* ── Library ──────────────────────────────── */}
        <TabsContent value="library" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditorInitial(null);
                setEditorOpen(true);
              }}
            >
              + New Pill
            </Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Empty</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.library.map((pill) => (
                  <TableRow key={pill.id}>
                    <TableCell className="font-medium">{pill.label}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {pill.id}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                      {pill.message}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {pill.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                        {pill.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{pill.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{pill.priority}</TableCell>
                    <TableCell>
                      {pill.allowInEmptyState ? "✓" : ""}
                    </TableCell>
                    <TableCell>
                      {pill.allowInResponse ? "✓" : ""}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={pill.enabled}
                        onCheckedChange={(v) => {
                          updateLibrary((lib) =>
                            lib.map((p) => (p.id === pill.id ? { ...p, enabled: v } : p))
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditorInitial(pill);
                            setEditorOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeletePill(pill.id)}
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
        </TabsContent>

        {/* ── In-Response ──────────────────────────── */}
        <TabsContent value="in-response" className="space-y-6">
          <div className="rounded-md border p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={config.inResponse.enabled}
                onCheckedChange={(v) => setInResponse("enabled", v)}
              />
              <div>
                <div className="font-semibold">Enable CMS-driven chips in AI responses</div>
                <p className="text-sm text-muted-foreground">
                  When off, the agent emits its hardcoded chips (baseline behavior). Do
                  not enable before running the chat eval harness with parity checks.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Switch
                checked={config.inResponse.shadowMode}
                onCheckedChange={(v) => setInResponse("shadowMode", v)}
              />
              <div>
                <div className="font-semibold">Shadow mode</div>
                <p className="text-sm text-muted-foreground">
                  Logs what the resolver would return without replacing hardcoded chips.
                  Use this to compare outputs in production before flipping Enable.
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="max-per">Max pills per response (1–3)</Label>
              <Input
                id="max-per"
                type="number"
                min={1}
                max={3}
                value={config.inResponse.maxPerResponse}
                onChange={(e) =>
                  setInResponse(
                    "maxPerResponse",
                    Math.min(3, Math.max(1, Number(e.target.value) || 3))
                  )
                }
                className="w-24"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <PillEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editorInitial}
        taxonomy={taxonomy}
        existingIds={existingIds}
        onSave={handleSavePill}
      />
    </div>
  );
}
