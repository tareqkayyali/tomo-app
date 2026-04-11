"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { InstructionStepsEditor } from "./InstructionStepsEditor";
import { EquipmentEditor } from "./EquipmentEditor";
import { ProgressionEditor } from "./ProgressionEditor";
import { TagEditor } from "./TagEditor";
import { AttributeMultiSelect } from "./AttributeMultiSelect";
import { AgeBandSelector } from "./AgeBandSelector";
import { PositionMultiSelect } from "./PositionMultiSelect";
import { MediaUploader } from "./MediaUploader";
import { PageGuide } from "@/components/admin/PageGuide";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { drillsHelp } from "@/lib/cms-help/drills";

interface Equipment {
  name: string;
  quantity: number;
  optional: boolean;
}
interface Progression {
  level: number;
  label: string;
  description: string;
  duration_minutes?: number;
}

interface DrillFormProps {
  drillId?: string;
  initialData?: Record<string, unknown>;
}

const CATEGORIES = ["warmup", "training", "cooldown", "recovery", "activation"] as const;
const INTENSITIES = ["light", "moderate", "hard"] as const;

export function DrillForm({ drillId, initialData }: DrillFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Basic fields
  const [name, setName] = useState((initialData?.name as string) || "");
  const [description, setDescription] = useState((initialData?.description as string) || "");
  const [sportId, setSportId] = useState((initialData?.sport_id as string) || "football");
  const [category, setCategory] = useState<string>((initialData?.category as string) || "training");
  const [intensity, setIntensity] = useState<string>((initialData?.intensity as string) || "moderate");
  const [durationMinutes, setDurationMinutes] = useState((initialData?.duration_minutes as number) || 15);
  const [playersMin, setPlayersMin] = useState((initialData?.players_min as number) || 1);
  const [playersMax, setPlayersMax] = useState((initialData?.players_max as number) || 1);
  const [active, setActive] = useState(initialData?.active !== false);
  const [sortOrder, setSortOrder] = useState((initialData?.sort_order as number) || 100);

  // Nested
  const [instructions, setInstructions] = useState<string[]>(
    (initialData?.instructions as string[]) || [""]
  );
  const [equipment, setEquipment] = useState<Equipment[]>(
    (initialData?.equipment as Equipment[]) || []
  );
  const [progressions, setProgressions] = useState<Progression[]>(
    (initialData?.progressions as Progression[]) || []
  );
  const [tags, setTags] = useState<string[]>((initialData?.tags as string[]) || []);
  const [attributeKeys, setAttributeKeys] = useState<string[]>(
    (initialData?.attribute_keys as string[]) || []
  );
  const [ageBands, setAgeBands] = useState<string[]>(
    (initialData?.age_bands as string[]) || []
  );
  const [positionKeys, setPositionKeys] = useState<string[]>(
    (initialData?.position_keys as string[]) || []
  );
  const [primaryAttribute, setPrimaryAttribute] = useState<string>(
    (initialData?.primary_attribute as string) || ""
  );

  // Media
  const [videoUrl, setVideoUrl] = useState((initialData?.video_url as string) || "");
  const [imageUrl, setImageUrl] = useState((initialData?.image_url as string) || "");

  // Lookups
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<{ key: string; full_name: string; color: string }[]>([]);
  const [positions, setPositions] = useState<{ key: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/v1/admin/drills/tags", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setAvailableTags(d.tags || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Fetch sport attributes and positions from content bundle
    fetch("/api/v1/content/bundle")
      .then((r) => r.json())
      .then((bundle) => {
        const attrs = (bundle.sport_attributes || [])
          .filter((a: Record<string, unknown>) => a.sport_id === sportId)
          .map((a: Record<string, unknown>) => ({
            key: a.key as string,
            full_name: a.full_name as string,
            color: a.color as string,
          }));
        setAttributes(attrs);

        const pos = (bundle.sport_positions || [])
          .filter((p: Record<string, unknown>) => p.sport_id === sportId)
          .map((p: Record<string, unknown>) => ({
            key: p.key as string,
            label: p.label as string,
          }));
        setPositions(pos);
      })
      .catch(() => {});
  }, [sportId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      sport_id: sportId,
      name,
      description,
      instructions: instructions.filter((s) => s.trim()),
      duration_minutes: durationMinutes,
      intensity,
      attribute_keys: attributeKeys,
      primary_attribute: primaryAttribute || null,
      age_bands: ageBands,
      position_keys: positionKeys,
      category,
      players_min: playersMin,
      players_max: playersMax,
      video_url: videoUrl || undefined,
      image_url: imageUrl || undefined,
      sort_order: sortOrder,
      active,
      equipment,
      progressions,
      tags,
    };

    const url = drillId
      ? `/api/v1/admin/drills/${drillId}`
      : "/api/v1/admin/drills";
    const method = drillId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      toast.success(drillId ? "Drill updated" : "Drill created");
      if (!drillId && data?.id) {
        router.push(`/admin/drills/${data.id}/edit`);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save drill");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {drillId ? "Edit Drill" : "New Drill"}
          </h1>
          <p className="text-muted-foreground">
            {drillId ? "Update drill details" : "Add a new drill to the catalog"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="active">Active</Label>
            <Switch id="active" checked={active} onCheckedChange={setActive} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : drillId ? "Update Drill" : "Create Drill"}
          </Button>
        </div>
      </div>

      <PageGuide {...drillsHelp.list.page} />

      <Separator />

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Drill Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sprint Intervals"
                required
              />
              <FieldGuide {...drillsHelp.list.fields!.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sport">Sport *</Label>
              <Select value={sportId} onValueChange={(v) => setSportId(v ?? "football")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="football">Football</SelectItem>
                  <SelectItem value="padel">Padel</SelectItem>
                  <SelectItem value="basketball">Basketball</SelectItem>
                  <SelectItem value="tennis">Tennis</SelectItem>
                </SelectContent>
              </Select>
              <FieldGuide {...drillsHelp.list.fields!.sport} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this drill achieves..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v ?? "training")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldGuide {...drillsHelp.list.fields!.category} />
            </div>
            <div className="space-y-2">
              <Label>Intensity *</Label>
              <Select value={intensity} onValueChange={(v) => setIntensity(v ?? "moderate")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTENSITIES.map((i) => (
                    <SelectItem key={i} value={i} className="capitalize">
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldGuide {...drillsHelp.list.fields!.intensity} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                min={1}
                max={120}
              />
              <FieldGuide {...drillsHelp.list.fields!.duration} />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="playersMin">Players Min</Label>
              <Input
                id="playersMin"
                type="number"
                value={playersMin}
                onChange={(e) => setPlayersMin(Number(e.target.value))}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="playersMax">Players Max</Label>
              <Input
                id="playersMax"
                type="number"
                value={playersMax}
                onChange={(e) => setPlayersMax(Number(e.target.value))}
                min={1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <InstructionStepsEditor steps={instructions} onChange={setInstructions} />
        </CardContent>
      </Card>

      {/* Equipment */}
      <Card>
        <CardHeader>
          <CardTitle>Equipment</CardTitle>
        </CardHeader>
        <CardContent>
          <EquipmentEditor equipment={equipment} onChange={setEquipment} />
        </CardContent>
      </Card>

      {/* Progressions */}
      <Card>
        <CardHeader>
          <CardTitle>Progressions</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressionEditor progressions={progressions} onChange={setProgressions} />
        </CardContent>
      </Card>

      {/* Targeting */}
      <Card>
        <CardHeader>
          <CardTitle>Targeting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Primary Attribute <span className="text-xs text-muted-foreground">(strongest focus — scores +10 for gap targeting)</span></Label>
            <Select value={primaryAttribute || "_none"} onValueChange={(v) => setPrimaryAttribute(!v || v === "_none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select primary attribute..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— None —</SelectItem>
                {attributes.length > 0
                  ? attributes.map((a) => (
                      <SelectItem key={a.key} value={a.key}>
                        {a.full_name}
                      </SelectItem>
                    ))
                  : ["pace", "shooting", "passing", "dribbling", "defending", "physicality", "recovery"].map((k) => (
                      <SelectItem key={k} value={k} className="capitalize">
                        {k}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Secondary Attributes <span className="text-xs text-muted-foreground">(each scores +2 for gap targeting)</span></Label>
            <AttributeMultiSelect
              selected={attributeKeys}
              onChange={setAttributeKeys}
              attributes={attributes}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Age Bands</Label>
            <FieldGuide {...drillsHelp.list.fields!.age_bands} />
            <AgeBandSelector selected={ageBands} onChange={setAgeBands} />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Positions</Label>
            <FieldGuide {...drillsHelp.list.fields!.positions} />
            <PositionMultiSelect
              selected={positionKeys}
              onChange={setPositionKeys}
              positions={positions}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <TagEditor
            tags={tags}
            onChange={setTags}
            availableTags={availableTags}
          />
        </CardContent>
      </Card>

      {/* Media */}
      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGuide {...drillsHelp.list.fields!.video_url} />
          <MediaUploader
            drillId={drillId}
            videoUrl={videoUrl}
            imageUrl={imageUrl}
            onUpload={(type, url) => {
              if (type === "video") setVideoUrl(url);
              else setImageUrl(url);
            }}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/drills")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : drillId ? "Update Drill" : "Create Drill"}
        </Button>
      </div>
    </form>
  );
}
