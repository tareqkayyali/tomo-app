"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Category {
  id: string;
  label: string;
  icon: string | null;
  color: string | null;
  default_mode: string | null;
  default_days_per_week: number | null;
  default_session_duration: number | null;
  default_preferred_time: string | null;
  sort_order: number;
  is_enabled: boolean;
  sport_filter: string[] | null;
}

export default function TrainingCategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/training-categories", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories ?? []);
    } else {
      toast.error("Failed to load categories");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function handleToggle(cat: Category) {
    const res = await fetch(`/api/v1/admin/training-categories/${cat.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: !cat.is_enabled }),
    });

    if (res.ok) {
      toast.success(
        `"${cat.label}" ${!cat.is_enabled ? "enabled" : "disabled"}`
      );
      fetchCategories();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to update category");
    }
  }

  async function handleDelete(cat: Category) {
    if (!confirm(`Delete "${cat.label}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/v1/admin/training-categories/${cat.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${cat.label}" deleted`);
      fetchCategories();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete category");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Training Categories
          </h1>
          <p className="text-muted-foreground">
            {categories.length} categor
            {categories.length !== 1 ? "ies" : "y"} configured
          </p>
        </div>
        <Link href="/admin/training-categories/new">
          <Button>+ New Category</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Order</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Days/Wk</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Sport Filter</TableHead>
              <TableHead className="w-[80px]">Enabled</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-8 text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-8 text-muted-foreground"
                >
                  No categories found
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-mono text-sm">
                    {cat.sort_order}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/training-categories/${cat.id}/edit`}
                      className="font-medium hover:underline flex items-center gap-2"
                    >
                      {cat.color && (
                        <div
                          className="h-4 w-4 rounded-sm border shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      {cat.icon && <span>{cat.icon}</span>}
                      {cat.label}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm capitalize">
                    {cat.default_mode?.replace("_", " ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {cat.default_days_per_week ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {cat.default_session_duration
                      ? `${cat.default_session_duration} min`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm capitalize">
                    {cat.default_preferred_time || "—"}
                  </TableCell>
                  <TableCell>
                    {cat.sport_filter && cat.sport_filter.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {cat.sport_filter.map((s) => (
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
                      checked={cat.is_enabled}
                      onCheckedChange={() => handleToggle(cat)}
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
                            router.push(
                              `/admin/training-categories/${cat.id}/edit`
                            )
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(cat)}
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
    </div>
  );
}
