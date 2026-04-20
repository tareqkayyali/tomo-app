"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

interface ProgrammeRow {
  id: string;
  name: string;
  season_cycle: string;
  weeks: number;
  status: string;
  target_type: string;
  start_date: string;
  updated_at: string;
  users?: { full_name: string };
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  published: "default",
  archived: "outline",
};

const CYCLE_LABELS: Record<string, string> = {
  pre_season: "Pre-Season",
  in_season: "In-Season",
  off_season: "Off-Season",
  exam_period: "Exam Period",
};

export default function ProgrammesListPage() {
  const router = useRouter();
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchProgrammes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (cycleFilter !== "all") params.set("season_cycle", cycleFilter);
    params.set("page", String(page));
    params.set("limit", String(limit));

    const res = await fetch(`/api/v1/admin/programmes?${params}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setProgrammes(data.programmes);
      setTotal(data.total);
    }
    setLoading(false);
  }, [search, statusFilter, cycleFilter, page]);

  useEffect(() => {
    fetchProgrammes();
  }, [fetchProgrammes]);

  async function handlePublish(id: string) {
    if (!confirm("Publish this programme? This will make it visible to target players.")) return;
    const res = await fetch(`/api/v1/admin/programmes/${id}/publish`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Programme published");
      fetchProgrammes();
    } else {
      toast.error("Failed to publish programme");
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this programme?")) return;
    const res = await fetch(`/api/v1/admin/programmes/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Programme archived");
      fetchProgrammes();
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coach Programmes</h1>
          <p className="text-muted-foreground">
            {total} programme{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link href="/admin/programmes/new">
          <Button>+ New Programme</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search programmes..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cycleFilter} onValueChange={(v) => { setCycleFilter(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Season Cycle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cycles</SelectItem>
            <SelectItem value="pre_season">Pre-Season</SelectItem>
            <SelectItem value="in_season">In-Season</SelectItem>
            <SelectItem value="off_season">Off-Season</SelectItem>
            <SelectItem value="exam_period">Exam Period</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead>Weeks</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : programmes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No programmes found</TableCell>
              </TableRow>
            ) : (
              programmes.map((prog) => (
                <TableRow key={prog.id}>
                  <TableCell>
                    <Link href={`/admin/programmes/${prog.id}/edit`} className="font-medium hover:underline">
                      {prog.name}
                    </Link>
                  </TableCell>
                  <TableCell>{prog.users?.full_name || "—"}</TableCell>
                  <TableCell>{CYCLE_LABELS[prog.season_cycle] || prog.season_cycle}</TableCell>
                  <TableCell>{prog.weeks}w</TableCell>
                  <TableCell className="capitalize">{prog.target_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>{prog.start_date}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[prog.status] || "outline"}>
                      {prog.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                        ...
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/programmes/${prog.id}/edit`)}>
                          Edit
                        </DropdownMenuItem>
                        {prog.status === "draft" && (
                          <DropdownMenuItem onClick={() => handlePublish(prog.id)}>
                            Publish
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleArchive(prog.id)} className="text-destructive">
                          Archive
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
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
