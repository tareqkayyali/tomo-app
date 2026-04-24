"use client";

/**
 * Admin athlete detail page — v1 scope is the History tab reflecting
 * Profile > Historical Data. Other tabs (Profile / Events / Deletion) are
 * flagged for v2 per the CMS Reflection rule. Read-only in v1; admin-edit
 * requires audit-log wiring (migration 076).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface AthleteHistoryResponse {
  user: {
    id: string;
    name: string | null;
    dateOfBirth: string | null;
    createdAt: string;
  };
  trainingStartedAt: string | null;
  trainingHistoryNote: string | null;
  historicalTests: Array<{
    id: string;
    testType: string;
    score: number;
    date: string;
    unit: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  injuries: Array<{
    id: string;
    bodyArea: string;
    severity: string;
    year: number;
    weeksOut: number | null;
    resolved: boolean;
    note: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

function yearsFrom(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const start = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(start)) return null;
  const years = (Date.now() - start) / (365.25 * 86400000);
  if (years < 0) return null;
  return (Math.round(years * 10) / 10).toString();
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<AthleteHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/users/${id}/history`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading athlete…</div>;
  }

  if (!data) {
    return <div className="p-8 text-destructive">Could not load athlete.</div>;
  }

  const years = yearsFrom(data.trainingStartedAt);

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <Link
          href="/admin/system/users"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {data.user.name ?? "Unnamed athlete"}
        </h1>
        <div className="mt-1 flex gap-3 text-sm text-muted-foreground">
          <span>ID: {data.user.id}</span>
          <span>•</span>
          <span>Joined Tomo: {new Date(data.user.createdAt).toLocaleDateString()}</span>
          {data.user.dateOfBirth && (
            <>
              <span>•</span>
              <span>DOB: {data.user.dateOfBirth}</span>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Training history</CardTitle>
          <CardDescription>Self-reported pre-Tomo context</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <span className="text-sm text-muted-foreground">Start date: </span>
            {data.trainingStartedAt ? (
              <span className="font-medium">
                {data.trainingStartedAt}
                {years && (
                  <Badge variant="secondary" className="ml-2">
                    {years} yrs training
                  </Badge>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground italic">Not set</span>
            )}
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Note: </span>
            {data.trainingHistoryNote ? (
              <span>{data.trainingHistoryNote}</span>
            ) : (
              <span className="text-muted-foreground italic">No note</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past test results</CardTitle>
          <CardDescription>
            Self-reported pre-Tomo test entries ({data.historicalTests.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.historicalTests.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No entries.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.historicalTests.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.testType}</TableCell>
                    <TableCell>{t.score}</TableCell>
                    <TableCell>{t.unit ?? "—"}</TableCell>
                    <TableCell>{t.date}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past injuries</CardTitle>
          <CardDescription>
            Self-reported pre-Tomo injury history ({data.injuries.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.injuries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No entries.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Body area</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Weeks out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.injuries.map((inj) => (
                  <TableRow key={inj.id}>
                    <TableCell>{inj.year}</TableCell>
                    <TableCell className="font-medium">{inj.bodyArea}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          inj.severity === "severe"
                            ? "destructive"
                            : inj.severity === "moderate"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {inj.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>{inj.weeksOut ?? "—"}</TableCell>
                    <TableCell>{inj.resolved ? "Resolved" : "Ongoing"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inj.note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
