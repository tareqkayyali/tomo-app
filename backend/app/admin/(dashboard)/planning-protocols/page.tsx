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
import { PageGuide } from "@/components/admin/PageGuide";

interface PlanningProtocol {
  id: string;
  name: string;
  description: string | null;
  severity: "MANDATORY" | "ADVISORY" | "INFO";
  category: string;
  trigger_conditions: unknown[];
  actions: Record<string, unknown>;
  scientific_basis: string | null;
  sport_filter: string[] | null;
  is_enabled: boolean;
  version: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  MANDATORY: "bg-red-500/15 text-red-400 border-red-500/30",
  ADVISORY: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  INFO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const CATEGORY_COLORS: Record<string, string> = {
  safety: "bg-red-500/15 text-red-400 border-red-500/30",
  load_management: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  recovery: "bg-green-500/15 text-green-400 border-green-500/30",
  academic: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  scheduling: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  performance: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export default function PlanningProtocolsListPage() {
  const router = useRouter();
  const [protocols, setProtocols] = useState<PlanningProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("all");

  const fetchProtocols = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/planning-protocols", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setProtocols(data.protocols ?? []);
    } else {
      toast.error("Failed to load planning protocols");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProtocols();
  }, [fetchProtocols]);

  const filtered =
    severityFilter === "all"
      ? protocols
      : protocols.filter((p) => p.severity === severityFilter);

  async function handleToggle(protocol: PlanningProtocol) {
    const res = await fetch(`/api/v1/admin/planning-protocols/${protocol.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !protocol.is_enabled }),
    });

    if (res.ok) {
      toast.success(
        `"${protocol.name}" ${!protocol.is_enabled ? "enabled" : "disabled"}`
      );
      fetchProtocols();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to update protocol");
    }
  }

  async function handleDelete(protocol: PlanningProtocol) {
    if (!confirm(`Delete "${protocol.name}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/v1/admin/planning-protocols/${protocol.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${protocol.name}" deleted`);
      fetchProtocols();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete protocol");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Planning Protocols
          </h1>
          <p className="text-muted-foreground">
            {protocols.length} protocol{protocols.length !== 1 ? "s" : ""}{" "}
            configured
          </p>
        </div>
        <Link href="/admin/planning-protocols/new">
          <Button>+ New Protocol</Button>
        </Link>
      </div>

      <PageGuide
        summary="Planning Protocols are automated rules that fire when an athlete's data hits specific thresholds. They're the guardrails of the system — preventing overtraining, managing exam stress, and ensuring recovery happens when it should."
        details={[
          "Each protocol has trigger conditions (IF) and actions (THEN). When all conditions are met, the action fires automatically. Think of them as 'if ACWR > 1.5, then reduce load by 40%'.",
          "Severity determines how aggressively the system enforces the protocol. MANDATORY rules block the athlete from overriding (e.g., growth phase load caps). ADVISORY rules suggest but allow override. INFO rules are educational.",
          "Category groups protocols for the recommendation engine. 'Safety' and 'load_management' protocols feed into the Load Warning computer. 'Academic' protocols feed the Academic computer. 'Recovery' protocols feed the Recovery computer.",
          "Conditions use snapshot fields — the same real-time data that powers the athlete dashboard. Common fields: ACWR, dual load index, exam proximity score, readiness score, active injury count.",
          "Sport Filter lets you create sport-specific protocols. A football protocol might trigger on match day + 1, while a tennis protocol might watch for consecutive match days.",
          "Scientific Basis is shown to coaches and parents when they ask 'why is this recommendation showing?' It builds trust in the system. Always reference peer-reviewed research when possible.",
        ]}
        examples={[
          "PHV Load Reduction (MANDATORY, safety): IF phv_stage = mid_phv AND ACWR > 1.2, THEN reduce_load 40%. Scientific basis: Lloyd & Oliver (2012) youth periodization model.",
          "Exam Week Taper (ADVISORY, academic): IF exam_proximity_score > 80 AND dual_load_index > 60, THEN reduce_load 30% + suggest 'Front-load training early this week to free up exam prep time'.",
          "Post-Match Recovery (ADVISORY, recovery): IF days_since_last_session = 0 AND matches_next_7d >= 1, THEN schedule_recovery + suggest 'Recovery session recommended — you have another match this week'.",
          "Detraining Alert (INFO, performance): IF ACWR < 0.8 AND days_since_last_session > 5, THEN alert + suggest 'Your training has dropped significantly. Even light activity helps maintain your base'.",
        ]}
      />

      {/* Severity Filter */}
      <div className="flex gap-3">
        <Select
          value={severityFilter}
          onValueChange={(v) => setSeverityFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="MANDATORY">Mandatory</SelectItem>
            <SelectItem value="ADVISORY">Advisory</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead className="w-[100px]">Sport Filter</TableHead>
              <TableHead className="w-[80px]">Enabled</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No planning protocols found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/admin/planning-protocols/${p.id}/edit`)
                  }
                >
                  <TableCell className="font-medium">
                    {p.name}
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                        {p.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={CATEGORY_COLORS[p.category] ?? ""}
                    >
                      {p.category.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={SEVERITY_COLORS[p.severity] ?? ""}
                    >
                      {p.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Array.isArray(p.trigger_conditions)
                      ? `${p.trigger_conditions.length} condition${p.trigger_conditions.length !== 1 ? "s" : ""}`
                      : "\u2014"}
                  </TableCell>
                  <TableCell>
                    {p.sport_filter && p.sport_filter.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {p.sport_filter.map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">All</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={p.is_enabled}
                      onCheckedChange={() => handleToggle(p)}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/admin/planning-protocols/${p.id}/edit`
                          )
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive/80"
                        onClick={() => handleDelete(p)}
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
