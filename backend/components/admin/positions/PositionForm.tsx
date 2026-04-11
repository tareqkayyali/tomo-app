"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { AttributeWeightSliders } from "./AttributeWeightSliders";
import { PageGuide } from "@/components/admin/PageGuide";
import { sportsHelp } from "@/lib/cms-help/sports";

interface PositionFormProps {
  sportId: string;
  positionId?: string;
  initialData?: Record<string, unknown>;
}

export function PositionForm({ sportId, positionId, initialData }: PositionFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [key, setKey] = useState((initialData?.key as string) || "");
  const [label, setLabel] = useState((initialData?.label as string) || "");
  const [sortOrder, setSortOrder] = useState((initialData?.sort_order as number) || 0);
  const [attributeWeights, setAttributeWeights] = useState<Record<string, number>>(
    (initialData?.attribute_weights as Record<string, number>) || {}
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      sport_id: sportId,
      key,
      label,
      sort_order: sortOrder,
      attribute_weights: attributeWeights,
    };

    const url = positionId
      ? `/api/v1/admin/positions/${positionId}`
      : "/api/v1/admin/positions";
    const method = positionId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(positionId ? "Position updated" : "Position created");
      router.push(`/admin/sports/${sportId}/positions`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save position");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {positionId ? "Edit Position" : "New Position"}
          </h1>
          <p className="text-muted-foreground">
            {positionId ? "Update position details" : "Add a new position to this sport"}
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : positionId ? "Update Position" : "Create Position"}
        </Button>
      </div>

      <PageGuide {...sportsHelp.positions.page} />

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="key">Key *</Label>
              <Input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g., ST"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Striker"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attribute Weights</CardTitle>
        </CardHeader>
        <CardContent>
          <AttributeWeightSliders
            weights={attributeWeights}
            onChange={setAttributeWeights}
            sportId={sportId}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/admin/sports/${sportId}/positions`)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : positionId ? "Update Position" : "Create Position"}
        </Button>
      </div>
    </form>
  );
}
