"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ColorGroupEditor } from "./ColorGroupEditor";
import { TypographyEditor } from "./TypographyEditor";
import { PhonePreview } from "@/components/admin/preview/PhonePreview";
import { usePreviewSync } from "@/components/admin/preview/usePreviewSync";

interface ThemeFormProps {
  themeId?: string;
  initialData?: Record<string, unknown>;
}

type TabKey = "colors_dark" | "colors_light" | "typography";

export function ThemeForm({ themeId, initialData }: ThemeFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("colors_dark");

  const [name, setName] = useState((initialData?.name as string) || "");
  const isActive = (initialData?.is_active as boolean) ?? false;

  const [colorsDark, setColorsDark] = useState<Record<string, unknown>>(
    (initialData?.colors_dark as Record<string, unknown>) || {}
  );
  const [colorsLight, setColorsLight] = useState<Record<string, unknown>>(
    (initialData?.colors_light as Record<string, unknown>) || {}
  );
  const [typography, setTypography] = useState<Record<string, unknown>>(
    (initialData?.typography as Record<string, unknown>) || {}
  );

  // Live preview sync
  const { iframeRef, send } = usePreviewSync(300);

  useEffect(() => {
    send({
      type: "TOMO_DRAFT_THEME",
      payload: {
        colors_dark: colorsDark,
        colors_light: colorsLight,
        typography,
      },
    });
  }, [colorsDark, colorsLight, typography, send]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name,
      colors_dark: colorsDark,
      colors_light: colorsLight,
      typography,
    };

    const url = themeId
      ? `/api/v1/admin/themes/${themeId}`
      : "/api/v1/admin/themes";
    const method = themeId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(themeId ? "Theme updated" : "Theme created");
      if (!themeId) {
        const data = await res.json();
        if (data?.id) {
          router.push(`/admin/theme/${data.id}/edit`);
        } else {
          router.push("/admin/theme");
        }
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save theme");
    }

    setSaving(false);
  }

  async function handleActivate() {
    if (!themeId) return;
    const res = await fetch(`/api/v1/admin/themes/${themeId}/activate`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Theme activated");
      router.refresh();
    } else {
      toast.error("Failed to activate theme");
    }
  }

  async function handleExport() {
    if (!themeId) return;
    const res = await fetch(`/api/v1/admin/themes/${themeId}/export`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `theme-${name || "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Theme exported");
    } else {
      toast.error("Failed to export theme");
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "colors_dark", label: "Colors \u2014 Dark" },
    { key: "colors_light", label: "Colors \u2014 Light" },
    { key: "typography", label: "Typography" },
  ];

  return (
    <div className="flex gap-8">
    <form onSubmit={handleSubmit} className="space-y-8 flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {themeId ? "Edit Theme" : "New Theme"}
          </h1>
          <p className="text-muted-foreground">
            {themeId ? "Update theme colors and typography" : "Create a new theme"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {themeId && isActive && (
            <Badge className="bg-green-600 text-white">Active</Badge>
          )}
          {themeId && !isActive && (
            <Button type="button" variant="outline" onClick={handleActivate}>
              Activate
            </Button>
          )}
          {themeId && (
            <Button type="button" variant="outline" onClick={handleExport}>
              Export JSON
            </Button>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : themeId ? "Save Theme" : "Create Theme"}
          </Button>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Theme Name</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-md">
            <Label htmlFor="themeName">Name *</Label>
            <Input
              id="themeName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tomo Default"
              required
            />
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="border-b">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "colors_dark" && (
        <ColorGroupEditor
          colors={colorsDark}
          onChange={setColorsDark}
          mode="dark"
        />
      )}
      {activeTab === "colors_light" && (
        <ColorGroupEditor
          colors={colorsLight}
          onChange={setColorsLight}
          mode="light"
        />
      )}
      {activeTab === "typography" && (
        <TypographyEditor typography={typography} onChange={setTypography} />
      )}

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/theme")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : themeId ? "Save Theme" : "Create Theme"}
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
