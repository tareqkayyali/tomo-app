"use client";

/**
 * Wearable Connections Ops panel.
 *
 * Lists every athlete's wearable OAuth connection (Whoop, Oura, etc.)
 * with sync status + last error. Supports revoke (hard delete of the
 * connection row) so ops can force re-auth when tokens go sideways.
 *
 * Access tokens are never returned by the API — this page is a safe
 * admin lens over the sensitive wearable_connections table.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface WearableRow {
  id: string;
  user_id: string;
  athlete_email: string | null;
  athlete_name: string | null;
  provider: string;
  external_user_id: string | null;
  scopes: string[];
  connected_at: string | null;
  last_sync_at: string | null;
  sync_status: string | null;
  sync_error: string | null;
  token_expires_at: string | null;
  updated_at: string | null;
}

const PAGE = 50;

export default function WearablesPage() {
  const [rows, setRows] = useState<WearableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [provider, setProvider] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE),
        offset: String(offset),
      });
      if (provider !== "all") qs.set("provider", provider);
      if (status !== "all") qs.set("status", status);

      const res = await fetch(`/api/v1/admin/wearables?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { rows: WearableRow[]; total: number };
      setRows(data.rows);
      setTotal(data.total);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [offset, provider, status]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  async function handleRevoke(row: WearableRow) {
    if (
      !confirm(
        `Revoke ${row.provider} connection for ${row.athlete_email || row.user_id}? The athlete will need to re-authenticate.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/v1/admin/wearables?id=${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Revoked");
      await fetchRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const pageIndex = Math.floor(offset / PAGE);

  function statusVariant(s: string | null): "default" | "destructive" | "outline" | "secondary" {
    if (!s) return "outline";
    if (s === "error") return "destructive";
    if (s === "stale") return "secondary";
    return "default";
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Wearable Connections
        </h1>
        <p className="text-sm text-muted-foreground">
          OAuth-backed connections to Whoop, Oura, and other wearable
          providers. Use this view to debug sync failures, inspect scope
          grants, and force re-auth by revoking a connection.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <Select value={provider} onValueChange={(v) => { setProvider(v ?? "all"); setOffset(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="whoop">Whoop</SelectItem>
              <SelectItem value="oura">Oura</SelectItem>
              <SelectItem value="garmin">Garmin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sync status</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v ?? "all"); setOffset(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="stale">Stale</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Input
            readOnly
            className="w-28 text-right tabular-nums"
            value={`${total} total`}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No wearable connections match.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Athlete</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead>Token expires</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="w-24 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {r.athlete_email || "—"}
                      </span>
                      {r.athlete_name ? (
                        <span className="text-xs text-muted-foreground">
                          {r.athlete_name}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {r.provider}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.sync_status)}>
                      {r.sync_status ?? "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.last_sync_at
                      ? new Date(r.last_sync_at).toLocaleString()
                      : "never"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.token_expires_at
                      ? new Date(r.token_expires_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {r.scopes.length > 0 ? r.scopes.join(", ") : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-destructive max-w-xs truncate">
                    {r.sync_error || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleRevoke(r)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              Page {pageIndex + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE >= total}
                onClick={() => setOffset((o) => o + PAGE)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
