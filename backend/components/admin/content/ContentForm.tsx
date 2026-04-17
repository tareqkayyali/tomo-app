"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ContentJsonEditor } from "./ContentJsonEditor";

const KNOWN_CATEGORIES = [
  "quotes",
  "tips",
  "milestones",
  "onboarding",
  "drills",
  "phone_tests",
  "blazepod_drills",
] as const;

const SPORTS = [
  { value: "football", label: "Football" },
  { value: "padel", label: "Padel" },
  { value: "basketball", label: "Basketball" },
  { value: "tennis", label: "Tennis" },
];

interface ContentFormProps {
  itemId?: string;
  initialData?: Record<string, unknown>;
}

export function ContentForm({ itemId, initialData }: ContentFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Basic fields
  const [category, setCategory] = useState(
    (initialData?.category as string) || ""
  );
  const [customCategory, setCustomCategory] = useState("");
  const [subcategory, setSubcategory] = useState(
    (initialData?.subcategory as string) || ""
  );
  const [sportId, setSportId] = useState<string>(
    (initialData?.sport_id as string) || ""
  );
  const [key, setKey] = useState((initialData?.key as string) || "");
  const [sortOrder, setSortOrder] = useState(
    (initialData?.sort_order as number) || 0
  );
  const [active, setActive] = useState(initialData?.active !== false);
  const [content, setContent] = useState<Record<string, unknown>>(
    (initialData?.content as Record<string, unknown>) || {}
  );

  const isKnownCategory = KNOWN_CATEGORIES.includes(
    category as (typeof KNOWN_CATEGORIES)[number]
  );
  const useCustom = category === "__custom__";
  const effectiveCategory = useCustom ? customCategory : category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!effectiveCategory) {
      toast.error("Category is required");
      return;
    }

    setSaving(true);

    const payload = {
      category: effectiveCategory,
      subcategory,
      sport_id: sportId || null,
      key,
      sort_order: sortOrder,
      content,
      active,
    };

    const url = itemId
      ? `/api/v1/admin/content-items/${itemId}`
      : "/api/v1/admin/content-items";
    const method = itemId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      toast.success(itemId ? "Content item updated" : "Content item created");
      if (!itemId && data?.id) {
        router.push(`/admin/content/${data.id}/edit`);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save content item");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {itemId ? "Edit Content Item" : "New Content Item"}
          </h1>
          <p className="text-muted-foreground">
            {itemId
              ? "Update content item details"
              : "Add a new content item to the CMS"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="active">Active</Label>
            <Switch id="active" checked={active} onCheckedChange={setActive} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : itemId
                ? "Update Item"
                : "Create Item"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v ?? "");
                  // Reset content when category changes (new items only)
                  if (!itemId) setContent({});
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom...</SelectItem>
                </SelectContent>
              </Select>
              {useCustom && (
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Enter custom category"
                  className="mt-2"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Subcategory</Label>
              <Input
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g., high_energy, recovery_tips"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Sport (optional)</Label>
              <Select
                value={sportId || "none"}
                onValueChange={(v) => setSportId(v === "none" ? "" : v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No sport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No sport</SelectItem>
                  {SPORTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Key</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Lookup key"
              />
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                min={0}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content JSONB */}
      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent>
          {effectiveCategory ? (
            <ContentJsonEditor
              category={effectiveCategory}
              content={content}
              onChange={setContent}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a category above to see the content editor.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/content")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? "Saving..."
            : itemId
              ? "Update Item"
              : "Create Item"}
        </Button>
      </div>
    </form>
  );
}
