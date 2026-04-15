"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { programsHelp } from "@/lib/cms-help/programs";

const CATEGORIES = [
  "sprint", "sled", "strength", "power", "plyometric",
  "nordic", "hamstring", "acl_prevention", "ankle_stability", "hip_mobility", "groin",
  "passing", "shooting", "dribbling", "first_touch", "crossing", "heading",
  "defensive", "goalkeeping", "set_piece", "tactical", "decision_making",
  "scanning", "combination_play", "endurance", "agility", "cardio",
];

interface ProgramRow {
  id: string;
  name: string;
  category: string;
  type: string;
  duration_minutes: number;
  difficulty: string;
  tags: string[];
  position_emphasis: string[];
  source: "hardcoded" | "database";
  description?: string;
  chat_eligible?: boolean;
}

export default function ProgramsListPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    params.set("page", String(page));
    params.set("limit", String(limit));

    const res = await fetch(`/api/v1/admin/programs?${params}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setPrograms(data.programs);
      setTotal(data.total);
    }
    setLoading(false);
  }, [search, categoryFilter, typeFilter, page]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  async function handleToggle(id: string) {
    const res = await fetch(`/api/v1/admin/programs/${id}/toggle`, {
      method: "PATCH",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Program status updated");
      fetchPrograms();
    }
  }

  async function handleChatToggle(id: string, next: boolean) {
    // Optimistic update so the switch feels instant. Rollback on failure.
    setPrograms((prev) =>
      prev.map((p) => (p.id === id ? { ...p, chat_eligible: next } : p))
    );
    try {
      const res = await fetch(`/api/v1/admin/programs/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_eligible: next }),
      });
      if (!res.ok) {
        throw new Error("Patch failed");
      }
      toast.success(next ? "Program now available in chat" : "Program hidden from chat");
    } catch {
      // Rollback
      setPrograms((prev) =>
        prev.map((p) => (p.id === id ? { ...p, chat_eligible: !next } : p))
      );
      toast.error("Failed to update chat eligibility");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to deactivate this program?")) return;
    const res = await fetch(`/api/v1/admin/programs/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Program deactivated");
      fetchPrograms();
    }
  }

  const totalPages = Math.ceil(total / limit);

  const typeColor = (t: string) =>
    t === "physical" ? "secondary" : "outline";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Training Programs</h1>
          <PageGuide {...programsHelp.list.page} />
          <p className="text-muted-foreground">
            {total} program{total !== 1 ? "s" : ""} in the catalog
          </p>
        </div>
        <Link href="/admin/programs/new">
          <Button>+ New Program</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search programs..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-64"
        />
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="physical">Physical</SelectItem>
            <SelectItem value="technical">Technical</SelectItem>
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
              <TableHead>Type</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Positions</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-center">Chat</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : programs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No programs found
                </TableCell>
              </TableRow>
            ) : (
              programs.map((prog) => (
                <TableRow key={prog.id}>
                  <TableCell>
                    <Link
                      href={`/admin/programs/${prog.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {prog.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">
                    {prog.category.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeColor(prog.type) as "secondary" | "outline"}>
                      {prog.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{prog.duration_minutes}min</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(prog.position_emphasis || []).slice(0, 3).map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                      {(prog.position_emphasis || []).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{prog.position_emphasis.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={prog.source === "database" ? "default" : "secondary"} className="text-xs">
                      {prog.source === "database" ? "DB" : "Built-in"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={prog.chat_eligible !== false}
                      onCheckedChange={(v) => handleChatToggle(prog.id, v)}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="sm" />}
                      >
                        ...
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/admin/programs/${prog.id}/edit`)
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(prog.id)}
                          className="text-destructive"
                        >
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of{" "}
            {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
