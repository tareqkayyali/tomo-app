"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

interface RatingLevelRow {
  id: string;
  name: string;
  min_rating: number;
  max_rating: number;
  color: string;
  description: string;
  sort_order: number;
}

export default function RatingLevelsListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sportId = params.id;
  const [levels, setLevels] = useState<RatingLevelRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLevels = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/v1/admin/rating-levels?sport_id=${encodeURIComponent(sportId)}`,
      { credentials: "include" }
    );
    if (res.ok) {
      const data = await res.json();
      setLevels(data.levels ?? []);
    }
    setLoading(false);
  }, [sportId]);

  useEffect(() => {
    fetchLevels();
  }, [fetchLevels]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this rating level?")) return;
    const res = await fetch(`/api/v1/admin/rating-levels/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Rating level deleted");
      fetchLevels();
    } else {
      toast.error("Failed to delete rating level");
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
          <h1 className="text-3xl font-bold tracking-tight">Rating Levels</h1>
          <p className="text-muted-foreground">
            {levels.length} level{levels.length !== 1 ? "s" : ""} for{" "}
            <span className="capitalize">{sportId}</span>
          </p>
        </div>
        <Link href={`/admin/sports/${sportId}/rating-levels/new`}>
          <Button>+ Add Level</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Min Rating</TableHead>
              <TableHead>Max Rating</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Sort Order</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : levels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No rating levels found
                </TableCell>
              </TableRow>
            ) : (
              levels.map((level) => (
                <TableRow key={level.id}>
                  <TableCell>
                    <Link
                      href={`/admin/sports/${sportId}/rating-levels/${level.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {level.name}
                    </Link>
                  </TableCell>
                  <TableCell>{level.min_rating}</TableCell>
                  <TableCell>{level.max_rating}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-5 w-5 rounded border"
                        style={{ backgroundColor: level.color }}
                      />
                      <span className="text-xs font-mono">{level.color}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {level.description || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{level.sort_order}</TableCell>
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
                              `/admin/sports/${sportId}/rating-levels/${level.id}/edit`
                            )
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(level.id)}
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
