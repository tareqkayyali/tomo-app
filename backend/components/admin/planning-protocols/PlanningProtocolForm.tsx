"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

/* ---------- constants ---------- */

const SEVERITY_OPTIONS: {
  value: string;
  label: string;
  colors: string;
  selectedColors: string;
}[] = [
  {
    value: "MANDATORY",
    label: "Mandatory",
    colors: "bg-red-500/15 text-red-400 border-red-500/30",
    selectedColors: "bg-red-500 text-white border-red-500",
  },
  {
    value: "ADVISORY",
    label: "Advisory",
    colors: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    selectedColors: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "INFO",
    label: "Info",
    colors: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    selectedColors: "bg-blue-500 text-white border-blue-500",
  },
];

const CATEGORY_OPTIONS: {
  value: string;
  label: string;
  colors: string;
  selectedColors: string;
}[] = [
  {
    value: "safety",
    label: "Safety",
    colors: "bg-red-500/15 text-red-400 border-red-500/30",
    selectedColors: "bg-red-500 text-white border-red-500",
  },
  {
    value: "load_management",
    label: "Load Management",
    colors: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    selectedColors: "bg-orange-500 text-white border-orange-500",
  },
  {
    value: "recovery",
    label: "Recovery",
    colors: "bg-green-500/15 text-green-400 border-green-500/30",
    selectedColors: "bg-green-500 text-white border-green-500",
  },
  {
    value: "academic",
    label: "Academic",
    colors: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    selectedColors: "bg-amber-500 text-white border-amber-500",
  },
  {
    value: "scheduling",
    label: "Scheduling",
    colors: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    selectedColors: "bg-blue-500 text-white border-blue-500",
  },
  {
    value: "performance",
    label: "Performance",
    colors: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    selectedColors: "bg-purple-500 text-white border-purple-500",
  },
];

const SPORT_OPTIONS: { value: string; label: string }[] = [
  { value: "football", label: "Football" },
  { value: "padel", label: "Padel" },
  { value: "basketball", label: "Basketball" },
  { value: "tennis", label: "Tennis" },
  { value: "athletics", label: "Athletics" },
];

/* ---------- types ---------- */

interface PlanningProtocolFormProps {
  protocolId?: string;
  initialData?: Record<string, unknown>;
}

/* ---------- component ---------- */

