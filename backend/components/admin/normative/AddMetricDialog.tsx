"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddMetricDialogProps {
  sportId: string;
  attributeKeys: string[];
  onCreated: () => void;
}

export default function AddMetricDialog({
  sportId,
  attributeKeys,
  onCreated,
}: AddMetricDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metricName, setMetricName] = useState("");
  const [unit, setUnit] = useState("");
  const [attributeKey, setAttributeKey] = useState("");
  const [direction, setDirection] = useState<"higher" | "lower">("higher");
  const [ageMin, setAgeMin] = useState(13);
  const [ageMax, setAgeMax] = useState(23);

  function reset() {
    setMetricName("");
    setUnit("");
    setAttributeKey("");
    setDirection("higher");
    setAgeMin(13);
    setAgeMax(23);
  }

  async function handleSubmit() {
    if (!metricName || !attributeKey) return;
    setSaving(true);

    const means = Array(11).fill(0);
    const sds = Array(11).fill(0);

    try {
      const res = await fetch("/api/v1/admin/normative-data", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport_id: sportId,
          metric_name: metricName,
          unit,
          attribute_key: attributeKey,
          direction,
          age_min: ageMin,
          age_max: ageMax,
          means,
          sds,
        }),
      });

      if (res.ok) {
        reset();
        setOpen(false);
        onCreated();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        + Add Metric
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Normative Metric</DialogTitle>
          <DialogDescription>
            Add a new metric row. Mean and SD values default to 0 and can be
            edited in the spreadsheet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="metric-name">Metric Name</Label>
            <Input
              id="metric-name"
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
              placeholder="e.g. 30m Sprint"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. seconds"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v) => {
                  if (v === "higher" || v === "lower") setDirection(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher">Higher is better</SelectItem>
                  <SelectItem value="lower">Lower is better</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Attribute Key</Label>
            <Select
              value={attributeKey}
              onValueChange={(v) => {
                if (v) setAttributeKey(v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select attribute..." />
              </SelectTrigger>
              <SelectContent>
                {attributeKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="age-min">Age Min</Label>
              <Input
                id="age-min"
                type="number"
                value={ageMin}
                onChange={(e) => setAgeMin(Number(e.target.value))}
                min={5}
                max={30}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="age-max">Age Max</Label>
              <Input
                id="age-max"
                type="number"
                value={ageMax}
                onChange={(e) => setAgeMax(Number(e.target.value))}
                min={5}
                max={30}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={saving || !metricName || !attributeKey}>
            {saving ? "Creating..." : "Create Metric"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
