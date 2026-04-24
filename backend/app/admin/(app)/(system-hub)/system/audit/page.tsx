"use client";

/**
 * Admin Audit Log viewer.
 *
 * Read-only view over admin_audit_log. Every mutation performed via
 * services/admin/* and api/v1/admin/* should call logAudit() from
 * lib/admin/audit.ts, which lands rows here.
 */

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";

interface AuditRow {
  id: string;
  actor_id: string;
  actor_email: string | null;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  tenant_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: "",
    resource_type: "",
    actor: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(page * PAGE_SIZE));
      if (filters.action) qs.set("action", filters.action);
      if (filters.resource_type) qs.set("resource_type", filters.resource_type);
      if (filters.actor) qs.set("actor", filters.actor);

      const res = await fetch(`/api/v1/admin/audit?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { rows: AuditRow[]; total: number };
      setRows(data.rows);
      setTotal(data.total);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only trail of every CMS mutation. Use filters to scope the
          view. Each row captures the actor, the action, the resource, and the
          full metadata snapshot.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Input
            placeholder="e.g. update, delete, role_change"
            value={filters.action}
            onChange={(e) => {
              setFilters((f) => ({ ...f, action: e.target.value }));
              setPage(0);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Resource type</Label>
          <Input
            placeholder="e.g. training_program, knowledge_chunk"
            value={filters.resource_type}
            onChange={(e) => {
              setFilters((f) => ({ ...f, resource_type: e.target.value }));
              setPage(0);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Actor (user id)</Label>
          <Input
            placeholder="uuid"
            value={filters.actor}
            onChange={(e) => {
              setFilters((f) => ({ ...f, actor: e.target.value }));
              setPage(0);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No audit rows match.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {r.actor_email || r.actor_id}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.actor_role.replace("_", " ")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{r.resource_type}</span>
                      {r.resource_id ? (
                        <span className="text-xs text-muted-foreground font-mono">
                          {r.resource_id}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <pre className="text-xs bg-muted rounded p-2 max-w-md overflow-auto">
                      {JSON.stringify(r.metadata, null, 2)}
                    </pre>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} — {total} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
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
