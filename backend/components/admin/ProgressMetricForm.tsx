"use client";

/**
 * Progress Metric form — new/edit page for a single row in `progress_metrics`.
 *
 * Fields mirror the CMS table 1:1:
 *   metric_key, display_name, display_unit, category
 *   source_kind + source_field (data binding)
 *   direction (delta styling), value_min/max (ring normalisation)
 *   sort_order, sport_filter (badge toggles), is_enabled
 *   notification_triggers (JSONB editor — Phase 4 wires the cron)
 *
 * Stays intentionally plain — uses native inputs / selects / textareas, same
 * utility styling as the rest of the admin panel. No fancy form library.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Category = "readiness" | "wellness" | "academic" | "performance" | "engagement";
type SourceKind =
  | "snapshot_field"
  | "daily_vitals_avg"
  | "daily_vitals_latest"
  | "checkin_avg"
  | "checkin_latest"
  | "daily_load_sum"
  | "event_aggregate"
  | "benchmark";
type Direction = "higher_better" | "lower_better" | "neutral";

interface Props {
  metricId?: string; // undefined = create mode
}

const CATEGORIES: Category[] = ["readiness", "wellness", "academic", "performance", "engagement"];
const SOURCE_KINDS: SourceKind[] = [
  "snapshot_field",
  "daily_vitals_latest",
  "daily_vitals_avg",
  "checkin_latest",
  "checkin_avg",
  "daily_load_sum",
  "event_aggregate",
  "benchmark",
];
const DIRECTIONS: Direction[] = ["higher_better", "lower_better", "neutral"];

const SPORT_OPTIONS = ["football", "soccer", "basketball", "tennis", "padel", "athletics"];

export default function ProgressMetricForm({ metricId }: Props) {
  const router = useRouter();
  const isEdit = !!metricId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [metricKey, setMetricKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayUnit, setDisplayUnit] = useState("");
  const [category, setCategory] = useState<Category>("readiness");
  const [sourceKind, setSourceKind] = useState<SourceKind>("snapshot_field");
  const [sourceField, setSourceField] = useState("");
  const [direction, setDirection] = useState<Direction>("higher_better");
  const [valueMin, setValueMin] = useState<string>("");
  const [valueMax, setValueMax] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<number>(100);
  const [sportFilter, setSportFilter] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [triggersJson, setTriggersJson] = useState<string>("");
  const [triggersError, setTriggersError] = useState<string>("");

  // Load existing row on edit
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const res = await fetch(`/api/v1/admin/progress-metrics/${metricId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to load metric");
        router.push("/admin/progress-metrics");
        return;
      }
      const m = await res.json();
      setMetricKey(m.metric_key);
      setDisplayName(m.display_name);
      setDisplayUnit(m.display_unit ?? "");
      setCategory(m.category);
      setSourceKind(m.source_kind);
      setSourceField(m.source_field);
      setDirection(m.direction);
      setValueMin(m.value_min != null ? String(m.value_min) : "");
      setValueMax(m.value_max != null ? String(m.value_max) : "");
      setSortOrder(m.sort_order);
      setSportFilter(Array.isArray(m.sport_filter) ? m.sport_filter : []);
      setIsEnabled(!!m.is_enabled);
      setTriggersJson(
        m.notification_triggers
          ? JSON.stringify(m.notification_triggers, null, 2)
          : "",
      );
      setLoading(false);
    })();
  }, [isEdit, metricId, router]);

  function toggleSport(sport: string) {
    setSportFilter((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate triggers JSON on the client so bad input doesn't round-trip.
    let parsedTriggers: unknown = null;
    if (triggersJson.trim()) {
      try {
        parsedTriggers = JSON.parse(triggersJson);
        setTriggersError("");
      } catch {
        setTriggersError("Invalid JSON");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      metric_key: metricKey.trim(),
      display_name: displayName.trim(),
      display_unit: displayUnit.trim(),
      category,
      source_kind: sourceKind,
      source_field: sourceField.trim(),
      direction,
      value_min: valueMin === "" ? null : Number(valueMin),
      value_max: valueMax === "" ? null : Number(valueMax),
      sort_order: sortOrder,
      sport_filter: sportFilter.length > 0 ? sportFilter : null,
      is_enabled: isEnabled,
      notification_triggers: parsedTriggers,
    };

    setSaving(true);
    const url = isEdit
      ? `/api/v1/admin/progress-metrics/${metricId}`
      : `/api/v1/admin/progress-metrics`;
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (res.ok) {
      toast.success(isEdit ? "Metric updated" : "Metric created");
      router.push("/admin/progress-metrics");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Save failed");
    }
  }

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {isEdit ? "Edit Progress Metric" : "New Progress Metric"}
        </h1>
        <div className="flex items-center gap-2">
          <Label htmlFor="enabled" className="text-sm">Enabled</Label>
          <Switch id="enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
        </div>
      </div>

      {/* Identity */}
      <section className="space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Identity</h2>
        <div>
          <Label>Metric key</Label>
          <Input
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            placeholder="e.g. recovery, hrv, sprint_10m"
            disabled={isEdit}
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            lowercase + underscores; used as the stable mobile identifier.
            Cannot change after creation.
          </p>
        </div>
        <div>
          <Label>Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Recovery"
            required
          />
        </div>
        <div>
          <Label>Display unit</Label>
          <Input
            value={displayUnit}
            onChange={(e) => setDisplayUnit(e.target.value)}
            placeholder="%, h, ms, /10, AU, s"
          />
        </div>
        <div>
          <Label>Category</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Data source */}
      <section className="space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Data source</h2>
        <div>
          <Label>Source kind</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={sourceKind}
            onChange={(e) => setSourceKind(e.target.value as SourceKind)}
          >
            {SOURCE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Tells the resolver which table + aggregation to use. `benchmark` = latest value from `test_log`.
          </p>
        </div>
        <div>
          <Label>Source field</Label>
          <Input
            value={sourceField}
            onChange={(e) => setSourceField(e.target.value)}
            placeholder="readiness_score, sleep_hours, hrv_morning_ms, sprint_10m"
            required
          />
        </div>
        <div>
          <Label>Direction</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            `lower_better` flips the delta chip colour — e.g. Soreness up = bad.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Value min (optional)</Label>
            <Input
              type="number"
              value={valueMin}
              onChange={(e) => setValueMin(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Value max (optional)</Label>
            <Input
              type="number"
              value={valueMax}
              onChange={(e) => setValueMax(e.target.value)}
              placeholder="100"
            />
          </div>
        </div>
      </section>

      {/* Display + filtering */}
      <section className="space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Display</h2>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Lower = higher in the grid. Convention: increments of 100.
          </p>
        </div>
        <div>
          <Label>Sport filter</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {SPORT_OPTIONS.map((s) => {
              const active = sportFilter.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSport(s)}
                  className="outline-none"
                >
                  <Badge variant={active ? "default" : "outline"}>{s}</Badge>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            No sports selected = shown for all athletes.
          </p>
        </div>
      </section>

      {/* Notification triggers (Phase 4) */}
      <section className="space-y-3 rounded-md border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Notification triggers (optional)</h2>
        <p className="text-xs text-muted-foreground">
          JSON rules that fire notifications when the metric crosses a threshold
          (compared to the metric's latest value) or a trend bound (compared to
          the 7-day delta %). The daily cron dispatches via the existing
          notification engine, so quiet hours, daily cap, fatigue, and push
          suppression all apply automatically.
          <br />
          <br />
          <code>notification_type</code> must reference a registered template in
          <code> notificationTemplates.ts</code>. The progress-specific ones
          (PROGRESS_THRESHOLD_LOW, PROGRESS_THRESHOLD_HIGH,
          PROGRESS_TREND_DECLINING, PROGRESS_TREND_IMPROVING) receive
          <code> display_name</code>, <code>latest</code>, <code>unit</code>,
          <code> delta</code>, and <code>window_days</code> as interpolation
          vars automatically.
        </p>
        <Textarea
          value={triggersJson}
          onChange={(e) => {
            setTriggersJson(e.target.value);
            setTriggersError("");
          }}
          rows={10}
          placeholder={`{\n  "triggers": [\n    {\n      "kind": "threshold",\n      "operator": "lt",\n      "value": 50,\n      "notification_type": "PROGRESS_THRESHOLD_LOW",\n      "cooldown_hours": 24\n    },\n    {\n      "kind": "trend",\n      "operator": "delta_lt_pct",\n      "value": -15,\n      "notification_type": "PROGRESS_TREND_DECLINING",\n      "cooldown_hours": 48\n    }\n  ]\n}`}
          className="font-mono text-xs"
        />
        {triggersError && (
          <p className="text-xs text-destructive">{triggersError}</p>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/progress-metrics")}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}
