"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface PromptBlock {
  id: string;
  name: string;
  template: string;
  enabled: boolean;
  sortOrder: number;
  description: string;
}

interface AIPromptTemplates {
  blocks: PromptBlock[];
}

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const SAMPLE_VARS: Record<string, string> = {
  sport: "Football",
  position: "Midfielder",
  keyMetrics: "Yo-Yo IR1, 10m/30m sprint, CMJ",
  loadFramework: "ACWR 7:28 rolling, match = 1.0 AU",
  positionNote: "Highest total distance covered. Prioritize aerobic base.",
  phvStage: "MID-PHV",
  loadingMultiplier: "0.60",
  contraindications: "- Barbell squat -> Goblet squat\n- Depth jumps -> Low box step-downs",
  archetype: "Compliant, consistent",
  complianceRate: "0.85",
  recoveryResponse: "0.72",
  readinessRag: "AMBER",
  readinessScore: "58",
  wellnessTrend: "STABLE",
  wellness7dayAvg: "6.8",
  acwr: "1.15",
  atl7day: "45.3",
  ctl28day: "38.5",
  recommendations: "1. Light session suggested (P2)\n2. Focus on agility gap (P3)",
  dualLoadIndex: "62",
  examContext: "No exams in next 14 days.",
};

export function PromptTemplateEditor() {
  const [config, setConfig] = useState<AIPromptTemplates | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetch("/api/v1/admin/performance-intelligence/prompt-templates", { credentials: "include" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => toast.error("Failed to load prompt templates"));
  }, []);

  if (!config) return <div className="text-sm text-muted-foreground p-8">Loading...</div>;

  const block = config.blocks[selectedBlock];

  function updateBlock(idx: number, field: keyof PromptBlock, value: unknown) {
    setConfig((prev) => {
      if (!prev) return prev;
      const blocks = [...prev.blocks];
      blocks[idx] = { ...blocks[idx], [field]: value };
      return { blocks };
    });
  }

  function addBlock() {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        blocks: [
          ...prev.blocks,
          {
            id: `block_${Date.now()}`,
            name: "New Block",
            template: "",
            enabled: true,
            sortOrder: prev.blocks.length + 1,
            description: "",
          },
        ],
      };
    });
    setSelectedBlock(config?.blocks.length ?? 0);
  }

  function removeBlock(idx: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return { blocks: prev.blocks.filter((_, i) => i !== idx) };
    });
    setSelectedBlock(Math.max(0, selectedBlock - 1));
  }

  function renderPreview(): string {
    if (!config) return "";
    return config.blocks
      .filter((b) => b.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((b) => {
        let text = b.template;
        for (const [key, val] of Object.entries(SAMPLE_VARS)) {
          text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
        }
        return `--- ${b.name} ---\n${text}`;
      })
      .join("\n\n");
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/performance-intelligence/prompt-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) toast.success("Prompt templates saved");
      else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  const totalTokens = config.blocks
    .filter((b) => b.enabled)
    .reduce((sum, b) => sum + estimateTokens(b.template), 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">AI Prompt Context Blocks</h3>
          <p className="text-xs text-muted-foreground">
            These blocks are injected into the AI system prompt for every chat response.
            Total: ~{totalTokens} tokens from {config.blocks.filter((b) => b.enabled).length} enabled blocks.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={addBlock}>Add Block</Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Block list */}
        <div className="w-56 shrink-0 space-y-1">
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Blocks</p>
          {config.blocks.map((b, i) => (
            <div
              key={b.id}
              onClick={() => setSelectedBlock(i)}
              className={`flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer transition-colors ${
                selectedBlock === i
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Switch
                  checked={b.enabled}
                  onCheckedChange={(v) => updateBlock(i, "enabled", v)}
                  className="scale-75"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="truncate text-xs">{b.name}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">~{estimateTokens(b.template)}t</span>
            </div>
          ))}
        </div>

        {/* Block editor */}
        {block && (
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Block Name</Label>
                <Input
                  value={block.name}
                  onChange={(e) => updateBlock(selectedBlock, "name", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Sort Order</Label>
                <Input
                  type="number"
                  value={block.sortOrder}
                  onChange={(e) => updateBlock(selectedBlock, "sortOrder", parseInt(e.target.value) || 0)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={block.description}
                onChange={(e) => updateBlock(selectedBlock, "description", e.target.value)}
                className="h-8 text-xs"
                placeholder="What this block does..."
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Template</Label>
                <div className="flex gap-1 flex-wrap">
                  {extractVariables(block.template).map((v) => (
                    <Badge key={v} variant="outline" className="text-xs font-mono">{`{{${v}}}`}</Badge>
                  ))}
                </div>
              </div>
              <Textarea
                value={block.template}
                onChange={(e) => updateBlock(selectedBlock, "template", e.target.value)}
                rows={8}
                className="text-xs font-mono"
                placeholder="Template text with {{variable}} placeholders..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                ~{estimateTokens(block.template)} tokens. Use {"{{variableName}}"} for dynamic values.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => removeBlock(selectedBlock)}>
              Remove Block
            </Button>
          </div>
        )}
      </div>

      {/* Preview */}
      {showPreview && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Assembled Prompt Preview (sample athlete)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground bg-muted/30 p-4 rounded max-h-96 overflow-y-auto">
              {renderPreview()}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">Total: ~{totalTokens} tokens</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
