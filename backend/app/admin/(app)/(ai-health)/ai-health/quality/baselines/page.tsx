"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Baseline {
  id: string;
  kind: "active" | "long_term_anchor";
  commit_sha: string;
  promoted_at: string;
  promoted_by: string;
  consecutive_green_nights: number | null;
  behavior_fingerprint: string | null;
  drift_vs_anchor_pct: number | string | null;
  notes: string | null;
}

interface BaselineHistoryRow {
  id: string;
  kind: string;
  commit_sha: string;
  promoted_at: string;
  promoted_by: string;
  is_retired: boolean;
  retired_at: string | null;
}

function shortSha(sha: string | null): string {
  if (!sha) return "—";
  return sha.startsWith("PENDING_") ? sha : sha.slice(0, 7);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function BaselinesPage() {
  const [active, setActive] = useState<Baseline | null>(null);
  const [anchor, setAnchor] = useState<Baseline | null>(null);
  const [history, setHistory] = useState<BaselineHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBaselines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/ai-health/baselines", {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to load baselines");
        return;
      }
      const data = await res.json();
      setActive(data.active ?? null);
      setAnchor(data.long_term_anchor ?? null);
      setHistory(data.history ?? []);
    } catch {
      toast.error("Baselines request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBaselines();
  }, [fetchBaselines]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regression Baselines</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dual anchor. The rolling <code>active</code> advances via
          pg_cron after 3 consecutive green nightlies. The{" "}
          <code>long_term_anchor</code> advances only by super_admin manual
          promotion. PR evals must pass against both.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active anchors</CardTitle>
          <CardDescription>
            The current regression contract. When either shows a real commit
            SHA (not <code>PENDING_*</code>), the gate is live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BaselineCard baseline={active} label="Active (rolling)" />
              <BaselineCard baseline={anchor} label="Long-term anchor" />
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Promotion history</CardTitle>
            <CardDescription>
              Last 50 promotions, newest first. Retired rows are previous
              anchors replaced by a newer green streak.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md divide-y">
              {history.slice(0, 50).map((row) => (
                <div
                  key={row.id}
                  className="px-3 py-2 text-xs flex items-center gap-3"
                >
                  <Badge variant="outline" className="font-mono">
                    {row.kind}
                  </Badge>
                  <code className="text-zinc-600">{shortSha(row.commit_sha)}</code>
                  <span className="text-zinc-500">{fmtDate(row.promoted_at)}</span>
                  <span className="text-zinc-500 truncate">
                    by {row.promoted_by}
                  </span>
                  {row.is_retired && (
                    <Badge variant="secondary" className="ml-auto">
                      retired
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BaselineCard({
  baseline,
  label,
}: {
  baseline: Baseline | null;
  label: string;
}) {
  if (!baseline) {
    return (
      <div className="border rounded-md p-4 bg-zinc-50">
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
          {label}
        </p>
        <p className="text-sm text-muted-foreground">not set</p>
      </div>
    );
  }
  const isPlaceholder = baseline.commit_sha.startsWith("PENDING_");
  return (
    <div
      className={`border rounded-md p-4 ${isPlaceholder ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {label}
      </p>
      <div className="flex items-baseline gap-2">
        <code className="font-mono text-sm">{shortSha(baseline.commit_sha)}</code>
        {isPlaceholder && (
          <Badge variant="outline" className="text-[10px]">
            placeholder
          </Badge>
        )}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-zinc-600">
        <div>
          <span className="text-zinc-500">Promoted:</span>{" "}
          {fmtDate(baseline.promoted_at)} by {baseline.promoted_by}
        </div>
        {baseline.consecutive_green_nights != null && (
          <div>
            <span className="text-zinc-500">Green nights:</span>{" "}
            {baseline.consecutive_green_nights}
          </div>
        )}
        {baseline.drift_vs_anchor_pct != null && (
          <div>
            <span className="text-zinc-500">Drift vs anchor:</span>{" "}
            {Number(baseline.drift_vs_anchor_pct).toFixed(2)}%
          </div>
        )}
        {baseline.notes && (
          <div className="text-zinc-500 italic mt-1">{baseline.notes}</div>
        )}
      </div>
    </div>
  );
}
