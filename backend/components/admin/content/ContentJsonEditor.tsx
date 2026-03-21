"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ContentJsonEditorProps {
  category: string;
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function ContentJsonEditor({
  category,
  content,
  onChange,
}: ContentJsonEditorProps) {
  switch (category) {
    case "quotes":
      return <QuotesEditor content={content} onChange={onChange} />;
    case "tips":
      return <TipsEditor content={content} onChange={onChange} />;
    case "milestones":
      return <MilestonesEditor content={content} onChange={onChange} />;
    case "onboarding":
      return <OnboardingEditor content={content} onChange={onChange} />;
    case "phone_tests":
      return <PhoneTestsEditor content={content} onChange={onChange} />;
    case "blazepod_drills":
      return <BlazepodDrillsEditor content={content} onChange={onChange} />;
    default:
      return <RawJsonEditor content={content} onChange={onChange} />;
  }
}

// ---------- Quotes ----------

function QuotesEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Quote Text *</Label>
        <Textarea
          value={(content.text as string) || ""}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="Enter the quote..."
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>Author</Label>
        <Input
          value={(content.author as string) || ""}
          onChange={(e) => onChange({ ...content, author: e.target.value })}
          placeholder="e.g., Michael Jordan"
        />
      </div>
    </div>
  );
}

// ---------- Tips ----------

function TipsEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={(content.title as string) || ""}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          placeholder="Tip title"
        />
      </div>
      <div className="space-y-2">
        <Label>Body *</Label>
        <Textarea
          value={(content.body as string) || ""}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          placeholder="Tip body text..."
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <Label>Situation</Label>
        <Input
          value={(content.situation as string) || ""}
          onChange={(e) => onChange({ ...content, situation: e.target.value })}
          placeholder="e.g., pre_match, recovery, high_energy"
        />
      </div>
    </div>
  );
}

// ---------- Milestones ----------

function MilestonesEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={(content.title as string) || ""}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          placeholder="Milestone title"
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={(content.description as string) || ""}
          onChange={(e) =>
            onChange({ ...content, description: e.target.value })
          }
          placeholder="Milestone description..."
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Icon</Label>
          <Input
            value={(content.icon as string) || ""}
            onChange={(e) => onChange({ ...content, icon: e.target.value })}
            placeholder="e.g., trophy, star, flame"
          />
        </div>
        <div className="space-y-2">
          <Label>Threshold</Label>
          <Input
            type="number"
            value={(content.threshold as number) || 0}
            onChange={(e) =>
              onChange({ ...content, threshold: Number(e.target.value) })
            }
            min={0}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Onboarding ----------

function OnboardingEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={(content.title as string) || ""}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          placeholder="Onboarding screen title"
        />
      </div>
      <div className="space-y-2">
        <Label>Body *</Label>
        <Textarea
          value={(content.body as string) || ""}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          placeholder="Onboarding body text..."
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <Label>Image URL</Label>
        <Input
          value={(content.image_url as string) || ""}
          onChange={(e) => onChange({ ...content, image_url: e.target.value })}
          placeholder="https://..."
        />
      </div>
    </div>
  );
}

// ---------- Phone Tests ----------

function PhoneTestsEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const instructions = (content.instructions as string[]) || [""];

  function setInstruction(index: number, value: string) {
    const updated = [...instructions];
    updated[index] = value;
    onChange({ ...content, instructions: updated });
  }

  function addInstruction() {
    onChange({ ...content, instructions: [...instructions, ""] });
  }

  function removeInstruction(index: number) {
    const updated = instructions.filter((_, i) => i !== index);
    onChange({ ...content, instructions: updated.length > 0 ? updated : [""] });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Test Name *</Label>
        <Input
          value={(content.name as string) || ""}
          onChange={(e) => onChange({ ...content, name: e.target.value })}
          placeholder="e.g., Reaction Time Test"
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={(content.description as string) || ""}
          onChange={(e) =>
            onChange({ ...content, description: e.target.value })
          }
          placeholder="Test description..."
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>Instructions</Label>
        <div className="space-y-2">
          {instructions.map((step, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-sm text-muted-foreground mt-2 w-6 shrink-0">
                {i + 1}.
              </span>
              <Input
                value={step}
                onChange={(e) => setInstruction(i, e.target.value)}
                placeholder={`Step ${i + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeInstruction(i)}
                disabled={instructions.length <= 1}
              >
                X
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
            + Add Step
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Metric Key</Label>
        <Input
          value={(content.metric_key as string) || ""}
          onChange={(e) => onChange({ ...content, metric_key: e.target.value })}
          placeholder="e.g., reaction_time_ms"
        />
      </div>
    </div>
  );
}

// ---------- Blazepod Drills ----------

function BlazepodDrillsEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Drill Name *</Label>
        <Input
          value={(content.name as string) || ""}
          onChange={(e) => onChange({ ...content, name: e.target.value })}
          placeholder="e.g., Light Chase"
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={(content.description as string) || ""}
          onChange={(e) =>
            onChange({ ...content, description: e.target.value })
          }
          placeholder="Drill description..."
          rows={3}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Sets</Label>
          <Input
            type="number"
            value={(content.sets as number) || 3}
            onChange={(e) =>
              onChange({ ...content, sets: Number(e.target.value) })
            }
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label>Reps</Label>
          <Input
            type="number"
            value={(content.reps as number) || 10}
            onChange={(e) =>
              onChange({ ...content, reps: Number(e.target.value) })
            }
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label>Rest (seconds)</Label>
          <Input
            type="number"
            value={(content.rest_seconds as number) || 30}
            onChange={(e) =>
              onChange({ ...content, rest_seconds: Number(e.target.value) })
            }
            min={0}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Raw JSON Fallback ----------

function RawJsonEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const [raw, setRaw] = useState(JSON.stringify(content, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  function handleChange(value: string) {
    setRaw(value);
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        setJsonError(null);
        onChange(parsed);
      } else {
        setJsonError("Content must be a JSON object");
      }
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  return (
    <div className="space-y-2">
      <Label>Content JSON</Label>
      <Textarea
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        rows={10}
        className="font-mono text-sm"
        placeholder='{ "key": "value" }'
      />
      {jsonError && (
        <p className="text-sm text-destructive">{jsonError}</p>
      )}
    </div>
  );
}
