"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface PromptBlock {
  id: string;
  name: string;
  template: string;
  enabled: boolean;
  sortOrder: number;
  description: string;
}

interface AIPromptTemplates {
  blocks: PromptBlock[];
  coachingStyle: string;
  ageToneAdjustments: {
    u13_u15: { enabled: boolean };
    u17_u19: { enabled: boolean };
    senior: { enabled: boolean };
  };
  programmePhilosophy: string;
}

const COACHING_STYLES = [
  { id: "motivating", label: "Motivating coach", tagline: "Direct, energising, push-oriented", example: "\"You're recovered and ready — let's push it today. This is your week.\"" },
  { id: "supportive", label: "Supportive mentor", tagline: "Warm, developmental, process-focused", example: "\"You've put in the work — today is about applying it. Trust the process.\"" },
  { id: "data_informed", label: "Data-informed", tagline: "Numbers-led, precise, evidence-based", example: "\"Your sprint times are up 4% this month. Your aerobic base is responding.\"" },
  { id: "holistic", label: "Holistic guide", tagline: "Whole-athlete, balance and lifestyle focused", example: "\"Sleep is as important as the session. Here is why recovery matters.\"" },
];

const CONTEXT_BLOCKS = [
  { id: "sport_context", label: "Sport and position context", description: "Tomo knows your athletes' positions and the demands of your sport.", alwaysOn: true },
  { id: "phv_safety", label: "Growth phase safety", description: "Tomo applies extra caution for athletes in a growth phase." },
  { id: "behavioral_profile", label: "Athlete personality and habits", description: "Tomo adjusts its approach based on how each athlete typically responds to training and feedback." },
  { id: "triangle_intelligence", label: "Daily readiness and wellness", description: "Tomo factors in sleep, mood, and physical readiness when coaching." },
  { id: "active_recommendations", label: "Recent coaching recommendations", description: "Tomo references the top recommendations from the last 24 hours." },
  { id: "dual_load", label: "School and exam schedule", description: "Tomo adjusts training intensity around academic pressure and exams." },
];

export function CoachingVoiceEditor() {
  const [config, setConfig] = useState<AIPromptTemplates | null>(null);
  const [saving, setSaving] = useState(false);
  const [philosophySaving, setPhilosophySaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/prompt-templates", { credentials: "include" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => toast.error("Failed to load"));
  }, []);

  if (!config) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  async function save(newConfig: AIPromptTemplates) {
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/prompt-templates", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) toast.success("Saved");
      else toast.error("Save failed");
    } catch { toast.error("Save failed"); }
  }

  function setStyle(style: string) {
    const updated = { ...config!, coachingStyle: style };
    setConfig(updated);
    save(updated);
  }

  function toggleAgeTone(group: "u13_u15" | "u17_u19" | "senior", value: boolean) {
    const updated = {
      ...config!,
      ageToneAdjustments: {
        ...config!.ageToneAdjustments,
        [group]: { enabled: value },
      },
    };
    setConfig(updated);
    save(updated);
  }

  function toggleBlock(blockId: string, enabled: boolean) {
    const updated = {
      ...config!,
      blocks: config!.blocks.map((b) => b.id === blockId ? { ...b, enabled } : b),
    };
    setConfig(updated);
    save(updated);
  }

  async function savePhilosophy() {
    setPhilosophySaving(true);
    await save(config!);
    setPhilosophySaving(false);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Section A — Coaching style */}
      <div>
        <h3 className="text-sm font-semibold mb-2">How Tomo speaks to your athletes</h3>
        <div className="grid grid-cols-2 gap-3">
          {COACHING_STYLES.map((style) => (
            <Card
              key={style.id}
              className={`cursor-pointer transition-all ${
                config.coachingStyle === style.id
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-border hover:bg-accent/5"
              }`}
              onClick={() => setStyle(style.id)}
            >
              <CardContent className="p-4">
                <p className="text-sm font-medium">{style.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{style.tagline}</p>
                <p className="text-xs italic text-muted-foreground mt-2">{style.example}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Section B — Age tone toggles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Adjust tone for each age group</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Younger athletes (U13–U15)</p>
              <p className="text-xs text-muted-foreground">Simpler words, more encouragement, fun-first framing. Avoids performance pressure language.</p>
            </div>
            <Switch checked={config.ageToneAdjustments.u13_u15.enabled} onCheckedChange={(v) => toggleAgeTone("u13_u15", v)} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Academy athletes (U17–U19)</p>
              <p className="text-xs text-muted-foreground">More performance language, goal-orientation, and training detail. Still encouraging but increasingly professional.</p>
            </div>
            <Switch checked={config.ageToneAdjustments.u17_u19.enabled} onCheckedChange={(v) => toggleAgeTone("u17_u19", v)} />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Senior athletes (18+)</p>
              <p className="text-xs text-muted-foreground">Professional tone, data-forward, tactical context included. Treats the athlete as a performance professional.</p>
            </div>
            <Switch checked={config.ageToneAdjustments.senior.enabled} onCheckedChange={(v) => toggleAgeTone("senior", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Section C — Non-negotiable principles */}
      <div>
        <h3 className="text-sm font-semibold mb-2">What Tomo always does</h3>
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-dashed">
            <CardContent className="p-4">
              <p className="text-sm font-medium">Always offer an alternative</p>
              <p className="text-xs text-muted-foreground mt-1">If Tomo restricts a session or exercise, it always tells the athlete what they can do instead. There are no dead ends.</p>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="p-4">
              <p className="text-sm font-medium">Plain language, not clinical terms</p>
              <p className="text-xs text-muted-foreground mt-1">When Tomo limits training for safety reasons, it explains the benefit in coaching language. Athletes are never given acronyms or medical terminology.</p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground mt-2">These behaviours cannot be disabled — they are core to how Tomo keeps athletes safe and engaged.</p>
      </div>

      {/* Section D — Programme philosophy */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Your programme's coaching philosophy (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={config.programmePhilosophy}
            onChange={(e) => setConfig({ ...config, programmePhilosophy: e.target.value.slice(0, 500) })}
            rows={4}
            className="text-sm"
            placeholder="Add your own coaching philosophy here. Tomo will reflect this in how it communicates with your athletes.&#10;&#10;Example: 'We value effort and consistency over outcomes. We celebrate recovery as a performance tool, not a weakness.'"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{config.programmePhilosophy.length} / 500</span>
            <Button size="sm" onClick={savePhilosophy} disabled={philosophySaving}>
              {philosophySaving ? "Saving..." : "Save philosophy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section E — Context blocks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Information Tomo uses when coaching</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CONTEXT_BLOCKS.map((block) => {
            const configBlock = config.blocks.find((b) => b.id === block.id);
            const isEnabled = configBlock?.enabled ?? true;
            return (
              <div key={block.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">{block.label}</p>
                  <p className="text-xs text-muted-foreground">{block.description}</p>
                </div>
                {block.alwaysOn ? (
                  <span className="text-xs text-muted-foreground">(Always active)</span>
                ) : (
                  <Switch checked={isEnabled} onCheckedChange={(v) => toggleBlock(block.id, v)} />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
