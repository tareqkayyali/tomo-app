"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface PositionRow {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  attribute_weights: Record<string, number>;
}

export default function PositionsListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sportId = params.id;
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/v1/admin/positions?sport_id=${encodeURIComponent(sportId)}`,
      { credentials: "include" }
    );
    if (res.ok) {
      const data = await res.json();
      setPositions(data.positions ?? []);
    }
    setLoading(false);
  }, [sportId]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this position?")) return;
    const res = await fetch(`/api/v1/admin/positions/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Position deleted");
      fetchPositions();
    } else {
      toast.error("Failed to delete position");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/admin/sports/${sportId}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              &larr; Back to Sport
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Positions</h1>
          <p className="text-muted-foreground">
            {positions.length} position{positions.length !== 1 ? "s" : ""} for{" "}
            <span className="capitalize">{sportId}</span>
          </p>
        </div>
        <Link href={`/admin/sports/${sportId}/positions/new`}>
          <Button>+ Add Position</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Weight Count</TableHead>
              <TableHead>Sort Order</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : positions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No positions found
                </TableCell>
              </TableRow>
            ) : (
              positions.map((pos) => (
                <TableRow key={pos.id}>
                  <TableCell className="font-mono text-sm">{pos.key}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/sports/${sportId}/positions/${pos.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {pos.label}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {Object.keys(pos.attribute_weights || {}).length}
                    </Badge>
                  </TableCell>
                  <TableCell>{pos.sort_order}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="sm" />}
                      >
                        ...
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(
                              `/admin/sports/${sportId}/positions/${pos.id}/edit`
                            )
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(pos.id)}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
