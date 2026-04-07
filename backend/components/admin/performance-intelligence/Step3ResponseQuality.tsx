"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HUB_DEFAULTS } from "./defaults";
import type { ResponseRule, ContextBlock } from "./types";

interface Props { onBack: () => void; onNext: () => void; }

export function Step3ResponseQuality({ onBack, onNext }: Props) {
  const [rules, setRules] = useState<ResponseRule[]>(HUB_DEFAULTS.responseRules);
  const [blocks, setBlocks] = useState<ContextBlock[]>(HUB_DEFAULTS.contextBlocks);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddBlock, setShowAddBlock] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/prompt-templates", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.responseRules) && data.responseRules.length > 0) setRules(data.responseRules);
        if (Array.isArray(data?.contextBlocks) && data.contextBlocks.length > 0) setBlocks(data.contextBlocks);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async (updatedRules: ResponseRule[], updatedBlocks: ContextBlock[]) => {
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/prompt-templates", { credentials: "include" });
      const existing = await res.json();
      const payload = { ...existing, responseRules: updatedRules, contextBlocks: updatedBlocks };

      const saveRes = await fetch("/api/v1/admin/performance-intelligence/prompt-templates", {
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
    save(updated, blocks);
  };

  const toggleBlock = (id: string, enabled: boolean) => {
    const updated = blocks.map((b) => (b.id === id ? { ...b, enabled } : b));
    setBlocks(updated);
    save(rules, updated);
  };

  const addRule = (when: string, instruction: string) => {
    const newRule: ResponseRule = { id: `custom_${Date.now()}`, when, instruction, enabled: true };
    const updated = [...rules, newRule];
    setRules(updated);
    save(updated, blocks);
    setShowAddForm(false);
  };

  const addBlock = (name: string, description: string) => {
    const newBlock: ContextBlock = { id: `block_${Date.now()}`, name, description, enabled: true, locked: false };
    const updated = [...blocks, newBlock];
    setBlocks(updated);
    save(rules, updated);
    setShowAddBlock(false);
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
          <p className="text-sm font-medium">What is AI Response Quality?</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            After the guardrails check is complete, the AI composes its response. This layer controls
            the quality and direction of that response — what context it includes, how it frames
            scientific information, and what extra intelligence it adds based on the athlete's situation.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Think of this as briefing your most knowledgeable assistant before they speak to an athlete. The richer the briefing, the better the guidance.
          </p>
        </CardContent>
      </Card>

      {/* Response rules */}
      <div>
        <p className="text-sm font-medium">Response rules</p>
        <p className="text-xs text-muted-foreground mt-0.5">Instructions that change what the AI says based on the athlete's current situation.</p>
      </div>
      {rules.map((rule) => (
        <Card key={rule.id} className={!rule.enabled ? "opacity-50" : ""}>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">When</p>
            <p className="text-sm font-medium">{rule.when}</p>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{rule.instruction}</p>
            <div className="flex items-center justify-between mt-3">
              <Badge variant="secondary" className="text-xs">Response instruction</Badge>
              <Switch checked={rule.enabled} onCheckedChange={(v) => toggleRule(rule.id, v)} className="scale-75" />
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add rule */}
      {showAddForm ? (
        <AddResponseRuleForm onSave={addRule} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full text-center py-3 text-xs text-muted-foreground border border-dashed rounded hover:bg-accent/30 transition-colors"
        >
          + Add a response rule
        </button>
      )}

      {/* Context blocks */}
      <div className="pt-2">
        <p className="text-sm font-medium">Scientific context blocks</p>
        <p className="text-xs text-muted-foreground mt-0.5">Extra layers of knowledge the AI includes in every response. Turn on the ones most relevant to your athletes.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {blocks.map((block) => (
          <Card key={block.id}>
            <CardContent className="p-4">
              <p className="text-sm font-medium">{block.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{block.description}</p>
              <div className="flex items-center justify-between mt-3">
                {block.locked ? (
                  <Badge variant="default" className="text-xs">Always active</Badge>
                ) : (
                  <>
                    <Badge variant={block.enabled ? "default" : "secondary"} className="text-xs">
                      {block.enabled ? "Active" : "Inactive"}
                    </Badge>
                    <Switch checked={block.enabled} onCheckedChange={(v) => toggleBlock(block.id, v)} className="scale-75" />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add context block */}
      {showAddBlock ? (
        <AddContextBlockForm onSave={addBlock} onCancel={() => setShowAddBlock(false)} />
      ) : (
        <button
          onClick={() => setShowAddBlock(true)}
          className="w-full text-center py-3 text-xs text-muted-foreground border border-dashed rounded hover:bg-accent/30 transition-colors"
        >
          + Add a scientific context block
        </button>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" size="sm" onClick={onBack}>&larr; Back</Button>
        <span className="text-xs text-muted-foreground">Step 3 of 4</span>
        <Button onClick={onNext} size="sm">Next — Safety Filters &rarr;</Button>
      </div>
    </div>
  );
}

function AddResponseRuleForm({ onSave, onCancel }: { onSave: (when: string, instruction: string) => void; onCancel: () => void }) {
  const [when, setWhen] = useState("");
  const [instruction, setInstruction] = useState("");

  return (
    <Card className="bg-muted/20">
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-xs font-medium">Add a response rule</p>
          <p className="text-xs text-muted-foreground mt-1">Response rules tell the AI how to frame its coaching based on the athlete's situation. Write in plain English.</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1">When this situation occurs...</p>
          <p className="text-xs text-muted-foreground mb-1">Describe when this rule should apply.</p>
          <Textarea value={when} onChange={(e) => setWhen(e.target.value)} rows={2} className="text-xs" placeholder='e.g., "When an athlete has missed 3+ days of training"' />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">The AI should always...</p>
          <p className="text-xs text-muted-foreground mb-1">What instruction should the AI follow in this situation?</p>
          <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} className="text-xs" placeholder='e.g., "Welcome them back positively. Suggest an easy re-entry session. Do not reference missed days negatively."' />
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!when.trim() || !instruction.trim()} onClick={() => onSave(when, instruction)}>Save rule</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddContextBlockForm({ onSave, onCancel }: { onSave: (name: string, description: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Card className="bg-muted/20">
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-xs font-medium">Add a scientific context block</p>
          <p className="text-xs text-muted-foreground mt-1">Context blocks are layers of knowledge the AI includes when coaching athletes. Add a new domain of expertise for the AI to draw from.</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1">Block name</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" placeholder="e.g., Nutrition and hydration science" />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">What does this block tell the AI?</p>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-xs" placeholder="e.g., The AI factors in the athlete's nutrition habits, hydration levels, and fueling strategy when planning training sessions." />
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!name.trim()} onClick={() => onSave(name, description)}>Add block</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
