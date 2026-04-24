"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { knowledgeHelp } from "@/lib/cms-help/knowledge";

/**
 * Knowledge Graph Visualization
 * Interactive PropertyGraphIndex explorer for PDs to browse entities,
 * relationships, and verify the AI knowledge foundation.
 *
 * TODO: wire to real graph API at /api/v1/admin/enterprise/knowledge/graph
 */

// ── Types ──────────────────────────────────────────────────────────────────────

type EntityType =
  | "concept"
  | "exercise"
  | "protocol"
  | "condition"
  | "sport"
  | "age_band"
  | "body_region";

type RelationType =
  | "CONTRAINDICATED_FOR"
  | "SAFE_ALTERNATIVE_TO"
  | "PREREQUISITE_FOR"
  | "RECOMMENDED_FOR"
  | "BELONGS_TO"
  | "APPLICABLE_TO"
  | "AFFECTS"
  | "EVIDENCE_SUPPORTS"
  | "PART_OF"
  | "TRIGGERS";

interface KnowledgeEntity {
  id: string;
  entity_type: EntityType;
  name: string;
  display_name: string;
  description: string | null;
  properties: Record<string, unknown>;
}

interface KnowledgeRelationship {
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  weight: number;
}

interface GraphData {
  entities: KnowledgeEntity[];
  relationships: KnowledgeRelationship[];
}

