"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface Mode {
  id: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_enabled: boolean;
  sport_filter: string[] | null;
  params: Record<string, unknown>;
}

export default function ModesPage() {
  const router = useRouter();
  const [modes, setModes] = useState<Mode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/modes", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setModes(data.modes ?? []);
    } else {
      toast.error("Failed to load modes");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchModes();
  }, [fetchModes]);

  async function handleToggle(mode: Mode) {
    const res = await fetch(`/api/v1/admin/modes/${mode.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !mode.is_enabled }),
    });

    if (res.ok) {
      toast.success(
        `"${mode.label}" ${!mode.is_enabled ? "enabled" : "disabled"}`
      );
      fetchModes();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to update mode");
    }
  }

  async function handleDelete(mode: Mode) {
    if (!confirm(`Delete "${mode.label}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/v1/admin/modes/${mode.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${mode.label}" deleted`);
      fetchModes();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete mode");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Athlete Modes</h1>
          <p className="text-muted-foreground">
            {modes.length} mode{modes.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Button onClick={() => router.push("/admin/modes/new")}>
          + New Mode
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Order</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Description</TableHead>
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
            ) : modes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No modes found
                </TableCell>
              </TableRow>
            ) : (
              modes.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/modes/${m.id}/edit`)}
                >
                  <TableCell className="font-mono text-sm">
                    {m.sort_order}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {m.color && (
                        <div
                          className="h-4 w-4 rounded-sm border shrink-0"
                          style={{ backgroundColor: m.color }}
                        />
                      )}
                      {m.icon && <span>{m.icon}</span>}
                      {m.label}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {m.id}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {m.description || "\u2014"}
                  </TableCell>
                  <TableCell>
                    {m.sport_filter && m.sport_filter.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {m.sport_filter.map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className="text-xs"
                          >
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
                      checked={m.is_enabled}
                      onCheckedChange={() => handleToggle(m)}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          router.push(`/admin/modes/${m.id}/edit`)
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(m)}
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
