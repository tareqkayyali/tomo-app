"use client";

/**
 * Admin → Moderation Queue review surface.
 *
 * Surfaces every open/pending/auto-hidden UGC item along with the SLA
 * countdown (24-hour per Apple 1.2 and DSA Art. 14). Read-only for
 * v1 — cleared/removed actions are invoked via API after a follow-up
 * PR wires in the action buttons and writes ugc_actions rows.
 *
 * Ordering: most overdue first. Colour cue by SLA bucket.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type State = "pending" | "auto_hidden" | "human_review" | "cleared" | "removed";
type Severity = "low" | "med" | "high" | "critical";

interface QueueRow {
  id: string;
  targetType: string;
  targetId: string;
  trigger: "report" | "classifier" | "keyword" | "first_post";
  severity: Severity;
  state: State;
  createdAt: string;
  classifierScore: Record<string, number> | null;
  reviewerId: string | null;
  reviewedAt: string | null;
}

interface ReportRow {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  notes: string | null;
  status: "open" | "triaged" | "actioned" | "dismissed";
  openedAt: string;
  slaDueAt: string;
}

function slaLabel(slaDueAt: string, now: Date = new Date()): { label: string; tone: "green" | "amber" | "red" } {
  const due = new Date(slaDueAt);
  const ms = due.getTime() - now.getTime();
  if (ms < 0) {
    const overdueMin = Math.round(-ms / 60000);
    return { label: `Overdue ${overdueMin}m`, tone: "red" };
  }
  const hoursLeft = ms / 3600000;
  if (hoursLeft < 2) return { label: `${Math.round(ms / 60000)}m left`, tone: "red" };
  if (hoursLeft < 8) return { label: `${hoursLeft.toFixed(1)}h left`, tone: "amber" };
  return { label: `${hoursLeft.toFixed(0)}h left`, tone: "green" };
}

export default function ModerationAdminPage() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, rRes] = await Promise.all([
        fetch("/api/v1/admin/moderation/queue", { credentials: "include" }),
        fetch("/api/v1/admin/moderation/reports", { credentials: "include" }),
      ]);
      if (!qRes.ok || !rRes.ok) throw new Error("admin moderation fetch failed");
      const qJson = await qRes.json();
      const rJson = await rRes.json();
      setQueue(qJson.queue ?? []);
      setReports(rJson.reports ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, [load]);

  const overdueReports = useMemo(
    () => reports.filter((r) => new Date(r.slaDueAt).getTime() < now.getTime() && (r.status === "open" || r.status === "triaged")),
    [reports, now]
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Moderation</h1>
        <p className="text-sm text-neutral-500 mt-1">
          UGC review queue + user reports. 24-hour SLA per Apple 1.2 and DSA Art. 14.
          Overdue items page the on-call.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ─── Reports ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Reports</h2>
          <div className="text-sm">
            {overdueReports.length > 0 && (
              <span className="text-red-600 font-medium">{overdueReports.length} overdue</span>
            )}
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="text-sm text-neutral-500">No open reports.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500 border-b">
                <tr>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">SLA</th>
                  <th className="py-2 pr-3">Opened</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const sla = slaLabel(r.slaDueAt, now);
                  return (
                    <tr key={r.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-3 font-mono text-xs">{r.targetType} / {r.targetId.slice(0, 8)}</td>
                      <td className="py-2 pr-3">{r.reason}</td>
                      <td className="py-2 pr-3">{r.status}</td>
                      <td className={`py-2 pr-3 font-medium ${sla.tone === "red" ? "text-red-600" : sla.tone === "amber" ? "text-amber-600" : "text-emerald-600"}`}>
                        {sla.label}
                      </td>
                      <td className="py-2 pr-3 text-xs text-neutral-500">{new Date(r.openedAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── Queue ─── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Moderation queue</h2>
        {loading ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : queue.length === 0 ? (
          <div className="text-sm text-neutral-500">Queue empty.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500 border-b">
                <tr>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Trigger</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => (
                  <tr key={q.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-mono text-xs">{q.targetType} / {q.targetId.slice(0, 8)}</td>
                    <td className="py-2 pr-3">{q.trigger}</td>
                    <td className={`py-2 pr-3 font-medium ${q.severity === "critical" ? "text-red-600" : q.severity === "high" ? "text-amber-600" : "text-neutral-600"}`}>
                      {q.severity}
                    </td>
                    <td className="py-2 pr-3">{q.state}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{new Date(q.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
