"use client";

/**
 * SD Wideners Admin Page
 *
 * Per-(sport, age_band) multiplier applied to normative-data SDs at
 * percentile-calc time. Widens youth-band SDs to reflect published variance
 * that the SEN-derived norms under-represent. CMS-editable so ops can tune
 * without a code deploy.
 *
 * Changes propagate in ≤5 minutes (widener cache TTL) — the PUT handler
 * busts the in-process cache for the instance that served the write.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";

const SPORTS = [
  { id: "football", label: "Football" },
  { id: "soccer", label: "Soccer" },
  { id: "basketball", label: "Basketball" },
  { id: "tennis", label: "Tennis" },
  { id: "padel", label: "Padel" },
];

const AGE_BANDS = ["U13", "U15", "U17", "U19", "SEN", "SEN30", "VET"] as const;

interface WidenerRow {
  id: string;
  sport_id: string;
  age_band: string;
  multiplier: number;
  rationale: string | null;
  updated_at: string;
}

interface Draft {
  multiplier: string;
  rationale: string;
}

export default function NormativeWidenersPage() {
  const [sportId, setSportId] = useState<string>("football");
  const [rows, setRows] = useState<WidenerRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingBand, setSavingBand] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/admin/sd-wideners?sport_id=${sportId}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        toast.error("Failed to load wideners");
        setRows([]);
        return;
      }
      const data = await res.json();
      const fetched: WidenerRow[] = data.rows ?? [];
      setRows(fetched);

      // Ensure every age band has a row in the UI even if the DB is missing
      // one — CMS ops can set it without needing a separate "create" flow.
      const draftMap: Record<string, Draft> = {};
      for (const band of AGE_BANDS) {
        const existing = fetched.find((r) => r.age_band === band);
        draftMap[band] = {
          multiplier: existing ? String(existing.multiplier) : "1.000",
          rationale: existing?.rationale ?? "",
        };
      }
      setDrafts(draftMap);
    } finally {
      setLoading(false);
    }
  }, [sportId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSave(ageBand: string) {
    const draft = drafts[ageBand];
    if (!draft) return;
    const multiplier = Number(draft.multiplier);
    if (!Number.isFinite(multiplier) || multiplier < 0.5 || multiplier > 3.0) {
      toast.error("Multiplier must be between 0.5 and 3.0");
      return;
    }

    setSavingBand(ageBand);
    try {
      const res = await fetch(`/api/v1/admin/sd-wideners`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport_id: sportId,
          age_band: ageBand,
          multiplier,
          rationale: draft.rationale.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Save failed");
        return;
      }
      toast.success(`${ageBand} widener saved — propagates within 5 min`);
      await fetchData();
    } finally {
      setSavingBand(null);
    }
  }

  function updateDraft(band: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [band]: { ...prev[band], ...patch },
    }));
  }

  const sportLabel =
    SPORTS.find((s) => s.id === sportId)?.label ?? sportId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SD Wideners</h1>
        <p className="text-muted-foreground mt-1">
          Per-age-band multiplier applied to normative SDs for {sportLabel}.
          Compensates for youth performance variance that the senior-derived
          norms under-represent. Changes propagate in up to 5 minutes.
        </p>
      </div>

      {/* Sport Selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium">Sport:</Label>
        <Select
          value={sportId}
          onValueChange={(v) => {
            if (v) setSportId(v);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPORTS.map((sport) => (
              <SelectItem key={sport.id} value={sport.id}>
                {sport.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          Loading wideners...
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Age Band</TableHead>
                <TableHead className="w-32">Multiplier</TableHead>
                <TableHead>Rationale</TableHead>
                <TableHead className="w-28 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AGE_BANDS.map((band) => {
                const draft = drafts[band] ?? {
                  multiplier: "1.000",
                  rationale: "",
                };
                const existing = rows.find((r) => r.age_band === band);
                const dirty =
                  draft.multiplier !== String(existing?.multiplier ?? "1.000") ||
                  draft.rationale !== (existing?.rationale ?? "");
                return (
                  <TableRow key={band}>
                    <TableCell className="font-mono font-medium">
                      {band}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.5"
                        max="3.0"
                        value={draft.multiplier}
                        onChange={(e) =>
                          updateDraft(band, { multiplier: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        placeholder="e.g. Mendez-Villanueva 2024 — U17 spread ~25% wider"
                        value={draft.rationale}
                        onChange={(e) =>
                          updateDraft(band, { rationale: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "outline"}
                        disabled={!dirty || savingBand === band}
                        onClick={() => handleSave(band)}
                      >
                        {savingBand === band ? "Saving…" : "Save"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p>
          <strong>How this works:</strong> benchmark percentile math reads
          <code className="mx-1 rounded bg-muted px-1 py-0.5">sport_sd_wideners</code>
          at query time (cached 5 min) and multiplies the stored SD before
          computing the z-score. Every snapshot is tagged with the multiplier
          that was applied, so historical percentiles are reproducible.
        </p>
        <p className="mt-2">
          Default values (football, signed off 2026-04-20): U13=1.60, U15=1.40,
          U17=1.25, U19=1.10, SEN+=1.00 — based on Malina 2015, Buchheit 2012,
          Mendez-Villanueva 2024 on youth maturation spread.
        </p>
      </div>
    </div>
  );
}
