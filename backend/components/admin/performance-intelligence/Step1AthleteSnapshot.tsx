"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HUB_DEFAULTS } from "./defaults";
import type { DataGroup, SnapshotField, FieldType, FieldScale } from "./types";

interface Props { onNext: () => void; }

const SCALE_LABELS: Record<string, string> = {
  live: "Updated today",
  short_term: "Last 7 days",
  long_term: "Training history",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  number: "Number",
  scale_1_10: "Scale (1-10)",
  rag: "Red / Amber / Green",
  text: "Text",
  boolean: "Yes / No",
  calculated: "Auto-calculated",
};

export function Step1AthleteSnapshot({ onNext }: Props) {
  const [groups, setGroups] = useState<DataGroup[]>(HUB_DEFAULTS.dataGroups);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>("training_load");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [addingFieldTo, setAddingFieldTo] = useState<string | null>(null);
  const saveRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/sport-context", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const entries = Object.values(data || {}) as Record<string, unknown>[];
        for (const entry of entries) {
          if (Array.isArray(entry?.dataGroups) && entry.dataGroups.length > 0) {
            setGroups(entry.dataGroups as DataGroup[]);
            break;
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const saveGroups = useCallback((updated: DataGroup[]) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/v1/admin/performance-intelligence/sport-context", { credentials: "include" });
        const existing = await res.json();
        const firstKey = Object.keys(existing)[0] || "football";
        const entry = existing[firstKey] || {};
        const payload = { ...existing, [firstKey]: { ...entry, dataGroups: updated } };
        const saveRes = await fetch("/api/v1/admin/performance-intelligence/sport-context", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (saveRes.ok) toast.success("Saved");
        else toast.error("Save failed — check connection");
      } catch { toast.error("Save failed — check connection"); }
    }, 800);
  }, []);

  const toggleGroup = (groupId: string, enabled: boolean) => {
    const updated = groups.map((g) => (g.id === groupId ? { ...g, enabled } : g));
    setGroups(updated);
    saveGroups(updated);
  };

  const toggleField = (groupId: string, fieldId: string, enabled: boolean) => {
    const updated = groups.map((g) =>
      g.id === groupId
        ? { ...g, fields: g.fields.map((f) => (f.id === fieldId ? { ...f, enabled } : f)) }
        : g
    );
    setGroups(updated);
    saveGroups(updated);
  };

  const addGroup = (name: string, description: string) => {
    const newGroup: DataGroup = {
      id: `group_${Date.now()}`,
      name,
      description,
      fields: [],
      enabled: true,
      isDefault: false,
    };
    const updated = [...groups, newGroup];
    setGroups(updated);
    saveGroups(updated);
    setShowAddGroup(false);
    setExpandedGroup(newGroup.id);
  };

  const addField = (groupId: string, name: string, fieldType: FieldType, scale: FieldScale) => {
    const newField: SnapshotField = {
      id: `field_${Date.now()}`,
      name,
      fieldType,
      scale,
      enabled: true,
    };
    const updated = groups.map((g) =>
      g.id === groupId ? { ...g, fields: [...g.fields, newField] } : g
    );
    setGroups(updated);
    saveGroups(updated);
    setAddingFieldTo(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Explainer */}
      <Card className="border-l-2 border-l-blue-500/50 bg-blue-500/5">
        <CardContent className="p-4">
          <p className="text-sm font-medium">What is the Athlete Snapshot?</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Every time an athlete asks Tomo something, the AI first reads a snapshot — a summary of everything
            it needs to know about that athlete right now. Think of it like a briefing card the AI reads before
            responding. You control what goes on that card by defining data groups and the fields within them.
          </p>
          <div className="flex gap-2 mt-3">
            {Object.entries(SCALE_LABELS).map(([key, label]) => (
              <Badge key={key} variant="secondary" className="text-xs">{label}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section title */}
      <div>
        <p className="text-sm font-medium">Data groups</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Each group bundles related pieces of information. The AI reads all active groups together before responding to the athlete.
        </p>
      </div>

      {/* Data group cards */}
      {groups.map((group) => {
        const isExpanded = expandedGroup === group.id;
        return (
          <Card key={group.id} className={!group.enabled ? "border-dashed opacity-70" : ""}>
            <CardContent className="p-0">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {group.enabled ? (
                    <Badge variant="default" className="text-xs">Active &middot; {group.fields.filter((f) => f.enabled).length} fields</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs border-dashed">Not yet configured</Badge>
                  )}
                  <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-2">
                  {group.enabled && group.fields.length > 0 ? (
                    <>
                      {group.fields.map((field) => (
                        <div key={field.id} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm">{field.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {FIELD_TYPE_LABELS[field.fieldType] || field.fieldType} &middot; {SCALE_LABELS[field.scale] || field.scale}
                            </span>
                          </div>
                          <Switch
                            checked={field.enabled}
                            onCheckedChange={(v) => toggleField(group.id, field.id, v)}
                            className="scale-75"
                          />
                        </div>
                      ))}

                      {/* Add field form or button */}
                      {addingFieldTo === group.id ? (
                        <AddFieldForm
                          onSave={(name, fieldType, scale) => addField(group.id, name, fieldType, scale)}
                          onCancel={() => setAddingFieldTo(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setAddingFieldTo(group.id)}
                          className="w-full text-center py-2 text-xs text-muted-foreground border border-dashed rounded mt-2 hover:bg-accent/30 transition-colors"
                        >
                          + Add a field to this group
                        </button>
                      )}
                    </>
                  ) : !group.enabled ? (
                    <div className="text-center py-4">
                      <p className="text-xs text-muted-foreground mb-2">This group is not configured yet.</p>
                      <Button variant="outline" size="sm" onClick={() => toggleGroup(group.id, true)}>
                        Set up this group
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground py-2">No fields in this group yet.</p>
                      {addingFieldTo === group.id ? (
                        <AddFieldForm
                          onSave={(name, fieldType, scale) => addField(group.id, name, fieldType, scale)}
                          onCancel={() => setAddingFieldTo(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setAddingFieldTo(group.id)}
                          className="w-full text-center py-2 text-xs text-muted-foreground border border-dashed rounded hover:bg-accent/30 transition-colors"
                        >
                          + Add the first field
                        </button>
                      )}
                    </>
                  )}

                  {group.enabled && (
                    <div className="flex justify-end pt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Group active</span>
                        <Switch
                          checked={group.enabled}
                          onCheckedChange={(v) => toggleGroup(group.id, v)}
                          className="scale-75"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Add group */}
      {showAddGroup ? (
        <AddGroupForm onSave={addGroup} onCancel={() => setShowAddGroup(false)} />
      ) : (
        <button
          onClick={() => setShowAddGroup(true)}
          className="w-full text-center py-3 text-xs text-muted-foreground border border-dashed rounded hover:bg-accent/30 transition-colors"
        >
          + Add a new data group
        </button>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <span className="text-xs text-muted-foreground">Step 1 of 4</span>
        <Button onClick={onNext} size="sm">
          Next — Guardrails &amp; Rules &rarr;
        </Button>
      </div>
    </div>
  );
}

function AddGroupForm({ onSave, onCancel }: { onSave: (name: string, description: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card className="bg-muted/20">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-medium">Add a new data group</p>
        <p className="text-xs text-muted-foreground">A data group is a category of athlete information the AI reads. For example, "Injury history" or "Nutrition habits".</p>
        <div>
          <p className="text-xs font-medium mb-1">Group name</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" placeholder="e.g., Nutrition and hydration" />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">Description — what does this group tell the AI?</p>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-xs" placeholder="e.g., What the athlete eats and drinks, and how it affects their energy and recovery." />
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!name.trim()} onClick={() => onSave(name, description)}>Create group</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddFieldForm({ onSave, onCancel }: { onSave: (name: string, fieldType: FieldType, scale: FieldScale) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("number");
  const [scale, setScale] = useState<FieldScale>("live");

  return (
    <Card className="bg-muted/20 mt-2">
      <CardContent className="p-3 space-y-3">
        <p className="text-xs font-medium">Add a new field</p>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Field name — what does the AI read?</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" placeholder="e.g., Resting heart rate this morning" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Data type — what kind of value is this?</p>
            <Select value={fieldType} onValueChange={(v) => setFieldType((v as FieldType) || "number")}>
              <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[220px]">
                <SelectItem value="number">Number (e.g., 72 bpm)</SelectItem>
                <SelectItem value="scale_1_10">Scale 1-10 (self-reported)</SelectItem>
                <SelectItem value="rag">Red / Amber / Green signal</SelectItem>
                <SelectItem value="text">Text (e.g., "improving")</SelectItem>
                <SelectItem value="boolean">Yes / No</SelectItem>
                <SelectItem value="calculated">Auto-calculated from other fields</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">How often is this updated?</p>
            <Select value={scale} onValueChange={(v) => setScale((v as FieldScale) || "live")}>
              <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[220px]">
                <SelectItem value="live">Updated today (live data)</SelectItem>
                <SelectItem value="short_term">Last 7 days (short-term trend)</SelectItem>
                <SelectItem value="long_term">Training history (long-term)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!name.trim()} onClick={() => onSave(name, fieldType, scale)}>Add field</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
