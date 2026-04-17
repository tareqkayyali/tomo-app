"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { MetadataEditor, type PageMetadata } from "./MetadataEditor";
import { SectionList, type SectionConfig } from "./SectionList";
import { PageColorEditor, type PageColorOverrides } from "./PageColorEditor";
import { PhonePreview } from "@/components/admin/preview/PhonePreview";
import { usePreviewSync } from "@/components/admin/preview/usePreviewSync";

interface PageConfigFormProps {
  configId?: string;
  initialData?: Record<string, unknown>;
}

export function PageConfigForm({ configId, initialData }: PageConfigFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [screenKey, setScreenKey] = useState(
    (initialData?.screen_key as string) || ""
  );
  const [screenLabel, setScreenLabel] = useState(
    (initialData?.screen_label as string) || ""
  );
  const [isPublished, setIsPublished] = useState(
    (initialData?.is_published as boolean) ?? false
  );
  const [metadata, setMetadata] = useState<PageMetadata>(
    (initialData?.metadata as PageMetadata) || {
      pageTitle: "",
      subtitle: "",
      tabLabels: {},
      emptyStates: {},
    }
  );
  const [sections, setSections] = useState<SectionConfig[]>(
    (initialData?.sections as SectionConfig[]) || []
  );
  const [colorOverrides, setColorOverrides] = useState<PageColorOverrides>(
    (initialData?.color_overrides as PageColorOverrides) || {}
  );

  // Live preview sync
  const { iframeRef, send } = usePreviewSync(300);

  useEffect(() => {
    if (!screenKey) return;
    send({
      type: "TOMO_DRAFT_PAGE_CONFIG",
      payload: {
        screen_key: screenKey,
        screen_label: screenLabel,
        sections,
        metadata,
      },
    });
  }, [screenKey, screenLabel, sections, metadata, send]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload: Record<string, unknown> = {
      screen_label: screenLabel,
      is_published: isPublished,
      metadata,
      sections,
      color_overrides: colorOverrides,
    };

    if (!configId) {
      payload.screen_key = screenKey;
    }

    const url = configId
      ? `/api/v1/admin/page-configs/${configId}`
      : "/api/v1/admin/page-configs";
    const method = configId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(configId ? "Page config updated" : "Page config created");
      if (!configId) {
        const data = await res.json();
        if (data?.id) {
          router.push(`/admin/pages/${data.id}/edit`);
        } else {
          router.push("/admin/pages");
        }
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save page config");
    }

    setSaving(false);
  }

  return (
    <div className="flex gap-8">
    <form onSubmit={handleSubmit} className="space-y-8 flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {configId ? "Edit Page Config" : "New Page Config"}
          </h1>
          <p className="text-muted-foreground">
            {configId
              ? "Update page layout and sections"
              : "Configure a new app page"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="published">Published</Label>
            <Switch
              id="published"
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : configId ? "Update" : "Create"}
          </Button>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="screenKey">Screen Key *</Label>
              <Input
                id="screenKey"
                value={screenKey}
                onChange={(e) => setScreenKey(e.target.value)}
                placeholder="e.g., timeline_screen"
                required
                disabled={!!configId}
                className={configId ? "opacity-60" : ""}
              />
              {!configId && (
                <p className="text-xs text-muted-foreground">
                  Unique identifier. Cannot be changed after creation.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="screenLabel">Screen Label *</Label>
              <Input
                id="screenLabel"
                value={screenLabel}
                onChange={(e) => setScreenLabel(e.target.value)}
                placeholder="e.g., Timeline"
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Page Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <MetadataEditor metadata={metadata} onChange={setMetadata} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sections</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionList sections={sections} onChange={setSections} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Color Overrides</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Override specific theme colors for this page only. Leave empty to use the global theme.
          </p>
          <PageColorEditor colorOverrides={colorOverrides} onChange={setColorOverrides} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/pages")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : configId ? "Update" : "Create"}
        </Button>
      </div>
    </form>

    {/* Live Phone Preview */}
    <div className="hidden xl:block sticky top-6 self-start">
      <PhonePreview iframeRef={iframeRef} />
    </div>
    </div>
  );
}
