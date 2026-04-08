"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

interface Signal {
  signal_id: string;
  key: string;
  display_name: string;
  subtitle: string;
  priority: number;
  color: string;
  is_enabled: boolean;
  is_built_in: boolean;
  show_urgency_badge: boolean;
  urgency_label: string | null;
  conditions: { match: string; conditions: unknown[] };
}

const PRIORITY_COLORS: Record<string, string> = {
  safety: "bg-red-500/20 text-red-400",
  contextual: "bg-orange-500/20 text-orange-400",
  positive: "bg-blue-500/20 text-blue-400",
  custom: "bg-gray-500/20 text-gray-400",
};

function getPriorityStyle(priority: number): string {
  if (priority <= 3) return PRIORITY_COLORS.safety;
  if (priority <= 6) return PRIORITY_COLORS.contextual;
  if (priority <= 8) return PRIORITY_COLORS.positive;
  return PRIORITY_COLORS.custom;
}

export default function SignalsListPage() {
  const router = useRouter();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("enabled", statusFilter === "enabled" ? "true" : "false");

    const res = await fetch(`/api/v1/admin/signals?${params}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setSignals(data.signals ?? []);
    } else {
      toast.error("Failed to load signals");
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  async function handleToggle(signal: Signal) {
    if (signal.is_built_in && signal.is_enabled) {
      toast.error("Built-in signals cannot be disabled");
      return;
    }

    const res = await fetch(`/api/v1/admin/signals/${signal.signal_id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !signal.is_enabled }),
    });

    if (res.ok) {
      toast.success(`"${signal.display_name}" ${!signal.is_enabled ? "enabled" : "disabled"}`);
      fetchSignals();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to update signal");
    }
  }

  async function handleDelete(signal: Signal) {
    if (signal.is_built_in) {
      toast.error("Built-in signals cannot be deleted");
      return;
    }

    if (!confirm(`Delete "${signal.display_name}"? This will disable the signal.`)) return;

    const res = await fetch(`/api/v1/admin/signals/${signal.signal_id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${signal.display_name}" deleted`);
      fetchSignals();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete signal");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Signals</h1>
          <p className="text-muted-foreground">
            {signals.length} signal{signals.length !== 1 ? "s" : ""} configured — evaluated in priority order (lowest first)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/protocols/test">
            <Button variant="outline">Test / Simulate</Button>
          </Link>
          <Link href="/admin/protocols/audit">
            <Button variant="outline">Audit Log</Button>
          </Link>
          <Link href="/admin/signals/new">
            <Button>+ New Signal</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Priority</TableHead>
              <TableHead>Signal</TableHead>
              <TableHead className="w-[100px]">Color</TableHead>
              <TableHead className="w-[120px]">Conditions</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[120px]">Safety Critical</TableHead>
              <TableHead className="w-[90px]">Built-in</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : signals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No signals found
                </TableCell>
              </TableRow>
            ) : (
              signals.map((s) => (
                <TableRow
                  key={s.signal_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/signals/${s.signal_id}/edit`)}
                >
                  <TableCell>
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${getPriorityStyle(s.priority)}`}>
                      {s.priority}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="font-bold tracking-wide" style={{ color: s.color }}>
                        {s.display_name}
                      </span>
                      {s.show_urgency_badge && (
                        <Badge variant="destructive" className="text-[10px]">
                          {s.urgency_label?.toUpperCase() || "URGENCY"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                      {s.subtitle}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{s.key}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full border border-white/10"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{s.color}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {s.conditions?.conditions?.length ?? 0} rule{(s.conditions?.conditions?.length ?? 0) !== 1 ? "s" : ""}
                      {" · "}
                      {s.conditions?.match?.toUpperCase() ?? "ALL"}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={s.is_enabled}
                      onCheckedChange={() => handleToggle(s)}
                    />
                  </TableCell>
                  <TableCell>
                    {s.show_urgency_badge && (
                      <Badge variant="destructive" className="text-xs">
                        CRITICAL
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.is_built_in && (
                      <span className="text-muted-foreground text-lg" title="Built-in signal">
                        🔒
                      </span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/admin/signals/${s.signal_id}/edit`)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        disabled={s.is_built_in}
                        onClick={() => handleDelete(s)}
                      >
                        Delete
                      </Button>
                    </div>
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
