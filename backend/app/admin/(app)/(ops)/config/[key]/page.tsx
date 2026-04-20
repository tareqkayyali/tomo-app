"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

/**
 * Engine Config — detail + edit.
 *
 * This first cut uses a JSON textarea editor; server-side Zod validates
 * the payload on PUT. A richer Zod-form renderer can come in a later PR
 * once ops have a feel for the primary knobs.
 *
 * Preview runs the proposed payload against 50 real athletes and shows
 * the CCRS-delta distribution + recommendation-shift matrix before save.
 */

interface DetailResponse {
  config: {
    config_key: string;
    payload: unknown;
    schema_version: number;
    rollout_percentage: number;
    sport_filter: string[] | null;
    enabled: boolean;
    updated_at: string | null;
    updated_by: string | null;
    change_reason: string | null;
  } | null;
  history: Array<{
    id: number;
    payload: unknown;
    schema_version: number;
    rollout_percentage: number;
    sport_filter: string[] | null;
    enabled: boolean;
    changed_at: string;
    changed_by: string | null;
    change_reason: string | null;
    operation: "INSERT" | "UPDATE" | "DELETE";
  }>;
  registry: {
    key: string;
    label: string;
    category: string;
    summary: string;
    default: unknown;
  } | null;
}

interface PreviewResponse {
  summary: {
    sample_size: number;
    max_abs_delta: number;
    mean_abs_delta: number;
    recommendations_changed: number;
    recommendation_shift_matrix: Record<string, number>;
  };
  sample: Array<{
    athlete_id: string;
    ccrs_before: number;
    ccrs_after: number;
    ccrs_delta: number;
    recommendation_before: string;
    recommendation_after: string;
    recommendation_changed: boolean;
  }>;
}

export default function EngineConfigDetailPage() {
  const params = useParams<{ key: string }>();
  const router = useRouter();
  const key = params.key;

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [payloadText, setPayloadText] = useState("");
  const [rolloutPct, setRolloutPct] = useState(100);
  const [sportFilterText, setSportFilterText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [changeReason, setChangeReason] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/config/${key}`, { credentials: "include" });
      if (!res.ok) {
        toast.error(`Failed to load ${key}`);
        return;
      }
      const data: DetailResponse = await res.json();
      setDetail(data);
      // If the row exists, seed editor from it; otherwise seed from registry DEFAULT.
      const src = data.config ?? {
        payload: data.registry?.default,
        rollout_percentage: 100,
        sport_filter: null,
        enabled: true,
      };
      setPayloadText(JSON.stringify(src.payload, null, 2));
      setRolloutPct(src.rollout_percentage ?? 100);
      setSportFilterText((src.sport_filter ?? []).join(", "));
      setEnabled(src.enabled ?? true);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const sportFilter = useMemo<string[] | null>(() => {
    const parts = sportFilterText.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length === 0 ? null : parts;
  }, [sportFilterText]);

  function parsedPayload(): unknown | null {
    try {
      return JSON.parse(payloadText);
    } catch {
      return null;
    }
  }

  async function handlePreview() {
    const payload = parsedPayload();
    if (payload == null) {
      toast.error("Payload is not valid JSON.");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/v1/admin/config/${key}/preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Preview failed", { description: JSON.stringify(err.detail) });
        return;
      }
      const data: PreviewResponse = await res.json();
      setPreview(data);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const payload = parsedPayload();
    if (payload == null) {
      toast.error("Payload is not valid JSON.");
      return;
    }
    if (changeReason.trim().length < 3) {
      toast.error("Change reason is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/config/${key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          rollout_percentage: rolloutPct,
          sport_filter: sportFilter,
          enabled,
          change_reason: changeReason,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Save failed", { description: JSON.stringify(err.detail) });
        return;
      }
      toast.success(`Saved ${key}`);
      setChangeReason("");
      fetchDetail();
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback(historyId: number) {
    if (!confirm(`Roll back to history entry #${historyId}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/config/${key}/rollback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history_id: historyId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Rollback failed", { description: JSON.stringify(err.detail) });
        return;
      }
      toast.success(`Rolled back to history #${historyId}`);
      fetchDetail();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/config" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← All configurations
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {detail?.registry?.label ?? key}
        </h1>
        <p className="font-mono text-xs text-muted-foreground">{key}</p>
        {detail?.registry?.summary && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{detail.registry.summary}</p>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Editor */}
        <div className="md:col-span-2 space-y-4">
          <div className="rounded-md border p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <span>Enabled</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </label>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Rollout %</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={rolloutPct}
                  onChange={(e) => setRolloutPct(Number(e.target.value))}
                />
              </div>
              <div className="flex-[2]">
                <label className="block text-sm font-medium mb-1">
                  Sport filter (comma-separated, blank = all)
                </label>
                <Input
                  value={sportFilterText}
                  onChange={(e) => setSportFilterText(e.target.value)}
                  placeholder="football, padel"
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <label className="block text-sm font-medium mb-1">Payload (JSON)</label>
            <textarea
              className="font-mono text-xs w-full rounded-md border bg-background p-3"
              rows={28}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPayloadText(JSON.stringify(detail?.registry?.default, null, 2))}
              >
                Reset to DEFAULT
              </Button>
              <Button onClick={handlePreview} disabled={busy}>Preview impact</Button>
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <label className="block text-sm font-medium">
              Change reason (required)
            </label>
            <Input
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="e.g. reducing mid_phv multiplier to 0.80 per S&C review"
            />
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={busy}>Save</Button>
              <Button variant="outline" onClick={() => router.push("/admin/config")} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>

        {/* Preview + History side panel */}
        <div className="space-y-4">
          {preview && (
            <div className="rounded-md border p-4 text-sm">
              <h3 className="font-semibold mb-2">Preview vs DEFAULT</h3>
              <dl className="grid grid-cols-2 gap-y-1">
                <dt className="text-muted-foreground">Sample size</dt>
                <dd>{preview.summary.sample_size}</dd>
                <dt className="text-muted-foreground">Max |Δ CCRS|</dt>
                <dd>{preview.summary.max_abs_delta}</dd>
                <dt className="text-muted-foreground">Mean |Δ CCRS|</dt>
                <dd>{preview.summary.mean_abs_delta}</dd>
                <dt className="text-muted-foreground">Rec changes</dt>
                <dd>{preview.summary.recommendations_changed}</dd>
              </dl>
              {Object.keys(preview.summary.recommendation_shift_matrix).length > 0 && (
                <div className="mt-2">
                  <p className="text-muted-foreground mb-1">Shift matrix</p>
                  <ul className="font-mono text-xs">
                    {Object.entries(preview.summary.recommendation_shift_matrix).map(([k, v]) => (
                      <li key={k}>{k}: {v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="rounded-md border">
            <div className="p-3 border-b">
              <h3 className="font-semibold">History</h3>
              <p className="text-xs text-muted-foreground">Last 20 changes — click to roll back.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Op</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail?.history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      No history yet
                    </TableCell>
                  </TableRow>
                ) : (
                  detail?.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{formatShort(h.changed_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{h.operation}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate" title={h.change_reason ?? ""}>
                        {h.change_reason ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleRollback(h.id)}>
                          Roll back
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
