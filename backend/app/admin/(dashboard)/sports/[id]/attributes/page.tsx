"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface SubAttribute {
  name: string;
  weight: number;
  description: string;
  unit: string;
}

interface Attribute {
  id: string;
  sport_id: string;
  key: string;
  label: string;
  full_name: string;
  abbreviation: string;
  description: string;
  color: string;
  max_value: number;
  sort_order: number;
  sub_attributes: SubAttribute[];
}

export default function AttributesListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sportId = params.id;

  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAttributes = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/v1/admin/attributes?sport_id=${sportId}`,
      { credentials: "include" }
    );
    if (res.ok) {
      const data = await res.json();
      setAttributes(data.attributes);
    } else {
      toast.error("Failed to load attributes");
    }
    setLoading(false);
  }, [sportId]);

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  async function handleDelete(id: string, key: string) {
    if (!confirm(`Delete attribute "${key}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/v1/admin/attributes/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Attribute deleted");
      fetchAttributes();
    } else {
      toast.error("Failed to delete attribute");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/admin/sports/${sportId}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Back to Sport
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Attributes</h1>
          <p className="text-muted-foreground">
            {attributes.length} attribute{attributes.length !== 1 ? "s" : ""}{" "}
            for <span className="font-mono">{sportId}</span>
          </p>
        </div>
        <Link href={`/admin/sports/${sportId}/attributes/new`}>
          <Button>+ Add Attribute</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Max</TableHead>
              <TableHead>Sub-Attrs</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : attributes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No attributes found. Add your first attribute to get started.
                </TableCell>
              </TableRow>
            ) : (
              attributes.map((attr) => (
                <TableRow key={attr.id}>
                  <TableCell className="font-mono text-sm">
                    {attr.key}
                  </TableCell>
                  <TableCell className="font-medium">
                    {attr.full_name}
                  </TableCell>
                  <TableCell>{attr.label}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-sm border"
                        style={{ backgroundColor: attr.color }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">
                        {attr.color}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{attr.max_value}</TableCell>
                  <TableCell>
                    {(attr.sub_attributes || []).length}
                  </TableCell>
                  <TableCell>{attr.sort_order}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/admin/sports/${sportId}/attributes/${attr.id}/edit`
                          )
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(attr.id, attr.key)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
