"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface SafetyFlag {
  flag_id: string;
  flag_type: "rule_missed" | "false_positive";
  severity: "critical" | "high" | "medium";
  status: "open" | "triaged" | "resolved" | "false_alarm";
  phv_stage: string | null;
  age_band: string | null;
  rule_trigger: string | null;
  auditor_model: string | null;
  turn_id: string;
  session_id: string | null;
  flagged_at: string;
  turn_at: string;
  resolution: string | null;
}

const PAGE_SIZE = 50;

export default function SafetyFlagsPage() {
  const [flags, setFlags] = useState<SafetyFlag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [flagTypeFilter, setFlagTypeFilter] = useState<string>("all");

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (flagTypeFilter !== "all") params.set("flagType", flagTypeFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await fetch(
        `/api/v1/admin/enterprise/quality/safety-flags?${params.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load flags");
      const data = await res.json();
      setFlags(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, severityFilter, flagTypeFilter]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  async function resolveFlag(
    flagId: string,
    status: "triaged" | "resolved" | "false_alarm"
  ) {
    try {
      const res = await fetch(
        `/api/v1/admin/enterprise/quality/safety-flags/${flagId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) throw new Error("Failed to update flag");
      toast.success(`Flag marked ${status.replace("_", " ")}`);
      fetchFlags();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function severityBadge(severity: string) {
    const classes: Record<string, string> = {
      critical:
        "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
      high:
        "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
      medium:
        "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
    };
    return (
      <span
        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${classes[severity] ?? ""}`}
      >
        {severity}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Safety Audit Flags</h1>
        <p className="text-muted-foreground">
          Turns where the PHV safety rule and the Haiku auditor disagreed. Each
          flag is either a missed rule (auditor caught something the rule didn&apos;t)
          or a false positive (rule fired on safe content).
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="triaged">Triaged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="false_alarm">False alarm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Severity</label>
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? "all")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Flag type</label>
            <Select value={flagTypeFilter} onValueChange={(v) => setFlagTypeFilter(v ?? "all")}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="rule_missed">Rule missed</SelectItem>
                <SelectItem value="false_positive">False positive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flagged</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>PHV</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Turn</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-6" />
                  </TableCell>
                </TableRow>
              ))
            ) : flags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No safety flags matched.
                </TableCell>
              </TableRow>
            ) : (
              flags.map((f) => (
                <TableRow key={f.flag_id}>
                  <TableCell className="font-mono text-xs">
                    {new Date(f.flagged_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{f.flag_type.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>{severityBadge(f.severity)}</TableCell>
                  <TableCell className="text-xs">{f.status}</TableCell>
                  <TableCell>{f.age_band ?? "—"}</TableCell>
                  <TableCell>{f.phv_stage ?? "—"}</TableCell>
                  <TableCell
                    className="max-w-xs truncate"
                    title={f.rule_trigger ?? ""}
                  >
                    {f.rule_trigger ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {f.turn_id?.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-right">
                    {f.status === "open" ? (
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveFlag(f.flag_id, "resolved")}
                        >
                          Resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => resolveFlag(f.flag_id, "false_alarm")}
                        >
                          False alarm
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {f.resolution ?? ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex justify-between items-center text-sm">
        <div className="text-muted-foreground">
          {total === 0
            ? "0 flags"
            : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
        </div>
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
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
