"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PhonePreview } from "@/components/admin/preview/PhonePreview";
import { usePreviewSync } from "@/components/admin/preview/usePreviewSync";
import {
  type ComponentDef,
  type ComponentStyleEntry,
  type ComponentStylesConfig,
  COMPONENT_REGISTRY,
  COMPONENT_DEFAULTS,
  COMPONENTS_BY_TAB,
  COLOR_GROUPS_BY_TAB,
  FONT_WEIGHTS,
  TAB_META,
} from "./constants";

// Map tab key to preview screen name
const TAB_TO_PREVIEW_SCREEN: Record<string, string> = {
  global: "preview",
  timeline: "Training",
  output: "Tests",
  chat: "Home",
  mastery: "Progress",
  "own-it": "ForYou",
};

// ── Types ──

interface ThemeRow {
  id: string;
  name: string;
  is_active: boolean;
  colors_dark: Record<string, string>;
  colors_light: Record<string, string>;
  typography: Record<string, unknown>;
}

interface TabDesignPageProps {
  tabKey: string;
  children?: ReactNode; // Extra sections (e.g. DNA tier editor for Mastery)
}

// ── Color Input ──

function ColorInput({
  colorKey,
  value,
  onChange,
}: {
  colorKey: string;
  value: string;
  onChange: (key: string, val: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function formatLabel(key: string): string {
    return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  }

  function getPickerValue(val: string): string {
    if (!val) return "#888888";
    if (val.startsWith("rgba") || val.startsWith("rgb")) {
      const match = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, "0");
        const g = parseInt(match[2]).toString(16).padStart(2, "0");
        const b = parseInt(match[3]).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
    }
    if (val.startsWith("#") && (val.length === 4 || val.length === 7 || val.length === 9))
      return val.slice(0, 7);
    return "#888888";
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={getPickerValue(draft)}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(colorKey, e.target.value);
        }}
        className="w-9 h-9 rounded-md border cursor-pointer shrink-0 p-0.5 bg-transparent"
      />
      <div className="flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">{formatLabel(colorKey)}</Label>
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (!e.target.value || /^#([0-9A-Fa-f]{3,8})$/.test(e.target.value)) {
              onChange(colorKey, e.target.value);
            }
          }}
          placeholder="#RRGGBB"
          className="h-8 font-mono text-sm"
        />
      </div>
    </div>
  );
}

// ── Style Editor Row ──

