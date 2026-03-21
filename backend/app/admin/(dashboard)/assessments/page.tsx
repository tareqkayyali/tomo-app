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

interface AssessmentRow {
  id: string;
  sport_id: string;
  test_id: string;
  name: string;
  icon: string;
  color: string;
  inputs: unknown[];
  derived_metrics: unknown[];
  sort_order: number;
}

export default function AssessmentsListPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 50;

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (sportFilter !== "all") params.set("sport_id", sportFilter);
    params.set("page", String(page));
    params.set("limit", String(limit));

    const res = await fetch(`/api/v1/admin/assessments?${params}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setAssessments(data.assessments);
      setTotal(data.total);
    }
    setLoading(false);
  }, [search, sportFilter, page]);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this assessment? This cannot be undone."))
      return;
    const res = await fetch(`/api/v1/admin/assessments/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Assessment deleted");
      fetchAssessments();
    } else {
      toast.error("Failed to delete assessment");
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Physical Test Definitions
          </h1>
          <p className="text-muted-foreground">
            {total} assessment{total !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Link href="/admin/assessments/new">
          <Button>+ New Assessment</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search assessments..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-64"
        />
        <Select
          value={sportFilter}
          onValueChange={(v) => {
            setSportFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sports</SelectItem>
            <SelectItem value="football">Football</SelectItem>
            <SelectItem value="padel">Padel</SelectItem>
            <SelectItem value="basketball">Basketball</SelectItem>
            <SelectItem value="tennis">Tennis</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sport</TableHead>
              <TableHead>Test ID</TableHead>
              <TableHead>Inputs</TableHead>
              <TableHead>Derived Metrics</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead className="w-12" />
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
            ) : assessments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No assessments found
                </TableCell>
              </TableRow>
            ) : (
              assessments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      href={`/admin/assessments/${a.id}/edit`}
                      className="font-medium hover:underline flex items-center gap-2"
                    >
                      {a.icon && <span>{a.icon}</span>}
                      <span
                        className="inline-block w-3 h-3 rounded-full mr-1"
                        style={{ backgroundColor: a.color || "#888" }}
                      />
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{a.sport_id}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {a.test_id}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {Array.isArray(a.inputs) ? a.inputs.length : 0} field
                      {Array.isArray(a.inputs) && a.inputs.length !== 1
                        ? "s"
                        : ""}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {Array.isArray(a.derived_metrics)
                        ? a.derived_metrics.length
                        : 0}{" "}
                      metric
                      {Array.isArray(a.derived_metrics) &&
                      a.derived_metrics.length !== 1
                        ? "s"
                        : ""}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.sort_order}</TableCell>
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
                            router.push(`/admin/assessments/${a.id}/edit`)
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(a.id)}
                          className="text-destructive"
                        >
                          Delete
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
