"use client";

/**
 * Admin → Relationships review + force-revoke (P5.1, 2026-04-18).
 *
 * Lists every coach/parent ↔ athlete relationship with filters on
 * status + type + search. Force Revoke is the emergency escape hatch
 * for compromised / abandoned relationships — writes to
 * admin_override_log with mandatory justification.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "pending" | "accepted" | "revoked";
type Role = "coach" | "parent";

interface Row {
  id: string;
  relationshipType: Role;
  status: Status;
  createdAt: string;
  guardian: { id: string; name: string | null; email: string | null; role: string | null };
  player: {
    id: string;
    name: string | null;
    email: string | null;
    role: string | null;
    date_of_birth: string | null;
  };
}

const STATUS_FILTERS: Array<{ label: string; value: Status | "all" }> = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Accepted", value: "accepted" },
  { label: "Revoked", value: "revoked" },
];

const TYPE_FILTERS: Array<{ label: string; value: Role | "all" }> = [
  { label: "All types", value: "all" },
  { label: "Coach", value: "coach" },
  { label: "Parent", value: "parent" },
];

export default function RelationshipsAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [typeFilter, setTypeFilter] = useState<Role | "all">("all");
  const [q, setQ] = useState("");

  const [revokeTarget, setRevokeTarget] = useState<Row | null>(null);
  const [justification, setJustification] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/v1/admin/relationships?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`admin relationships fetch failed: ${res.status}`);
      const json = await res.json();
      setRows(json.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, q]);

  useEffect(() => {
    const id = setTimeout(load, q.trim() ? 250 : 0); // debounce search
    return () => clearTimeout(id);
  }, [load, q]);

  const submitRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/relationships/${revokeTarget.id}/force-revoke`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ justification }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `force-revoke failed: ${res.status}`);
      }
      setRevokeTarget(null);
      setJustification("");
      await load();
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevoking(false);
    }
  }, [revokeTarget, justification, load]);

  const closeModal = () => {
    setRevokeTarget(null);
    setJustification("");
    setRevokeError(null);
  };

  const stats = useMemo(() => {
    const counts = { pending: 0, accepted: 0, revoked: 0 };
    for (const r of rows) counts[r.status]++;
    return counts;
  }, [rows]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Relationships</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Coach/parent ↔ athlete relationship audit. Force revoke writes
          to admin_override_log with mandatory justification.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={
                "px-3 py-1 rounded-full text-sm font-medium transition " +
                (statusFilter === f.value
                  ? "bg-white text-black shadow-sm"
                  : "text-neutral-600 hover:text-black")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={
                "px-3 py-1 rounded-full text-sm font-medium transition " +
                (typeFilter === f.value
                  ? "bg-white text-black shadow-sm"
                  : "text-neutral-600 hover:text-black")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / email…"
          className="flex-1 min-w-[220px] px-3 py-1.5 rounded-md border border-neutral-200 text-sm"
        />
        <span className="text-xs text-neutral-500">
          {rows.length} total · {stats.pending} pending · {stats.accepted} accepted · {stats.revoked} revoked
        </span>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-neutral-500 bg-neutral-50 border-b">
            <tr>
              <th className="py-2 px-3">Guardian</th>
              <th className="py-2 px-3">Role</th>
              <th className="py-2 px-3">Player</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Created</th>
              <th className="py-2 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-500">
                  No relationships match these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2 px-3">
                    <div className="font-medium">{r.guardian.name ?? "—"}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[220px]">
                      {r.guardian.email}
                    </div>
                  </td>
                  <td className="py-2 px-3 capitalize">{r.relationshipType}</td>
                  <td className="py-2 px-3">
                    <div className="font-medium">{r.player.name ?? "—"}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[220px]">
                      {r.player.email}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 px-3 text-xs text-neutral-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => setRevokeTarget(r)}
                      disabled={r.status === "revoked"}
                      className={
                        "px-3 py-1 text-xs rounded-md border " +
                        (r.status === "revoked"
                          ? "border-neutral-200 text-neutral-400 cursor-not-allowed"
                          : "border-red-300 text-red-700 hover:bg-red-50")
                      }
                    >
                      {r.status === "revoked" ? "Revoked" : "Force revoke"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Force-revoke modal */}
      {revokeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Force revoke relationship</h2>
            <p className="text-sm text-neutral-600 mt-1">
              {revokeTarget.guardian.name ?? "Guardian"} ({revokeTarget.relationshipType}) ↔{" "}
              {revokeTarget.player.name ?? "Player"}
            </p>
            <p className="text-xs text-neutral-500 mt-2">
              A justification (10+ chars) is required and written to
              admin_override_log for audit.
            </p>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Reason for force revoke (e.g. 'Compromised account per SEC-ticket-123')"
              rows={3}
              className="mt-3 w-full px-3 py-2 rounded border border-neutral-300 text-sm"
            />
            {revokeError && (
              <div className="mt-2 text-xs text-red-700">{revokeError}</div>
            )}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={closeModal}
                disabled={revoking}
                className="px-3 py-1.5 rounded-md border border-neutral-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitRevoke}
                disabled={revoking || justification.trim().length < 10}
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm disabled:opacity-50"
              >
                {revoking ? "Revoking…" : "Force revoke"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const tone =
    status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-neutral-100 text-neutral-600 border-neutral-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}
