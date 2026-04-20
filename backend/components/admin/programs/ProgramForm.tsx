"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { programsHelp } from "@/lib/cms-help/programs";

// ── Constants ──

const CATEGORIES = [
  "sprint", "sled", "strength", "power", "plyometric",
  "nordic", "hamstring", "acl_prevention", "ankle_stability", "hip_mobility", "groin",
  "passing", "shooting", "dribbling", "first_touch", "crossing", "heading",
  "defensive", "goalkeeping", "set_piece", "tactical", "decision_making",
  "scanning", "combination_play", "endurance", "agility", "cardio",
];

const AGE_BANDS = ["U13", "U15", "U17", "U19", "U21", "SEN", "VET"];

const POSITIONS = [
  "GK", "CB", "FB", "WB", "CDM", "CM", "CAM", "WM", "W", "ST", "CF", "ALL",
];

const DIFFICULTIES = ["beginner", "intermediate", "advanced", "elite"];

// ── Types ──

interface Prescription {
  sets: number;
  reps: string;
  intensity: string;
  rpe: string;
  rest: string;
  frequency: string;
  coachingCues: string[];
}

interface PHVStage {
  contraindicated?: boolean;
  warnings: string[];
  modifiedPrescription?: Partial<Prescription>;
}

interface PHVGuidance {
  pre_phv?: PHVStage;
  mid_phv?: PHVStage;
  post_phv?: PHVStage;
}

interface ProgramFormProps {
  programId?: string;
  initialData?: Record<string, unknown>;
}

const DEFAULT_PRESCRIPTION: Prescription = {
  sets: 3,
  reps: "8-12",
  intensity: "moderate",
  rpe: "6-7",
  rest: "60-90s",
  frequency: "2x/week",
  coachingCues: [],
};

// ── Main Form ──

