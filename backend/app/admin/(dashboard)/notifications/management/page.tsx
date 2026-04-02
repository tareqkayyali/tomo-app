"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────────────

interface TypeConfig {
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

// ─── Constants ───────────────────────────────────────────────────────

const CATEGORIES = ["all", "critical", "training", "coaching", "academic", "triangle", "cv", "system"];

const CATEGORY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  training: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  coaching: "bg-green-500/10 text-green-400 border-green-500/30",
  academic: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  triangle: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  cv: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  system: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

const CATEGORY_ROW_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  training: "border-l-orange-500",
  coaching: "border-l-green-500",
  academic: "border-l-blue-500",
  triangle: "border-l-purple-500",
  cv: "border-l-yellow-500",
  system: "border-l-gray-500",
};

// ─── Page ────────────────────────────────────────────────────────────

export default function NotificationManagementPage() {
  const [configs, setConfigs] = useState<TypeConfig[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [editingPriority, setEditingPriority] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/notifications/config");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setConfigs(data.configs ?? []);
    } catch (err) {
      toast.error("Failed to load notification configs");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // ── Save helper ──
  const saveConfig = useCallback(
    async (type: string, updates: Record<string, unknown>) => {
      setSaving((prev) => new Set(prev).add(type));
      try {
        const res = await fetch("/api/v1/admin/notifications/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, ...updates }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Save failed");
        }
        toast.success(`Updated ${type}`);
        await fetchConfigs();
      } catch (err: any) {
        toast.error(err.message || "Save failed");
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(type);
          return next;
        });
      }
    },
    [fetchConfigs]
  );

  // ── Filtered list ──
  const filtered = filter === "all" ? configs : configs.filter((c) => c.category === filter);

  // ── Summary stats ──
  const disabledCount = configs.filter((c) => !c.enabled).length;
  const pushMutedCount = configs.filter((c) => c.enabled && !c.push_enabled).length;
  const overrideCount = configs.filter((c) => c.has_override).length;

  // ── Status badge ──
  function getStatus(c: TypeConfig) {
    if (!c.enabled) return { label: "Disabled", variant: "destructive" as const };
    if (!c.push_enabled && c.is_critical) return { label: "In-App Only", variant: "secondary" as const };
    if (!c.push_enabled) return { label: "Push Muted", variant: "secondary" as const };
    return { label: "Active", variant: "default" as const };
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading notification configs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notification Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control which notification types are active, adjust priorities, and toggle push delivery.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchConfigs(); }}>
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{configs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{configs.length - disabledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{disabledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Push Muted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{pushMutedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant={filter === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(cat)}
            className="capitalize"
          >
            {cat}
            {cat !== "all" && (
              <span className="ml-1.5 text-xs opacity-60">
                {configs.filter((c) => c.category === cat).length}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Main Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Push</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((config) => {
              const status = getStatus(config);
              const isSaving = saving.has(config.type);
              const rowBorder = CATEGORY_ROW_BORDER[config.category] ?? "";

              return (
                <TableRow
                  key={config.type}
                  className={`border-l-2 ${rowBorder} ${!config.enabled ? "opacity-50" : ""}`}
                >
                  {/* Type */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {config.is_critical && <span title="Critical — cannot be disabled">🔒</span>}
                      <code className="text-xs font-mono">{config.type}</code>
                    </div>
                    {config.notes && (
                      <div className="text-xs text-muted-foreground mt-1 italic">{config.notes}</div>
                    )}
                  </TableCell>

                  {/* Category */}
                  <TableCell>
                    <Badge variant="outline" className={CATEGORY_COLORS[config.category]}>
                      {config.category}
                    </Badge>
                  </TableCell>

                  {/* Priority */}
                  <TableCell>
                    {editingPriority === config.type ? (
                      <Select
                        value={config.priority_override !== null ? String(config.priority_override) : "default"}
                        onValueChange={(val: string | null) => {
                          if (!val) return;
                          const override = val === "default" ? null : parseInt(val, 10);
                          saveConfig(config.type, { priority_override: override });
                          setEditingPriority(null);
                        }}
                      >
                        <SelectTrigger className="w-[100px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default (P{config.default_priority})</SelectItem>
                          <SelectItem value="1">P1 — Urgent</SelectItem>
                          <SelectItem value="2">P2 — Today</SelectItem>
                          <SelectItem value="3">P3 — Week</SelectItem>
                          <SelectItem value="4">P4 — Info</SelectItem>
                          <SelectItem value="5">P5 — Low</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          P{config.effective_priority}
                        </Badge>
                        {config.priority_override !== null && (
                          <Badge variant="secondary" className="text-[10px]">Override</Badge>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* Enabled Toggle */}
                  <TableCell>
                    <Switch
                      checked={config.enabled}
                      disabled={config.is_critical || isSaving}
                      onCheckedChange={(checked) => saveConfig(config.type, { enabled: checked })}
                    />
                  </TableCell>

                  {/* Push Toggle */}
                  <TableCell>
                    <Switch
                      checked={config.push_enabled}
                      disabled={isSaving}
                      onCheckedChange={(checked) => saveConfig(config.type, { push_enabled: checked })}
                    />
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={(props) => (
                          <Button {...props} variant="ghost" size="sm" className="h-8 w-8 p-0">
                            ⋮
                          </Button>
                        )}
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingPriority(config.type)}>
                          Edit Priority
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingNote(config.type);
                            setNoteValue(config.notes ?? "");
                          }}
                        >
                          {config.notes ? "Edit Note" : "Add Note"}
                        </DropdownMenuItem>
                        {config.has_override && (
                          <DropdownMenuItem
                            onClick={() => saveConfig(config.type, {
                              enabled: true,
                              priority_override: null,
                              push_enabled: true,
                              notes: null,
                            })}
                          >
                            Reset to Default
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Note Editor Dialog (inline at bottom) */}
      {editingNote && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Note for <code className="font-mono">{editingNote}</code>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="e.g., Temporarily muted during testing"
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => {
                if (editingNote) {
                  saveConfig(editingNote, { notes: noteValue || null });
                }
                setEditingNote(null);
              }}
            >
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditingNote(null)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Override Count Footer */}
      {overrideCount > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {overrideCount} type{overrideCount !== 1 ? "s" : ""} with admin overrides
        </p>
      )}
    </div>
  );
}
