"use client";

/**
 * CMS Admin — Motivational Quotes.
 *
 * Thin CRUD wrapper over /api/v1/admin/content-items/quotes.
 * Rows live in `content_items` with category='quotes'; mobile reads them
 * via useAllQuotes — no mobile change needed when quotes are added/edited.
 */

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

interface QuoteRow {
  id: string;
  subcategory: string;
  content: { text?: string; author?: string } | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface QuoteForm {
  id?: string;
  text: string;
  author: string;
  subcategory: string;
  active: boolean;
  sort_order: number;
}

function emptyForm(): QuoteForm {
  return {
    text: "",
    author: "",
    subcategory: "general",
    active: true,
    sort_order: 0,
  };
}

export default function QuotesAdminPage() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([
    "high_energy",
    "recovery",
    "low_sleep",
    "streak",
    "general",
  ]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<QuoteForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/content-items/quotes", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setQuotes(data.quotes ?? []);
      if (Array.isArray(data.subcategories) && data.subcategories.length > 0) {
        setSubcategories(data.subcategories);
      }
    } catch (e) {
      toast.error(`Failed to load quotes: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleNew = () => {
    setForm(emptyForm());
    setEditorOpen(true);
  };

  const handleEdit = (q: QuoteRow) => {
    setForm({
      id: q.id,
      text: q.content?.text ?? "",
      author: q.content?.author ?? "",
      subcategory: q.subcategory || "general",
      active: q.active,
      sort_order: q.sort_order ?? 0,
    });
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this quote? This cannot be undone.")) return;
    const res = await fetch(`/api/v1/admin/content-items/quotes/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Quote deleted");
      load();
    } else {
      toast.error("Failed to delete");
    }
  };

  const handleToggleActive = async (q: QuoteRow) => {
    const res = await fetch(`/api/v1/admin/content-items/quotes/${q.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !q.active }),
    });
    if (res.ok) {
      toast.success(q.active ? "Hidden" : "Enabled");
      load();
    } else {
      toast.error("Failed to update");
    }
  };

  const handleSubmit = async () => {
    if (!form.text.trim() || !form.author.trim()) {
      toast.error("Text and author are required");
      return;
    }
    setSaving(true);
    try {
      const isEdit = Boolean(form.id);
      const body = {
        text: form.text.trim(),
        author: form.author.trim(),
        subcategory: form.subcategory,
        active: form.active,
        sort_order: form.sort_order,
      };
      const res = await fetch(
        isEdit
          ? `/api/v1/admin/content-items/quotes/${form.id}`
          : "/api/v1/admin/content-items/quotes",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ? JSON.stringify(err.detail) : err.error ?? `HTTP ${res.status}`);
      }
      toast.success(isEdit ? "Quote updated" : "Quote created");
      setEditorOpen(false);
      load();
    } catch (e) {
      toast.error(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">
            {quotes.length} quote{quotes.length === 1 ? "" : "s"} in rotation
          </p>
        </div>
        <Button onClick={handleNew}>+ New Quote</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Text</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Subcategory</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : quotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No quotes yet.
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="max-w-md truncate">
                    {q.content?.text ?? ""}
                  </TableCell>
                  <TableCell>{q.content?.author ?? ""}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {q.subcategory.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{q.sort_order ?? 0}</TableCell>
                  <TableCell>
                    <Switch
                      checked={q.active}
                      onCheckedChange={() => handleToggleActive(q)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(q)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(q.id)}>
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

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Quote" : "New Quote"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="q-text">Text</Label>
              <Textarea
                id="q-text"
                rows={3}
                maxLength={500}
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="q-author">Author</Label>
              <Input
                id="q-author"
                maxLength={120}
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
              />
            </div>
            <div>
              <Label>Subcategory</Label>
              <Select
                value={form.subcategory}
                onValueChange={(v) => v && setForm((f) => ({ ...f, subcategory: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subcategories.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="q-sort">Sort order</Label>
              <Input
                id="q-sort"
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                }
                className="w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : form.id ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