export function ProgramForm({ programId, initialData }: ProgramFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Basic fields
  const [name, setName] = useState((initialData?.name as string) || "");
  const [category, setCategory] = useState((initialData?.category as string) || "strength");
  const [type, setType] = useState<"physical" | "technical">((initialData?.type as "physical" | "technical") || "physical");
  const [description, setDescription] = useState((initialData?.description as string) || "");
  const [durationMinutes, setDurationMinutes] = useState((initialData?.duration_minutes as number) || 30);
  const [difficulty, setDifficulty] = useState((initialData?.difficulty as string) || "intermediate");
  // Physical intensity bucket used by the calendar intensity-resolver
  // cascade. When an athlete schedules this program without explicitly
  // picking an intensity, this value lands on calendar_events.intensity
  // (so downstream ATL/CTL/ACWR never sees a null signal).
  const [defaultIntensity, setDefaultIntensity] = useState<string>(
    (initialData?.default_intensity as string) || "MODERATE",
  );
  const [sortOrder, setSortOrder] = useState((initialData?.sort_order as number) || 100);
  const [active, setActive] = useState((initialData?.active as boolean) ?? true);
  // Load-bearing AI safety gate — when false the chat agent must not
  // recommend this program regardless of other filters.
  const [chatEligible, setChatEligible] = useState(
    (initialData?.chat_eligible as boolean) ?? true
  );

  // Arrays
  const [positionEmphasis, setPositionEmphasis] = useState<string[]>(
    (initialData?.position_emphasis as string[]) || ["ALL"]
  );
  const [equipment, setEquipment] = useState<string[]>(
    (initialData?.equipment as string[]) || []
  );
  const [tags, setTags] = useState<string[]>(
    (initialData?.tags as string[]) || []
  );

  // Prescriptions per age band
  const [prescriptions, setPrescriptions] = useState<Record<string, Prescription>>(
    (initialData?.prescriptions as Record<string, Prescription>) || {}
  );
  const [activeAgeBand, setActiveAgeBand] = useState("SEN");

  // PHV guidance
  const [phvGuidance, setPhvGuidance] = useState<PHVGuidance>(
    (initialData?.phv_guidance as PHVGuidance) || {}
  );

  // Tag input
  const [newTag, setNewTag] = useState("");
  const [newEquip, setNewEquip] = useState("");

  // ── Prescription helpers ──

  function getPrescription(band: string): Prescription {
    return prescriptions[band] || { ...DEFAULT_PRESCRIPTION };
  }

  function updatePrescription(band: string, field: keyof Prescription, value: unknown) {
    setPrescriptions((prev) => ({
      ...prev,
      [band]: { ...getPrescription(band), [field]: value },
    }));
  }

  function addCoachingCue(band: string) {
    const current = getPrescription(band);
    updatePrescription(band, "coachingCues", [...current.coachingCues, ""]);
  }

  function updateCoachingCue(band: string, index: number, value: string) {
    const current = getPrescription(band);
    const cues = [...current.coachingCues];
    cues[index] = value;
    updatePrescription(band, "coachingCues", cues);
  }

  function removeCoachingCue(band: string, index: number) {
    const current = getPrescription(band);
    const cues = current.coachingCues.filter((_, i) => i !== index);
    updatePrescription(band, "coachingCues", cues);
  }

  // ── Position toggle ──

  function togglePosition(pos: string) {
    if (pos === "ALL") {
      setPositionEmphasis(["ALL"]);
      return;
    }
    const without = positionEmphasis.filter((p) => p !== "ALL" && p !== pos);
    if (positionEmphasis.includes(pos)) {
      setPositionEmphasis(without.length === 0 ? ["ALL"] : without);
    } else {
      setPositionEmphasis([...without, pos]);
    }
  }

  // ── Submit ──

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name,
      category,
      type,
      description,
      duration_minutes: durationMinutes,
      difficulty,
      default_intensity: defaultIntensity,
      sort_order: sortOrder,
      active,
      chat_eligible: chatEligible,
      position_emphasis: positionEmphasis,
      equipment,
      tags,
      prescriptions,
      phv_guidance: phvGuidance,
    };

    const url = programId
      ? `/api/v1/admin/programs/${programId}`
      : "/api/v1/admin/programs";
    const method = programId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(programId ? "Program updated" : "Program created");
      if (!programId) {
        const data = await res.json();
        if (data?.id) {
          router.push(`/admin/programs/${data.id}/edit`);
        } else {
          router.push("/admin/programs");
        }
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save program");
    }
    setSaving(false);
  }

  const currentPrescription = getPrescription(activeAgeBand);

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {programId ? "Edit Program" : "New Program"}
          </h1>
          <p className="text-muted-foreground">
            {programId ? "Update program template" : "Add a new training program to the catalog"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/programs")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : programId ? "Save Program" : "Create Program"}
          </Button>
        </div>
      </div>

      <PageGuide {...programsHelp.list.page} />

      <Separator />

      {/* ── Section 1: Basic Info ── */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Program Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldGuide {...programsHelp.list.fields!.category} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => v && setType(v as "physical" | "technical")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical">Physical</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} min={1} max={180} />
              <FieldGuide {...programsHelp.list.fields!.duration_weeks} />
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={(v) => v && setDifficulty(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldGuide {...programsHelp.list.fields!.difficulty} />
            </div>
            <div className="space-y-2">
              <Label>Default Intensity</Label>
              <Select value={defaultIntensity} onValueChange={(v) => v && setDefaultIntensity(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REST">Rest</SelectItem>
                  <SelectItem value="LIGHT">Light</SelectItem>
                  <SelectItem value="MODERATE">Moderate</SelectItem>
                  <SelectItem value="HARD">Hard</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used when an athlete schedules this program without picking an intensity. Drives training load on the calendar event.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label>Active</Label>
              <span className="text-xs text-muted-foreground">
                — visible in the program catalog.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={chatEligible}
                onCheckedChange={setChatEligible}
              />
              <Label>AI can recommend</Label>
              <span className="text-xs text-muted-foreground">
                — when off, the chat agent will not surface this program as a
                recommendation, regardless of other filters. Use to quickly
                remove unsafe or deprecated programs from the AI pool.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Position Emphasis ── */}
      <Card>
        <CardHeader>
          <CardTitle>Position Emphasis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((pos) => (
              <Badge
                key={pos}
                variant={positionEmphasis.includes(pos) ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => togglePosition(pos)}
              >
                {pos}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Prescriptions by Age Band ── */}
      <Card>
        <CardHeader>
          <CardTitle>Prescriptions by Age Band</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Age band tabs */}
          <div className="border-b">
            <div className="flex gap-0">
              {AGE_BANDS.map((band) => (
                <button
                  key={band}
                  type="button"
                  onClick={() => setActiveAgeBand(band)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeAgeBand === band
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {band}
                  {prescriptions[band] && (
                    <span className="ml-1 text-xs text-green-500">●</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Prescription fields */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Sets</Label>
              <Input
                type="number"
                value={currentPrescription.sets}
                onChange={(e) => updatePrescription(activeAgeBand, "sets", Number(e.target.value))}
                min={1}
                max={10}
              />
            </div>
            <div className="space-y-2">
              <Label>Reps</Label>
              <Input
                value={currentPrescription.reps}
                onChange={(e) => updatePrescription(activeAgeBand, "reps", e.target.value)}
                placeholder="e.g., 8-12"
              />
            </div>
            <div className="space-y-2">
              <Label>Intensity</Label>
              <Input
                value={currentPrescription.intensity}
                onChange={(e) => updatePrescription(activeAgeBand, "intensity", e.target.value)}
                placeholder="e.g., moderate"
              />
            </div>
            <div className="space-y-2">
              <Label>RPE</Label>
              <Input
                value={currentPrescription.rpe}
                onChange={(e) => updatePrescription(activeAgeBand, "rpe", e.target.value)}
                placeholder="e.g., 6-7"
              />
            </div>
            <div className="space-y-2">
              <Label>Rest</Label>
              <Input
                value={currentPrescription.rest}
                onChange={(e) => updatePrescription(activeAgeBand, "rest", e.target.value)}
                placeholder="e.g., 60-90s"
              />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Input
                value={currentPrescription.frequency}
                onChange={(e) => updatePrescription(activeAgeBand, "frequency", e.target.value)}
                placeholder="e.g., 2x/week"
              />
            </div>
          </div>

          {/* Coaching cues */}
          <div className="space-y-2">
            <Label>Coaching Cues</Label>
            {currentPrescription.coachingCues.map((cue, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={cue}
                  onChange={(e) => updateCoachingCue(activeAgeBand, i, e.target.value)}
                  placeholder={`Cue ${i + 1}`}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => removeCoachingCue(activeAgeBand, i)}>
                  ×
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addCoachingCue(activeAgeBand)}>
              + Add Cue
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: PHV Guidance ── */}
      <Card>
        <CardHeader>
          <CardTitle>PHV Guidance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["pre_phv", "mid_phv", "post_phv"] as const).map((stage) => {
            const stageData: PHVStage = phvGuidance[stage] || { warnings: [] };
            const label = stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

            return (
              <div key={stage} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{label}</h4>
                  {stage === "mid_phv" && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={stageData.contraindicated || false}
                        onCheckedChange={(v) =>
                          setPhvGuidance((prev) => ({
                            ...prev,
                            [stage]: { ...stageData, contraindicated: v },
                          }))
                        }
                      />
                      <Label className="text-sm text-destructive">Contraindicated</Label>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Warnings (one per line)</Label>
                  <Textarea
                    rows={2}
                    value={(stageData.warnings || []).join("\n")}
                    onChange={(e) =>
                      setPhvGuidance((prev) => ({
                        ...prev,
                        [stage]: {
                          ...stageData,
                          warnings: e.target.value.split("\n").filter(Boolean),
                        },
                      }))
                    }
                    placeholder="Enter warnings, one per line"
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Section 5: Equipment ── */}
      <Card>
        <CardHeader>
          <CardTitle>Equipment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {equipment.map((item, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setEquipment(equipment.filter((_, idx) => idx !== i))}
              >
                {item} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newEquip}
              onChange={(e) => setNewEquip(e.target.value)}
              placeholder="Add equipment..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newEquip.trim()) {
                    setEquipment([...equipment, newEquip.trim()]);
                    setNewEquip("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (newEquip.trim()) {
                  setEquipment([...equipment, newEquip.trim()]);
                  setNewEquip("");
                }
              }}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 6: Tags ── */}
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="cursor-pointer"
                onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
              >
                {tag} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newTag.trim()) {
                    setTags([...tags, newTag.trim()]);
                    setNewTag("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (newTag.trim()) {
                  setTags([...tags, newTag.trim()]);
                  setNewTag("");
                }
              }}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Bottom actions ── */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/programs")}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : programId ? "Save Program" : "Create Program"}
        </Button>
      </div>
    </form>
  );
}
