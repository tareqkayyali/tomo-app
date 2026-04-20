"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  InputFieldBuilder,
  type InputFieldDef,
} from "./InputFieldBuilder";
import {
  DerivedMetricEditor,
  type DerivedMetricDef,
} from "./DerivedMetricEditor";

interface AssessmentFormProps {
  assessmentId?: string;
  initialData?: Record<string, unknown>;
}

export function AssessmentForm({
  assessmentId,
  initialData,
}: AssessmentFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // -- Metadata --
  const [testId, setTestId] = useState(
    (initialData?.test_id as string) || ""
  );
  const [name, setName] = useState((initialData?.name as string) || "");
  const [sportId, setSportId] = useState(
    (initialData?.sport_id as string) || "football"
  );
  const [icon, setIcon] = useState((initialData?.icon as string) || "");
  const [color, setColor] = useState(
    (initialData?.color as string) || "#888888"
  );
  const [description, setDescription] = useState(
    (initialData?.description as string) || ""
  );
  const [researchNote, setResearchNote] = useState(
    (initialData?.research_note as string) || ""
  );
  const [sortOrder, setSortOrder] = useState(
    (initialData?.sort_order as number) || 0
  );

  // -- Input Fields --
  const [inputs, setInputs] = useState<InputFieldDef[]>(
    (initialData?.inputs as InputFieldDef[]) || []
  );

  // -- Derived Metrics --
  const [derivedMetrics, setDerivedMetrics] = useState<DerivedMetricDef[]>(
    (initialData?.derived_metrics as DerivedMetricDef[]) || []
  );

  // -- Linked Attributes --
  const [attributeKeys, setAttributeKeys] = useState<string[]>(
    (initialData?.attribute_keys as string[]) || []
  );

  // -- Primary Metric --
  const [primaryMetricName, setPrimaryMetricName] = useState(
    (initialData?.primary_metric_name as string) || ""
  );
  const [primaryInputKey, setPrimaryInputKey] = useState(
    (initialData?.primary_input_key as string) || ""
  );

  // -- Lookups --
  const [attributes, setAttributes] = useState<
    { key: string; full_name: string; color: string }[]
  >([]);

  useEffect(() => {
    fetch("/api/v1/content/bundle")
      .then((r) => r.json())
      .then((bundle) => {
        const attrs = (bundle.sport_attributes || [])
          .filter((a: Record<string, unknown>) => a.sport_id === sportId)
          .map((a: Record<string, unknown>) => ({
            key: a.key as string,
            full_name: a.full_name as string,
            color: a.color as string,
          }));
        setAttributes(attrs);
      })
      .catch(() => {});
  }, [sportId]);

  function toggleAttribute(key: string) {
    setAttributeKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      sport_id: sportId,
      test_id: testId,
      name,
      icon,
      color,
      description,
      research_note: researchNote,
      attribute_keys: attributeKeys,
      inputs,
      derived_metrics: derivedMetrics,
      primary_metric_name: primaryMetricName,
      primary_input_key: primaryInputKey,
      sort_order: sortOrder,
    };

    const url = assessmentId
      ? `/api/v1/admin/assessments/${assessmentId}`
      : "/api/v1/admin/assessments";
    const method = assessmentId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      toast.success(
        assessmentId ? "Assessment updated" : "Assessment created"
      );
      if (!assessmentId && data?.id) {
        router.push(`/admin/assessments/${data.id}/edit`);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to save assessment");
    }

    setSaving(false);
  }

  // Build options for primary_input_key select from configured inputs
  const inputKeyOptions = inputs
    .filter((f) => f.key.trim())
    .map((f) => ({ key: f.key, label: f.label || f.key }));

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {assessmentId ? "Edit Assessment" : "New Assessment"}
          </h1>
          <p className="text-muted-foreground">
            {assessmentId
              ? "Update physical test definition"
              : "Add a new physical test definition"}
          </p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving
            ? "Saving..."
            : assessmentId
              ? "Update Assessment"
              : "Create Assessment"}
        </Button>
      </div>

      <Separator />

      {/* Section 1: Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="test_id">Test ID (slug) *</Label>
              <Input
                id="test_id"
                value={testId}
                onChange={(e) => setTestId(e.target.value)}
                placeholder="e.g., sprint_30m"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 30m Sprint Test"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sport">Sport *</Label>
              <Select
                value={sportId}
                onValueChange={(v) => setSportId(v ?? "football")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="football">Football</SelectItem>
                  <SelectItem value="padel">Padel</SelectItem>
                  <SelectItem value="basketball">Basketball</SelectItem>
                  <SelectItem value="tennis">Tennis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="emoji or icon name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color (hex)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#888888"
                  className="flex-1"
                />
                <div
                  className="w-8 h-8 rounded border shrink-0"
                  style={{ backgroundColor: color }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this test measure?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="research_note">Research Note</Label>
            <Textarea
              id="research_note"
              value={researchNote}
              onChange={(e) => setResearchNote(e.target.value)}
              placeholder="Scientific background, reliability notes..."
              rows={3}
            />
          </div>

          <div className="space-y-2 w-32">
            <Label htmlFor="sortOrder">Sort Order</Label>
            <Input
              id="sortOrder"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              min={0}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Input Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Input Fields</CardTitle>
          <p className="text-sm text-muted-foreground">
            Define the data fields athletes fill in when recording this test
          </p>
        </CardHeader>
        <CardContent>
          <InputFieldBuilder fields={inputs} onChange={setInputs} />
        </CardContent>
      </Card>

      {/* Section 3: Derived Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Derived Metrics</CardTitle>
          <p className="text-sm text-muted-foreground">
            Computed values calculated from the input fields (e.g., estimated max
            speed from 30m time)
          </p>
        </CardHeader>
        <CardContent>
          <DerivedMetricEditor
            metrics={derivedMetrics}
            onChange={setDerivedMetrics}
          />
        </CardContent>
      </Card>

      {/* Section 4: Linked Attributes */}
      <Card>
        <CardHeader>
          <CardTitle>Linked Attributes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sport attributes this test measures
          </p>
        </CardHeader>
        <CardContent>
          {attributes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No attributes found for this sport. Select a sport with configured
              attributes.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {attributes.map((attr) => (
                <div key={attr.key} className="flex items-center gap-2">
                  <Checkbox
                    checked={attributeKeys.includes(attr.key)}
                    onCheckedChange={() => toggleAttribute(attr.key)}
                  />
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: attr.color }}
                    />
                    <Label className="text-sm font-normal cursor-pointer">
                      {attr.full_name} ({attr.key})
                    </Label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Primary Metric */}
      <Card>
        <CardHeader>
          <CardTitle>Primary Metric</CardTitle>
          <p className="text-sm text-muted-foreground">
            Which input is the main performance indicator for this test
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary Input Key</Label>
              <Select
                value={primaryInputKey || "__none__"}
                onValueChange={(v) =>
                  setPrimaryInputKey(v === "__none__" ? "" : (v ?? ""))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select input field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- None --</SelectItem>
                  {inputKeyOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="primary_metric_name">Primary Metric Name</Label>
              <Input
                id="primary_metric_name"
                value={primaryMetricName}
                onChange={(e) => setPrimaryMetricName(e.target.value)}
                placeholder="e.g., 30m Sprint Time"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/assessments")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving
            ? "Saving..."
            : assessmentId
              ? "Update Assessment"
              : "Create Assessment"}
        </Button>
      </div>
    </form>
  );
}
