"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ── Brand Kit Token Definitions with Component Examples ──

interface BrandToken {
  key: string;
  label: string;
  description: string;
  defaultDark: string;
  defaultLight: string;
  group: string;
  /** Which UI components use this color */
  usedBy: string[];
}

const BRAND_TOKENS: BrandToken[] = [
  // ─── Core Accents ───
  { key: "accent", label: "Primary Accent", description: "Tomo Green — CTAs, active states", defaultDark: "#2ECC71", defaultLight: "#2ECC71", group: "Accent",
    usedBy: ["Primary buttons", "Tab underlines", "Active icons", "Profile ring", "Tomo center tab", "Progress bars", "Chip text"] },
  { key: "accent1", label: "Accent 1 (alias)", description: "Same as Primary Accent — backward compat", defaultDark: "#2ECC71", defaultLight: "#2ECC71", group: "Accent",
    usedBy: ["GradientButton", "RefreshControl tint", "ActivityIndicator", "Wordmark color"] },
  { key: "accent2", label: "Accent 2 (alias)", description: "Same as Primary Accent — backward compat", defaultDark: "#2ECC71", defaultLight: "#2ECC71", group: "Accent",
    usedBy: ["Secondary accent references", "AI insight icon"] },
  { key: "accentDark", label: "Accent Dark", description: "Pressed states, accent borders", defaultDark: "#27AE60", defaultLight: "#27AE60", group: "Accent",
    usedBy: ["Button pressed state", "Card left accent border"] },
  { key: "accent1Dark", label: "Accent 1 Dark (alias)", description: "Backward compat", defaultDark: "#27AE60", defaultLight: "#27AE60", group: "Accent",
    usedBy: ["Pressed button states"] },
  { key: "accentLight", label: "Accent Light", description: "Highlights, progress fills", defaultDark: "#58D68D", defaultLight: "#58D68D", group: "Accent",
    usedBy: ["Progress bar fills", "Metric value highlights"] },
  { key: "accent1Light", label: "Accent 1 Light (alias)", description: "Backward compat", defaultDark: "#58D68D", defaultLight: "#58D68D", group: "Accent",
    usedBy: ["Highlight states"] },
  { key: "accent2Dark", label: "Accent 2 Dark (alias)", description: "Backward compat", defaultDark: "#27AE60", defaultLight: "#27AE60", group: "Accent",
    usedBy: ["Secondary pressed states"] },
  { key: "accent2Light", label: "Accent 2 Light (alias)", description: "Backward compat", defaultDark: "#58D68D", defaultLight: "#58D68D", group: "Accent",
    usedBy: ["Secondary highlights"] },

  // ─── Surfaces ───
  { key: "background", label: "Background", description: "Primary app background", defaultDark: "#0A0A0A", defaultLight: "#F5F5F5", group: "Surfaces",
    usedBy: ["Screen background", "Nav bar", "Status bar area"] },
  { key: "backgroundElevated", label: "Elevated", description: "Cards, sheets", defaultDark: "#1A1A1A", defaultLight: "#FFFFFF", group: "Surfaces",
    usedBy: ["All cards", "Bottom sheet", "Chat bubbles", "Metric cards", "Rec cards"] },
  { key: "border", label: "Border", description: "Card borders, dividers", defaultDark: "#2D2D2D", defaultLight: "#E0E0E0", group: "Surfaces",
    usedBy: ["Card borders", "Dividers", "Tab bar border"] },

  // ─── Text ───
  { key: "textHeader", label: "Text Header", description: "Page titles, headlines", defaultDark: "#FFFFFF", defaultLight: "#0A0A0A", group: "Text",
    usedBy: ["Page titles", "Display text", "H1 headings"] },
  { key: "textOnDark", label: "Text on Dark", description: "Body text on dark surfaces", defaultDark: "#FFFFFF", defaultLight: "#0A0A0A", group: "Text",
    usedBy: ["Body text", "Card content", "H2/H3 headings", "Chat messages", "Button labels"] },
  { key: "textInactive", label: "Text Inactive", description: "Secondary text, placeholders", defaultDark: "#B0B0B0", defaultLight: "#B0B0B0", group: "Text",
    usedBy: ["Subtitles", "Timestamps", "Placeholders", "Inactive tabs", "Body light text"] },
  { key: "textMuted", label: "Text Muted", description: "Captions, disabled text", defaultDark: "#6B6B6B", defaultLight: "#6B6B6B", group: "Text",
    usedBy: ["Caption text", "Disabled states", "Ghost text"] },
  { key: "textOnAccent", label: "Text on Buttons", description: "Text on accent-colored buttons & CTAs", defaultDark: "#FFFFFF", defaultLight: "#FFFFFF", group: "Text",
    usedBy: ["Primary button text", "Generate Schedule btn", "Login btn", "Save btn", "GradientButton text", "Center tab label"] },
  { key: "textLink", label: "Link Text", description: "Tappable links and action text", defaultDark: "#2ECC71", defaultLight: "#2ECC71", group: "Text",
    usedBy: ["Edit Rules link", "Recalculate link", "View all links", "Plan Sleep Recovery CTA"] },

  // ─── Semantic ───
  { key: "success", label: "Success", description: "Completed sets, PRs, targets hit", defaultDark: "#2ECC71", defaultLight: "#2ECC71", group: "Semantic",
    usedBy: ["Readiness GREEN ring", "Done checkmarks", "PR badges", "\"Solid\" badges"] },
  { key: "warning", label: "Warning", description: "Fatigue alerts, exam warnings", defaultDark: "#F39C12", defaultLight: "#F39C12", group: "Semantic",
    usedBy: ["Readiness YELLOW ring", "\"Expired\" badges", "Study blocks", "Growth badges"] },
  { key: "error", label: "Error", description: "Injury risk, overtraining", defaultDark: "#E74C3C", defaultLight: "#E74C3C", group: "Semantic",
    usedBy: ["Readiness RED ring", "Injury flags", "Delete buttons", "Exam alerts"] },
  { key: "info", label: "Info", description: "Tips, recommendations, recovery", defaultDark: "#3498DB", defaultLight: "#3498DB", group: "Semantic",
    usedBy: ["Recovery tips", "Match events", "Info badges", "AI insight icons"] },

  // ─── Readiness ───
  { key: "readinessGreen", label: "Readiness Green", description: "GREEN readiness state", defaultDark: "#2ECC71", defaultLight: "#2ECC71", group: "Readiness",
    usedBy: ["Readiness ring (GREEN)", "Vitals good state", "Sleep quality good"] },
  { key: "readinessYellow", label: "Readiness Yellow", description: "YELLOW readiness state", defaultDark: "#F39C12", defaultLight: "#F39C12", group: "Readiness",
    usedBy: ["Readiness ring (YELLOW)", "Moderate soreness", "Fatigue warning"] },
  { key: "readinessRed", label: "Readiness Red", description: "RED readiness state", defaultDark: "#E74C3C", defaultLight: "#E74C3C", group: "Readiness",
    usedBy: ["Readiness ring (RED)", "High soreness", "Overtraining alert"] },

  // ─── Events ───
  { key: "eventTraining", label: "Training", description: "Training session events", defaultDark: "#2ECC71", defaultLight: "#2ECC71", group: "Events",
    usedBy: ["Timeline training cards", "Day grid training blocks"] },
  { key: "eventMatch", label: "Match", description: "Match / competition events", defaultDark: "#3498DB", defaultLight: "#3498DB", group: "Events",
    usedBy: ["Timeline match cards", "Day grid match blocks"] },
  { key: "eventRecovery", label: "Recovery", description: "Recovery session events", defaultDark: "#27AE60", defaultLight: "#27AE60", group: "Events",
    usedBy: ["Timeline recovery cards", "Day grid recovery blocks"] },
  { key: "eventStudyBlock", label: "Study", description: "Study block events", defaultDark: "#F39C12", defaultLight: "#F39C12", group: "Events",
    usedBy: ["Timeline study cards", "Day grid study blocks"] },
  { key: "eventExam", label: "Exam", description: "Exam period events", defaultDark: "#E74C3C", defaultLight: "#E74C3C", group: "Events",
    usedBy: ["Timeline exam cards", "Exam period warnings"] },
];