// ── Color & Type Config ────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<EntityType, { bg: string; border: string; text: string; minimap: string }> = {
  condition:   { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", minimap: "#ef4444" },
  exercise:    { bg: "#f0fdf4", border: "#22c55e", text: "#166534", minimap: "#22c55e" },
  protocol:    { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a5f", minimap: "#3b82f6" },
  concept:     { bg: "#fefce8", border: "#eab308", text: "#713f12", minimap: "#eab308" },
  sport:       { bg: "#faf5ff", border: "#a855f7", text: "#581c87", minimap: "#a855f7" },
  age_band:    { bg: "#fff7ed", border: "#f97316", text: "#7c2d12", minimap: "#f97316" },
  body_region: { bg: "#f9fafb", border: "#6b7280", text: "#1f2937", minimap: "#6b7280" },
};

const ENTITY_ICONS: Record<EntityType, string> = {
  condition:   "\u{1F534}",
  exercise:    "\u{1F7E2}",
  protocol:    "\u{1F535}",
  concept:     "\u{1F7E1}",
  sport:       "\u{1F7E3}",
  age_band:    "\u{1F7E0}",
  body_region: "\u26AA",
};

const SAFETY_RELATIONS: RelationType[] = ["CONTRAINDICATED_FOR", "TRIGGERS"];

const ALL_ENTITY_TYPES: EntityType[] = [
  "concept", "exercise", "protocol", "condition", "sport", "age_band", "body_region",
];

const ALL_RELATION_TYPES: RelationType[] = [
  "CONTRAINDICATED_FOR", "SAFE_ALTERNATIVE_TO", "PREREQUISITE_FOR",
  "RECOMMENDED_FOR", "BELONGS_TO", "APPLICABLE_TO", "AFFECTS",
  "EVIDENCE_SUPPORTS", "PART_OF", "TRIGGERS",
];

// ── Custom Node ────────────────────────────────────────────────────────────────

function EntityNode({ data }: NodeProps) {
  const entityType = (data.entityType as EntityType) || "concept";
  const colors = ENTITY_COLORS[entityType];
  const icon = ENTITY_ICONS[entityType];

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-3 !h-3" />
      <div
        className="px-3 py-2 rounded-lg shadow-sm cursor-pointer transition-shadow hover:shadow-md"
        style={{
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          minWidth: 100,
          maxWidth: 180,
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{icon}</span>
          <span
            className="text-xs font-semibold truncate"
            style={{ color: colors.text }}
            title={String(data.label ?? "")}
          >
            {String(data.label ?? "")}
          </span>
        </div>
        <div className="text-[10px] mt-0.5 capitalize" style={{ color: colors.text, opacity: 0.7 }}>
          {entityType.replace("_", " ")}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-3 !h-3" />
    </>
  );
}

const nodeTypes = { entity: EntityNode };

// ── Radial Layout ──────────────────────────────────────────────────────────────

function computeRadialLayout(entities: KnowledgeEntity[]): Node[] {
  const grouped: Record<string, KnowledgeEntity[]> = {};
  for (const e of entities) {
    if (!grouped[e.entity_type]) grouped[e.entity_type] = [];
    grouped[e.entity_type].push(e);
  }

  const cx = 600;
  const cy = 500;
  const typeRadii: Record<EntityType, number> = {
    protocol:    120,
    condition:   220,
    concept:     320,
    exercise:    420,
    sport:       520,
    age_band:    580,
    body_region: 640,
  };

  const nodes: Node[] = [];

  for (const [type, items] of Object.entries(grouped)) {
    const r = typeRadii[type as EntityType] ?? 400;
    const angleStep = (2 * Math.PI) / Math.max(items.length, 1);
    const angleOffset = Math.random() * Math.PI * 0.3;

    items.forEach((entity, i) => {
      const angle = angleOffset + i * angleStep;
      nodes.push({
        id: entity.id,
        type: "entity",
        position: {
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        },
        data: {
          label: entity.display_name || entity.name,
          entityType: entity.entity_type,
          entity,
        },
      });
    });
  }

  return nodes;
}

function computeEdges(relationships: KnowledgeRelationship[]): Edge[] {
  return relationships.map((rel, i) => {
    const isSafety = SAFETY_RELATIONS.includes(rel.relation_type);
    return {
      id: `e-${rel.source_entity_id}-${rel.target_entity_id}-${i}`,
      source: rel.source_entity_id,
      target: rel.target_entity_id,
      label: rel.relation_type.replace(/_/g, " "),
      animated: isSafety,
      style: {
        stroke: isSafety ? "#ef4444" : "#94a3b8",
        strokeWidth: Math.max(1, Math.min(rel.weight * 2, 4)),
      },
      labelStyle: {
        fontSize: 9,
        fill: isSafety ? "#ef4444" : "#64748b",
        fontWeight: isSafety ? 700 : 400,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isSafety ? "#ef4444" : "#94a3b8",
        width: 16,
        height: 16,
      },
    };
  });
}

// ── Mock Data ──────────────────────────────────────────────────────────────────

function generateMockData(): GraphData {
  // TODO: wire to real graph API
  const entities: KnowledgeEntity[] = [
    { id: "e1",  entity_type: "exercise",    name: "nordic_curl",          display_name: "Nordic Curl",             description: "Eccentric hamstring strengthening exercise. Gold standard for hamstring injury prevention.",                properties: { evidence_grade: "A", primary_muscles: ["hamstrings"], equipment: "bench" } },
    { id: "e2",  entity_type: "exercise",    name: "copenhagen_adductor",  display_name: "Copenhagen Adductor",     description: "Adductor strengthening in side plank position. Reduces groin injury risk.",                                  properties: { evidence_grade: "A", primary_muscles: ["adductors"], equipment: "bench" } },
    { id: "e3",  entity_type: "exercise",    name: "single_leg_rdl",       display_name: "Single Leg RDL",          description: "Unilateral hip hinge targeting posterior chain balance and hamstring flexibility.",                           properties: { evidence_grade: "B", primary_muscles: ["hamstrings", "glutes"] } },
    { id: "e4",  entity_type: "exercise",    name: "drop_jump",            display_name: "Drop Jump",               description: "Plyometric exercise developing reactive strength and stretch-shortening cycle efficiency.",                   properties: { evidence_grade: "B", primary_muscles: ["quadriceps", "calves"], impact: "high" } },
    { id: "e5",  entity_type: "exercise",    name: "isometric_wall_sit",   display_name: "Isometric Wall Sit",      description: "Static quadriceps strengthening with minimal joint stress.",                                                  properties: { evidence_grade: "B", primary_muscles: ["quadriceps"] } },
    { id: "e6",  entity_type: "exercise",    name: "hip_flexor_stretch",   display_name: "Hip Flexor Stretch",      description: "Dynamic and static stretching protocol for anterior hip tightness.",                                          properties: { evidence_grade: "C", primary_muscles: ["hip_flexors"] } },
    { id: "c1",  entity_type: "condition",   name: "hamstring_strain",     display_name: "Hamstring Strain",        description: "Acute or chronic hamstring muscle fiber disruption. Most common injury in football.",                          properties: { severity_levels: ["grade_1", "grade_2", "grade_3"], recurrence_rate: "30%" } },
    { id: "c2",  entity_type: "condition",   name: "osgood_schlatter",     display_name: "Osgood-Schlatter",        description: "Growth plate inflammation at tibial tuberosity. Common in adolescent athletes during PHV.",                    properties: { age_range: "10-15", severity_levels: ["mild", "moderate", "severe"] } },
    { id: "c3",  entity_type: "condition",   name: "groin_strain",         display_name: "Groin Strain",            description: "Adductor muscle strain common in multidirectional sports.",                                                   properties: { severity_levels: ["grade_1", "grade_2", "grade_3"] } },
    { id: "c4",  entity_type: "condition",   name: "acl_injury",           display_name: "ACL Injury",              description: "Anterior cruciate ligament sprain or rupture. Season-ending in most cases.",                                  properties: { severity_levels: ["partial", "complete"], recovery_months: "6-12" } },
    { id: "p1",  entity_type: "protocol",    name: "fifa_11_plus",         display_name: "FIFA 11+",                description: "Evidence-based warm-up program reducing injuries by 30-50% in football.",                                     properties: { evidence_grade: "A", duration_min: 20, frequency: "pre-session" } },
    { id: "p2",  entity_type: "protocol",    name: "return_to_play",       display_name: "Return to Play Protocol", description: "Graduated return to sport following injury. Multi-phase progression with objective criteria.",                 properties: { evidence_grade: "A", phases: 6 } },
    { id: "p3",  entity_type: "protocol",    name: "phv_load_management",  display_name: "PHV Load Management",     description: "Load modification protocol for athletes during peak height velocity.",                                        properties: { evidence_grade: "B", target: "mid_phv", load_reduction: "20-40%" } },
    { id: "co1", entity_type: "concept",     name: "acwr",                 display_name: "ACWR",                    description: "Acute:Chronic Workload Ratio — key metric for training load monitoring and injury risk.",                     properties: { optimal_range: "0.8-1.3", high_risk_threshold: 1.5 } },
    { id: "co2", entity_type: "concept",     name: "periodization",        display_name: "Periodization",           description: "Systematic planning of athletic training to optimize performance and minimize overtraining.",                  properties: { types: ["linear", "undulating", "block"] } },
    { id: "co3", entity_type: "concept",     name: "progressive_overload", display_name: "Progressive Overload",    description: "Gradual increase in training stimulus to drive adaptation without exceeding recovery capacity.",                properties: { evidence_grade: "A" } },
    { id: "co4", entity_type: "concept",     name: "relative_age_effect",  display_name: "Relative Age Effect",     description: "Bias in talent identification favoring athletes born earlier in the selection year.",                           properties: { impact: "significant", sports: ["football", "basketball"] } },
    { id: "s1",  entity_type: "sport",       name: "football",             display_name: "Football",                description: "Association football. High-demand multidirectional sport with sprint, agility, and endurance requirements.",    properties: { positions: ["GK", "CB", "FB", "CM", "CAM", "W", "ST"] } },
    { id: "s2",  entity_type: "sport",       name: "padel",               display_name: "Padel",                   description: "Racquet sport played in doubles on enclosed court. Demands lateral agility and overhead power.",               properties: { positions: ["drive", "reves"] } },
    { id: "s3",  entity_type: "sport",       name: "basketball",          display_name: "Basketball",              description: "Court sport demanding vertical power, agility, and repeated sprint ability.",                                  properties: { positions: ["PG", "SG", "SF", "PF", "C"] } },
    { id: "a1",  entity_type: "age_band",    name: "u13",                 display_name: "U13",                     description: "Under 13 age band. Pre-PHV focus on fundamental movement skills.",                                           properties: { phv_stage: "pre", training_focus: "FMS" } },
    { id: "a2",  entity_type: "age_band",    name: "u15",                 display_name: "U15",                     description: "Under 15 age band. Often coincides with PHV onset. Critical load management period.",                         properties: { phv_stage: "circa", training_focus: "load_management" } },
    { id: "a3",  entity_type: "age_band",    name: "u17",                 display_name: "U17",                     description: "Under 17 age band. Post-PHV strength development window.",                                                   properties: { phv_stage: "post", training_focus: "strength_development" } },
    { id: "b1",  entity_type: "body_region", name: "hamstring",           display_name: "Hamstring",               description: "Posterior thigh muscle group. Most commonly injured muscle group in football.",                                properties: { muscles: ["biceps_femoris", "semimembranosus", "semitendinosus"] } },
    { id: "b2",  entity_type: "body_region", name: "knee",               display_name: "Knee",                    description: "Complex hinge joint. Vulnerable to ligament injuries and growth-related conditions in youth.",                 properties: { structures: ["ACL", "MCL", "meniscus", "patella"] } },
    { id: "b3",  entity_type: "body_region", name: "groin",              display_name: "Groin",                   description: "Hip adductor region. Common injury site in kicking and multidirectional sports.",                              properties: { muscles: ["adductor_longus", "adductor_magnus", "gracilis"] } },
  ];

  const relationships: KnowledgeRelationship[] = [
    { source_entity_id: "e1",  target_entity_id: "c1",  relation_type: "RECOMMENDED_FOR",      weight: 1.0 },
    { source_entity_id: "e1",  target_entity_id: "b1",  relation_type: "AFFECTS",              weight: 0.9 },
    { source_entity_id: "e2",  target_entity_id: "c3",  relation_type: "RECOMMENDED_FOR",      weight: 1.0 },
    { source_entity_id: "e2",  target_entity_id: "b3",  relation_type: "AFFECTS",              weight: 0.9 },
    { source_entity_id: "e3",  target_entity_id: "b1",  relation_type: "AFFECTS",              weight: 0.8 },
    { source_entity_id: "e3",  target_entity_id: "c1",  relation_type: "RECOMMENDED_FOR",      weight: 0.7 },
    { source_entity_id: "e4",  target_entity_id: "c2",  relation_type: "CONTRAINDICATED_FOR",  weight: 1.0 },
    { source_entity_id: "e4",  target_entity_id: "c4",  relation_type: "CONTRAINDICATED_FOR",  weight: 1.0 },
    { source_entity_id: "e4",  target_entity_id: "b2",  relation_type: "AFFECTS",              weight: 0.9 },
    { source_entity_id: "e5",  target_entity_id: "c2",  relation_type: "SAFE_ALTERNATIVE_TO",  weight: 0.8 },
    { source_entity_id: "e5",  target_entity_id: "b2",  relation_type: "AFFECTS",              weight: 0.7 },
    { source_entity_id: "e6",  target_entity_id: "b3",  relation_type: "AFFECTS",              weight: 0.6 },
    { source_entity_id: "p1",  target_entity_id: "c1",  relation_type: "RECOMMENDED_FOR",      weight: 1.0 },
    { source_entity_id: "p1",  target_entity_id: "c4",  relation_type: "RECOMMENDED_FOR",      weight: 0.9 },
    { source_entity_id: "p1",  target_entity_id: "s1",  relation_type: "BELONGS_TO",           weight: 1.0 },
    { source_entity_id: "p1",  target_entity_id: "e1",  relation_type: "PART_OF",              weight: 0.8 },
    { source_entity_id: "p1",  target_entity_id: "e2",  relation_type: "PART_OF",              weight: 0.8 },
    { source_entity_id: "p2",  target_entity_id: "c1",  relation_type: "RECOMMENDED_FOR",      weight: 1.0 },
    { source_entity_id: "p2",  target_entity_id: "c4",  relation_type: "RECOMMENDED_FOR",      weight: 1.0 },
    { source_entity_id: "p3",  target_entity_id: "a2",  relation_type: "APPLICABLE_TO",        weight: 1.0 },
    { source_entity_id: "p3",  target_entity_id: "c2",  relation_type: "RECOMMENDED_FOR",      weight: 0.9 },
    { source_entity_id: "co1", target_entity_id: "co2", relation_type: "PART_OF",              weight: 0.7 },
    { source_entity_id: "co1", target_entity_id: "c1",  relation_type: "EVIDENCE_SUPPORTS",    weight: 0.9 },
    { source_entity_id: "co3", target_entity_id: "co2", relation_type: "PART_OF",              weight: 0.8 },
    { source_entity_id: "e4",  target_entity_id: "e1",  relation_type: "PREREQUISITE_FOR",     weight: 0.6 },
    { source_entity_id: "c2",  target_entity_id: "b2",  relation_type: "AFFECTS",              weight: 1.0 },
    { source_entity_id: "c4",  target_entity_id: "b2",  relation_type: "AFFECTS",              weight: 1.0 },
    { source_entity_id: "c1",  target_entity_id: "b1",  relation_type: "AFFECTS",              weight: 1.0 },
    { source_entity_id: "c3",  target_entity_id: "b3",  relation_type: "AFFECTS",              weight: 1.0 },
    { source_entity_id: "s1",  target_entity_id: "a1",  relation_type: "APPLICABLE_TO",        weight: 1.0 },
    { source_entity_id: "s1",  target_entity_id: "a2",  relation_type: "APPLICABLE_TO",        weight: 1.0 },
    { source_entity_id: "s1",  target_entity_id: "a3",  relation_type: "APPLICABLE_TO",        weight: 1.0 },
    { source_entity_id: "co4", target_entity_id: "s1",  relation_type: "APPLICABLE_TO",        weight: 0.8 },
    { source_entity_id: "co4", target_entity_id: "s3",  relation_type: "APPLICABLE_TO",        weight: 0.7 },
    { source_entity_id: "e5",  target_entity_id: "e4",  relation_type: "SAFE_ALTERNATIVE_TO",  weight: 0.9 },
    { source_entity_id: "c2",  target_entity_id: "a2",  relation_type: "APPLICABLE_TO",        weight: 1.0 },
  ];

  return { entities, relationships };
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({
  entity,
  relationships,
  entities,
  onClose,
}: {
  entity: KnowledgeEntity;
  relationships: KnowledgeRelationship[];
  entities: KnowledgeEntity[];
  onClose: () => void;
}) {
  const entityMap = useMemo(() => {
    const m = new Map<string, KnowledgeEntity>();
    for (const e of entities) m.set(e.id, e);
    return m;
  }, [entities]);

  const outgoing = relationships.filter((r) => r.source_entity_id === entity.id);
  const incoming = relationships.filter((r) => r.target_entity_id === entity.id);
  const colors = ENTITY_COLORS[entity.entity_type];

  return (
    <Card className="p-4 border-t-2" style={{ borderTopColor: colors.border }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{ENTITY_ICONS[entity.entity_type]}</span>
            <h3 className="text-base font-bold truncate">
              {entity.display_name || entity.name}
            </h3>
            <Badge variant="outline" className="text-xs capitalize shrink-0">
              {entity.entity_type.replace("_", " ")}
            </Badge>
          </div>
          {entity.description && (
            <p className="text-sm text-muted-foreground mt-1">{entity.description}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
          Close
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {/* Properties */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Properties</p>
          {Object.keys(entity.properties).length > 0 ? (
            <div className="space-y-1">
              {Object.entries(entity.properties).map(([key, val]) => (
                <div key={key} className="text-xs">
                  <span className="font-mono text-muted-foreground">{key}:</span>{" "}
                  <span className="text-foreground">
                    {Array.isArray(val) ? val.join(", ") : String(val)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No properties</p>
          )}
        </div>

        {/* Outgoing */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Outgoing ({outgoing.length})
          </p>
          {outgoing.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {outgoing.map((r, i) => {
                const target = entityMap.get(r.target_entity_id);
                return (
                  <div key={i} className="text-xs flex items-center gap-1">
                    <Badge
                      variant={SAFETY_RELATIONS.includes(r.relation_type) ? "destructive" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {r.relation_type.replace(/_/g, " ")}
                    </Badge>
                    <span className="truncate">{target?.display_name || target?.name || r.target_entity_id}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">None</p>
          )}
        </div>

        {/* Incoming */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Incoming ({incoming.length})
          </p>
          {incoming.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {incoming.map((r, i) => {
                const source = entityMap.get(r.source_entity_id);
                return (
                  <div key={i} className="text-xs flex items-center gap-1">
                    <Badge
                      variant={SAFETY_RELATIONS.includes(r.relation_type) ? "destructive" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {r.relation_type.replace(/_/g, " ")}
                    </Badge>
                    <span className="truncate">{source?.display_name || source?.name || r.source_entity_id}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">None</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Filter Bar ─────────────────────────────────────────────────────────────────

function FilterBar({
  search,
  onSearchChange,
  selectedTypes,
  onToggleType,
  selectedRelations,
  onToggleRelation,
  onReset,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  selectedTypes: Set<EntityType>;
  onToggleType: (t: EntityType) => void;
  selectedRelations: Set<RelationType>;
  onToggleRelation: (r: RelationType) => void;
  onReset: () => void;
}) {
  const [showRelations, setShowRelations] = useState(false);
  const hasFilters = search || selectedTypes.size < ALL_ENTITY_TYPES.length || selectedRelations.size < ALL_RELATION_TYPES.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search entities..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-56 h-8 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRelations((p) => !p)}
          className="text-xs h-8"
        >
          {showRelations ? "Hide Relation Filters" : "Relation Filters"}
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-xs h-8">
            Reset Filters
          </Button>
        )}
      </div>

      {/* Entity type toggles */}
      <div className="flex gap-1.5 flex-wrap">
        {ALL_ENTITY_TYPES.map((type) => {
          const active = selectedTypes.has(type);
          const colors = ENTITY_COLORS[type];
          return (
            <button
              key={type}
              onClick={() => onToggleType(type)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all border"
              style={{
                background: active ? colors.bg : "transparent",
                borderColor: active ? colors.border : "var(--border)",
                color: active ? colors.text : "var(--muted-foreground)",
                opacity: active ? 1 : 0.5,
              }}
            >
              <span className="text-[10px]">{ENTITY_ICONS[type]}</span>
              {type.replace("_", " ")}
            </button>
          );
        })}
      </div>

      {/* Relation type toggles */}
      {showRelations && (
        <div className="flex gap-1.5 flex-wrap">
          {ALL_RELATION_TYPES.map((rel) => {
            const active = selectedRelations.has(rel);
            const isSafety = SAFETY_RELATIONS.includes(rel);
            return (
              <button
                key={rel}
                onClick={() => onToggleRelation(rel)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all border ${
                  active
                    ? isSafety
                      ? "bg-red-50 border-red-400 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-accent border-border text-foreground"
                    : "bg-transparent border-border text-muted-foreground opacity-50"
                }`}
              >
                {rel.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Graph Canvas ───────────────────────────────────────────────────────────────

function GraphCanvas({ data }: { data: GraphData }) {
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<EntityType>>(new Set(ALL_ENTITY_TYPES));
  const [selectedRelations, setSelectedRelations] = useState<Set<RelationType>>(new Set(ALL_RELATION_TYPES));
  const [selectedEntity, setSelectedEntity] = useState<KnowledgeEntity | null>(null);

  // Filter entities
  const filteredEntities = useMemo(() => {
    return data.entities.filter((e) => {
      if (!selectedTypes.has(e.entity_type)) return false;
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = e.name.toLowerCase().includes(q) || e.display_name.toLowerCase().includes(q);
        const descMatch = e.description?.toLowerCase().includes(q);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    });
  }, [data.entities, selectedTypes, search]);

  const filteredEntityIds = useMemo(() => new Set(filteredEntities.map((e) => e.id)), [filteredEntities]);

  // Filter relationships
  const filteredRelationships = useMemo(() => {
    return data.relationships.filter((r) => {
      if (!selectedRelations.has(r.relation_type)) return false;
      if (!filteredEntityIds.has(r.source_entity_id)) return false;
      if (!filteredEntityIds.has(r.target_entity_id)) return false;
      return true;
    });
  }, [data.relationships, selectedRelations, filteredEntityIds]);

  // Compute layout
  const initialNodes = useMemo(() => computeRadialLayout(filteredEntities), [filteredEntities]);
  const initialEdges = useMemo(() => computeEdges(filteredRelationships), [filteredRelationships]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when filters change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const entity = data.entities.find((e) => e.id === node.id);
      if (entity) setSelectedEntity(entity);
    },
    [data.entities]
  );

  const handleToggleType = useCallback((type: EntityType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setSelectedEntity(null);
  }, []);

  const handleToggleRelation = useCallback((rel: RelationType) => {
    setSelectedRelations((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setSearch("");
    setSelectedTypes(new Set(ALL_ENTITY_TYPES));
    setSelectedRelations(new Set(ALL_RELATION_TYPES));
    setSelectedEntity(null);
  }, []);

  const minimapNodeColor = useCallback((node: Node) => {
    const type = (node.data?.entityType as EntityType) || "concept";
    return ENTITY_COLORS[type]?.minimap || "#94a3b8";
  }, []);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Graph</h1>
          <PageGuide {...knowledgeHelp.graph.page} />
          <p className="text-sm text-muted-foreground">
            {filteredEntities.length} entities, {filteredRelationships.length} relationships
            {(filteredEntities.length !== data.entities.length ||
              filteredRelationships.length !== data.relationships.length) && (
              <span className="ml-1">
                (of {data.entities.length} / {data.relationships.length} total)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">
            {data.entities.length} entities
          </Badge>
          <Badge variant="outline" className="text-xs">
            {data.relationships.length} relationships
          </Badge>
          <Badge variant="outline" className="text-xs">
            {new Set(data.entities.map((e) => e.entity_type)).size} types
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          selectedTypes={selectedTypes}
          onToggleType={handleToggleType}
          selectedRelations={selectedRelations}
          onToggleRelation={handleToggleRelation}
          onReset={handleReset}
        />
      </Card>

      {/* React Flow Canvas */}
      <Card className="overflow-hidden" style={{ height: 600 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls position="top-right" />
          <MiniMap
            nodeColor={minimapNodeColor}
            nodeStrokeWidth={2}
            zoomable
            pannable
            style={{ border: "1px solid var(--border)", borderRadius: 8 }}
          />
          <Panel position="bottom-left">
            <div className="bg-background/90 backdrop-blur-sm border rounded-lg p-2 space-y-1">
              {ALL_ENTITY_TYPES.map((type) => (
                <div key={type} className="flex items-center gap-1.5 text-[10px]">
                  <div
                    className="w-2.5 h-2.5 rounded-full border"
                    style={{ backgroundColor: ENTITY_COLORS[type].bg, borderColor: ENTITY_COLORS[type].border }}
                  />
                  <span className="capitalize text-muted-foreground">
                    {type.replace("_", " ")}
                  </span>
                </div>
              ))}
              <div className="border-t pt-1 mt-1">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-4 h-0.5 bg-red-500" />
                  <span className="text-muted-foreground">Safety (animated)</span>
                </div>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </Card>

      {/* Detail Panel */}
      {selectedEntity && (
        <DetailPanel
          entity={selectedEntity}
          relationships={data.relationships}
          entities={data.entities}
          onClose={() => setSelectedEntity(null)}
        />
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGraphData();
  }, []);

  async function fetchGraphData() {
    try {
      // TODO: wire to real graph API
      const res = await fetch("/api/v1/admin/enterprise/knowledge/graph");
      if (res.ok) {
        const json = await res.json();
        if (json.entities?.length > 0) {
          setData(json);
          return;
        }
      }
    } catch {
      // API not available yet — fall through to mock data
    }

    // Use realistic mock data until API is wired
    setData(generateMockData());
    toast.info("Using sample knowledge graph data. Wire the API to load real data.");
    setLoading(false);
  }

  useEffect(() => {
    if (data) setLoading(false);
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Graph</h1>
          <p className="text-muted-foreground">Loading graph data...</p>
        </div>
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Knowledge Graph</h1>
        <Card className="p-8 text-center text-muted-foreground">
          No knowledge graph data available. Ensure knowledge_entities and knowledge_relationships tables are populated.
        </Card>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <GraphCanvas data={data} />
    </ReactFlowProvider>
  );
}
