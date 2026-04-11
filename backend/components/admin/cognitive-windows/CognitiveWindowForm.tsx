"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { FieldGuide } from "@/components/admin/FieldGuide";
import { cognitiveWindowsHelp } from "@/lib/cms-help/cognitive-windows";

/* ---------- types ---------- */

interface CognitiveWindowData {
  id?: string;
  session_type: string;
  cognitive_state: "enhanced" | "suppressed" | "neutral";
  optimal_study_delay_minutes: number;
  description: string | null;
}

interface CognitiveWindowFormProps {
  windowId?: string;
  initialData?: CognitiveWindowData;
}

/* ---------- constants ---------- */

const COGNITIVE_STATES = [
  { value: "enhanced" as const, label: "Enhanced", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "suppressed" as const, label: "Suppressed", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  { value: "neutral" as const, label: "Neutral", className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
] as const;

const DELAY_OPTIONS = [
  { value: 0, label: "No delay" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
  { value: 90, label: "90 min" },
  { value: 120, label: "120 min" },
] as const;

/* ---------- component ---------- */

export function CognitiveWindowForm({ windowId, initialData }: CognitiveWindowFormProps) {
  const router = useRouter();
  const isEditing = !!windowId;

  const [sessionType, setSessionType] = useState(initialData?.session_type ?? "");
  const [cognitiveState, setCognitiveState] = useState<"enhanced" | "suppressed" | "neutral">(
    initialData?.cognitive_state ?? "neutral"
  );
  const [delayMinutes, setDelayMinutes] = useState(initialData?.optimal_study_delay_minutes ?? 0);
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!sessionType.trim()) {
      toast.error("Session type is required");
      return;
    }

    setSaving(true);
    const payload = {
      session_type: sessionType.trim(),
      cognitive_state: cognitiveState,
      optimal_study_delay_minutes: delayMinutes,
      description: description.trim() || null,
    };

    const url = isEditing
      ? `/api/v1/admin/cognitive-windows/${windowId}`
      : "/api/v1/admin/cognitive-windows";

    const res = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(isEditing ? `"${sessionType}" updated` : `"${sessionType}" created`);
      router.push("/admin/cognitive-windows");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || `Failed to ${isEditing ? "update" : "create"} cognitive window`);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete cognitive window for "${sessionType}"? This cannot be undone.`)) return;

    setDeleting(true);
    const res = await fetch(`/api/v1/admin/cognitive-windows/${windowId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${sessionType}" deleted`);
      router.push("/admin/cognitive-windows");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete cognitive window");
    }
    setDeleting(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back link */}
      <Link
        href="/admin/cognitive-windows"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to Cognitive Windows
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditing ? "Edit Cognitive Window" : "New Cognitive Window"}
        </h1>
        <p className="text-muted-foreground">
          {isEditing
            ? "Update the session type, cognitive state, and study delay settings."
            : "Define how a training session type affects cognitive readiness for study."}
        </p>
      </div>

      <PageGuide {...cognitiveWindowsHelp.list.page} />

      {/* Session Type */}
      <Card>
        <CardHeader>
          <CardTitle>Session Type</CardTitle>
          <CardDescription>
            The type of training session (e.g. &ldquo;High Intensity Training&rdquo;, &ldquo;Match Day&rdquo;)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="session_type">Session Type</Label>
            <Input
              id="session_type"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              placeholder="e.g. High Intensity Training"
            />
            <FieldGuide {...cognitiveWindowsHelp.list.fields!.session_type} />
          </div>
        </CardContent>
      </Card>

      {/* Cognitive State */}
      <Card>
        <CardHeader>
          <CardTitle>Cognitive State</CardTitle>
          <CardDescription>
            How this session type affects the athlete&rsquo;s cognitive readiness
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>State</Label>
            <FieldGuide {...cognitiveWindowsHelp.list.fields!.cognitive_state} />
            <div className="flex gap-2 flex-wrap">
              {COGNITIVE_STATES.map((state) => {
                const isSelected = cognitiveState === state.value;
                return (
                  <Badge
                    key={state.value}
                    variant="outline"
                    className={`cursor-pointer px-4 py-2 text-sm transition-all ${
                      isSelected
                        ? state.className.replace(/\/15/, "/40") + " ring-1 ring-current"
                        : state.className + " opacity-50 hover:opacity-80"
                    }`}
                    onClick={() => setCognitiveState(state.value)}
                  >
                    {state.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optimal Study Delay */}
      <Card>
        <CardHeader>
          <CardTitle>Optimal Study Delay</CardTitle>
          <CardDescription>
            Recommended wait time after this session before studying
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Delay (minutes)</Label>
            <FieldGuide {...cognitiveWindowsHelp.list.fields!.optimal_study_delay} />
            <div className="flex gap-2 flex-wrap">
              {DELAY_OPTIONS.map((opt) => {
                const isSelected = delayMinutes === opt.value;
                return (
                  <Badge
                    key={opt.value}
                    variant="outline"
                    className={`cursor-pointer px-4 py-2 text-sm transition-all ${
                      isSelected
                        ? "bg-blue-500/30 text-blue-300 border-blue-500/50 ring-1 ring-blue-400"
                        : "bg-gray-500/10 text-gray-400 border-gray-500/20 opacity-60 hover:opacity-90"
                    }`}
                    onClick={() => setDelayMinutes(opt.value)}
                  >
                    {opt.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Description / Scientific Basis</CardTitle>
          <CardDescription>
            Explain the reasoning behind this cognitive window configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. High-intensity exercise increases BDNF and cerebral blood flow, enhancing neuroplasticity for 1-2 hours post-exercise..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div>
          {isEditing && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Window"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/admin/cognitive-windows">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Window"}
          </Button>
        </div>
      </div>
    </div>
  );
}