function StyleEditorRow({
  def,
  style,
  onChange,
}: {
  def: ComponentDef;
  style: ComponentStyleEntry;
  onChange: (key: string, field: keyof ComponentStyleEntry, value: number | string) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-b-0">
      <div className="w-52 shrink-0">
        <p className="text-sm font-medium">{def.label}</p>
        <p className="text-xs text-muted-foreground font-mono">{def.key}</p>
      </div>
      <div className="flex items-center gap-3 flex-1">
        <div className="w-24">
          <Label className="text-xs text-muted-foreground">Size</Label>
          <Input
            type="number"
            value={style.fontSize ?? ""}
            onChange={(e) => onChange(def.key, "fontSize", Number(e.target.value))}
            className="mt-1 h-8 text-sm"
            min={6}
            max={72}
            step={1}
          />
        </div>
        <div className="w-40">
          <Label className="text-xs text-muted-foreground">Weight</Label>
          <Select
            value={style.fontWeight ?? "400"}
            onValueChange={(val) => {
              if (val) onChange(def.key, "fontWeight", val);
            }}
          >
            <SelectTrigger className="mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28">
          <Label className="text-xs text-muted-foreground">Spacing</Label>
          <Input
            type="number"
            value={style.letterSpacing ?? 0}
            onChange={(e) => onChange(def.key, "letterSpacing", Number(e.target.value))}
            className="mt-1 h-8 text-sm"
            min={-2}
            max={10}
            step={0.1}
          />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span
            style={{
              fontSize: style.fontSize ?? 14,
              fontWeight: (style.fontWeight ?? "400") as React.CSSProperties["fontWeight"],
              letterSpacing: style.letterSpacing ?? 0,
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            Aa
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible Group ──

function CollapsibleGroup({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
      >
        <span>{label}</span>
        <span className="text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Main Component ──

export function TabDesignPage({ tabKey, children }: TabDesignPageProps) {
  const meta = TAB_META[tabKey];
  const colorGroups = COLOR_GROUPS_BY_TAB[tabKey] ?? [];
  const componentFilter = COMPONENTS_BY_TAB[tabKey];
  const previewScreen = TAB_TO_PREVIEW_SCREEN[tabKey] ?? "preview";

  // Preview sync
  const { iframeRef, send } = usePreviewSync(300);

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [colorMode, setColorMode] = useState<"dark" | "light">("dark");
  const [theme, setTheme] = useState<ThemeRow | null>(null);
  const [colorsDark, setColorsDark] = useState<Record<string, string>>({});
  const [colorsLight, setColorsLight] = useState<Record<string, string>>({});
  const [componentStyles, setComponentStyles] = useState<ComponentStylesConfig>(COMPONENT_DEFAULTS);

  // Fetch active theme + component styles
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [themesRes, stylesRes] = await Promise.all([
        fetch("/api/v1/admin/themes", { credentials: "include" }),
        fetch("/api/v1/content/ui-config?key=component_styles"),
      ]);

      if (themesRes.ok) {
        const themes: ThemeRow[] = await themesRes.json();
        const active = themes.find((t) => t.is_active) || themes[0];
        if (active) {
          setTheme(active);
          setColorsDark(active.colors_dark || {});
          setColorsLight(active.colors_light || {});
        }
      }

      if (stylesRes.ok) {
        const data = await stylesRes.json();
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          setComponentStyles({ ...COMPONENT_DEFAULTS, ...data });
        }
      }
    } catch {
      toast.error("Failed to load design settings");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync draft colors to preview iframe
  useEffect(() => {
    if (!theme) return;
    send({
      type: "TOMO_DRAFT_THEME",
      payload: {
        colors_dark: colorsDark,
        colors_light: colorsLight,
        typography: theme.typography || {},
      },
    });
  }, [colorsDark, colorsLight, theme, send]);

  // Colors
  const currentColors = colorMode === "dark" ? colorsDark : colorsLight;
  const setCurrentColors = colorMode === "dark" ? setColorsDark : setColorsLight;

  function handleColorChange(key: string, value: string) {
    setCurrentColors((prev) => ({ ...prev, [key]: value }));
  }

  // Component styles
  function handleStyleChange(key: string, field: keyof ComponentStyleEntry, value: number | string) {
    setComponentStyles((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  // Save
  async function handleSave() {
    setSaving(true);
    const errors: string[] = [];

    // Save theme colors (if this tab has color groups and we have a theme)
    if (colorGroups.length > 0 && theme) {
      try {
        const res = await fetch(`/api/v1/admin/themes/${theme.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: theme.name,
            colors_dark: colorsDark,
            colors_light: colorsLight,
            typography: theme.typography || {},
          }),
        });
        if (!res.ok) errors.push("colors");

        // Ensure the theme is active so the bundle API serves it
        if (!theme.is_active) {
          await fetch(`/api/v1/admin/themes/${theme.id}/activate`, {
            method: "POST",
            credentials: "include",
          });
        }
      } catch {
        errors.push("colors");
      }
    }

    // Save component styles
    if (filteredComponents.length > 0) {
      try {
        const res = await fetch("/api/v1/admin/ui-config", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config_key: "component_styles",
            config_value: componentStyles,
          }),
        });
        if (!res.ok) errors.push("component styles");
      } catch {
        errors.push("component styles");
      }
    }

    if (errors.length === 0) {
      toast.success("Design settings saved");
    } else {
      toast.error(`Failed to save: ${errors.join(", ")}`);
    }
    setSaving(false);
  }

  // Filter components for this tab
  const filteredComponents = componentFilter
    ? COMPONENT_REGISTRY.filter((def) => componentFilter(def.group))
    : [];

  const componentGroups = filteredComponents.reduce<Record<string, ComponentDef[]>>((acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading design settings...
      </div>
    );
  }

  const hasColors = colorGroups.length > 0;
  const hasComponents = filteredComponents.length > 0;

  return (
    <div className="flex gap-6">
      {/* Left: Settings */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {meta?.icon} {meta?.title ?? tabKey}
            </h1>
            <p className="text-muted-foreground">{meta?.description}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Color mode toggle */}
        {hasColors && (
          <div className="flex gap-2">
            <Button
              variant={colorMode === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => setColorMode("dark")}
            >
              Dark
            </Button>
            <Button
              variant={colorMode === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => setColorMode("light")}
            >
              Light
            </Button>
          </div>
        )}

        {/* Colors Section */}
        {hasColors && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Colors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {colorGroups.map((group) => (
                <CollapsibleGroup key={group.label} label={group.label}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.keys.map((key) => (
                      <ColorInput
                        key={key}
                        colorKey={key}
                        value={currentColors[key] || ""}
                        onChange={handleColorChange}
                      />
                    ))}
                  </div>
                </CollapsibleGroup>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Extra sections (DNA tiers for Mastery, typography scale for Global, etc.) */}
        {children}

        {/* Component Typography Section */}
        {hasComponents && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Component Typography</h2>
              <span className="text-sm text-muted-foreground">
                {filteredComponents.length} components
              </span>
            </div>
            {Object.entries(componentGroups).map(([groupName, defs]) => (
              <Card key={groupName}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{groupName}</CardTitle>
                </CardHeader>
                <CardContent>
                  {defs.map((def) => (
                    <StyleEditorRow
                      key={def.key}
                      def={def}
                      style={componentStyles[def.key] ?? {}}
                      onChange={handleStyleChange}
                    />
                  ))}
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {!hasColors && !hasComponents && !children && (
          <div className="text-center py-12 text-muted-foreground">
            No design settings for this tab yet
          </div>
        )}
      </div>

      {/* Right: Phone Preview (sticky) */}
      <div className="hidden xl:block w-[400px] shrink-0">
        <div className="sticky top-6">
          <PhonePreview iframeRef={iframeRef} initialScreen={previewScreen} />
        </div>
      </div>
    </div>
  );
}
