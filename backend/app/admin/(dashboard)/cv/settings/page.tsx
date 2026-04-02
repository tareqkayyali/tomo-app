"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface CVConfig {
  club_sections: string[];
  university_sections: string[];
  position_emphasis: Record<string, string[]>;
  ai_statement_model: string;
  ai_trajectory_model: string;
  ai_dual_role_model: string;
  share_links_enabled: boolean;
  pdf_export_enabled: boolean;
  coachability_visible: boolean;
  dual_role_visible: boolean;
}

const ALL_SECTIONS = [
  "identity", "personal_statement", "physical", "positions", "career",
  "performance", "trajectory", "coachability", "competitions", "video_media",
  "references", "character_traits", "injury_status", "academic", "dual_role",
];

export default function CVSettingsPage() {
  const [config, setConfig] = useState<CVConfig | null>(null);
  const [defaults, setDefaults] = useState<CVConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/cv-settings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setConfig(data.config); setDefaults(data.defaults); })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/cv-settings", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      toast.success("CV settings saved");
    } catch { toast.error("Failed to save settings"); }
    setSaving(false);
  }, [config]);

  if (loading || !config) return <div className="p-6 text-muted-foreground">Loading settings...</div>;

  const toggleSection = (list: "club_sections" | "university_sections", section: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const arr = prev[list];
      return { ...prev, [list]: arr.includes(section) ? arr.filter((s) => s !== section) : [...arr, section] };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CV Settings</h1>
          <p className="text-muted-foreground">Configure the Player CV system</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfig(defaults)}>Reset to Defaults</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </div>

      {/* Feature Toggles */}
      <Card>
        <CardHeader><CardTitle>Feature Toggles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "share_links_enabled", label: "Share Links", desc: "Allow athletes to generate shareable CV links" },
            { key: "pdf_export_enabled", label: "PDF Export", desc: "Allow athletes to download CVs as PDF" },
            { key: "coachability_visible", label: "Coachability Index", desc: "Show coachability index on CVs" },
            { key: "dual_role_visible", label: "Dual-Role Section", desc: "Show dual-role competency for university CVs" },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div><Label>{label}</Label><p className="text-sm text-muted-foreground">{desc}</p></div>
              <Switch checked={(config as any)[key]} onCheckedChange={(v) => setConfig((p) => p ? { ...p, [key]: v } : p)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* AI Model Settings */}
      <Card>
        <CardHeader><CardTitle>AI Model Configuration</CardTitle>
          <CardDescription>Choose which Claude model generates each narrative type</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "ai_statement_model", label: "Personal Statement" },
            { key: "ai_trajectory_model", label: "Trajectory Narrative" },
            { key: "ai_dual_role_model", label: "Dual-Role Narrative" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Select value={(config as any)[key]} onValueChange={(v) => { if (v) setConfig((p) => p ? { ...p, [key]: v } : p); }}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sonnet">Sonnet (higher quality)</SelectItem>
                  <SelectItem value="haiku">Haiku (lower cost)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Club CV Sections */}
      <Card>
        <CardHeader><CardTitle>Club CV Sections</CardTitle>
          <CardDescription>Toggle which sections appear on the club CV</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {ALL_SECTIONS.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <Switch checked={config.club_sections.includes(s)} onCheckedChange={() => toggleSection("club_sections", s)} />
                <Label className="text-sm">{s.replace(/_/g, " ")}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* University CV Sections */}
      <Card>
        <CardHeader><CardTitle>University CV Sections</CardTitle>
          <CardDescription>Toggle which sections appear on the university/NCAA CV</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {ALL_SECTIONS.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <Switch checked={config.university_sections.includes(s)} onCheckedChange={() => toggleSection("university_sections", s)} />
                <Label className="text-sm">{s.replace(/_/g, " ")}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
