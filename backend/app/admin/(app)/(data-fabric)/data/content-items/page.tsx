"use client";

/**
 * Content Items — generalized admin over content_items.
 *
 * Supersedes /admin/quotes (which was a typed view of
 * category='quotes' only). This page exposes EVERY category in
 * content_items with a category filter dropdown, so operators can edit
 * card_tips, affirmations, etc. that were previously SQL-only.
 *
 * Smart content editor:
 *   - Known category 'quotes' → typed text + author inputs.
 *   - All other categories → raw JSON editor for the `content` column.
 * Category and subcategory are free-form strings so new categories can
 * be seeded without a schema change.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface ContentItemRow {
  id: string;
  category: string;
  subcategory: string | null;
  sport_id: string | null;
  key: string | null;
  sort_order: number | null;
  content: Record<string, unknown> | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
}

interface FormState {
  id?: string;
  category: string;
  subcategory: string;
  sport_id: string;
  key: string;
  sort_order: number;
  active: boolean;
  // Quotes-specific typed fields (used only when category === 'quotes')
  text: string;
  author: string;
  // JSON editor fallback for every other category
  contentJson: string;
}

const EMPTY_FORM: FormState = {
  category: "quotes",
  subcategory: "",
  sport_id: "",
  key: "",
  sort_order: 0,
  active: true,
  text: "",
  author: "",
  contentJson: "{}",
};

const PAGE_SIZE = 25;

export default function ContentItemsPage() {
  const [rows, setRows] = useState<ContentItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/content-items/categories", {
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { categories: string[] };
        setCategories(data.categories ?? []);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (selectedCategory !== "all") qs.set("category", selectedCategory);
      if (search.trim()) qs.set("search", search.trim());
      qs.set("page", String(page));
      qs.set("limit", String(PAGE_SIZE));

      const res = await fetch(`/api/v1/admin/content-items?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        items: ContentItemRow[];
        total: number;
      };
      setRows(data.items);
      setTotal(data.total);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, search, page]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      category:
        selectedCategory !== "all" ? selectedCategory : EMPTY_FORM.category,
    });
    setDialogOpen(true);
  }

  function openEdit(row: ContentItemRow) {
    const c = row.content ?? {};
    setForm({
      id: row.id,
      category: row.category,
      subcategory: row.subcategory ?? "",
      sport_id: row.sport_id ?? "",
      key: row.key ?? "",
      sort_order: row.sort_order ?? 0,
      active: row.active,
      text: typeof c.text === "string" ? c.text : "",
      author: typeof c.author === "string" ? c.author : "",
      contentJson: JSON.stringify(c, null, 2),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      let content: Record<string, unknown>;
      if (form.category === "quotes") {
        if (!form.text.trim()) throw new Error("Text is required for quotes");
        content = { text: form.text.trim(), author: form.author.trim() };
      } else {
        try {
          const parsed = form.contentJson.trim()
            ? JSON.parse(form.contentJson)
            : {};
          if (
            typeof parsed !== "object" ||
            parsed === null ||
            Array.isArray(parsed)
          ) {
            throw new Error("content must be a JSON object");
          }
          content = parsed as Record<string, unknown>;
        } catch (e) {
          throw new Error(
            `Invalid JSON in content: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      if (!form.category.trim()) throw new Error("category is required");

      const payload = {
        category: form.category.trim(),
        subcategory: form.subcategory.trim(),
        sport_id: form.sport_id.trim() || null,
        key: form.key.trim(),
        sort_order: form.sort_order,
        active: form.active,
        content,
      };

      const res = await fetch(
        form.id
          ? `/api/v1/admin/content-items/${form.id}`
          : "/api/v1/admin/content-items",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      toast.success(form.id ? "Saved" : "Created");
      setDialogOpen(false);
      await fetchRows();
      await fetchCategories();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(row: ContentItemRow) {
    try {
      const res = await fetch(`/api/v1/admin/content-items/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !row.active }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(row.active ? "Hidden" : "Enabled");
      await fetchRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    }
  }

  async function handleDelete(row: ContentItemRow) {
    if (!confirm(`Delete ${row.category} item ${row.key || row.id}?`)) return;
    try {
      const res = await fetch(`/api/v1/admin/content-items/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Deleted");
      await fetchRows();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isQuotes = form.category === "quotes";

  // Render a short preview of a row's content for the table.
  function renderContentPreview(row: ContentItemRow): string {
    const c = row.content ?? {};
    if (typeof c.text === "string") return c.text;
    if (typeof c.title === "string") return c.title;
    if (typeof c.message === "string") return c.message;
    return JSON.stringify(c).slice(0, 80);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Content Items</h1>
        <p className="text-sm text-muted-foreground">
          All content categories in one surface — quotes, card tips,
          affirmations, and anything else that lives in
          <code className="font-mono text-xs mx-1">content_items</code>. Use
          the category filter to scope; add new categories simply by typing
          one in the create dialog.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select
            value={selectedCategory}
            onValueChange={(v) => {
              setSelectedCategory(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 max-w-sm">
          <Label className="text-xs">Search (key / category)</Label>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button onClick={openCreate}>+ New item</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Edit" : "New"} —{" "}
              <span className="capitalize">{form.category}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="quotes / card_tip / affirmation"
                />
              </div>
              <div className="space-y-1">
                <Label>Subcategory</Label>
                <Input
                  value={form.subcategory}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subcategory: e.target.value }))
                  }
                  placeholder="general, high_energy, ..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Sport (optional)</Label>
                <Input
                  value={form.sport_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sport_id: e.target.value }))
                  }
                  placeholder="football / basketball / ..."
                />
              </div>
              <div className="space-y-1">
                <Label>Key (optional, unique id)</Label>
                <Input
                  value={form.key}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, key: e.target.value }))
                  }
                />
              </div>
            </div>

            {isQuotes ? (
              <>
                <div className="space-y-1">
                  <Label>Text</Label>
                  <Textarea
                    rows={3}
                    maxLength={500}
                    value={form.text}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, text: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Author</Label>
                  <Input
                    maxLength={120}
                    value={form.author}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, author: e.target.value }))
                    }
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label>Content (JSON)</Label>
                <Textarea
                  rows={8}
                  className="font-mono text-xs"
                  value={form.contentJson}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contentJson: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Shape varies by category. E.g. card_tip uses{" "}
                  <code>{`{ title, body }`}</code>; affirmations use{" "}
                  <code>{`{ text }`}</code>.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sort_order: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-32"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, active: v }))
                  }
                />
                <Label>Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : form.id ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No content items match.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Subcat / Sport</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Sort</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-40 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {r.category.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                    {renderContentPreview(r)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col">
                      <span>{r.subcategory || "—"}</span>
                      {r.sport_id ? (
                        <span className="text-muted-foreground">
                          {r.sport_id}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {r.key || "—"}
                  </TableCell>
                  <TableCell>{r.sort_order ?? 0}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.active}
                      onCheckedChange={() => handleToggleActive(r)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(r)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDelete(r)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} — {total} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
