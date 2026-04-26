"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AppErrorRow = {
  id: string;
  created_at: string;
  layer: "mobile" | "backend" | "python";
  severity: "critical" | "high" | "medium" | "low" | "info";
  error_code: string | null;
  message: string;
  fingerprint: string | null;
  trace_id: string | null;
};

type StatsPayload = {
  hourly: Array<{ bucket_hour: string; error_count: number; unique_users: number }>;
  topCodes: Array<{ error_code: string | null; layer: string; error_count: number }>;
  layerBreakdown: Array<{ layer: string; severity: string; error_count: number }>;
  recentCritical: AppErrorRow[];
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-zinc-100 text-zinc-700 border-zinc-200",
  info: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export default function AIHealthErrorsPage() {
  const [errors, setErrors] = useState<AppErrorRow[]>([]);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState("24");
  const [layer, setLayer] = useState("");
  const [severity, setSeverity] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [traceId, setTraceId] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        hours,
        limit: String(limit),
        offset: String(offset),
      });
      if (layer) query.set("layer", layer);
      if (severity) query.set("severity", severity);
      if (errorCode) query.set("error_code", errorCode);
      if (fingerprint) query.set("fingerprint", fingerprint);
      if (traceId) query.set("trace_id", traceId);

      const [errorsRes, statsRes] = await Promise.all([
        fetch(`/api/v1/admin/enterprise/errors?${query.toString()}`, {
          credentials: "include",
        }),
        fetch(`/api/v1/admin/enterprise/errors/stats?hours=${encodeURIComponent(hours)}`, {
          credentials: "include",
        }),
      ]);

      if (errorsRes.ok) {
        const payload = await errorsRes.json();
        setErrors(payload.errors ?? []);
        setTotal(payload.total ?? 0);
      }
      if (statsRes.ok) {
        setStats((await statsRes.json()) as StatsPayload);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  const criticalCount = useMemo(
    () => stats?.recentCritical?.length ?? 0,
    [stats?.recentCritical]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Unified Errors</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="hours" className="w-24" />
          <Input value={layer} onChange={(e) => setLayer(e.target.value)} placeholder="layer" className="w-28" />
          <Input value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="severity" className="w-28" />
          <Input value={errorCode} onChange={(e) => setErrorCode(e.target.value)} placeholder="error_code prefix" className="w-52" />
          <Input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="fingerprint" className="w-40" />
          <Input value={traceId} onChange={(e) => setTraceId(e.target.value)} placeholder="trace_id" className="w-52" />
          <Button
            onClick={() => {
              setOffset(0);
              void load();
            }}
            disabled={loading}
          >
            Apply
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Critical/High</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{criticalCount}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Error Codes</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {(stats?.topCodes ?? []).slice(0, 5).map((row, idx) => (
              <div key={`${row.error_code}-${idx}`} className="flex justify-between">
                <span>{row.error_code ?? "unknown"}</span>
                <span>{row.error_count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Layer Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {(stats?.layerBreakdown ?? []).slice(0, 5).map((row, idx) => (
              <div key={`${row.layer}-${row.severity}-${idx}`} className="flex justify-between">
                <span>{row.layer}/{row.severity}</span>
                <span>{row.error_count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Error Feed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {errors.map((row) => (
            <div key={row.id} className="border rounded p-2 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{row.layer}</Badge>
                  <Badge variant="outline" className={SEVERITY_STYLE[row.severity] ?? ""}>
                    {row.severity}
                  </Badge>
                  <span className="font-mono">{row.error_code ?? "unknown"}</span>
                </div>
                <span>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              <div>{row.message}</div>
              <div className="text-zinc-500 font-mono">
                fp={row.fingerprint ?? "-"} trace={row.trace_id ?? "-"}
              </div>
            </div>
          ))}
          {errors.length === 0 && <div className="text-sm text-zinc-500">No errors found.</div>}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-zinc-500">
              Showing {Math.min(total, offset + 1)}-{Math.min(total, offset + limit)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
