"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PromptBlock { id: string; name: string; template: string; enabled: boolean; sortOrder: number; description: string; }
interface AgeBandCalibration { vocabularyLevel: number; scientificTerms: boolean; motivationalFraming: string; }

interface Config {
  blocks: PromptBlock[];
  coachingStyle?: string;
  scienceTranslation: string;
  ageBandCalibration: Record<string, AgeBandCalibration>;
  ageToneAdjustments: { u13_u15: { enabled: boolean }; u17_u19: { enabled: boolean }; senior: { enabled: boolean } };
  programmePhilosophy: string;
}

const TRANSLATION_STYLES = [
  { id: "performance", label: "Performance language", tagline: "Data and numbers lead. Athletes get specific metrics and targets.", example: "\"Your sprint time improved 4% this month. Your aerobic threshold is responding to the base work. Strength is your next priority.\"" },
  { id: "development", label: "Development language", tagline: "Process and adaptation lead. Athletes understand what's happening to their body.", example: "\"Your aerobic base is growing — you'll notice your heart rate returning to normal faster after hard efforts. That's the adaptation you're building.\"" },
  { id: "action", label: "Action language", tagline: "Practical next steps lead. Athletes know exactly what to do.", example: "\"Today: bodyweight squats and mobility. Skip the heavy stuff — your body needs the recovery. Tomorrow you'll be sharper for it.\"" },
  { id: "balanced", label: "Balanced", tagline: "Science, development, and action in equal measure.", example: "\"Your recovery indicators suggest a lighter day. Instead of the planned strength session, let's do mobility and a short aerobic piece. You'll come back stronger tomorrow.\"" },
];

const AGE_BANDS = [
  { key: "u13", label: "U13 — ages 11-13", defaultVocab: 1, defaultFraming: "encouragement" },
  { key: "u15", label: "U15 — ages 13-15", defaultVocab: 2, defaultFraming: "encouragement" },
  { key: "u17", label: "U17 — ages 15-17", defaultVocab: 3, defaultFraming: "neutral" },
  { key: "u19", label: "U19 — ages 17-19", defaultVocab: 4, defaultFraming: "performance" },
  { key: "senior", label: "Senior — 18+", defaultVocab: 5, defaultFraming: "performance" },
];

const CONTEXT_BLOCKS = [
  { id: "sport_context", label: "Sport-specific demands and position profile", desc: "The AI knows what physical qualities matter for this athlete's sport and position.", alwaysOn: true },
  { id: "phv_safety", label: "Biological maturation and growth phase protocols", desc: "The AI applies appropriate load and exercise restrictions based on the athlete's estimated growth phase." },
  { id: "behavioral_profile", label: "Individual adaptation and response patterns", desc: "The AI adjusts its approach based on how this specific athlete has historically responded to training." },
  { id: "triangle_intelligence", label: "Sleep, recovery, and readiness physiology", desc: "The AI factors in sleep quality, recovery trends, and wellness patterns when recommending session intensity." },
  { id: "active_recommendations", label: "Active development priorities from the last 24 hours", desc: "The AI references the top development recommendations from the athlete's most recent data." },
  { id: "dual_load", label: "Academic stress and cognitive load science", desc: "The AI adjusts training intensity based on academic calendar events — exam periods, high workloads." },
];

const PRINCIPLES = [
  { title: "Always offers an alternative", desc: "If the AI cannot recommend a planned exercise or session, it always tells the athlete what they CAN do instead. There are no dead ends." },
  { title: "Science in plain language", desc: "The AI never uses clinical or technical acronyms in athlete-facing messages. Technical terms are always translated to coaching language." },
  { title: "Education, not restriction", desc: "When the AI limits training for safety reasons, it explains the physiological benefit to the athlete. Restriction without explanation reduces motivation." },
  { title: "No absolute statements about injury", desc: "The AI never diagnoses injury or tells an athlete they are injured. It recommends reduced load, flags patterns, and suggests professional consultation." },
  { title: "Athlete data ownership", desc: "The AI never shares one athlete's data with another athlete, regardless of any relationship between them." },
];

