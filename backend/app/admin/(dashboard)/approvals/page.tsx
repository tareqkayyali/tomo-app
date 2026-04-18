"use client";

/**
 * Admin → Approvals queue (P5.2, 2026-04-18).
 *
 * Lists approval_request suggestions with focus on the STUCK view —
 * pending rows older than 48h that neither coach nor parent has acted
 * on. Admin override writes to admin_override_log with justification;
 * safety gates elsewhere still run post-resolution.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Filter = "stuck" | "pending" | "all";
type Decision = "accepted" | "declined";

interface ChainEntry {
  role?: string;
  user_id?: string;
  decision?: string;
  at?: string;
  notes?: string;
}

interface Row {
  id: string;
  title: string;
  suggestionType: string;
  status: string;
  mode: string;
  blocking: boolean;
  requiredApproverRole: string | null;
  supersedeRule: string;
  approvalChain: ChainEntry[] | null | unknown;
  resolvedAt: string | null;
  resolvedByRole: string | null;
  resolutionRationale: string | null;
  targetRefType: string | null;
  targetRefId: string | null;
  createdAt: string;
  ageHours: number;
  isStuck: boolean;
  author: { id: string; name: string | null; email: string | null };
  authorRole: string;
  player: { id: string; name: string | null; email: string | null; date_of_birth: string | null };
}

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "Stuck (>48h)", value: "stuck" },
  { label: "All pending", value: "pending" },
  { label: "Everything", value: "all" },
];

export default function ApprovalsAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("stuck");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalTarget, setModalTarget] = useState<Row | null>(null);
  const [decision, setDecision] = useState<Decision>("declined");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/admin/approvals?filter=${filter}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`approvals fetch failed: ${res.status}`);
      const json = await res.json();
      setRows(json.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const stuck = rows.filter((r) => r.isStuck).length;
    const blocking = rows.filter((r) => r.blocking && r.status === "pending").length;
    return { stuck, blocking, total: rows.length };
  }, [rows]);

  const openOverride = (r: Row, d: Decision) => {
    setModalTarget(r);
    setDecision(d);
    setJustification("");
    setModalError(null);
  };
  const closeModal = () => {
    setModalTarget(null);
    setJustification("");
    setModalError(null);
  };

  const submit = useCallback(async () => {
    if (!modalTarget) return;
    setSaving(true);
    setModalError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/approvals/${modalTarget.id}/override`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, justification }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `override failed: ${res.status}`);
      }
      closeModal();
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [modalTarget, decision, justification, load]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals queue</h1>
        <p className="text-sm text-neutral-500 mt-1">
          approval_request suggestions awaiting coach/parent action. Admin
          override writes to admin_override_log with mandatory justification.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={
                "px-3 py-1 rounded-full text-sm font-medium transition " +
                (filter === f.value
                  ? "bg-white text-black shadow-sm"
                  : "text-neutral-600 hover:text-black")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-neutral-500">
          {stats.total} total · {stats.stuck} stuck · {stats.blocking} blocking downstream
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-neutral-500 bg-neutral-50 border-b">
            <tr>
              <th className="py-2 px-3">Title / target</th>
              <th className="py-2 px-3">Player</th>
              <th className="py-2 px-3">Author</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Age</th>
              <th className="py-2 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">
                  Queue empty. Nothing matches this filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                  <td className="py-2 px-3">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-neutral-500">
                      {r.suggestionType}
                      {r.blocking ? " · blocking" : ""}
                      {r.targetRefType ? ` · ${r.targetRefType}` : ""}
                    </div>
                    {r.supersedeRule && (
                      <div className="text-xs text-neutral-400 mt-0.5">
                        rule: {r.supersedeRule}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-medium">{r.player.name ?? "—"}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[220px]">
                      {r.player.email}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="font-medium">{r.author.name ?? "—"}</div>
                    <div className="text-xs text-neutral-500 capitalize">{r.authorRole}</div>
                  </td>
                  <td className="py-2 px-3">
                    <StatusBadge status={r.status} />
                    {r.status !== "pending" && r.resolvedByRole && (
                      <div className="text-xs text-neutral-500 mt-1">
                        by {r.resolvedByRole}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    <AgeChip hours={r.ageHours} stuck={r.isStuck} />
                  </td>
                  <td className="py-2 px-3 text-right space-x-1">
                    <button
                      onClick={() => openOverride(r, "accepted")}
                      disabled={r.status !== "pending"}
                      className="px-2 py-1 text-xs rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Force accept
                    </button>
                    <button
                      onClick={() => openOverride(r, "declined")}
                      disabled={r.status !== "pending"}
                      className="px-2 py-1 text-xs rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Force decline
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              Admin {decision === "accepted" ? "accept" : "decline"} approval
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              {modalTarget.title} · player: {modalTarget.player.name ?? modalTarget.player.email}
            </p>
            <p className="text-xs text-neutral-500 mt-2">
              Safety gates downstream (PHV / ACWR) still run regardless of
              this decision. Justification (10+ chars) is written to
              admin_override_log.
            </p>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={decision === "accepted"
                ? "Why the accept (e.g. 'Coach unavailable; parent confirmed by phone, SUP-214')"
                : "Why the decline (e.g. 'Stuck 5 days; athlete request superseded')"}
              rows={3}
              className="mt-3 w-full px-3 py-2 rounded border border-neutral-300 text-sm"
            />
            {modalError && (
              <div className="mt-2 text-xs text-red-700">{modalError}</div>
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-3 py-1.5 rounded-md border border-neutral-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving || justification.trim().length < 10}
                className={
                  "px-3 py-1.5 rounded-md text-white text-sm disabled:opacity-50 " +
                  (decision === "accepted" ? "bg-emerald-600" : "bg-red-600")
                }
              >
                {saving ? "Saving…" : decision === "accepted" ? "Force accept" : "Force decline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "declined" ? "bg-red-50 text-red-700 border-red-200" :
    status === "edited" ? "bg-blue-50 text-blue-700 border-blue-200" :
    status === "expired" ? "bg-neutral-100 text-neutral-500 border-neutral-200" :
    "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function AgeChip({ hours, stuck }: { hours: number; stuck: boolean }) {
  const label = hours < 1 ? `${Math.max(1, Math.round(hours * 60))}m`
    : hours < 24 ? `${hours}h`
    : `${Math.round(hours / 24)}d`;
  const tone = stuck
    ? "bg-red-50 text-red-700 border-red-200"
    : hours > 12
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-neutral-50 text-neutral-600 border-neutral-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${tone}`}>
      {label}
      {stuck ? " · stuck" : ""}
    </span>
  );
}