export function PlanningProtocolForm({
  protocolId,
  initialData,
}: PlanningProtocolFormProps) {
  const router = useRouter();
  const isEdit = !!protocolId;

  const [name, setName] = useState((initialData?.name as string) ?? "");
  const [description, setDescription] = useState(
    (initialData?.description as string) ?? ""
  );
  const [severity, setSeverity] = useState(
    (initialData?.severity as string) ?? "ADVISORY"
  );
  const [category, setCategory] = useState(
    (initialData?.category as string) ?? "safety"
  );
  const [triggerConditions, setTriggerConditions] = useState(
    initialData?.trigger_conditions
      ? JSON.stringify(initialData.trigger_conditions, null, 2)
      : "[]"
  );
  const [actions, setActions] = useState(
    initialData?.actions
      ? JSON.stringify(initialData.actions, null, 2)
      : "{}"
  );
  const [scientificBasis, setScientificBasis] = useState(
    (initialData?.scientific_basis as string) ?? ""
  );
  const [sportFilter, setSportFilter] = useState<string[]>(
    (initialData?.sport_filter as string[]) ?? []
  );
  const [isEnabled, setIsEnabled] = useState(
    initialData?.is_enabled !== undefined
      ? (initialData.is_enabled as boolean)
      : true
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleSport(sport: string) {
    setSportFilter((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    let parsedTriggerConditions: unknown[];
    let parsedActions: Record<string, unknown>;

    try {
      parsedTriggerConditions = JSON.parse(triggerConditions);
      if (!Array.isArray(parsedTriggerConditions)) {
        toast.error("Trigger conditions must be a JSON array");
        return;
      }
    } catch {
      toast.error("Invalid JSON in trigger conditions");
      return;
    }

    try {
      parsedActions = JSON.parse(actions);
      if (typeof parsedActions !== "object" || Array.isArray(parsedActions)) {
        toast.error("Actions must be a JSON object");
        return;
      }
    } catch {
      toast.error("Invalid JSON in actions");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      severity,
      category,
      trigger_conditions: parsedTriggerConditions,
      actions: parsedActions,
      scientific_basis: scientificBasis.trim() || null,
      sport_filter: sportFilter.length > 0 ? sportFilter : null,
      is_enabled: isEnabled,
    };

    setSaving(true);

    const url = isEdit
      ? `/api/v1/admin/planning-protocols/${protocolId}`
      : "/api/v1/admin/planning-protocols";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(
        isEdit ? `"${name}" updated` : `"${name}" created`
      );
      router.push("/admin/planning-protocols");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || `Failed to ${isEdit ? "update" : "create"} protocol`);
    }

    setSaving(false);
  }

  async function handleDelete() {
    if (!protocolId) return;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    setDeleting(true);
    const res = await fetch(`/api/v1/admin/planning-protocols/${protocolId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      toast.success(`"${name}" deleted`);
      router.push("/admin/planning-protocols");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete protocol");
    }
    setDeleting(false);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/admin/planning-protocols"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to Planning Protocols
      </Link>

      <h1 className="text-3xl font-bold tracking-tight">
        {isEdit ? "Edit Planning Protocol" : "New Planning Protocol"}
      </h1>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Protocol name, description, and classification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PHV Load Reduction"
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this protocol do?"
              className="min-h-[80px]"
            />
          </div>

          <Separator />

          {/* Severity pills */}
          <div>
            <Label>Severity</Label>
            <div className="flex gap-2 mt-1.5">
              {SEVERITY_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                    severity === opt.value ? opt.selectedColors : opt.colors
                  }`}
                  onClick={() => setSeverity(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Category pills */}
          <div>
            <Label>Category</Label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {CATEGORY_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                    category === opt.value ? opt.selectedColors : opt.colors
                  }`}
                  onClick={() => setCategory(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            <Label className="cursor-pointer" onClick={() => setIsEnabled(!isEnabled)}>
              {isEnabled ? "Enabled" : "Disabled"}
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Trigger Conditions & Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Logic</CardTitle>
          <CardDescription>
            Define when this protocol triggers and what actions it takes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Trigger Conditions (JSON array)</Label>
            <Textarea
              className="font-mono text-sm min-h-[140px]"
              value={triggerConditions}
              onChange={(e) => setTriggerConditions(e.target.value)}
              placeholder='[{"field": "acwr", "operator": ">", "value": 1.5}]'
            />
            <p className="text-xs text-muted-foreground mt-1">
              Each condition is an object with field, operator, and value.
            </p>
          </div>

          <div>
            <Label>Actions (JSON object)</Label>
            <Textarea
              className="font-mono text-sm min-h-[140px]"
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              placeholder='{"type": "reduce_load", "amount": 0.3}'
            />
            <p className="text-xs text-muted-foreground mt-1">
              Define the action payload this protocol executes when triggered.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Scientific Basis & Sport Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>
            Scientific references and sport applicability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Scientific Basis / Reference</Label>
            <Textarea
              value={scientificBasis}
              onChange={(e) => setScientificBasis(e.target.value)}
              placeholder="e.g. Based on Lloyd &amp; Oliver (2012) youth periodization model..."
              className="min-h-[100px]"
            />
          </div>

          <Separator />

          <div>
            <Label>Sport Filter</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Select which sports this protocol applies to. Leave empty for all
              sports.
            </p>
            <div className="flex gap-2 flex-wrap">
              {SPORT_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                    sportFilter.includes(opt.value)
                      ? "bg-foreground text-background border-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => toggleSport(opt.value)}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {isEdit && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Protocol"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/admin/planning-protocols">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Create Protocol"}
          </Button>
        </div>
      </div>
    </div>
  );
}
