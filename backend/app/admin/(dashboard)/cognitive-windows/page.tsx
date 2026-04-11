"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";
import { PageGuide } from "@/components/admin/PageGuide";
import { cognitiveWindowsHelp } from "@/lib/cms-help/cognitive-windows";

interface CognitiveWindow {
  id: string;
  session_type: string;
  cognitive_state: "enhanced" | "suppressed" | "neutral";
  optimal_study_delay_minutes: number;
  description: string | null;
}

const STATE_COLORS: Record<string, string> = {
  enhanced: "bg-green-500/15 text-green-400 border-green-500/30",
  suppressed: "bg-red-500/15 text-red-400 border-red-500/30",
  neutral: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

function formatDelay(minutes: number): string {
  if (minutes === 0) return "No delay";
  return `${minutes} min`;
}

export default function CognitiveWindowsPage() {
  const router = useRouter();
  const [windows, setWindows] = useState<CognitiveWindow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWindows = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/admin/cognitive-windows", {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setWindows(data.windows ?? []);
    } else {
      toast.error("Failed to load cognitive windows");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWindows();
  }, [fetchWindows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cognitive Windows</h1>
          <PageGuide {...cognitiveWindowsHelp.list.page} />
          <p className="text-muted-foreground">
            {windows.length} window{windows.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Link href="/admin/cognitive-windows/new">
          <Button>+ New Window</Button>
        </Link>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session Type</TableHead>
              <TableHead>Cognitive State</TableHead>
              <TableHead>Optimal Study Delay</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : windows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No cognitive windows found. Click &ldquo;+ New Window&rdquo; to create one.
                </TableCell>
              </TableRow>
            ) : (
              windows.map((w) => (
                <TableRow
                  key={w.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/cognitive-windows/${w.id}/edit`)}
                >
                  <TableCell className="font-medium">{w.session_type}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATE_COLORS[w.cognitive_state] ?? ""}>
                      {w.cognitive_state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDelay(w.optimal_study_delay_minutes)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {w.description || "\u2014"}
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
