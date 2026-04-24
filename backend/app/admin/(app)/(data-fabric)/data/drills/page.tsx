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
import { drillsHelp } from "@/lib/cms-help/drills";

interface DrillRow {
  id: string;
  name: string;
  sport_id: string;
  category: string;
  intensity: string;
  duration_minutes: number;
  active: boolean;
  age_bands: string[];
  drill_tags: { tag: string }[];
}

export default function DrillsListPage() {
  const router = useRouter();
  const [drills, setDrills] = useState<DrillRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [intensityFilter, setIntensityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchDrills = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (sportFilter !== "all") params.set("sport_id", sportFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (intensityFilter !== "all") params.set("intensity", intensityFilter);
    params.set("page", String(page));
    params.set("limit", String(limit));

    const res = await fetch(`/api/v1/admin/drills?${params}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setDrills(data.drills);
      setTotal(data.total);
    }
    setLoading(false);
  }, [search, sportFilter, categoryFilter, intensityFilter, page]);

  useEffect(() => {
    fetchDrills();
  }, [fetchDrills]);

  async function handleToggle(id: string) {
    const res = await fetch(`/api/v1/admin/drills/${id}/toggle`, {
      method: "PATCH",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Drill status updated");
      fetchDrills();
    }
  }

  async function handleDuplicate(id: string) {
    const res = await fetch(`/api/v1/admin/drills/${id}/duplicate`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Drill duplicated");
      fetchDrills();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to deactivate this drill?")) return;
    const res = await fetch(`/api/v1/admin/drills/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Drill deactivated");
      fetchDrills();
    }
  }

  const totalPages = Math.ceil(total / limit);

  const intensityColor = (i: string) =>
    i === "hard"
      ? "destructive"
      : i === "moderate"
        ? "secondary"
        : "outline";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Training Drills</h1>
          <PageGuide {...drillsHelp.list.page} />
          <p className="text-muted-foreground">
            {total} drill{total !== 1 ? "s" : ""} in the catalog
          </p>
        </div>
        <Link href="/admin/data/drills/new">
          <Button>+ New Drill</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search drills..."
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
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="warmup">Warmup</SelectItem>
            <SelectItem value="training">Training</SelectItem>
            <SelectItem value="cooldown">Cooldown</SelectItem>
            <SelectItem value="recovery">Recovery</SelectItem>
            <SelectItem value="activation">Activation</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={intensityFilter}
          onValueChange={(v) => {
            setIntensityFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Intensity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Intensities</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
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
              <TableHead>Category</TableHead>
              <TableHead>Intensity</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Active</TableHead>
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
            ) : drills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No drills found
                </TableCell>
              </TableRow>
            ) : (
              drills.map((drill) => (
                <TableRow key={drill.id}>
                  <TableCell>
                    <Link
                      href={`/admin/data/drills/${drill.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {drill.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{drill.sport_id}</TableCell>
                  <TableCell className="capitalize">{drill.category}</TableCell>
                  <TableCell>
                    <Badge variant={intensityColor(drill.intensity) as "destructive" | "secondary" | "outline"}>
                      {drill.intensity}
                    </Badge>
                  </TableCell>
                  <TableCell>{drill.duration_minutes}min</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(drill.drill_tags || []).slice(0, 3).map((t) => (
                        <Badge key={t.tag} variant="outline" className="text-xs">
                          {t.tag}
                        </Badge>
                      ))}
                      {(drill.drill_tags || []).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{drill.drill_tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={drill.active}
                      onCheckedChange={() => handleToggle(drill.id)}
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
                            router.push(`/admin/data/drills/${drill.id}/edit`)
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(drill.id)}
                        >
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(drill.id)}
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
