"use client";

import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import {
  SubAttributeBuilder,
  type SubAttribute,
} from "./SubAttributeBuilder";
import { PhonePreview } from "@/components/admin/preview/PhonePreview";
import { usePreviewSync } from "@/components/admin/preview/usePreviewSync";
import { PageGuide } from "@/components/admin/PageGuide";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { sportsHelp } from "@/lib/cms-help/sports";

interface AttributeFormProps {
  sportId: string;
  attributeId?: string;
  initialData?: Record<string, unknown>;
}

export function AttributeForm({
  sportId,
  attributeId,
  initialData,
}: AttributeFormProps) {
  const router = useRouter();
  const isEdit = Boolean(attributeId);
  const [saving, setSaving] = useState(false);

  const [key, setKey] = useState((initialData?.key as string) || "");
  const [label, setLabel] = useState((initialData?.label as string) || "");
  const [fullName, setFullName] = useState(
    (initialData?.full_name as string) || ""
  );
  const [abbreviation, setAbbreviation] = useState(
    (initialData?.abbreviation as string) || ""
  );
  const [description, setDescription] = useState(
    (initialData?.description as string) || ""
  );
  const [color, setColor] = useState(
    (initialData?.color as string) || "#888888"
  );
  const [maxValue, setMaxValue] = useState(
    (initialData?.max_value as number) || 99
  );
  const [sortOrder, setSortOrder] = useState(
    (initialData?.sort_order as number) || 0
  );
  const [subAttributes, setSubAttributes] = useState<SubAttribute[]>(
    (initialData?.sub_attributes as SubAttribute[]) || []
  );

  // Live preview sync — sends draft radar colors to the preview iframe
  const { iframeRef, send } = usePreviewSync(200);

  // Map CMS attribute key → radar axis key
  const ATTR_TO_RADAR: Record<string, string> = {
    pace: "pace",
    physicality: "power",
    dribbling: "agility",
    defending: "endurance",
    shooting: "strength",
    passing: "mobility",
  };

  useEffect(() => {
    if (!color || !key) return;
    const radarKey = ATTR_TO_RADAR[key];
    if (!radarKey) return;

    send({
      type: "TOMO_DRAFT_RADAR_COLORS",
      payload: { [radarKey]: color },
    });
  }, [color, key, send]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        key,
        label,
        full_name: fullName,
        abbreviation,
        description,
        color,
        max_value: maxValue,
        sort_order: sortOrder,
        sub_attributes: subAttributes,
      };

      if (!isEdit) {
        body.sport_id = sportId;
      }

      const url = isEdit
        ? `/api/v1/admin/attributes/${attributeId}`
        : `/api/v1/admin/attributes`;
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

      toast.success(isEdit ? "Attribute updated" : "Attribute created");

      // Refresh preview to pick up saved color from API
      const iframe = iframeRef.current;
      if (iframe) {
        iframe.src = iframe.src;
      }

      router.push(`/admin/sports/${sportId}/attributes`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-8">
    <form onSubmit={handleSubmit} className="space-y-6 flex-1 min-w-0 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          {isEdit ? "Edit Attribute" : "New Attribute"}
        </h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>

      <PageGuide {...sportsHelp.attributes.page} />

      <Card>
        <CardHeader>
          <CardTitle>Attribute Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="pace"
                required
                pattern="^[a-z0-9_]+$"
              />
              <FieldGuide {...sportsHelp.attributes.fields!.key} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label (short)</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="PAC"
                required
                maxLength={10}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Pace"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="abbreviation">Abbreviation</Label>
              <Input
                id="abbreviation"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
                placeholder="PAC"
                maxLength={10}
              />
              <FieldGuide {...sportsHelp.attributes.fields!.abbreviation} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Measures overall speed and acceleration"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color.startsWith("#") ? color.slice(0, 7) : "#888888"}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-10 rounded-md border cursor-pointer shrink-0 p-0.5 bg-transparent"
                  title="Click to pick color (includes eyedropper)"
                />
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#888888"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_value">Max Value</Label>
              <Input
                id="max_value"
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(Number(e.target.value))}
                min={1}
                max={999}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sub-Attributes</CardTitle>
        </CardHeader>
        <CardContent>
          <SubAttributeBuilder
            value={subAttributes}
            onChange={setSubAttributes}
          />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving
            ? "Saving..."
            : isEdit
              ? "Update Attribute"
              : "Create Attribute"}
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

    {/* Live Phone Preview */}
    <div className="hidden xl:block sticky top-6 self-start">
      <PhonePreview iframeRef={iframeRef} initialScreen="mastery" />
    </div>
    </div>
  );
}
