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

interface Protocol {
  protocol_id: string;
  name: string;
  description: string | null;
  category: string;
  priority: number;
  is_enabled: boolean;
  is_built_in: boolean;
  safety_critical: boolean;
  conditions: { match: string; conditions: unknown[] };
}

const CATEGORY_COLORS: Record<string, string> = {
  safety: "bg-red-500/15 text-red-400 border-red-500/30",
  development: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  recovery: "bg-green-500/15 text-green-400 border-green-500/30",
  performance: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  academic: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export default function ProtocolsListPage() {
  const router = useRouter();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchProtocols = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (statusFilter !== "all") params.set("enabled", statusFilter === "enabled" ? "true" : "false");

    const res = await fetch(`/api/v1/admin/protocols?${params}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setProtocols(data.protocols ?? []);
    } else {
      toast.error("Failed to load protocols");
    }
    setLoading(false);
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    fetchProtocols();
  }, [fetchProtocols]);

  async function handleToggle(protocol: Protocol) {
    if (protocol.is_built_in && protocol.is_enabled) {
      toast.error("Built-in safety protocols cannot be disabled");
      return;
    }

    const res = await fetch(`/api/v1/admin/protocols/${protocol.protocol_id}`, {
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

  async function handleDelete(protocol: Protocol) {
    if (protocol.is_built_in) {
      toast.error("Built-in protocols cannot be deleted");
      return;
    }

    if (!confirm(`Delete "${protocol.name}"? This will disable the protocol.`)) return;

    const res = await fetch(`/api/v1/admin/protocols/${protocol.protocol_id}`, {
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
          <h1 className="text-3xl font-bold tracking-tight">Protocols</h1>
          <p className="text-muted-foreground">
            {protocols.length} protocol{protocols.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/protocols/test">
            <Button variant="outline">Test / Simulate</Button>
          </Link>
          <Link href="/admin/protocols/audit">
            <Button variant="outline">Audit Log</Button>
          </Link>
          <Link href="/admin/protocols/new">
            <Button>+ New Protocol</Button>
          </Link>
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
            <SelectItem value="academic">Academic</SelectItem>
          </SelectContent>
        </Select>

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
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[120px]">Safety Critical</TableHead>
              <TableHead className="w-[90px]">Built-in</TableHead>
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
            ) : protocols.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No protocols found
                </TableCell>
              </TableRow>
            ) : (
              protocols.map((p) => (
                <TableRow
                  key={p.protocol_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/protocols/${p.protocol_id}/edit`)}
                >
                  <TableCell>
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                      p.priority <= 20 ? "bg-red-500/20 text-red-400" :
                      p.priority <= 50 ? "bg-orange-500/20 text-orange-400" :
                      p.priority <= 100 ? "bg-blue-500/20 text-blue-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>
                      {p.priority}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                        {p.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={CATEGORY_COLORS[p.category] ?? ""}>
                      {p.category}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={p.is_enabled}
                      onCheckedChange={() => handleToggle(p)}
                    />
                  </TableCell>
                  <TableCell>
                    {p.safety_critical && (
                      <Badge variant="destructive" className="text-xs">
                        CRITICAL
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.is_built_in && (
                      <span className="text-muted-foreground text-lg" title="Built-in protocol">
                        🔒
                      </span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/admin/protocols/${p.protocol_id}/edit`)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        disabled={p.is_built_in}
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