export function CoachingLanguageEditor() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/prompt-templates", { credentials: "include" })
      .then((r) => r.json()).then(setConfig).catch(() => toast.error("Failed to load"));
  }, []);

  const save = useCallback(async (c: Config) => {
    const res = await fetch("/api/v1/admin/performance-intelligence/prompt-templates", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    if (res.ok) toast.success("Saved"); else toast.error("Save failed");
  }, []);

  if (!config) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  function setTranslation(style: string) { const c = { ...config!, scienceTranslation: style }; setConfig(c); save(c); }

  function updateCalibration(band: string, field: keyof AgeBandCalibration, value: unknown) {
    const cal = { ...config!.ageBandCalibration };
    cal[band] = { ...(cal[band] || { vocabularyLevel: 3, scientificTerms: false, motivationalFraming: "neutral" }), [field]: value };
    const c = { ...config!, ageBandCalibration: cal };
    setConfig(c); save(c);
  }

  function toggleBlock(blockId: string, enabled: boolean) {
    const c = { ...config!, blocks: config!.blocks.map((b) => b.id === blockId ? { ...b, enabled } : b) };
    setConfig(c); save(c);
  }

  const VOCAB_LABELS = ["Simple", "Accessible", "Moderate", "Informed", "Technical"];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* A: Science-to-language translation */}
      <div>
        <h3 className="text-sm font-semibold mb-2">How the AI explains science to athletes</h3>
        <p className="text-xs text-muted-foreground mb-3">Define the translation principles the AI follows when communicating scientific concepts to young athletes.</p>
        <div className="grid grid-cols-2 gap-3">
          {TRANSLATION_STYLES.map((style) => (
            <Card key={style.id} className={`cursor-pointer transition-all ${config.scienceTranslation === style.id ? "border-green-500/50 bg-green-500/5" : "border-border hover:bg-accent/5"}`} onClick={() => setTranslation(style.id)}>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{style.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{style.tagline}</p>
                <p className="text-xs italic text-muted-foreground mt-2">{style.example}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* B: Age-appropriate calibration */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Language calibration by age</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">The AI adjusts its vocabulary and complexity based on athlete age. Set the calibration for each age band.</p>
          {AGE_BANDS.map((band) => {
            const cal = config.ageBandCalibration[band.key] || { vocabularyLevel: band.defaultVocab, scientificTerms: false, motivationalFraming: band.defaultFraming };
            return (
              <Card key={band.key} className="border-dashed">
                <CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium">{band.label}</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Vocabulary level</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input type="range" min={1} max={5} value={cal.vocabularyLevel} onChange={(e) => updateCalibration(band.key, "vocabularyLevel", parseInt(e.target.value))} className="flex-1 accent-green-500" />
                        <span className="text-xs w-16">{VOCAB_LABELS[cal.vocabularyLevel - 1]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={cal.scientificTerms} onCheckedChange={(v) => updateCalibration(band.key, "scientificTerms", v)} />
                      <Label className="text-xs">Use sport science terms (with explanations)</Label>
                    </div>
                    <div>
                      <Label className="text-xs">Motivational framing</Label>
                      <Select value={cal.motivationalFraming} onValueChange={(v) => updateCalibration(band.key, "motivationalFraming", v || cal.motivationalFraming)}>
                        <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="encouragement">Encouragement-forward</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                          <SelectItem value="performance">Performance-standard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>

      {/* C: Non-negotiable principles */}
      <div>
        <h3 className="text-sm font-semibold mb-2">What the AI always does — regardless of any other setting</h3>
        <div className="grid grid-cols-2 gap-3">
          {PRINCIPLES.map((p, i) => (
            <Card key={i} className="border-dashed border-l-2 border-l-green-500/50">
              <CardContent className="p-4">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">These principles cannot be modified here. They are core to how Tomo keeps athletes both safe and engaged in their development.</p>
      </div>

      {/* D: Context blocks */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Scientific context the AI uses in every conversation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {CONTEXT_BLOCKS.map((block) => {
            const cb = config.blocks.find((b) => b.id === block.id);
            return (
              <div key={block.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div><p className="text-sm font-medium">{block.label}</p><p className="text-xs text-muted-foreground">{block.desc}</p></div>
                {block.alwaysOn ? <span className="text-xs text-muted-foreground">(Always active)</span> : <Switch checked={cb?.enabled ?? true} onCheckedChange={(v) => toggleBlock(block.id, v)} />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
