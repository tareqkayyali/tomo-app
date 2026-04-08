"use client";

import { useEffect, useState, useCallback } from "react";
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

interface ProgramRule {
  rule_id: string;
  name: string;
  description: string | null;
  category: string;
  priority: number;
  is_enabled: boolean;
  is_built_in: boolean;
  safety_critical: boolean;
  conditions: { match: string; conditions: unknown[] };
  mandatory_programs: string[];
  high_priority_programs: string[];
  blocked_programs: string[];
  prioritize_categories: string[];
  block_categories: string[];
  load_multiplier: number | null;
  intensity_cap: string | null;
  evidence_grade: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  safety: "bg-red-500/15 text-red-400 border-red-500/30",
  development: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  recovery: "bg-green-500/15 text-green-400 border-green-500/30",
  performance: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  injury_prevention: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  position_specific: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  load_management: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export default function ProgramRulesListPage() {
  const router = useRouter();
  const [rules, setRules] = useState<ProgramRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (statusFilter !== "all") params.set("enabled", statusFilter === "enabled" ? "true" : "false");

    const res = await fetch(`/api/v1/admin/program-rules?${params}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules ?? []);
    } else {
      toast.error("Failed to load program rules");
    }
    setLoading(false);
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleToggle(rule: ProgramRule) {
    if (rule.is_built_in && rule.safety_critical && rule.is_enabled) {
      toast.error("Built-in safety-critical rules cannot be disabled");
      return;
    }

    const res = await fetch(`/api/v1/admin/program-rules`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_id: rule.rule_id, is_enabled: !rule.is_enabled }),
    });

    if (res.ok) {
      toast.success(`Rule ${rule.is_enabled ? "disabled" : "enabled"}`);
      fetchRules();
    } else {
      toast.error("Failed to update rule");
    }
  }

  async function handleDelete(rule: ProgramRule) {
    if (rule.is_built_in) {
      toast.error("Cannot delete built-in rules");
      return;
    }
    if (!confirm(`Delete "${rule.name}"?`)) return;

    const res = await fetch(`/api/v1/admin/program-rules?id=${rule.rule_id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success("Rule deleted");
      fetchRules();
    } else {
      toast.error("Failed to delete rule");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Program Assignment Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            PD-authored guidelines that control how AI assigns training programs to athletes.
            Rules use the same condition DSL as protocols.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/admin/program-rules/audit")}>
            Audit Log
          </Button>
          <Button size="sm" onClick={() => router.push("/admin/program-rules/new")}>
            + New Rule
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="safety">Safety</SelectItem>
            <SelectItem value="development">Development</SelectItem>
            <SelectItem value="recovery">Recovery</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="injury_prevention">Injury Prevention</SelectItem>
            <SelectItem value="position_specific">Position Specific</SelectItem>
            <SelectItem value="load_management">Load Management</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
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
              <TableHead className="w-[60px]">Priority</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Programs</TableHead>
              <TableHead>Constraints</TableHead>
              <TableHead className="w-[80px]">Safety</TableHead>
              <TableHead className="w-[80px]">Grade</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No program rules found
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.rule_id} className={!rule.is_enabled ? "opacity-50" : ""}>
                  <TableCell className="font-mono text-sm">{rule.priority}</TableCell>
                  <TableCell>
                    <div className="font-medium">{rule.name}</div>
                    {rule.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {rule.description}
                      </div>
                    )}
                    <div className="flex gap-1 mt-1">
                      {(rule.conditions.conditions as any[]).map((c: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                          {c.field} {c.operator} {String(c.value)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={CATEGORY_COLORS[rule.category] ?? "bg-gray-500/15 text-gray-400"}
                    >
                      {rule.category.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {rule.mandatory_programs.length > 0 && (
                        <div className="text-[10px]">
                          <span className="text-red-400 font-medium">Mandatory:</span>{" "}
                          <span className="text-muted-foreground">{rule.mandatory_programs.length}</span>
                        </div>
                      )}
                      {rule.blocked_programs.length > 0 && (
                        <div className="text-[10px]">
                          <span className="text-amber-400 font-medium">Blocked:</span>{" "}
                          <span className="text-muted-foreground">{rule.blocked_programs.length}</span>
                        </div>
                      )}
                      {rule.prioritize_categories.length > 0 && (
                        <div className="text-[10px]">
                          <span className="text-green-400 font-medium">Priority:</span>{" "}
                          <span className="text-muted-foreground">{rule.prioritize_categories.join(', ')}</span>
                        </div>
                      )}
                      {rule.block_categories.length > 0 && (
                        <div className="text-[10px]">
                          <span className="text-amber-400 font-medium">Block:</span>{" "}
                          <span className="text-muted-foreground">{rule.block_categories.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5 text-[10px] text-muted-foreground">
                      {rule.load_multiplier != null && (
                        <div>Load: {rule.load_multiplier}x</div>
                      )}
                      {rule.intensity_cap && (
                        <div>Cap: {rule.intensity_cap}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {rule.safety_critical && (
                      <Badge variant="destructive" className="text-[10px]">SAFETY</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {rule.evidence_grade && (
                      <Badge variant="outline" className="text-[10px]">
                        Grade {rule.evidence_grade}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={rule.is_enabled}
                      onCheckedChange={() => handleToggle(rule)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => router.push(`/admin/program-rules/${rule.rule_id}`)}
                      >
                        Edit
                      </Button>
                      {!rule.is_built_in && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => handleDelete(rule)}
                        >
                          Del
                        </Button>
                      )}
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
