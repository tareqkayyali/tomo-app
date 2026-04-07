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
import type { GuardrailRule, RuleAction } from "./types";

interface Props { onBack: () => void; onNext: () => void; }

const ACTION_COLORS: Record<RuleAction, string> = {
  hard_stop: "destructive",
  soft_limit: "default",
  warn_only: "secondary",
};

const ACTION_LABELS: Record<RuleAction, string> = {
  hard_stop: "Hard stop",
  soft_limit: "Soft limit",
  warn_only: "Warning only",
};

const SOURCE_LABELS: Record<string, string> = {
  training_load: "Training load",
  daily_readiness: "Daily readiness",
  development_stage: "Development stage",
  wellness_mental: "Wellness & mental",
  benchmarks: "Benchmarks",
};

export function Step2Guardrails({ onBack, onNext }: Props) {
  const [rules, setRules] = useState<GuardrailRule[]>(HUB_DEFAULTS.guardrailRules);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/readiness-matrix", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.guardrailRules) && data.guardrailRules.length > 0) {
          setRules(data.guardrailRules);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const saveRules = async (updated: GuardrailRule[]) => {
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/readiness-matrix", { credentials: "include" });
      const existing = await res.json();
      const payload = { ...existing, guardrailRules: updated };

      const saveRes = await fetch("/api/v1/admin/performance-intelligence/readiness-matrix", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (saveRes.ok) toast.success("Saved");
      else toast.error("Save failed");
    } catch { toast.error("Save failed"); }
  };

  const toggleRule = (id: string, enabled: boolean) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled } : r));
    setRules(updated);
    saveRules(updated);
  };

  const addRule = (when: string, actionText: string, action: RuleAction, sourceGroup: string) => {
    const newRule: GuardrailRule = {
      id: `custom_${Date.now()}`,
      when,
      condition: { field: "custom", operator: "equals", value: "" },
      action,
      actionText,
      sourceGroup,
      enabled: true,
    };
    const updated = [...rules, newRule];
    setRules(updated);
    saveRules(updated);
    setShowAddForm(false);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />)}
      </div>
    );
  }

  const physicalRules = rules.filter((r) => ["training_load", "daily_readiness"].includes(r.sourceGroup));
  const conditionRules = rules.filter((r) => !["training_load", "daily_readiness"].includes(r.sourceGroup));

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Explainer */}
      <Card className="border-l-2 border-l-blue-500/50 bg-blue-500/5">
        <CardContent className="p-4">
          <p className="text-sm font-medium">What are Guardrails?</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Before the AI responds to an athlete, it runs through a set of rules you define. These rules check
            the athlete's snapshot and decide if any limits or warnings need to be applied first. Think of them
            as a safety checklist the AI completes before speaking.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Every guardrail has two parts: a <b>trigger</b> (the condition that fires it) and an <b>action</b> (what the AI must do or avoid when it fires).
          </p>
        </CardContent>
      </Card>

      {/* Physical safety rules */}
      <div>
        <p className="text-sm font-medium">Physical safety rules</p>
        <p className="text-xs text-muted-foreground mt-0.5">Rules that protect the athlete based on what is happening in their body right now.</p>
      </div>
      {physicalRules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} onToggle={toggleRule} />
      ))}

      {/* Condition rules */}
      {conditionRules.length > 0 && (
        <>
          <div className="pt-2">
            <p className="text-sm font-medium">Physical conditions and imbalances</p>
            <p className="text-xs text-muted-foreground mt-0.5">Rules you define based on specific physical conditions that affect how the AI coaches an individual athlete.</p>
          </div>
          {conditionRules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} onToggle={toggleRule} />
          ))}
        </>
      )}

      {/* Add rule */}
      {showAddForm ? (
        <AddRuleForm onSave={addRule} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full text-center py-3 text-xs text-muted-foreground border border-dashed rounded hover:bg-accent/30 transition-colors"
        >
          + Add a new guardrail rule
        </button>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; Back</Button>
        <span className="text-xs text-muted-foreground">Step 2 of 4</span>
        <Button onClick={onNext} size="sm">Next — AI Response Quality &rarr;</Button>
      </div>
    </div>
  );
}

function RuleCard({ rule, onToggle }: { rule: GuardrailRule; onToggle: (id: string, enabled: boolean) => void }) {
  return (
    <Card className={!rule.enabled ? "opacity-50" : ""}>
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">When</p>
        <p className="text-sm font-medium">{rule.when}</p>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
          <span>&rarr;</span>
          <span>{rule.actionText}</span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1.5">
            <Badge variant={ACTION_COLORS[rule.action] as "default"} className="text-xs">{ACTION_LABELS[rule.action]}</Badge>
            <Badge variant="outline" className="text-xs">{SOURCE_LABELS[rule.sourceGroup] || rule.sourceGroup}</Badge>
          </div>
          <Switch checked={rule.enabled} onCheckedChange={(v) => onToggle(rule.id, v)} className="scale-75" />
        </div>
      </CardContent>
    </Card>
  );
}

function AddRuleForm({ onSave, onCancel }: { onSave: (when: string, actionText: string, action: RuleAction, sourceGroup: string) => void; onCancel: () => void }) {
  const [when, setWhen] = useState("");
  const [actionText, setActionText] = useState("");
  const [action, setAction] = useState<RuleAction>("soft_limit");
  const [sourceGroup, setSourceGroup] = useState("training_load");

  return (
    <Card className="bg-muted/20">
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-xs font-medium">Add a new guardrail rule</p>
          <p className="text-xs text-muted-foreground mt-1">Define a condition the AI checks before responding, and what it should do when the condition is met. Write in plain English — the AI will interpret it.</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1">When this happens...</p>
          <p className="text-xs text-muted-foreground mb-1">Describe the athlete situation that should trigger this rule. Be specific.</p>
          <Textarea value={when} onChange={(e) => setWhen(e.target.value)} rows={2} className="text-xs" placeholder='e.g., "Athlete has trained 5 or more days in a row without a rest day"' />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">The AI should...</p>
          <p className="text-xs text-muted-foreground mb-1">What action should the AI take when this condition is detected?</p>
          <Textarea value={actionText} onChange={(e) => setActionText(e.target.value)} rows={2} className="text-xs" placeholder='e.g., "Recommend a rest day or active recovery only. Explain why consecutive training days increase injury risk."' />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium mb-1">How strict is this rule?</p>
            <p className="text-xs text-muted-foreground mb-1">Hard stop = the AI blocks training. Soft limit = reduces intensity. Warning = informs only.</p>
            <Select value={action} onValueChange={(v) => setAction((v as RuleAction) || "soft_limit")}>
              <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[250px]">
                <SelectItem value="hard_stop">Hard stop — blocks the activity entirely</SelectItem>
                <SelectItem value="soft_limit">Soft limit — reduces intensity automatically</SelectItem>
                <SelectItem value="warn_only">Warning only — informs but doesn't restrict</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-medium mb-1">Which data does this rule read?</p>
            <p className="text-xs text-muted-foreground mb-1">Select the data group this rule checks from the athlete snapshot.</p>
            <Select value={sourceGroup} onValueChange={(v) => setSourceGroup(v || "training_load")}>
              <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[220px]">
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" disabled={!when.trim() || !actionText.trim()} onClick={() => onSave(when, actionText, action, sourceGroup)}>Save rule</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
