"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { protocolsHelp } from "@/lib/cms-help/protocols";

/**
 * Protocol Inheritance Visualization
 * Shows the tenant hierarchy tree (Global -> Institution -> Group -> Individual)
 * and how protocols inherit/override at each level. PDs can see which protocols
 * apply at each tier and understand the resolution order.
 */

/* ── Interfaces ────────────────────────────────────────────────────────── */

interface TenantNode {
  id: string;
  name: string;
  tier: "global" | "institution" | "group";
  parent_id: string | null;
  is_active: boolean;
  children: TenantNode[];
}

interface Protocol {
  protocol_id: string;
  name: string;
  category: string;
  safety_critical: boolean;
  is_built_in: boolean;
  priority: number;
  institution_id: string | null;
  is_enabled: boolean;
}

interface InheritanceRule {
  id: string;
  parent_tenant_id: string;
  child_tenant_id: string;
  resource_type: string;
  override_type: "inherit" | "extend" | "override" | "block";
}

interface ResolvedProtocol extends Protocol {
  source_tier: string;
  source_tenant_name: string;
  override_type: "inherit" | "extend" | "override" | "block" | "mandatory";
}

/* ── Mock Inheritance Rules ────────────────────────────────────────────── */

// TODO: wire to real inheritance API (GET /api/v1/admin/enterprise/inheritance)
const MOCK_INHERITANCE_RULES: InheritanceRule[] = [
  { id: "r1", parent_tenant_id: "global-1", child_tenant_id: "inst-1", resource_type: "protocol", override_type: "inherit" },
  { id: "r2", parent_tenant_id: "global-1", child_tenant_id: "inst-1", resource_type: "protocol", override_type: "extend" },
  { id: "r3", parent_tenant_id: "inst-1", child_tenant_id: "grp-1", resource_type: "protocol", override_type: "inherit" },
  { id: "r4", parent_tenant_id: "inst-1", child_tenant_id: "grp-2", resource_type: "protocol", override_type: "override" },
  { id: "r5", parent_tenant_id: "global-1", child_tenant_id: "inst-2", resource_type: "protocol", override_type: "inherit" },
  { id: "r6", parent_tenant_id: "inst-2", child_tenant_id: "grp-3", resource_type: "protocol", override_type: "block" },
  { id: "r7", parent_tenant_id: "global-1", child_tenant_id: "inst-3", resource_type: "protocol", override_type: "inherit" },
  { id: "r8", parent_tenant_id: "inst-3", child_tenant_id: "grp-4", resource_type: "protocol", override_type: "extend" },
  { id: "r9", parent_tenant_id: "inst-3", child_tenant_id: "grp-5", resource_type: "protocol", override_type: "inherit" },
];

/* ── Tree Utilities ────────────────────────────────────────────────────── */

interface FlatTenant {
  id: string;
  name: string;
  tier: "global" | "institution" | "group";
  parent_id: string | null;
  is_active: boolean;
}

