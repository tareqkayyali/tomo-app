"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HUB_DEFAULTS } from "./defaults";
import type { SafetyFilter, FilterAction, FilterScope } from "./types";

interface Props { onBack: () => void; }

const ACTION_LABELS: Record<FilterAction, string> = {
  remove_and_replace: "Remove and offer a safe alternative",
  translate_plain_language: "Translate into plain language",
  add_safety_note: "Keep it but add a safety note",
  block_and_restart: "Block the entire response and start again",
};

const ACTION_BADGES: Record<FilterAction, string> = {
  remove_and_replace: "Auto-replace",
  translate_plain_language: "Auto-translate",
  add_safety_note: "Add note",
  block_and_restart: "Block",
};

const SCOPE_LABELS: Record<FilterScope, string> = {
  always: "Always — all athletes",
  growth_phase: "Athlete is in rapid growth phase",
  under_16: "Athlete is under 16",
  active_injury: "Athlete has an active injury logged",
  new_athlete: "Athlete is new (first 12 weeks)",
};

export function Step4SafetyFilters({ onBack }: Props) {
  const [filters, setFilters] = useState<SafetyFilter[]>(HUB_DEFAULTS.safetyFilters);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/phv-config", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.safetyFilters) && data.safetyFilters.length > 0) {
          setFilters(data.safetyFilters);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const saveFilters = async (updated: SafetyFilter[]) => {
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/phv-config", { credentials: "include" });
      const existing = await res.json();
      const payload = { ...existing, safetyFilters: updated };

      const saveRes = await fetch("/api/v1/admin/performance-intelligence/phv-config", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (saveRes.ok) toast.success("Saved");
      else toast.error("Save failed");
    } catch { toast.error("Save failed"); }
  };

  const toggleFilter = (id: string, enabled: boolean) => {
    const updated = filters.map((f) => (f.id === id ? { ...f, enabled } : f));
    setFilters(updated);
    saveFilters(updated);
  };

  const addFilter = (catches: string, action: FilterAction, replacement: string, scope: FilterScope) => {
    const newFilter: SafetyFilter = {
      id: `custom_${Date.now()}`,
      catches,
      action,
      replacement: replacement || undefined,
      scope,
      enabled: true,
      isDefault: false,
    };
    const updated = [...filters, newFilter];
    setFilters(updated);
    saveFilters(updated);
    setShowAddForm(false);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Explainer */}
      <Card className="border-l-2 border-l-blue-500/50 bg-blue-500/5">
        <CardContent className="p-4">
          <p className="text-sm font-medium">What are Safety Filters?</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            This is the final check — applied to the AI's response after it has been written, before the
            athlete sees it. Safety filters scan what the AI is about to say and catch anything that could
            be harmful, inappropriate for the athlete's age or condition, or scientifically unsafe.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            This is your last line of defence. Define what the AI must never say to a developing athlete, and what it should say instead.
          </p>
        </CardContent>
      </Card>

      {/* Section title */}
      <div>
        <p className="text-sm font-medium">Active safety filters</p>
        <p className="text-xs text-muted-foreground mt-0.5">These run on every response before the athlete sees it.</p>
      </div>

      {/* Filter cards */}
      {filters.map((filter) => (
        <Card key={filter.id} className={!filter.enabled ? "opacity-50" : ""}>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">If the AI's response contains</p>
            <p className="text-sm font-medium">{filter.catches}</p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <span>&rarr;</span>
              <span>{ACTION_LABELS[filter.action]}</span>
            </div>
            {filter.replacement && (
              <p className="text-xs text-muted-foreground mt-1 italic">Replace with: "{filter.replacement}"</p>
            )}
            <div className="flex items-center justify-between mt-3">
              <div className="flex gap-1.5">
                <Badge variant={filter.action === "block_and_restart" || filter.action === "remove_and_replace" ? "destructive" : "default"} className="text-xs">
                  {ACTION_BADGES[filter.action]}
                </Badge>
                <Badge variant="outline" className="text-xs">{SCOPE_LABELS[filter.scope]}</Badge>
              </div>
              {filter.isDefault ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  Platform default
                </span>
              ) : (
                <Switch checked={filter.enabled} onCheckedChange={(v) => toggleFilter(filter.id, v)} className="scale-75" />
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add filter */}
      {showAddForm ? (
        <AddFilterForm onSave={addFilter} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full text-center py-3 text-xs text-muted-foreground border border-dashed rounded hover:bg-accent/30 transition-colors"
        >
          + Add a safety filter
        </button>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; Back</Button>
        <span className="text-xs text-muted-foreground">Step 4 of 4</span>
        <div />
      </div>
    </div>
  );
}

function AddFilterForm({ onSave, onCancel }: { onSave: (catches: string, action: FilterAction, replacement: string, scope: FilterScope) => void; onCancel: () => void }) {
  const [catches, setCatches] = useState("");
  const [action, setAction] = useState<FilterAction>("translate_plain_language");
  const [replacement, setReplacement] = useState("");
  const [scope, setScope] = useState<FilterScope>("always");

  return (
    <Card className="bg-muted/20">
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-xs font-medium">Add a safety filter</p>
          <p className="text-xs text-muted-foreground mt-1">Safety filters scan the AI's response before the athlete sees it. Define what to catch and what to do about it.</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1">If the AI's response contains or recommends...</p>
          <p className="text-xs text-muted-foreground mb-1">Describe the words, phrases, or types of content to catch.</p>
          <Textarea value={catches} onChange={(e) => setCatches(e.target.value)} rows={2} className="text-xs" placeholder='e.g., "Train through the pain", "no pain no gain", or similar phrases that encourage ignoring discomfort' />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">Then the AI should...</p>
          <p className="text-xs text-muted-foreground mb-1">What action should be taken when this content is detected?</p>
          <Select value={action} onValueChange={(v) => setAction((v as FilterAction) || "translate_plain_language")}>
            <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
            <SelectContent className="min-w-[300px]">
              <SelectItem value="remove_and_replace">Remove and offer a safe alternative</SelectItem>
              <SelectItem value="translate_plain_language">Translate into plain language</SelectItem>
              <SelectItem value="add_safety_note">Keep it but add a safety note</SelectItem>
              <SelectItem value="block_and_restart">Block the entire response and start again</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs font-medium mb-1">What should it say instead? (optional)</p>
          <p className="text-xs text-muted-foreground mb-1">If you chose "Remove and replace" or "Translate", provide the replacement text.</p>
          <Textarea value={replacement} onChange={(e) => setReplacement(e.target.value)} rows={2} className="text-xs" placeholder="e.g., Listen to your body. If something does not feel right, let your coach know." />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">This filter applies when...</p>
          <p className="text-xs text-muted-foreground mb-1">Choose which athletes this filter protects.</p>
          <Select value={scope} onValueChange={(v) => setScope((v as FilterScope) || "always")}>
            <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
            <SelectContent className="min-w-[280px]">
              <SelectItem value="always">Always — all athletes</SelectItem>
              <SelectItem value="growth_phase">Athlete is in rapid growth phase</SelectItem>
              <SelectItem value="under_16">Athlete is under 16</SelectItem>
              <SelectItem value="active_injury">Athlete has an active injury logged</SelectItem>
              <SelectItem value="new_athlete">Athlete is new (first 12 weeks)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!catches.trim()} onClick={() => onSave(catches, action, replacement, scope)}>Save this safety filter</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