const GROUPS = ["Accent", "Surfaces", "Text", "Semantic", "Readiness", "Events"];

// ── Types ──

interface ThemeRow {
  id: string;
  name: string;
  is_active: boolean;
  colors_dark: Record<string, string>;
  colors_light: Record<string, string>;
}

// ── Inline Component Preview ──

function ComponentPreview({ token, color, bgColor, textColor, borderColor }: {
  token: BrandToken;
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}) {
  const k = token.key;

  // Accent — show button, tab, chip, profile ring
  if (k === "accent") return (
    <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11 }}>
      <span style={{ backgroundColor: color, color: "#fff", padding: "4px 12px", borderRadius: 12, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Button</span>
      <span style={{ borderBottom: `2px solid ${color}`, color, padding: "2px 8px", fontWeight: 500 }}>Tab</span>
      <span style={{ border: `1px solid ${color}40`, color, backgroundColor: `${color}15`, padding: "2px 8px", borderRadius: 12 }}>Chip</span>
      <span style={{ border: `2px solid ${color}`, borderRadius: 999, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color }}>T</span>
    </div>
  );

  // Accent dark — pressed button
  if (k === "accentDark") return (
    <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
      <span style={{ backgroundColor: color, color: "#fff", padding: "4px 12px", borderRadius: 12, fontWeight: 600, fontSize: 10, opacity: 0.9 }}>Pressed</span>
      <span style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8, color: textColor }}>Card border</span>
    </div>
  );

  // Accent light — progress bar
  if (k === "accentLight") return (
    <div className="flex items-center gap-2" style={{ fontSize: 11, width: "100%" }}>
      <div style={{ flex: 1, height: 6, backgroundColor: borderColor, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: "72%", height: "100%", backgroundColor: color, borderRadius: 3 }} />
      </div>
      <span style={{ color, fontWeight: 600 }}>P72</span>
    </div>
  );

  // Background
  if (k === "background") return (
    <div style={{ backgroundColor: color, border: `1px solid ${borderColor}`, borderRadius: 8, padding: "6px 12px", minWidth: 100 }}>
      <span style={{ color: textColor, fontSize: 10 }}>Screen bg</span>
    </div>
  );

  // Elevated
  if (k === "backgroundElevated") return (
    <div style={{ backgroundColor: color, border: `1px solid ${borderColor}`, borderRadius: 8, padding: "8px 12px" }}>
      <span style={{ color: textColor, fontSize: 11, fontWeight: 600 }}>Card</span>
      <span style={{ color: textColor, fontSize: 10, opacity: 0.6, marginLeft: 8 }}>Subtitle</span>
    </div>
  );

  // Border
  if (k === "border") return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ width: 60, height: 32, border: `1px solid ${color}`, borderRadius: 8, backgroundColor: bgColor }} />
      <div style={{ width: 60, borderTop: `1px solid ${color}` }} />
    </div>
  );

  // Text tokens
  if (k.startsWith("text")) return (
    <div style={{ fontSize: 12 }}>
      <span style={{ color, fontWeight: k === "textPrimary" ? 600 : 400 }}>
        {k === "textPrimary" ? "Page Title" : k === "textSecondary" ? "Subtitle text" : "Disabled"}
      </span>
    </div>
  );

  // Semantic — badge + ring
  if (["success", "warning", "error", "info"].includes(k)) return (
    <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
      <span style={{ width: 28, height: 28, borderRadius: 14, border: `3px solid ${color}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color, fontWeight: 700, fontSize: 10 }}>
        {k === "success" ? "85" : k === "warning" ? "!" : k === "error" ? "X" : "i"}
      </span>
      <span style={{ backgroundColor: `${color}22`, color, padding: "2px 8px", borderRadius: 8, fontWeight: 600, fontSize: 10 }}>
        {token.label}
      </span>
    </div>
  );

  // Event — timeline card mock
  if (k.startsWith("event")) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderLeft: `3px solid ${color}`, paddingLeft: 8, backgroundColor: bgColor, borderRadius: 6, padding: "4px 8px 4px 10px" }}>
      <div>
        <span style={{ color: textColor, fontSize: 11, fontWeight: 600 }}>{token.label}</span>
        <span style={{ color: `${textColor}99`, fontSize: 9, marginLeft: 6 }}>15:00</span>
      </div>
    </div>
  );

  return null;
}

// ── Color Row with Preview ──

function BrandColorRow({
  token,
  darkValue,
  lightValue,
  mode,
  allColors,
  onChange,
}: {
  token: BrandToken;
  darkValue: string;
  lightValue: string;
  mode: "dark" | "light";
  allColors: Record<string, string>;
  onChange: (key: string, mode: "dark" | "light", value: string) => void;
}) {
  const value = mode === "dark" ? darkValue : lightValue;
  const defaultVal = mode === "dark" ? token.defaultDark : token.defaultLight;
  const resolvedColor = value || defaultVal;

  // Resolve contextual colors for previews
  const bgColor = allColors["background"] || (mode === "dark" ? "#0A0A0A" : "#F5F5F5");
  const elevColor = allColors["backgroundElevated"] || (mode === "dark" ? "#1A1A1A" : "#FFFFFF");
  const txtColor = allColors["textPrimary"] || (mode === "dark" ? "#FFFFFF" : "#0A0A0A");
  const brdColor = allColors["border"] || (mode === "dark" ? "#2D2D2D" : "#E0E0E0");

  return (
    <div className="py-4 border-b last:border-b-0">
      {/* Row 1: Color picker + label + hex */}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={resolvedColor}
          onChange={(e) => onChange(token.key, mode, e.target.value)}
          className="w-10 h-10 rounded-lg border cursor-pointer shrink-0 p-0.5 bg-transparent"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{token.label}</p>
          <p className="text-xs text-muted-foreground">{token.description}</p>
        </div>
        <Input
          value={value || defaultVal}
          onChange={(e) => {
            const v = e.target.value;
            if (!v || /^#([0-9A-Fa-f]{3,8})$/.test(v)) onChange(token.key, mode, v);
          }}
          className="h-8 w-28 font-mono text-xs shrink-0"
          placeholder={defaultVal}
        />
      </div>

      {/* Row 2: Component preview */}
      <div className="mt-2 ml-[52px] p-2 rounded-lg" style={{ backgroundColor: bgColor }}>
        <ComponentPreview token={token} color={resolvedColor} bgColor={elevColor} textColor={txtColor} borderColor={brdColor} />
      </div>

      {/* Row 3: Used by */}
      <div className="mt-1.5 ml-[52px] flex flex-wrap gap-1">
        {token.usedBy.map((u) => (
          <span key={u} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{u}</span>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──

export default function BrandColorsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [theme, setTheme] = useState<ThemeRow | null>(null);
  const [colorsDark, setColorsDark] = useState<Record<string, string>>({});
  const [colorsLight, setColorsLight] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/themes", { credentials: "include" });
      if (res.ok) {
        const themes: ThemeRow[] = await res.json();
        const active = themes.find((t) => t.is_active) || themes[0];
        if (active) {
          setTheme(active);
          setColorsDark(active.colors_dark || {});
          setColorsLight(active.colors_light || {});
        }
      }
    } catch {
      toast.error("Failed to load theme");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const currentColors = mode === "dark" ? colorsDark : colorsLight;

  function handleChange(key: string, m: "dark" | "light", value: string) {
    if (m === "dark") setColorsDark((prev) => ({ ...prev, [key]: value }));
    else setColorsLight((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveAndActivate() {
    if (!theme) return;
    setSaving(true);
    try {
      // 1. Save colors
      const saveRes = await fetch(`/api/v1/admin/themes/${theme.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: theme.name,
          colors_dark: colorsDark,
          colors_light: colorsLight,
          typography: {},
        }),
      });
      if (!saveRes.ok) { toast.error("Failed to save"); setSaving(false); return; }

      // 2. Always activate (force)
      const actRes = await fetch(`/api/v1/admin/themes/${theme.id}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (actRes.ok) {
        setTheme((prev) => prev ? { ...prev, is_active: true } : prev);
        toast.success("Brand colors saved & activated — changes are live");
      } else {
        toast.error("Saved but failed to activate");
      }
    } catch {
      toast.error("Failed to save brand colors");
    }
    setSaving(false);
  }

  async function handleForceActivate() {
    if (!theme) return;
    setActivating(true);
    try {
      const res = await fetch(`/api/v1/admin/themes/${theme.id}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setTheme((prev) => prev ? { ...prev, is_active: true } : prev);
        toast.success("Theme activated — changes are now live in the app");
      } else {
        toast.error("Failed to activate");
      }
    } catch {
      toast.error("Failed to activate theme");
    }
    setActivating(false);
  }

  function handleReset() {
    const dark: Record<string, string> = {};
    const light: Record<string, string> = {};
    for (const t of BRAND_TOKENS) {
      dark[t.key] = t.defaultDark;
      light[t.key] = t.defaultLight;
    }
    setColorsDark(dark);
    setColorsLight(light);
    toast.info("Reset to brand kit defaults (not saved yet)");
  }

  async function handleResetAndSave() {
    const dark: Record<string, string> = {};
    const light: Record<string, string> = {};
    for (const t of BRAND_TOKENS) {
      dark[t.key] = t.defaultDark;
      light[t.key] = t.defaultLight;
    }
    setColorsDark(dark);
    setColorsLight(light);

    if (!theme) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/themes/${theme.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: theme.name, colors_dark: dark, colors_light: light, typography: {} }),
      });
      if (res.ok) {
        await fetch(`/api/v1/admin/themes/${theme.id}/activate`, { method: "POST", credentials: "include" });
        setTheme((prev) => prev ? { ...prev, is_active: true } : prev);
        toast.success("Brand kit defaults saved & activated — app will update on next load");
      } else { toast.error("Failed to save"); }
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading brand colors...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brand Colors</h1>
          <p className="text-muted-foreground">
            {BRAND_TOKENS.length} tokens · 70% dark / 20% neutral / 10% green
          </p>
          {theme && (
            <p className="text-xs mt-1">
              Theme: <span className="font-mono">{theme.name}</span>
              {theme.is_active
                ? <span className="ml-2 text-green-500 font-semibold">Active</span>
                : <span className="ml-2 text-yellow-500 font-semibold">Not active</span>
              }
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={handleReset}>Reset (Preview)</Button>
          <Button variant="destructive" size="sm" onClick={handleResetAndSave} disabled={saving}>Reset & Save Brand Kit</Button>
          <Button variant="outline" size="sm" onClick={handleForceActivate} disabled={activating}>
            {activating ? "Activating..." : "Force Activate"}
          </Button>
          <Button onClick={handleSaveAndActivate} disabled={saving}>
            {saving ? "Saving..." : "Save & Activate"}
          </Button>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button variant={mode === "dark" ? "default" : "outline"} size="sm" onClick={() => setMode("dark")}>Dark Mode</Button>
        <Button variant={mode === "light" ? "default" : "outline"} size="sm" onClick={() => setMode("light")}>Light Mode</Button>
      </div>

      {/* Token groups */}
      {GROUPS.map((group) => (
        <Card key={group}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{group}</CardTitle>
          </CardHeader>
          <CardContent>
            {BRAND_TOKENS.filter((t) => t.group === group).map((token) => (
              <BrandColorRow
                key={token.key}
                token={token}
                darkValue={colorsDark[token.key] || ""}
                lightValue={colorsLight[token.key] || ""}
                mode={mode}
                allColors={currentColors}
                onChange={handleChange}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
