"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface RatingLevelFormProps {
  sportId: string;
  levelId?: string;
  initialData?: Record<string, unknown>;
}

export function RatingLevelForm({ sportId, levelId, initialData }: RatingLevelFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState((initialData?.name as string) || "");
  const [minRating, setMinRating] = useState((initialData?.min_rating as number) ?? 0);
  const [maxRating, setMaxRating] = useState((initialData?.max_rating as number) ?? 0);
  const [description, setDescription] = useState((initialData?.description as string) || "");
  const [color, setColor] = useState((initialData?.color as string) || "#888888");
  const [sortOrder, setSortOrder] = useState((initialData?.sort_order as number) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      sport_id: sportId,
      name,
      min_rating: minRating,
      max_rating: maxRating,
      description,
      color,
      sort_order: sortOrder,
    };

    const url = levelId
      ? `/api/v1/admin/rating-levels/${levelId}`
      : "/api/v1/admin/rating-levels";
    const method = levelId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(levelId ? "Rating level updated" : "Rating level created");
      router.push(`/admin/sports/${sportId}/rating-levels`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save rating level");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {levelId ? "Edit Rating Level" : "New Rating Level"}
          </h1>
          <p className="text-muted-foreground">
            {levelId ? "Update rating level details" : "Add a new rating level to this sport"}
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : levelId ? "Update Level" : "Create Level"}
        </Button>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Rating Level Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Elite"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color *</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-10 rounded border cursor-pointer"
                />
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#888888"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minRating">Min Rating *</Label>
              <Input
                id="minRating"
                type="number"
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                min={0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxRating">Max Rating *</Label>
              <Input
                id="maxRating"
                type="number"
                value={maxRating}
                onChange={(e) => setMaxRating(Number(e.target.value))}
                min={0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                min={0}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description of this rating level..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/admin/sports/${sportId}/rating-levels`)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : levelId ? "Update Level" : "Create Level"}
        </Button>
      </div>
    </form>
  );
}
