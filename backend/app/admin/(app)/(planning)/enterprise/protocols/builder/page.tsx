"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { protocolsHelp } from "@/lib/cms-help/protocols";
import ProtocolGeneratePanel from "@/components/admin/planning-protocols/ProtocolGeneratePanel";
import {
  GripVertical,
  Plus,
  Save,
  FlaskConical,
  Trash2,
  X,
  ChevronLeft,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */

type MatchMode = "all" | "any";
type Operator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in";
type Category = "safety" | "development" | "recovery" | "performance" | "academic";
type EvidenceGrade = "A" | "B" | "C" | "D";

interface ConditionField {
  key: string;
  label: string;
  type: "enum" | "float" | "int" | "string";
  options?: string[];
}

interface Condition {
  field: string;
  operator: Operator;
  value: string | number | string[];
}

interface ConditionGroupData {
  match: MatchMode;
  conditions: Condition[];
}

interface ActionData {
  intensity_cap: string;
  load_multiplier: number;
  contraindications: string[];
  required_elements: string[];
  session_cap_minutes: number;
}

interface OutputData {
  recommendation_guardrails: string;
  rag_override_context: string;
  ai_injection_text: string;
}

interface ProtocolFormState {
  name: string;
  category: Category;
  priority: number;
  evidence_level: string;
  evidence_grade: EvidenceGrade;
  safety_critical: boolean;
  scope_sports: string[];
  scope_phv_stages: string[];
  scope_age_bands: string[];
  ai_injection: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */

const CONDITION_FIELDS: ConditionField[] = [
  { key: "readiness_rag", label: "Readiness RAG", type: "enum", options: ["RED", "AMBER", "GREEN"] },
  { key: "acwr", label: "ACWR", type: "float" },
  { key: "phv_stage", label: "PHV Stage", type: "enum", options: ["pre", "mid", "post", "adult"] },
  { key: "sport", label: "Sport", type: "enum", options: ["football", "padel", "athletics", "basketball", "tennis"] },
  { key: "age_band", label: "Age Band", type: "enum", options: ["U13", "U15", "U17", "U19", "Senior"] },
  { key: "injury_status", label: "Injury Status", type: "enum", options: ["none", "minor", "moderate", "severe"] },
  { key: "days_since_match", label: "Days Since Match", type: "int" },
  { key: "sleep_score", label: "Sleep Score", type: "float" },
  { key: "soreness_score", label: "Soreness Score", type: "float" },
  { key: "stress_score", label: "Stress Score", type: "float" },
  { key: "training_load_7d", label: "Training Load (7d)", type: "float" },
];

const OPERATORS: { value: Operator; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "in", label: "in" },
  { value: "not_in", label: "not in" },
];

const INTENSITY_OPTIONS = ["none", "light", "moderate", "hard", "max"];
const CATEGORIES: Category[] = ["safety", "development", "recovery", "performance", "academic"];
const EVIDENCE_GRADES: EvidenceGrade[] = ["A", "B", "C", "D"];
const SPORTS = ["football", "padel", "athletics", "basketball", "tennis"];
const PHV_STAGES = ["pre", "mid", "post", "adult"];
const AGE_BANDS = ["U13", "U15", "U17", "U19", "Senior"];

const CATEGORY_COLORS: Record<Category, string> = {
  safety: "border-red-500",
  development: "border-blue-500",
  recovery: "border-green-500",
  performance: "border-yellow-500",
  academic: "border-purple-500",
};

const CATEGORY_BG: Record<Category, string> = {
  safety: "bg-red-500/10",
  development: "bg-blue-500/10",
  recovery: "bg-green-500/10",
  performance: "bg-yellow-500/10",
  academic: "bg-purple-500/10",
};

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOM NODES
   ═══════════════════════════════════════════════════════════════════════ */

function ConditionGroupNode({ id, data }: { id: string; data: any }) {
  const groupData = data as ConditionGroupData & {
    category: Category;
    onUpdate: (d: Partial<ConditionGroupData>) => void;
    onAddCondition: () => void;
    onRemoveCondition: (idx: number) => void;
    onUpdateCondition: (idx: number, c: Partial<Condition>) => void;
  };

  const borderColor = CATEGORY_COLORS[groupData.category] || "border-border";
  const bgColor = CATEGORY_BG[groupData.category] || "";

  return (
    <div className={`rounded-lg border-2 ${borderColor} ${bgColor} bg-popover shadow-md min-w-[340px] max-w-[420px]`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <GripVertical className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            IF
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => groupData.onUpdate({ match: groupData.match === "all" ? "any" : "all" })}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full transition-colors ${
              groupData.match === "all"
                ? "bg-blue-600 text-white"
                : "bg-amber-500 text-white"
            }`}
          >
            {groupData.match === "all" ? "ALL" : "ANY"}
          </button>
        </div>
      </div>

      <div className="p-2 space-y-1.5">
        {groupData.conditions.map((cond, idx) => (
          <ConditionRow
            key={idx}
            condition={cond}
            onUpdate={(partial) => groupData.onUpdateCondition(idx, partial)}
            onRemove={() => groupData.onRemoveCondition(idx)}
          />
        ))}

        <button
          onClick={groupData.onAddCondition}
          className="flex items-center gap-1 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
        >
          <Plus className="size-3" />
          Add condition
        </button>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-primary !w-2.5 !h-2.5" />
    </div>
  );
}

function ConditionRow({
  condition,
  onUpdate,
  onRemove,
}: {
  condition: Condition;
  onUpdate: (c: Partial<Condition>) => void;
  onRemove: () => void;
}) {
  const fieldDef = CONDITION_FIELDS.find((f) => f.key === condition.field);
  const isEnumField = fieldDef?.type === "enum";
  const isArrayOp = condition.operator === "in" || condition.operator === "not_in";

  return (
    <div className="flex items-center gap-1 group">
      <select
        value={condition.field}
        onChange={(e) => onUpdate({ field: e.target.value, value: "" })}
        className="flex-1 min-w-0 h-7 rounded border border-border/50 bg-background px-1.5 text-xs"
      >
        {CONDITION_FIELDS.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value as Operator })}
        className="w-14 h-7 rounded border border-border/50 bg-background px-1 text-xs text-center"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {isEnumField && !isArrayOp ? (
        <select
          value={String(condition.value)}
          onChange={(e) => onUpdate({ value: e.target.value })}
          className="flex-1 min-w-0 h-7 rounded border border-border/50 bg-background px-1.5 text-xs"
        >
          <option value="">--</option>
          {fieldDef.options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={fieldDef?.type === "float" || fieldDef?.type === "int" ? "number" : "text"}
          step={fieldDef?.type === "float" ? "0.1" : undefined}
          value={Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (isArrayOp) {
              onUpdate({ value: raw.split(",").map((s) => s.trim()).filter(Boolean) });
            } else if (fieldDef?.type === "float" || fieldDef?.type === "int") {
              onUpdate({ value: raw === "" ? "" : Number(raw) });
            } else {
              onUpdate({ value: raw });
            }
          }}
          placeholder={isArrayOp ? "val1, val2" : "value"}
          className="flex-1 min-w-0 h-7 rounded border border-border/50 bg-background px-1.5 text-xs"
        />
      )}

      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-opacity"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function ActionNode({ id, data }: { id: string; data: any }) {
  const action = data as ActionData & {
    onUpdate: (d: Partial<ActionData>) => void;
    onDelete: () => void;
  };

  const [contraInput, setContraInput] = useState("");
  const [reqInput, setReqInput] = useState("");

  return (
    <div className="rounded-lg border-2 border-emerald-500 bg-popover shadow-md min-w-[300px] max-w-[380px]">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-2.5 !h-2.5" />

      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-emerald-500/10">
        <div className="flex items-center gap-2">
          <GripVertical className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            THEN: Modify
          </span>
        </div>
        <button onClick={action.onDelete} className="p-0.5 text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Intensity Cap</label>
          <select
            value={action.intensity_cap}
            onChange={(e) => action.onUpdate({ intensity_cap: e.target.value })}
            className="w-full h-7 mt-0.5 rounded border border-border/50 bg-background px-2 text-xs"
          >
            {INTENSITY_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">
            Load Multiplier: {action.load_multiplier.toFixed(2)}
          </label>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={action.load_multiplier}
            onChange={(e) => action.onUpdate({ load_multiplier: parseFloat(e.target.value) })}
            className="w-full h-1.5 mt-1 accent-emerald-500"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>0</span><span>0.5</span><span>1.0</span><span>1.5</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Session Cap (min)</label>
          <input
            type="number"
            min={0}
            max={240}
            value={action.session_cap_minutes}
            onChange={(e) => action.onUpdate({ session_cap_minutes: parseInt(e.target.value) || 0 })}
            className="w-full h-7 mt-0.5 rounded border border-border/50 bg-background px-2 text-xs"
          />
        </div>

        <TagInput
          label="Contraindications"
          tags={action.contraindications}
          input={contraInput}
          onInputChange={setContraInput}
          onAdd={(tag) => action.onUpdate({ contraindications: [...action.contraindications, tag] })}
          onRemove={(idx) => action.onUpdate({ contraindications: action.contraindications.filter((_, i) => i !== idx) })}
        />

        <TagInput
          label="Required Elements"
          tags={action.required_elements}
          input={reqInput}
          onInputChange={setReqInput}
          onAdd={(tag) => action.onUpdate({ required_elements: [...action.required_elements, tag] })}
          onRemove={(idx) => action.onUpdate({ required_elements: action.required_elements.filter((_, i) => i !== idx) })}
        />
      </div>

      <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-2.5 !h-2.5" />
    </div>
  );
}

function OutputNode({ id, data }: { id: string; data: any }) {
  const output = data as OutputData & {
    onUpdate: (d: Partial<OutputData>) => void;
    onDelete: () => void;
  };

  return (
    <div className="rounded-lg border-2 border-violet-500 bg-popover shadow-md min-w-[300px] max-w-[380px]">
      <Handle type="target" position={Position.Left} className="!bg-violet-500 !w-2.5 !h-2.5" />

      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-violet-500/10">
        <div className="flex items-center gap-2">
          <GripVertical className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            OUTPUT
          </span>
        </div>
        <button onClick={output.onDelete} className="p-0.5 text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Recommendation Guardrails</label>
          <textarea
            value={output.recommendation_guardrails}
            onChange={(e) => output.onUpdate({ recommendation_guardrails: e.target.value })}
            rows={2}
            className="w-full mt-0.5 rounded border border-border/50 bg-background px-2 py-1 text-xs resize-none"
            placeholder="e.g. Must not recommend plyometrics"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">RAG Override Context</label>
          <textarea
            value={output.rag_override_context}
            onChange={(e) => output.onUpdate({ rag_override_context: e.target.value })}
            rows={2}
            className="w-full mt-0.5 rounded border border-border/50 bg-background px-2 py-1 text-xs resize-none"
            placeholder="Context injected into RAG retrieval"
          />
        </div>

        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">AI Injection Text</label>
          <textarea
            value={output.ai_injection_text}
            onChange={(e) => output.onUpdate({ ai_injection_text: e.target.value })}
            rows={2}
            className="w-full mt-0.5 rounded border border-border/50 bg-background px-2 py-1 text-xs resize-none"
            placeholder="System prompt text injected when rule fires"
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

function TagInput({
  label,
  tags,
  input,
  onInputChange,
  onAdd,
  onRemove,
}: {
  label: string;
  tags: string[];
  input: string;
  onInputChange: (v: string) => void;
  onAdd: (tag: string) => void;
  onRemove: (idx: number) => void;
}) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      onAdd(input.trim());
      onInputChange("");
    }
  }

  return (
    <div>
      <label className="text-[10px] font-medium uppercase text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px]"
          >
            {tag}
            <button onClick={() => onRemove(idx)} className="hover:text-destructive">
              <X className="size-2.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type + Enter"
        className="w-full h-6 mt-1 rounded border border-border/50 bg-background px-2 text-[10px]"
      />
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(val: string) {
    onChange(
      selected.includes(val)
        ? selected.filter((s) => s !== val)
        : [...selected, val]
    );
  }

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1 mt-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
              selected.includes(opt)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   NODE TYPE REGISTRY (stable reference)
   ═══════════════════════════════════════════════════════════════════════ */

const nodeTypes: NodeTypes = {
  conditionGroup: ConditionGroupNode,
  action: ActionNode,
  output: OutputNode,
};

/* ═══════════════════════════════════════════════════════════════════════
   SERIALIZATION
   ═══════════════════════════════════════════════════════════════════════ */

function serializeToProtocol(
  nodes: Node[],
  edges: Edge[],
  form: ProtocolFormState
) {
  const groupNode = nodes.find((n) => n.type === "conditionGroup");
  const actionNode = nodes.find((n) => n.type === "action");
  const outputNode = nodes.find((n) => n.type === "output");

  const conditions: any = groupNode
    ? { match: groupNode.data.match, conditions: groupNode.data.conditions }
    : { match: "all", conditions: [] };

  const actions = actionNode
    ? {
        intensity_cap: actionNode.data.intensity_cap,
        load_multiplier: actionNode.data.load_multiplier,
        contraindications: actionNode.data.contraindications,
        required_elements: actionNode.data.required_elements,
        session_cap_minutes: actionNode.data.session_cap_minutes,
      }
    : {};

  const output = outputNode
    ? {
        recommendation_guardrails: outputNode.data.recommendation_guardrails,
        rag_override_context: outputNode.data.rag_override_context,
        ai_injection_text: outputNode.data.ai_injection_text,
      }
    : {};

  return {
    name: form.name,
    category: form.category,
    priority: form.priority,
    evidence_level: form.evidence_level,
    evidence_grade: form.evidence_grade,
    safety_critical: form.safety_critical,
    conditions,
    actions,
    output,
    scope: {
      sports: form.scope_sports,
      phv_stages: form.scope_phv_stages,
      age_bands: form.scope_age_bands,
    },
    ai_injection: form.ai_injection,
    canvas: { nodes, edges },
  };
}

function deserializeProtocol(
  protocol: any,
  callbacks: {
    onUpdateGroup: (d: Partial<ConditionGroupData>) => void;
    onAddCondition: () => void;
    onRemoveCondition: (idx: number) => void;
    onUpdateCondition: (idx: number, c: Partial<Condition>) => void;
    onUpdateAction: (d: Partial<ActionData>) => void;
    onDeleteAction: () => void;
    onUpdateOutput: (d: Partial<OutputData>) => void;
    onDeleteOutput: () => void;
    category: Category;
  }
): { nodes: Node[]; edges: Edge[]; form: ProtocolFormState } {
  if (protocol.canvas?.nodes) {
    const restoredNodes = protocol.canvas.nodes.map((n: Node) => {
      if (n.type === "conditionGroup") {
        return {
          ...n,
          data: {
            ...n.data,
            category: callbacks.category,
            onUpdate: callbacks.onUpdateGroup,
            onAddCondition: callbacks.onAddCondition,
            onRemoveCondition: callbacks.onRemoveCondition,
            onUpdateCondition: callbacks.onUpdateCondition,
          },
        };
      }
      if (n.type === "action") {
        return { ...n, data: { ...n.data, onUpdate: callbacks.onUpdateAction, onDelete: callbacks.onDeleteAction } };
      }
      if (n.type === "output") {
        return { ...n, data: { ...n.data, onUpdate: callbacks.onUpdateOutput, onDelete: callbacks.onDeleteOutput } };
      }
      return n;
    });

    return {
      nodes: restoredNodes,
      edges: protocol.canvas.edges || [],
      form: {
        name: protocol.name || "",
        category: protocol.category || "safety",
        priority: protocol.priority ?? 50,
        evidence_level: protocol.evidence_level || "",
        evidence_grade: protocol.evidence_grade || "B",
        safety_critical: protocol.safety_critical ?? false,
        scope_sports: protocol.scope?.sports || [],
        scope_phv_stages: protocol.scope?.phv_stages || [],
        scope_age_bands: protocol.scope?.age_bands || [],
        ai_injection: protocol.ai_injection || "",
      },
    };
  }

  // Fallback: build from conditions/actions/output JSONB
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (protocol.conditions) {
    nodes.push({
      id: "group-1",
      type: "conditionGroup",
      position: { x: 50, y: 80 },
      data: {
        match: protocol.conditions.match || "all",
        conditions: protocol.conditions.conditions || [],
        category: callbacks.category,
        onUpdate: callbacks.onUpdateGroup,
        onAddCondition: callbacks.onAddCondition,
        onRemoveCondition: callbacks.onRemoveCondition,
        onUpdateCondition: callbacks.onUpdateCondition,
      },
    });
  }

  if (protocol.actions) {
    nodes.push({
      id: "action-1",
      type: "action",
      position: { x: 500, y: 60 },
      data: {
        ...protocol.actions,
        contraindications: protocol.actions.contraindications || [],
        required_elements: protocol.actions.required_elements || [],
        onUpdate: callbacks.onUpdateAction,
        onDelete: callbacks.onDeleteAction,
      },
    });
    if (nodes.find((n) => n.id === "group-1")) {
      edges.push({ id: "e-group-action", source: "group-1", target: "action-1" });
    }
  }

  if (protocol.output) {
    nodes.push({
      id: "output-1",
      type: "output",
      position: { x: 920, y: 60 },
      data: {
        ...protocol.output,
        onUpdate: callbacks.onUpdateOutput,
        onDelete: callbacks.onDeleteOutput,
      },
    });
    const lastNode = nodes.find((n) => n.id === "action-1") || nodes.find((n) => n.id === "group-1");
    if (lastNode) {
      edges.push({ id: "e-to-output", source: lastNode.id, target: "output-1" });
    }
  }

  return {
    nodes,
    edges,
    form: {
      name: protocol.name || "",
      category: protocol.category || "safety",
      priority: protocol.priority ?? 50,
      evidence_level: protocol.evidence_level || "",
      evidence_grade: protocol.evidence_grade || "B",
      safety_critical: protocol.safety_critical ?? false,
      scope_sports: protocol.scope?.sports || [],
      scope_phv_stages: protocol.scope?.phv_stages || [],
      scope_age_bands: protocol.scope?.age_bands || [],
      ai_injection: protocol.ai_injection || "",
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

function ProtocolBuilderInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const protocolId = searchParams.get("id");
  const isEditMode = Boolean(protocolId);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const nodeIdCounter = useRef(1);

  const [form, setForm] = useState<ProtocolFormState>({
    name: "",
    category: "safety",
    priority: 50,
    evidence_level: "",
    evidence_grade: "B",
    safety_critical: false,
    scope_sports: [],
    scope_phv_stages: [],
    scope_age_bands: [],
    ai_injection: "",
  });

  const updateForm = useCallback((partial: Partial<ProtocolFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  /* -- Node data updaters (stable refs via useCallback) -- */

  const updateNodeData = useCallback(
    (nodeId: string, partial: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...partial } } : n))
      );
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setNodes, setEdges]
  );

  /* -- Build callbacks for the condition group node -- */

  const makeGroupCallbacks = useCallback(
    (nodeId: string) => ({
      onUpdate: (d: Partial<ConditionGroupData>) => updateNodeData(nodeId, d),
      onAddCondition: () => {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const conds = [...(n.data.conditions as Condition[])];
            conds.push({ field: "readiness_rag", operator: "eq", value: "RED" });
            return { ...n, data: { ...n.data, conditions: conds } };
          })
        );
      },
      onRemoveCondition: (idx: number) => {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const conds = (n.data.conditions as Condition[]).filter((_, i) => i !== idx);
            return { ...n, data: { ...n.data, conditions: conds } };
          })
        );
      },
      onUpdateCondition: (idx: number, partial: Partial<Condition>) => {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const conds = [...(n.data.conditions as Condition[])];
            conds[idx] = { ...conds[idx], ...partial };
            return { ...n, data: { ...n.data, conditions: conds } };
          })
        );
      },
    }),
    [setNodes, updateNodeData]
  );

  /* -- Palette: add node to canvas -- */

  const addConditionGroup = useCallback(() => {
    const id = `group-${nodeIdCounter.current++}`;
    const cbs = makeGroupCallbacks(id);
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "conditionGroup",
        position: { x: 50, y: 50 + nds.length * 40 },
        data: {
          match: "all" as MatchMode,
          conditions: [{ field: "readiness_rag", operator: "eq", value: "RED" }],
          category: form.category,
          ...cbs,
        },
      },
    ]);
  }, [setNodes, makeGroupCallbacks, form.category]);

  const addActionNode = useCallback(() => {
    const id = `action-${nodeIdCounter.current++}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "action",
        position: { x: 500, y: 50 + nds.length * 40 },
        data: {
          intensity_cap: "light",
          load_multiplier: 0.5,
          contraindications: [],
          required_elements: [],
          session_cap_minutes: 60,
          onUpdate: (d: Partial<ActionData>) => updateNodeData(id, d),
          onDelete: () => deleteNode(id),
        },
      },
    ]);
  }, [setNodes, updateNodeData, deleteNode]);

  const addOutputNode = useCallback(() => {
    const id = `output-${nodeIdCounter.current++}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "output",
        position: { x: 920, y: 50 + nds.length * 40 },
        data: {
          recommendation_guardrails: "",
          rag_override_context: "",
          ai_injection_text: "",
          onUpdate: (d: Partial<OutputData>) => updateNodeData(id, d),
          onDelete: () => deleteNode(id),
        },
      },
    ]);
  }, [setNodes, updateNodeData, deleteNode]);

  /* -- Edge connections -- */

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges]
  );

  /* -- Keep category color in sync on group nodes -- */

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        n.type === "conditionGroup" ? { ...n, data: { ...n.data, category: form.category } } : n
      )
    );
  }, [form.category, setNodes]);

  /* -- Rebind callbacks after state changes (stable closures) -- */

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === "conditionGroup") {
          const cbs = makeGroupCallbacks(n.id);
          return { ...n, data: { ...n.data, ...cbs } };
        }
        if (n.type === "action") {
          return {
            ...n,
            data: {
              ...n.data,
              onUpdate: (d: Partial<ActionData>) => updateNodeData(n.id, d),
              onDelete: () => deleteNode(n.id),
            },
          };
        }
        if (n.type === "output") {
          return {
            ...n,
            data: {
              ...n.data,
              onUpdate: (d: Partial<OutputData>) => updateNodeData(n.id, d),
              onDelete: () => deleteNode(n.id),
            },
          };
        }
        return n;
      })
    );
  }, [setNodes, makeGroupCallbacks, updateNodeData, deleteNode]);

  /* -- Fetch existing protocol -- */

  useEffect(() => {
    if (!protocolId) return;

    (async () => {
      try {
        const res = await fetch(`/api/v1/admin/enterprise/protocols/builder?id=${protocolId}`);
        if (!res.ok) throw new Error("Failed to load protocol");
        const { protocol } = await res.json();

        const cat = (protocol.category as Category) || "safety";
        const groupId = "group-1";

        const result = deserializeProtocol(protocol, {
          category: cat,
          onUpdateGroup: (d) => updateNodeData(groupId, d),
          onAddCondition: () => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== groupId) return n;
                const conds = [...(n.data.conditions as Condition[])];
                conds.push({ field: "readiness_rag", operator: "eq", value: "RED" });
                return { ...n, data: { ...n.data, conditions: conds } };
              })
            );
          },
          onRemoveCondition: (idx) => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== groupId) return n;
                const conds = (n.data.conditions as Condition[]).filter((_, i) => i !== idx);
                return { ...n, data: { ...n.data, conditions: conds } };
              })
            );
          },
          onUpdateCondition: (idx, partial) => {
            setNodes((nds) =>
              nds.map((n) => {
                if (n.id !== groupId) return n;
                const conds = [...(n.data.conditions as Condition[])];
                conds[idx] = { ...conds[idx], ...partial };
                return { ...n, data: { ...n.data, conditions: conds } };
              })
            );
          },
          onUpdateAction: (d) => updateNodeData("action-1", d),
          onDeleteAction: () => deleteNode("action-1"),
          onUpdateOutput: (d) => updateNodeData("output-1", d),
          onDeleteOutput: () => deleteNode("output-1"),
        });

        setNodes(result.nodes);
        setEdges(result.edges);
        setForm(result.form);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [protocolId]);

  /* -- Save -- */

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Protocol name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = serializeToProtocol(nodes, edges, form);
      const method = isEditMode ? "PATCH" : "POST";
      const url = isEditMode
        ? `/api/v1/admin/enterprise/protocols/builder?id=${protocolId}`
        : `/api/v1/admin/enterprise/protocols/builder`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }

      const data = await res.json();
      toast.success(isEditMode ? "Protocol updated" : "Protocol created");

      if (!isEditMode && data.protocol_id) {
        router.replace(`/admin/enterprise/protocols/builder?id=${data.protocol_id}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  /* -- Test -- */

  async function handleTest() {
    setTesting(true);
    try {
      const payload = serializeToProtocol(nodes, edges, form);
      const res = await fetch("/api/v1/admin/enterprise/protocols/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Test failed");
      const result = await res.json();

      toast.success(
        `Test passed: ${result.matched_athletes ?? 0} athletes would be affected`
      );
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-[600px] bg-muted/30 animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full">
      {/* ── Header bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/enterprise/protocols")}>
            <ChevronLeft className="size-4" />
          </Button>
          <h1 className="text-xl font-bold">
            {isEditMode ? "Edit Protocol" : "New Protocol"}
          </h1>
          <PageGuide {...protocolsHelp.builder.page} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
            <FlaskConical className="size-3.5 mr-1.5" />
            {testing ? "Testing..." : "Test"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="size-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* ── Generate-from-description panel ─────────────────────── */}
      {!isEditMode && (
        <ProtocolGeneratePanel
          onSaved={(protocolId) => {
            router.replace(`/admin/enterprise/protocols/builder?id=${protocolId}`);
          }}
        />
      )}

      {/* ── Metadata bar ────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="e.g. RED Readiness Recovery Lock"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <select
              value={form.category}
              onChange={(e) => updateForm({ category: e.target.value as Category })}
              className="w-full h-8 mt-1 rounded-lg border border-input bg-background px-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs">Priority ({form.priority})</Label>
            <input
              type="range"
              min={1}
              max={100}
              value={form.priority}
              onChange={(e) => updateForm({ priority: parseInt(e.target.value) })}
              className="w-full mt-2 accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground -mt-0.5">
              <span>1 (highest)</span><span>100 (lowest)</span>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs">Evidence</Label>
              <Input
                value={form.evidence_level}
                onChange={(e) => updateForm({ evidence_level: e.target.value })}
                placeholder="Source / DOI"
                className="mt-1"
              />
            </div>
            <div className="w-16">
              <Label className="text-xs">Grade</Label>
              <select
                value={form.evidence_grade}
                onChange={(e) => updateForm({ evidence_grade: e.target.value as EvidenceGrade })}
                className="w-full h-8 mt-1 rounded-lg border border-input bg-background px-1 text-sm text-center"
              >
                {EVIDENCE_GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Canvas + Palette ───────────────────────────────────── */}
      <div className="flex gap-4 min-h-[600px]">
        {/* Palette */}
        <Card className="w-44 shrink-0 p-3 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Node Palette
          </p>

          <button
            onClick={addConditionGroup}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            <span className="size-2 rounded-full bg-blue-500" />
            Condition Group
          </button>

          <button
            onClick={addActionNode}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <span className="size-2 rounded-full bg-emerald-500" />
            Action
          </button>

          <button
            onClick={addOutputNode}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-colors"
          >
            <span className="size-2 rounded-full bg-violet-500" />
            Output
          </button>

          <div className="border-t border-border pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Legend
            </p>
            <div className="space-y-1.5 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-red-500" />
                Safety
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-blue-500" />
                Development
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-green-500" />
                Recovery
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-yellow-500" />
                Performance
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-purple-500" />
                Academic
              </div>
            </div>
          </div>
        </Card>

        {/* React Flow Canvas */}
        <Card className="flex-1 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls showInteractive={false} className="!bg-popover !border-border !shadow-sm" />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="mt-32 text-center text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Empty canvas</p>
                  <p className="text-xs">
                    Add a Condition Group from the palette, then connect an Action and Output node.
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </Card>
      </div>

      {/* ── Scope + Safety footer ──────────────────────────────── */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <MultiSelect
              label="Scope: Sports"
              options={SPORTS}
              selected={form.scope_sports}
              onChange={(v) => updateForm({ scope_sports: v })}
            />
            <MultiSelect
              label="Scope: PHV Stages"
              options={PHV_STAGES}
              selected={form.scope_phv_stages}
              onChange={(v) => updateForm({ scope_phv_stages: v })}
            />
            <MultiSelect
              label="Scope: Age Bands"
              options={AGE_BANDS}
              selected={form.scope_age_bands}
              onChange={(v) => updateForm({ scope_age_bands: v })}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Safety Critical</Label>
                <p className="text-[10px] text-muted-foreground">
                  Marks this protocol as mandatory and non-overridable
                </p>
              </div>
              <Switch
                checked={form.safety_critical}
                onCheckedChange={(v) => updateForm({ safety_critical: Boolean(v) })}
              />
            </div>

            <div>
              <Label className="text-xs">AI Injection Text</Label>
              <Textarea
                value={form.ai_injection}
                onChange={(e) => updateForm({ ai_injection: e.target.value })}
                placeholder="System prompt text injected when this protocol fires globally..."
                rows={4}
                className="mt-1 text-xs"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   WRAPPED EXPORT (ReactFlowProvider must wrap useNodesState)
   ═══════════════════════════════════════════════════════════════════════ */

export default function ProtocolBuilderPage() {
  return (
    <ReactFlowProvider>
      <ProtocolBuilderInner />
    </ReactFlowProvider>
  );
}
