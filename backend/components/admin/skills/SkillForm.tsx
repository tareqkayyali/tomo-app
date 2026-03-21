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
import { SubMetricBuilder } from "./SubMetricBuilder";

interface SubMetric {
  key: string;
  label: string;
  unit: string;
  description: string;
}

interface SkillFormProps {
  sportId: string;
  skillId?: string;
  initialData?: Record<string, unknown>;
}

export function SkillForm({ sportId, skillId, initialData }: SkillFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [key, setKey] = useState((initialData?.key as string) || "");
  const [name, setName] = useState((initialData?.name as string) || "");
  const [category, setCategory] = useState((initialData?.category as string) || "");
  const [description, setDescription] = useState((initialData?.description as string) || "");
  const [icon, setIcon] = useState((initialData?.icon as string) || "");
  const [sortOrder, setSortOrder] = useState((initialData?.sort_order as number) || 0);
  const [subMetrics, setSubMetrics] = useState<SubMetric[]>(
    (initialData?.sub_metrics as SubMetric[]) || []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      sport_id: sportId,
      key,
      name,
      category,
      description,
      icon,
      sort_order: sortOrder,
      sub_metrics: subMetrics,
    };

    const url = skillId
      ? `/api/v1/admin/skills/${skillId}`
      : "/api/v1/admin/skills";
    const method = skillId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(skillId ? "Skill updated" : "Skill created");
      router.push(`/admin/sports/${sportId}/skills`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save skill");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {skillId ? "Edit Skill" : "New Skill"}
          </h1>
          <p className="text-muted-foreground">
            {skillId ? "Update skill details" : "Add a new skill to this sport"}
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : skillId ? "Update Skill" : "Create Skill"}
        </Button>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="key">Key *</Label>
              <Input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g., free_kick"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Free Kick"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Set Piece"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g., football-outline"
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
              placeholder="Brief description of this skill..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sub-Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <SubMetricBuilder subMetrics={subMetrics} onChange={setSubMetrics} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/admin/sports/${sportId}/skills`)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : skillId ? "Update Skill" : "Create Skill"}
        </Button>
      </div>
    </form>
  );
}
