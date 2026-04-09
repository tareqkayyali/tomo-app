"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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
}

const SEVERITY_COLORS: Record<string, string> = {
  MANDATORY: "bg-red-500/15 text-red-400 border-red-500/30",
  ADVISORY: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  INFO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

export default function PlanningProtocolsPage() {
  const [protocols, setProtocols] = useState<PlanningProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [editProtocol, setEditProtocol] = useState<PlanningProtocol | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    severity: "ADVISORY" as string,
    category: "",
    trigger_conditions: "",
    actions: "",
    scientific_basis: "",
  });
  const [saving, setSaving] = useState(false);

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

  const filtered = severityFilter === "all"
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
      toast.success(`"${protocol.name}" ${!protocol.is_enabled ? "enabled" : "disabled"}`);
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

  function openEditor(protocol: PlanningProtocol) {
    setEditProtocol(protocol);
    setEditForm({
      name: protocol.name,
      description: protocol.description || "",
      severity: protocol.severity,
      category: protocol.category,
      trigger_conditions: JSON.stringify(protocol.trigger_conditions, null, 2),
      actions: JSON.stringify(protocol.actions, null, 2),
      scientific_basis: protocol.scientific_basis || "",
    });
  }

  async function handleSave() {
    if (!editProtocol) return;

    let triggerConditions: unknown[];
    let actions: Record<string, unknown>;
    try {
      triggerConditions = JSON.parse(editForm.trigger_conditions);
    } catch {
      toast.error("Invalid JSON in trigger conditions");
      return;
    }
    try {
      actions = JSON.parse(editForm.actions);
    } catch {
      toast.error("Invalid JSON in actions");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/v1/admin/planning-protocols/${editProtocol.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        severity: editForm.severity,
        category: editForm.category,
        trigger_conditions: triggerConditions,
        actions,
        scientific_basis: editForm.scientific_basis || null,
      }),
    });

    if (res.ok) {
      toast.success(`"${editForm.name}" updated`);
      setEditProtocol(null);
      fetchProtocols();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save protocol");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Planning Protocols</h1>
          <p className="text-muted-foreground">
            {protocols.length} protocol{protocols.length !== 1 ? "s" : ""} configured
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? "all")}>
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
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No planning protocols found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                        {p.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{p.category}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={SEVERITY_COLORS[p.severity] ?? ""}>
                      {p.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Array.isArray(p.trigger_conditions)
                      ? `${p.trigger_conditions.length} condition${p.trigger_conditions.length !== 1 ? "s" : ""}`
                      : "—"}
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
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditor(p)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
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

      {/* Edit dialog */}
      <Dialog open={!!editProtocol} onOpenChange={(open) => !open && setEditProtocol(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Planning Protocol</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Severity</Label>
              <Select
                value={editForm.severity ?? '' as string}
                onValueChange={(v) => v && setEditForm({ ...editForm, severity: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANDATORY">Mandatory</SelectItem>
                  <SelectItem value="ADVISORY">Advisory</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trigger Conditions (JSON)</Label>
              <Textarea
                className="font-mono text-sm min-h-[120px]"
                value={editForm.trigger_conditions}
                onChange={(e) => setEditForm({ ...editForm, trigger_conditions: e.target.value })}
              />
            </div>
            <div>
              <Label>Actions (JSON)</Label>
              <Textarea
                className="font-mono text-sm min-h-[120px]"
                value={editForm.actions}
                onChange={(e) => setEditForm({ ...editForm, actions: e.target.value })}
              />
            </div>
            <div>
              <Label>Scientific Basis</Label>
              <Textarea
                value={editForm.scientific_basis}
                onChange={(e) => setEditForm({ ...editForm, scientific_basis: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditProtocol(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
