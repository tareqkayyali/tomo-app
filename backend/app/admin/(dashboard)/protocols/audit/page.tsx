"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import Link from "next/link";

interface Protocol {
  protocol_id: string;
  name: string;
}

interface AuditEntry {
  id: string;
  athlete_id: string;
  protocol_id: string;
  triggered_at: string;
  pd_protocols: {
    name: string;
    category: string;
    priority: number;
    safety_critical: boolean;
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  safety: "bg-red-500/15 text-red-400 border-red-500/30",
  development: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  recovery: "bg-green-500/15 text-green-400 border-green-500/30",
  performance: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  academic: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export default function ProtocolAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  // Filters
  const [athleteId, setAthleteId] = useState("");
  const [protocolId, setProtocolId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [limit, setLimit] = useState("50");

  // Load protocol list for filter dropdown
  useEffect(() => {
    async function loadProtocols() {
      const res = await fetch("/api/v1/admin/protocols", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProtocols(data.protocols ?? []);
      }
    }
    loadProtocols();
  }, []);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (athleteId.trim()) params.set("athlete_id", athleteId.trim());
    if (protocolId !== "all") params.set("protocol_id", protocolId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("limit", limit);

    const res = await fetch(`/api/v1/admin/protocols/audit?${params}`, {
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      setEntries(data.audit_entries ?? []);
      setCount(data.count ?? 0);
    } else {
      toast.error("Failed to load audit log");
    }
    setLoading(false);
  }, [athleteId, protocolId, fromDate, toDate, limit]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Protocol Audit Log</h1>
          <p className="text-muted-foreground">
            {count} entr{count !== 1 ? "ies" : "y"} found
          </p>
        </div>
        <Link href="/admin/protocols">
          <Button variant="outline">Back to Protocols</Button>
        </Link>
      </div>

      <Separator />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="auditAthleteId">Athlete ID</Label>
              <Input
                id="auditAthleteId"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                placeholder="UUID"
              />
            </div>

            <div className="space-y-2">
              <Label>Protocol</Label>
              <Select value={protocolId} onValueChange={(v) => setProtocolId(v ?? "all")}>
                <SelectTrigger>
                  <SelectValue placeholder="All protocols" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Protocols</SelectItem>
                  {protocols.map((p) => (
                    <SelectItem key={p.protocol_id} value={p.protocol_id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromDate">From</Label>
              <Input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="toDate">To</Label>
              <Input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Limit</Label>
              <Select value={limit} onValueChange={(v) => setLimit(v ?? "50")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Athlete ID</TableHead>
              <TableHead>Protocol Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Safety Critical</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No audit entries found
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDate(entry.triggered_at)}
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[180px] truncate">
                    {entry.athlete_id}
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.pd_protocols?.name ?? "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={CATEGORY_COLORS[entry.pd_protocols?.category ?? ""] ?? ""}
                    >
                      {entry.pd_protocols?.category ?? "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                      (entry.pd_protocols?.priority ?? 100) <= 20 ? "bg-red-500/20 text-red-400" :
                      (entry.pd_protocols?.priority ?? 100) <= 50 ? "bg-orange-500/20 text-orange-400" :
                      "bg-blue-500/20 text-blue-400"
                    }`}>
                      {entry.pd_protocols?.priority ?? "?"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {entry.pd_protocols?.safety_critical && (
                      <Badge variant="destructive" className="text-xs">CRITICAL</Badge>
                    )}
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
