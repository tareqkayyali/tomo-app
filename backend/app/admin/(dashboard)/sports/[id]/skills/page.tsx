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

interface SkillRow {
  id: string;
  key: string;
  name: string;
  category: string;
  sort_order: number;
  sub_metrics: { key: string; label: string; unit: string; description: string }[];
}

export default function SkillsListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sportId = params.id;
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/v1/admin/skills?sport_id=${encodeURIComponent(sportId)}`,
      { credentials: "include" }
    );
    if (res.ok) {
      const data = await res.json();
      setSkills(data.skills ?? []);
    }
    setLoading(false);
  }, [sportId]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this skill?")) return;
    const res = await fetch(`/api/v1/admin/skills/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast.success("Skill deleted");
      fetchSkills();
    } else {
      toast.error("Failed to delete skill");
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
          <h1 className="text-3xl font-bold tracking-tight">Skills / Shots</h1>
          <p className="text-muted-foreground">
            {skills.length} skill{skills.length !== 1 ? "s" : ""} for{" "}
            <span className="capitalize">{sportId}</span>
          </p>
        </div>
        <Link href={`/admin/sports/${sportId}/skills/new`}>
          <Button>+ Add Skill</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Sub-Metrics</TableHead>
              <TableHead>Sort Order</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : skills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No skills found
                </TableCell>
              </TableRow>
            ) : (
              skills.map((skill) => (
                <TableRow key={skill.id}>
                  <TableCell className="font-mono text-sm">{skill.key}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/sports/${sportId}/skills/${skill.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {skill.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {skill.category ? (
                      <Badge variant="outline">{skill.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(skill.sub_metrics || []).length}
                    </Badge>
                  </TableCell>
                  <TableCell>{skill.sort_order}</TableCell>
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
                              `/admin/sports/${sportId}/skills/${skill.id}/edit`
                            )
                          }
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(skill.id)}
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
