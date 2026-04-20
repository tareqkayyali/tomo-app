"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

interface SportFormProps {
  sportId?: string;
  initialData?: Record<string, unknown>;
}

export function SportForm({ sportId, initialData }: SportFormProps) {
  const router = useRouter();
  const isEdit = Boolean(sportId);
  const [saving, setSaving] = useState(false);

  const [id, setId] = useState((initialData?.id as string) || "");
  const [label, setLabel] = useState((initialData?.label as string) || "");
  const [icon, setIcon] = useState((initialData?.icon as string) || "");
  const [color, setColor] = useState((initialData?.color as string) || "#FF6B35");
  const [sortOrder, setSortOrder] = useState((initialData?.sort_order as number) || 0);
  const [available, setAvailable] = useState(initialData?.available !== false);
  const [configJson, setConfigJson] = useState(
    initialData?.config ? JSON.stringify(initialData.config, null, 2) : "{}"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate JSON config
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configJson);
    } catch {
      toast.error("Invalid JSON in config field");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        label,
        icon,
        color,
        sort_order: sortOrder,
        available,
        config,
      };

      if (!isEdit) {
        body.id = id;
      }

      const url = isEdit
        ? `/api/v1/admin/sports/${sportId}`
        : `/api/v1/admin/sports`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      const saved = await res.json();
      toast.success(isEdit ? "Sport updated" : "Sport created");
      router.push(`/admin/sports/${saved.id ?? sportId}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEdit ? "Edit Sport" : "New Sport"}
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="id">ID (slug)</Label>
              <Input
                id="id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="football"
                required
                pattern="^[a-z0-9_-]+$"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, dashes, underscores only. Cannot be changed later.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Football"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="icon">Icon (Ionicon name)</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="football-outline"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">Color (hex)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#FF6B35"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
                <div
                  className="h-9 w-9 rounded-md border shrink-0"
                  style={{ backgroundColor: color }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="available"
                checked={available}
                onCheckedChange={setAvailable}
              />
              <Label htmlFor="available">Available</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Config (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            rows={8}
            className="font-mono text-sm"
            placeholder="{}"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Extensible config object (e.g., dnaOverallWeights). Must be valid JSON.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Update Sport" : "Create Sport"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
