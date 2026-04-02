"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Athlete {
  id: string; name: string; email: string; sport: string; age: number;
  position: string; cv_completeness: number; sessions_total: number;
  coachability_index: number | null; completeness_club_pct: number;
  completeness_uni_pct: number; statement_status: string | null;
  share_club_views: number; share_uni_views: number;
}

interface Pagination { page: number; limit: number; total: number; total_pages: number; }

export default function CVAthletesPage() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [loading, setLoading] = useState(true);

  const fetchAthletes = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", sort, ...(search && { search }) });
      const res = await fetch(`/api/v1/admin/cv-athletes?${params}`, { credentials: "include" });
      const data = await res.json();
      setAthletes(data.athletes ?? []);
      setPagination(data.pagination ?? { page: 1, limit: 20, total: 0, total_pages: 0 });
    } catch { /* */ }
    setLoading(false);
  }, [search, sort]);

  useEffect(() => { fetchAthletes(); }, [fetchAthletes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CV Athletes</h1>
        <p className="text-muted-foreground">Browse athlete CV profiles and completeness</p>
      </div>

      <div className="flex gap-4 items-center">
        <Input placeholder="Search by name or email..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="max-w-sm"
          onKeyDown={(e) => e.key === "Enter" && fetchAthletes(1)} />
        <Select value={sort} onValueChange={(v) => { if (v) setSort(v); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
            <SelectItem value="completeness_desc">Completeness (High→Low)</SelectItem>
            <SelectItem value="completeness_asc">Completeness (Low→High)</SelectItem>
            <SelectItem value="recent">Recently Joined</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => fetchAthletes(1)}>Search</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Athlete</th>
                <th className="p-3">Sport / Pos</th>
                <th className="p-3 text-center">CV %</th>
                <th className="p-3 text-center">Sessions</th>
                <th className="p-3 text-center">Coachability</th>
                <th className="p-3 text-center">Statement</th>
                <th className="p-3 text-center">Share Views</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
              ) : athletes.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No athletes found</td></tr>
              ) : athletes.map((a) => (
                <tr key={a.id} className="border-b hover:bg-muted/50">
                  <td className="p-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </td>
                  <td className="p-3 text-muted-foreground">{a.sport} · {a.position ?? "—"}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${a.cv_completeness}%` }} />
                      </div>
                      <span className="font-mono text-xs">{a.cv_completeness}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-center font-mono">{a.sessions_total}</td>
                  <td className="p-3 text-center font-mono">{a.coachability_index?.toFixed(1) ?? "—"}</td>
                  <td className="p-3 text-center">
                    {a.statement_status ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        a.statement_status === "approved" ? "bg-green-500/10 text-green-500" :
                        a.statement_status === "needs_update" ? "bg-orange-500/10 text-orange-500" :
                        "bg-blue-500/10 text-blue-500"
                      }`}>{a.statement_status}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-center font-mono">{a.share_club_views + a.share_uni_views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchAthletes(pagination.page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={pagination.page >= pagination.total_pages} onClick={() => fetchAthletes(pagination.page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
