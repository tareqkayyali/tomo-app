"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { BulkImportExport } from "@/components/admin/enterprise/BulkImportExport";
import { PageGuide } from "@/components/admin/PageGuide";
import { protocolsHelp } from "@/lib/cms-help/protocols";

/**
 * Enterprise Protocol Management
 * Shows protocols resolved through the tenant hierarchy.
 * MANDATORY built-in safety protocols are highlighted and immutable.
 * Institutional protocols show their source tier.
 */

interface ResolvedProtocol {
  protocol_id: string;
  name: string;
  category: string;
  safety_critical: boolean;
  is_built_in: boolean;
  priority: number;
  institution_id: string | null;
  source_tier: string;
}

export default function ProtocolsPage() {
  const [protocols, setProtocols] = useState<ResolvedProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  useEffect(() => {
    fetchProtocols();
  }, []);

  async function fetchProtocols() {
    try {
      const res = await fetch("/api/v1/admin/enterprise/protocols");
      if (!res.ok) throw new Error("Failed to fetch protocols");
      const data = await res.json();
      setProtocols(data.protocols || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const categories = [
    "all",
    ...new Set(protocols.map((p) => p.category)),
  ];

  const filtered =
    filterCategory === "all"
      ? protocols
      : protocols.filter((p) => p.category === filterCategory);

  const mandatory = filtered.filter((p) => p.safety_critical && p.is_built_in);
  const institutional = filtered.filter(
    (p) => p.institution_id && !(p.safety_critical && p.is_built_in)
  );
  const advisory = filtered.filter(
    (p) => !p.institution_id && !(p.safety_critical && p.is_built_in)
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Protocols</h1>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Protocol Hierarchy</h1>
          <PageGuide {...protocolsHelp.list.page} />
          <p className="text-muted-foreground">
            Protocols resolved through the tenant hierarchy. Mandatory protocols
            cannot be overridden.
          </p>
        </div>
        <BulkImportExport
          resourceType="protocols"
          onImportComplete={fetchProtocols}
        />
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      {/* Mandatory protocols */}
      {mandatory.length > 0 && (
        <Card className="border-l-4 border-l-red-500">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">
              MANDATORY — Built-in Safety (cannot be overridden)
            </h2>
            <ProtocolTable protocols={mandatory} />
          </div>
        </Card>
      )}

      {/* Institutional protocols */}
      {institutional.length > 0 && (
        <Card className="border-l-4 border-l-blue-500">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3">
              INSTITUTIONAL — Org-Specific Protocols
            </h2>
            <ProtocolTable protocols={institutional} />
          </div>
        </Card>
      )}

      {/* Global advisory */}
      {advisory.length > 0 && (
        <Card>
          <div className="p-4">
            <h2 className="text-sm font-semibold mb-3">
              GLOBAL — Advisory Protocols
            </h2>
            <ProtocolTable protocols={advisory} />
          </div>
        </Card>
      )}

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          No protocols found for this category.
        </Card>
      )}
    </div>
  );
}

function ProtocolTable({ protocols }: { protocols: ResolvedProtocol[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Flags</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {protocols.map((p) => (
          <TableRow key={p.protocol_id}>
            <TableCell className="font-medium">{p.name}</TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs capitalize">
                {p.category}
              </Badge>
            </TableCell>
            <TableCell className="font-mono text-sm">P{p.priority}</TableCell>
            <TableCell>
              <Badge
                variant={p.source_tier === "global" ? "secondary" : "default"}
                className="text-xs"
              >
                {p.source_tier}
              </Badge>
            </TableCell>
            <TableCell className="flex gap-1">
              {p.safety_critical && (
                <Badge variant="destructive" className="text-xs">
                  Safety
                </Badge>
              )}
              {p.is_built_in && (
                <Badge variant="outline" className="text-xs">
                  Built-in
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
