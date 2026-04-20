"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Engine Configuration — read-only index.
 *
 * This is the PR 1 scaffold. Each row shows rollout status, sport filter,
 * and last-edit metadata for every system_config key. Detail page
 * (editing + history + shadow eval) lands in PR 2 per the plan.
 *
 * Empty-state is expected for the first deploy — domain rows get seeded
 * in the PRs that wire each domain (PR 2: ccrs_formula_v1, acwr_config_v1;
 * PR 3: intensity_catalog_v1; etc.).
 */

interface ConfigRow {
  config_key:         string;
  schema_version:     number;
  rollout_percentage: number;
  sport_filter:       string[] | null;
  enabled:            boolean;
  updated_at:         string;
  updated_by:         string | null;
  change_reason:      string | null;
}

export default function EngineConfigPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/config", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Engine Configuration</h1>
        <p className="text-muted-foreground mt-2">
          CMS-configurable knobs for the readiness engine, load attribution, notifications and
          downstream formulas. Every row is validated against a typed schema on every read; a
          hardcoded DEFAULT in code keeps the system running if a row is missing or malformed.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {configs.length} configuration{configs.length !== 1 ? "s" : ""} registered
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Schema</TableHead>
              <TableHead>Rollout</TableHead>
              <TableHead>Sport filter</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Last change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : configs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  No engine configurations seeded yet. The hardcoded DEFAULT in code is serving
                  every read. Domain-specific rows land in follow-up PRs.
                </TableCell>
              </TableRow>
            ) : (
              configs.map((cfg) => (
                <TableRow key={cfg.config_key}>
                  <TableCell className="font-mono font-medium">
                    <Link
                      href={`/admin/config/${cfg.config_key}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {cfg.config_key}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">v{cfg.schema_version}</TableCell>
                  <TableCell>
                    {cfg.rollout_percentage === 100 ? (
                      <Badge variant="secondary">100%</Badge>
                    ) : (
                      <Badge variant="outline">{cfg.rollout_percentage}%</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!cfg.sport_filter || cfg.sport_filter.length === 0 ? (
                      <Badge variant="secondary">All</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {cfg.sport_filter.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs capitalize">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {cfg.enabled ? (
                      <Badge>On</Badge>
                    ) : (
                      <Badge variant="destructive">Off</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatRelative(cfg.updated_at)}
                    {cfg.change_reason ? ` — ${cfg.change_reason}` : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
