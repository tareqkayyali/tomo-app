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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface FeatureFlagFormProps {
  flagId?: string;
  initialData?: {
    flag_key?: string;
    description?: string;
    enabled?: boolean;
    sports?: string[] | null;
  };
}

export function FeatureFlagForm({ flagId, initialData }: FeatureFlagFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [flagKey, setFlagKey] = useState(initialData?.flag_key || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [enabled, setEnabled] = useState(initialData?.enabled ?? false);
  const [sportsText, setSportsText] = useState(
    initialData?.sports ? initialData.sports.join(", ") : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const sports = sportsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      description,
      enabled,
      sports: sports.length > 0 ? sports : null,
    };

    if (!flagId) {
      payload.flag_key = flagKey;
    }

    const url = flagId
      ? `/api/v1/admin/feature-flags/${flagId}`
      : "/api/v1/admin/feature-flags";
    const method = flagId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(flagId ? "Flag updated" : "Flag created");
      router.push("/admin/feature-flags");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save flag");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {flagId ? "Edit Feature Flag" : "New Feature Flag"}
          </h1>
          <p className="text-muted-foreground">
            {flagId ? "Update flag configuration" : "Create a new feature flag"}
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : flagId ? "Update Flag" : "Create Flag"}
        </Button>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Flag Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="flagKey">Flag Key *</Label>
            <Input
              id="flagKey"
              value={flagKey}
              onChange={(e) => setFlagKey(e.target.value)}
              placeholder="e.g., enable_new_dashboard"
              required
              disabled={!!flagId}
              className={flagId ? "opacity-60" : ""}
            />
            {!flagId && (
              <p className="text-xs text-muted-foreground">
                Unique identifier. Cannot be changed after creation.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this flag control?"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>Enabled</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sports">Sports (comma-separated)</Label>
            <Input
              id="sports"
              value={sportsText}
              onChange={(e) => setSportsText(e.target.value)}
              placeholder="e.g., football, basketball (leave empty for all sports)"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to apply to all sports.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/feature-flags")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : flagId ? "Update Flag" : "Create Flag"}
        </Button>
      </div>
    </form>
  );
}