function buildTree(flat: FlatTenant[]): TenantNode[] {
  const map = new Map<string, TenantNode>();
  const roots: TenantNode[] = [];

  for (const t of flat) {
    map.set(t.id, { ...t, children: [] });
  }

  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function findNode(nodes: TenantNode[], id: string): TenantNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function getAncestorChain(flat: FlatTenant[], targetId: string): string[] {
  const chain: string[] = [];
  const map = new Map(flat.map((t) => [t.id, t]));
  let current = map.get(targetId);
  while (current) {
    chain.unshift(current.id);
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return chain;
}

/* ── Protocol Resolution ───────────────────────────────────────────────── */

function resolveProtocols(
  protocols: Protocol[],
  flatTenants: FlatTenant[],
  selectedId: string,
  rules: InheritanceRule[]
): ResolvedProtocol[] {
  const ancestors = getAncestorChain(flatTenants, selectedId);
  const tenantMap = new Map(flatTenants.map((t) => [t.id, t]));
  const resolved: ResolvedProtocol[] = [];

  // Mandatory built-in protocols always apply from global
  const mandatory = protocols.filter((p) => p.safety_critical && p.is_built_in);
  for (const p of mandatory) {
    resolved.push({
      ...p,
      source_tier: "global",
      source_tenant_name: "Tomo Global",
      override_type: "mandatory",
    });
  }

  // Non-mandatory protocols: resolve through the hierarchy
  const nonMandatory = protocols.filter((p) => !(p.safety_critical && p.is_built_in));

  for (const p of nonMandatory) {
    // Find the most specific source for this protocol
    const sourceTenantId = p.institution_id || ancestors[0];
    const sourceTenant = tenantMap.get(sourceTenantId);

    // Find applicable inheritance rule between parent-child in the chain
    const rule = rules.find(
      (r) =>
        ancestors.includes(r.child_tenant_id) &&
        ancestors.includes(r.parent_tenant_id) &&
        r.resource_type === "protocol"
    );

    const overrideType = rule?.override_type || "inherit";

    if (overrideType === "block" && !p.safety_critical) continue;

    resolved.push({
      ...p,
      source_tier: sourceTenant?.tier || "global",
      source_tenant_name: sourceTenant?.name || "Tomo Global",
      override_type: overrideType,
    });
  }

  return resolved.sort((a, b) => a.priority - b.priority);
}

/* ── Tree Node Component ───────────────────────────────────────────────── */

function TenantTreeNode({
  node,
  depth,
  selectedId,
  expanded,
  onSelect,
  onToggle,
}: {
  node: TenantNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  const tierIcon: Record<string, string> = {
    global: "\u{1F310}",
    institution: "\u{1F3DB}\uFE0F",
    group: "\u{1F465}",
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted text-foreground"
        } ${!node.is_active ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            {isExpanded ? "\u25BC" : "\u25B6"}
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <span className="shrink-0">{tierIcon[node.tier] || "\u25CB"}</span>
        <span className="truncate">{node.name}</span>
        {!node.is_active && (
          <span className="text-[10px] text-muted-foreground ml-auto">(inactive)</span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TenantTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Override Type Badge ────────────────────────────────────────────────── */

function OverrideBadge({ type }: { type: ResolvedProtocol["override_type"] }) {
  const config: Record<string, { label: string; className: string }> = {
    mandatory: { label: "Mandatory", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
    inherit: { label: "Inherited", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
    extend: { label: "Extended", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    override: { label: "Overridden", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    block: { label: "Blocked", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 line-through" },
  };
  const c = config[type] || config.inherit;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────── */

export default function ProtocolInheritancePage() {
  const [flatTenants, setFlatTenants] = useState<FlatTenant[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([fetchTenants(), fetchProtocols()]).finally(() =>
      setLoading(false)
    );
  }, []);

  async function fetchTenants() {
    try {
      const res = await fetch("/api/v1/admin/enterprise/organizations");
      if (!res.ok) throw new Error("Failed to fetch tenants");
      const data = await res.json();
      const tenants: FlatTenant[] = (data.tenants || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        tier: t.tier,
        parent_id: t.parent_id,
        is_active: t.is_active,
      }));
      setFlatTenants(tenants);
      // Auto-expand globals and auto-select first institution
      const globals = tenants.filter((t) => t.tier === "global").map((t) => t.id);
      setExpanded(new Set(globals));
      const firstInst = tenants.find((t) => t.tier === "institution");
      if (firstInst) setSelectedId(firstInst.id);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function fetchProtocols() {
    try {
      const res = await fetch("/api/v1/admin/enterprise/protocols");
      if (!res.ok) throw new Error("Failed to fetch protocols");
      const data = await res.json();
      setProtocols(data.protocols || []);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    // Auto-expand parent chain
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const tree = buildTree(flatTenants);
  const selectedTenant = selectedId
    ? flatTenants.find((t) => t.id === selectedId)
    : null;

  const resolved = selectedId
    ? resolveProtocols(protocols, flatTenants, selectedId, MOCK_INHERITANCE_RULES)
    : [];

  const mandatoryCount = resolved.filter((r) => r.override_type === "mandatory").length;
  const overrideCount = resolved.filter((r) => r.override_type === "override" || r.override_type === "block").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Protocol Inheritance</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px] lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Protocol Inheritance</h1>
        <PageGuide {...protocolsHelp.inheritance.page} />
        <p className="text-muted-foreground">
          Visualize how protocols flow through the tenant hierarchy
        </p>
      </div>

      {/* Stats row */}
      {selectedTenant && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold">{resolved.length}</div>
            <div className="text-xs text-muted-foreground">Total Protocols</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{mandatoryCount}</div>
            <div className="text-xs text-muted-foreground">Mandatory</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{overrideCount}</div>
            <div className="text-xs text-muted-foreground">Overrides / Blocks</div>
          </Card>
        </div>
      )}

      {/* Main split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left panel: Tenant tree */}
        <Card className="p-3 overflow-auto max-h-[600px]">
          <h2 className="text-sm font-semibold mb-2 px-2">Tenant Hierarchy</h2>
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2 py-4">
              No tenants found. Create organizations first.
            </p>
          ) : (
            tree.map((root) => (
              <TenantTreeNode
                key={root.id}
                node={root}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                onSelect={handleSelect}
                onToggle={toggleExpand}
              />
            ))
          )}
        </Card>

        {/* Right panel: Protocol resolution */}
        <Card className="p-4 lg:col-span-2 overflow-auto max-h-[600px]">
          {!selectedTenant ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-16">
              Select a tenant from the tree to view resolved protocols
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected tenant header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedTenant.name}</h2>
                  <p className="text-xs text-muted-foreground capitalize">
                    {selectedTenant.tier} tier
                    {!selectedTenant.is_active && " (inactive)"}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs capitalize">
                  {resolved.length} protocol{resolved.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Resolved protocol list */}
              <div className="space-y-1.5">
                {resolved.map((rp) => (
                  <div
                    key={rp.protocol_id}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                      rp.override_type === "block" ? "opacity-50" : ""
                    }`}
                  >
                    <span className="shrink-0">
                      {rp.override_type === "mandatory"
                        ? "\u{1F534}"
                        : rp.source_tier === "institution"
                        ? "\u{1F535}"
                        : rp.source_tier === "group"
                        ? "\u{1F7E2}"
                        : "\u26AA"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{rp.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {rp.category} &middot; P{rp.priority} &middot; from{" "}
                        {rp.source_tenant_name}
                      </div>
                    </div>
                    <OverrideBadge type={rp.override_type} />
                  </div>
                ))}
                {resolved.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No protocols resolved for this tenant.
                  </p>
                )}
              </div>

              {/* Inheritance legend */}
              <div className="border-t pt-3 mt-3">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                  Inheritance Rules
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <OverrideBadge type="inherit" />
                    <span>Use parent's protocol as-is</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <OverrideBadge type="extend" />
                    <span>Add conditions on top of parent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <OverrideBadge type="override" />
                    <span>Replace parent's protocol entirely</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <OverrideBadge type="block" />
                    <span>Disable parent's protocol at this level</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
