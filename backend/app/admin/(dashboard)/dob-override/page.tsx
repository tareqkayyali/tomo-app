"use client";

/**
 * Admin → DOB override (P5.4, 2026-04-18).
 *
 * Emergency escape hatch for the one-way younger-DOB gate. Admins
 * change a user's date_of_birth (typo fix, verification-dispute
 * correction, gov-ID upgrade). Every change writes to
 * admin_override_log with action='dob_older_change' and before/after
 * tier.
 */

import { useCallback, useState } from "react";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  dateOfBirth: string | null;
  tier: "T1" | "T2" | "T3" | "UNKNOWN";
  consentStatus: string | null;
  createdAt: string;
}

export default function DobOverrideAdminPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<UserRow | null>(null);
  const [newDob, setNewDob] = useState("");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    tierBefore: string; tierAfter: string; tierFlipped: boolean
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/admin/users/lookup?q=${encodeURIComponent(q.trim())}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `lookup failed: ${res.status}`);
      setResults(json.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }, [q]);

  const select = (u: UserRow) => {
    setTarget(u);
    setNewDob(u.dateOfBirth ?? "");
    setJustification("");
    setSubmitResult(null);
    setSubmitError(null);
  };

  const submit = useCallback(async () => {
    if (!target) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    try {
      const res = await fetch(
        `/api/v1/admin/users/${target.id}/dob-override`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date_of_birth: newDob, justification }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `override failed: ${res.status}`);
      setSubmitResult({
        tierBefore: json.tierBefore,
        tierAfter: json.tierAfter,
        tierFlipped: json.tierFlipped,
      });
      // Refresh lookup so the row reflects new DOB
      if (q.trim()) search();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [target, newDob, justification, q, search]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">DOB override</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Admin-only escape hatch for the one-way younger-DOB gate.
          Every change writes to admin_override_log with mandatory
          justification + before/after tier.
        </p>
      </div>

      {/* ─── User lookup ─── */}
      <section className="rounded border border-neutral-200 p-4 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            placeholder="UUID, email, or name fragment"
            className="flex-1 px-3 py-1.5 rounded-md border border-neutral-300 text-sm"
          />
          <button
            onClick={search}
            disabled={!q.trim() || searching}
            className="px-3 py-1.5 rounded-md bg-black text-white text-sm disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        {error && <div className="text-sm text-red-700">{error}</div>}
        {results.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-1 pr-3">Name</th>
                <th className="py-1 pr-3">Email</th>
                <th className="py-1 pr-3">Role</th>
                <th className="py-1 pr-3">DOB</th>
                <th className="py-1 pr-3">Tier</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((u) => (
                <tr key={u.id} className="border-t border-neutral-100">
                  <td className="py-1 pr-3">{u.name ?? "—"}</td>
                  <td className="py-1 pr-3 text-neutral-600">{u.email ?? "—"}</td>
                  <td className="py-1 pr-3 capitalize">{u.role ?? "—"}</td>
                  <td className="py-1 pr-3 tabular-nums">{u.dateOfBirth ?? "—"}</td>
                  <td className="py-1 pr-3">
                    <span className="inline-block px-2 py-0.5 rounded border text-xs font-medium bg-neutral-50">
                      {u.tier}
                    </span>
                  </td>
                  <td className="py-1 text-right">
                    <button
                      onClick={() => select(u)}
                      className="text-xs underline text-blue-700"
                    >
                      Override DOB
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ─── Override form ─── */}
      {target && (
        <section className="rounded border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Override DOB for {target.name ?? target.email}</h2>
            <div className="text-xs text-neutral-600 mt-1">
              current DOB: {target.dateOfBirth ?? "unset"}
              {" · "}
              current tier: {target.tier}
              {" · "}
              consent: {target.consentStatus ?? "—"}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-neutral-500 mb-1">New DOB (YYYY-MM-DD)</span>
              <input
                value={newDob}
                onChange={(e) => setNewDob(e.target.value)}
                placeholder="2012-06-15"
                className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm font-mono"
              />
            </label>
          </div>
          <label className="text-sm block">
            <span className="block text-xs text-neutral-500 mb-1">Justification (10+ chars, required)</span>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="e.g. 'Signup typo — parent confirmed via SUP-417'"
              className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm"
            />
          </label>

          {submitError && <div className="text-sm text-red-700">{submitError}</div>}
          {submitResult && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              <div className="font-medium">DOB updated.</div>
              <div className="text-xs mt-1">
                tier {submitResult.tierBefore} → {submitResult.tierAfter}
                {submitResult.tierFlipped ? " (flipped)" : ""}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTarget(null)}
              disabled={submitting}
              className="px-3 py-1.5 rounded-md border border-neutral-300 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={
                submitting ||
                !/^\d{4}-\d{2}-\d{2}$/.test(newDob) ||
                justification.trim().length < 10
              }
              className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm disabled:opacity-50"
            >
              {submitting ? "Applying…" : "Apply override"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
