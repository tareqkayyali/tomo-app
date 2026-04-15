"use client";

/**
 * Safety Gate — CMS admin settings page
 * ─────────────────────────────────────
 * Single form that maps 1:1 to the safety_gate_config singleton row.
 * Zero JSON editing — every knob is a typed form control:
 *   - Master toggle (Switch)
 *   - Three readiness rule toggles (Switch)
 *   - Two load limits (Input type="number")
 *   - Pain keyword list (chip editor — click × to remove, Enter to add)
 *   - Three response message fields (Textarea)
 *
 * Saves via PATCH /api/v1/admin/safety-gate. The ai-service cache
 * auto-refreshes within 60s, so changes land without a redeploy.
 */

import { useEffect, useState, useCallback, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface SafetyGateConfig {
  enabled: boolean;
  block_hard_on_red: boolean;
  block_moderate_on_red: boolean;
  block_hard_on_yellow: boolean;
  min_rest_hours_after_hard: number;
  max_hard_per_week: number;
  pain_keywords: string[];
  red_block_message: string;
  pain_block_message: string;
  load_block_message: string;
}

const EMPTY: SafetyGateConfig = {
  enabled: true,
  block_hard_on_red: true,
  block_moderate_on_red: false,
  block_hard_on_yellow: false,
  min_rest_hours_after_hard: 24,
  max_hard_per_week: 3,
  pain_keywords: [],
  red_block_message: "",
  pain_block_message: "",
  load_block_message: "",
};

export default function SafetyGatePage() {
  const [config, setConfig] = useState<SafetyGateConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [keywordDraft, setKeywordDraft] = useState("");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/safety-gate", { credentials: "include" });
      if (!res.ok) {
        toast.error("Failed to load safety gate config");
        return;
      }
      const data = await res.json();
      setConfig(data.config);
      setUpdatedAt(data.updatedAt);
      setDirty(false);
    } catch (err) {
      toast.error("Failed to load safety gate config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Shared setter — flips dirty whenever any field mutates.
  function update<K extends keyof SafetyGateConfig>(key: K, value: SafetyGateConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function addKeyword() {
    const k = keywordDraft.trim().toLowerCase();
    if (!k) return;
    if (config.pain_keywords.includes(k)) {
      setKeywordDraft("");
      return;
    }
    update("pain_keywords", [...config.pain_keywords, k]);
    setKeywordDraft("");
  }

  function removeKeyword(kw: string) {
    update(
      "pain_keywords",
      config.pain_keywords.filter((k) => k !== kw)
    );
  }

  function onKeywordKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/safety-gate", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
        return;
      }
      toast.success("Safety gate config saved — active within 60s");
      setDirty(false);
      fetchConfig();
    } catch (err) {
      toast.error("Failed to save safety gate config");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Safety Gate</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Safety Gate</h1>
          <p className="text-muted-foreground">
            Controls when Tomo AI refuses or swaps a training request to protect athlete wellbeing.
          </p>
          {updatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Last updated: {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      {/* ── Master toggle ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Master switch</CardTitle>
          <CardDescription>
            When OFF, the safety gate is completely inert — every request is allowed through,
            regardless of readiness, load, or pain keywords. Use this only for eval regression
            debugging.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <Label className="text-base">Safety gate enabled</Label>
              <p className="text-sm text-muted-foreground">
                {config.enabled
                  ? "All rules below are active."
                  : "Gate is OFF. Rules are ignored."}
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => update("enabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Readiness rules ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Readiness rules</CardTitle>
          <CardDescription>
            Block training requests based on the athlete's latest Green/Yellow/Red readiness score.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            label="Block HARD on RED readiness"
            description="When the athlete's readiness is RED, refuse requests for HARD intensity and swap to a light recovery block."
            checked={config.block_hard_on_red}
            onChange={(v) => update("block_hard_on_red", v)}
          />
          <Separator />
          <ToggleRow
            label="Block MODERATE on RED readiness"
            description="Conservative mode — refuse MODERATE intensity too when readiness is RED."
            checked={config.block_moderate_on_red}
            onChange={(v) => update("block_moderate_on_red", v)}
          />
          <Separator />
          <ToggleRow
            label="Block HARD on YELLOW readiness"
            description="Refuse HARD intensity when readiness is YELLOW. Off by default — YELLOW is 'proceed with care'."
            checked={config.block_hard_on_yellow}
            onChange={(v) => update("block_hard_on_yellow", v)}
          />
        </CardContent>
      </Card>

      {/* ── Load limits ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Load limits</CardTitle>
          <CardDescription>
            Prevent overload by capping HARD session frequency and enforcing recovery windows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <NumberRow
            label="Min rest hours after a HARD session"
            description="Minimum gap in hours before another HARD session can be scheduled. Set to 0 to disable."
            value={config.min_rest_hours_after_hard}
            min={0}
            max={168}
            unit="hours"
            onChange={(v) => update("min_rest_hours_after_hard", v)}
          />
          <Separator />
          <NumberRow
            label="Max HARD sessions per week"
            description="Hard cap across a rolling 7-day window. Further HARD requests get swapped to moderate/light."
            value={config.max_hard_per_week}
            min={0}
            max={14}
            unit="sessions"
            onChange={(v) => update("max_hard_per_week", v)}
          />
        </CardContent>
      </Card>

      {/* ── Pain keywords ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Pain &amp; injury keywords</CardTitle>
          <CardDescription>
            If the athlete's message contains any of these words (case-insensitive), the gate auto-routes
            to recovery and recommends seeing a physio. Press Enter or comma to add. Click × to remove.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={onKeywordKeyDown}
              placeholder="Add a keyword (e.g. shin splints)"
            />
            <Button variant="secondary" onClick={addKeyword} disabled={!keywordDraft.trim()}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[32px] p-3 rounded-md border bg-muted/30">
            {config.pain_keywords.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                No keywords — pain detection is disabled.
              </span>
            ) : (
              config.pain_keywords.map((kw) => (
                <Badge
                  key={kw}
                  variant="secondary"
                  className="gap-1 pl-2 pr-1 py-1 text-sm"
                >
                  {kw}
                  <button
                    type="button"
                    aria-label={`Remove ${kw}`}
                    onClick={() => removeKeyword(kw)}
                    className="ml-1 rounded-full hover:bg-destructive/20 w-4 h-4 flex items-center justify-center"
                  >
                    ×
                  </button>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Response phrasing ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Response phrasing</CardTitle>
          <CardDescription>
            What Tomo says to the athlete when a rule triggers. Keep the voice warm and directive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="red_msg">RED readiness block message</Label>
            <Textarea
              id="red_msg"
              rows={3}
              value={config.red_block_message}
              onChange={(e) => update("red_block_message", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pain_msg">Pain keyword block message</Label>
            <Textarea
              id="pain_msg"
              rows={3}
              value={config.pain_block_message}
              onChange={(e) => update("pain_block_message", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="load_msg">Load limit block message</Label>
            <Textarea
              id="load_msg"
              rows={3}
              value={config.load_block_message}
              onChange={(e) => update("load_block_message", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sticky save button at bottom for long forms */}
      <div className="flex justify-end sticky bottom-4 pt-4">
        <Button onClick={handleSave} disabled={!dirty || saving} size="lg">
          {saving ? "Saving..." : dirty ? "Save changes" : "No changes"}
        </Button>
      </div>
    </div>
  );
}

// ── Row components ────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberRow({
  label,
  description,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          className="w-24"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
