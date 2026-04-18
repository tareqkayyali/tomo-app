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
import { knowledgeHelp } from "@/lib/cms-help/knowledge";

/**
 * Enterprise Knowledge Operations
 * Browse knowledge chunks and graph entities, scoped to the active tenant hierarchy.
 * Phase 10 will add Tiptap editor and evidence citation embedding.
 */

interface KnowledgeChunk {
  chunk_id: string;
  domain: string;
  title: string;
  content: string;
  institution_id: string | null;
  evidence_grade: string | null;
  phv_stages: string[];
  sports: string[];
}

interface KnowledgeEntity {
  id: string;
  name: string;
  entity_type: string;
  description: string | null;
  institution_id: string | null;
}

type Tab = "chunks" | "entities";

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<Tab>("chunks");
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKnowledge();
  }, []);

  async function fetchKnowledge() {
    try {
      const [chunksRes, entitiesRes] = await Promise.all([
        fetch("/api/v1/admin/enterprise/knowledge/chunks"),
        fetch("/api/v1/admin/enterprise/knowledge/entities"),
      ]);

      if (chunksRes.ok) {
        const data = await chunksRes.json();
        setChunks(data.chunks || []);
      }

      if (entitiesRes.ok) {
        const data = await entitiesRes.json();
        setEntities(data.entities || []);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Knowledge Operations</h1>
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
          <h1 className="text-2xl font-bold">Knowledge Operations</h1>
          <PageGuide {...knowledgeHelp.list.page} />
          <p className="text-muted-foreground">
            Manage sports science knowledge chunks and knowledge graph entities
          </p>
        </div>
        <BulkImportExport
          resourceType="knowledge"
          onImportComplete={fetchKnowledge}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Knowledge Chunks</p>
          <p className="text-2xl font-bold">{chunks.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {chunks.filter((c) => c.institution_id).length} institutional
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Graph Entities</p>
          <p className="text-2xl font-bold">{entities.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Set(entities.map((e) => e.entity_type)).size} types
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Evidence Graded</p>
          <p className="text-2xl font-bold">
            {chunks.filter((c) => c.evidence_grade).length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            of {chunks.length} chunks
          </p>
        </Card>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("chunks")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "chunks"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Knowledge Chunks ({chunks.length})
        </button>
        <button
          onClick={() => setActiveTab("entities")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "entities"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Graph Entities ({entities.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === "chunks" && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>PHV Stages</TableHead>
                <TableHead>Sports</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chunks.map((c) => (
                <TableRow key={c.chunk_id}>
                  <TableCell className="font-mono text-xs">{c.domain}</TableCell>
                  <TableCell className="font-medium max-w-xs truncate">
                    {c.title}
                  </TableCell>
                  <TableCell>
                    {c.evidence_grade ? (
                      <Badge
                        variant={
                          c.evidence_grade === "A"
                            ? "default"
                            : c.evidence_grade === "B"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        Grade {c.evidence_grade}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(c.phv_stages || []).slice(0, 3).map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(c.sports || []).slice(0, 2).map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={c.institution_id ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {c.institution_id ? "Institutional" : "Global"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeTab === "entities" && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {e.entity_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                    {e.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={e.institution_id ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {e.institution_id ? "Institutional" : "Global"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
