"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Notification Type Config — per-type kill switches, priority overrides,
 * and push toggles for the 25+ notification templates. Critical types
 * cannot be disabled (enforced by API + service layer).
 *
 * Changes persist to notification_type_config; notificationEngine +
 * pushDelivery consult this live (5s admin cache) on every create.
 */

interface NotifConfigRow {
  type: string;
  category: string;
  default_priority: number;
  priority_override: number | null;
  effective_priority: number;
  enabled: boolean;
  push_enabled: boolean;
  can_dismiss: boolean;
  is_critical: boolean;
  notes: string | null;
  has_override: boolean;
}

const CATEGORY_ORDER = ["critical", "training", "coaching", "academic", "triangle", "cv", "system"];

export default function NotificationConfigPage() {
  const [configs, setConfigs] = useState<NotifConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/notifications/config", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs ?? []);
      } else {
        setError(`Failed to load: ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const toggleEnabled = async (row: NotifConfigRow, enabled: boolean) => {
    if (row.is_critical && !enabled) return; // cannot disable critical
    setSavingType(row.type);
    try {
      const res = await fetch("/api/v1/admin/notifications/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: row.type, enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingType(null);
    }
  };

  const togglePush = async (row: NotifConfigRow, push_enabled: boolean) => {
    setSavingType(row.type);
    try {
      const res = await fetch("/api/v1/admin/notifications/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: row.type, push_enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingType(null);
    }
  };

  const grouped = configs.reduce<Record<string, NotifConfigRow[]>>((acc, row) => {
    (acc[row.category] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification Config</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-type kill switches and push toggles. Changes apply within 5 seconds (admin cache).
          Critical types cannot be disabled — they protect athlete safety.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
          <div key={cat} className="space-y-2">
            <h2 className="text-lg font-medium capitalize">
              {cat}
              <span className="ml-2 text-xs text-muted-foreground">
                ({grouped[cat].length} types)
              </span>
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Push</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped[cat].map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="font-mono text-xs">{row.type}</TableCell>
                    <TableCell>
                      <Badge variant={row.effective_priority === 1 ? "destructive" : "secondary"}>
                        P{row.effective_priority}
                      </Badge>
                      {row.has_override && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (was P{row.default_priority})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={row.enabled ? "default" : "outline"}
                        disabled={row.is_critical || savingType === row.type}
                        onClick={() => toggleEnabled(row, !row.enabled)}
                      >
                        {row.enabled ? "On" : "Off"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={row.push_enabled ? "default" : "outline"}
                        disabled={savingType === row.type}
                        onClick={() => togglePush(row, !row.push_enabled)}
                      >
                        {row.push_enabled ? "Push on" : "Push off"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      {row.is_critical && <Badge variant="destructive">Critical</Badge>}
                      {!row.can_dismiss && (
                        <Badge variant="outline" className="ml-1">
                          Sticky
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </div>
  );
}
