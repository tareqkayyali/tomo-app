"use client";

/**
 * Admin → Triangle Input Registry audit (P5.4, 2026-04-18).
 *
 * Forensic view of what coach/parent inputs the AI prompt builder
 * would inject for a given athlete + the full ledger (including
 * retracted / hidden rows). Answers the "why did the AI say X"
 * debugging question.
 */

import { useCallback, useState } from "react";

interface Author {
  id: string;
  name: string | null;
  email: string | null;
}

interface RankedRow {
  id: string;
  authorRole: string;
  author: Author;
  domain: string;
  inputType: string;
  body: string;
  baseWeight: number;
  effectiveWeight: number;
  createdAt: string;
}

interface LedgerRow {
  id: string;
  authorRole: string;
  author: Author;
  domain: string;
  inputType: string;
  body: string;
  eventScopeId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  retractedAt: string | null;
  retractedReason: string | null;
  moderationState: string;
  createdAt: string;
}

interface Response {
  athlete: { id: string; name: string | null; email: string | null; date_of_birth: string | null } | null;
  tier: "T1" | "T2" | "T3" | "UNKNOWN";
  rankedCount: number;
  rankedTop: RankedRow[];
  ledger: LedgerRow[];
}

export default function TriangleInputsAdminPage() {
  const [athleteId, setAthleteId] = useState("");
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!athleteId.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(
        `/api/v1/admin/triangle-inputs?athlete_id=${encodeURIComponent(athleteId.trim())}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `fetch failed: ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Triangle inputs audit</h1>
        <p className="text-sm text-neutral-500 mt-1">
          What coach/parent inputs the AI would see for a given athlete,
          plus the full ledger (incl. retracted / hidden) for forensic
          debugging.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={athleteId}
          onChange={(e) => setAthleteId(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          placeholder="Athlete UUID"
          className="flex-1 max-w-md px-3 py-1.5 rounded-md border border-neutral-300 text-sm font-mono"
        />
        <button
          onClick={search}
          disabled={!athleteId.trim() || loading}
          className="px-3 py-1.5 rounded-md bg-black text-white text-sm disabled:opacity-50"
        >
          {loading ? "Loading…" : "Lookup"}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="rounded border border-neutral-200 p-4 bg-white">
            <div className="text-sm font-semibold">
              {data.athlete?.name ?? "Unknown"}{" "}
              <span className="text-xs font-normal text-neutral-500">
                {data.athlete?.email ?? data.athlete?.id}
              </span>
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              tier: <span className="font-medium">{data.tier}</span>
              {" · "}
              DOB: {data.athlete?.date_of_birth ?? "unset"}
              {" · "}
              {data.rankedCount} active input{data.rankedCount === 1 ? "" : "s"} in prompt
            </div>
          </div>

          {/* Ranked view — what the AI sees today */}
          <section>
            <h2 className="text-lg font-semibold mb-2">Prompt injection (live)</h2>
            <div className="rounded border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-neutral-500 bg-neutral-50">
                  <tr>
                    <th className="py-2 px-3">Author</th>
                    <th className="py-2 px-3">Domain</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Body</th>
                    <th className="py-2 px-3 text-right">Base</th>
                    <th className="py-2 px-3 text-right">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rankedTop.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-neutral-500">
                        No ranked inputs — AI sees an empty Triangle block for this athlete.
                      </td>
                    </tr>
                  ) : (
                    data.rankedTop.map((r) => (
                      <tr key={r.id} className="border-t border-neutral-100">
                        <td className="py-2 px-3">
                          <div className="text-xs">{r.author.name ?? "—"}</div>
                          <div className="text-xs text-neutral-500 capitalize">{r.authorRole}</div>
                        </td>
                        <td className="py-2 px-3 capitalize">{r.domain}</td>
                        <td className="py-2 px-3 text-xs">{r.inputType}</td>
                        <td className="py-2 px-3 max-w-md">
                          <div className="truncate">{r.body}</div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs">
                          {r.baseWeight.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs font-medium">
                          {r.effectiveWeight.toFixed(3)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Full ledger */}
          <section>
            <h2 className="text-lg font-semibold mb-2">Full ledger</h2>
            <div className="rounded border border-neutral-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-neutral-500 bg-neutral-50">
                  <tr>
                    <th className="py-2 px-3">Author</th>
                    <th className="py-2 px-3">Domain / Type</th>
                    <th className="py-2 px-3">Body</th>
                    <th className="py-2 px-3">State</th>
                    <th className="py-2 px-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-neutral-500">
                        No inputs in the ledger.
                      </td>
                    </tr>
                  ) : (
                    data.ledger.map((r) => (
                      <tr key={r.id} className="border-t border-neutral-100">
                        <td className="py-2 px-3 align-top">
                          <div className="text-xs">{r.author.name ?? "—"}</div>
                          <div className="text-xs text-neutral-500 capitalize">{r.authorRole}</div>
                        </td>
                        <td className="py-2 px-3 align-top text-xs">
                          <div className="capitalize">{r.domain}</div>
                          <div className="text-neutral-500">{r.inputType}</div>
                          {r.eventScopeId && (
                            <div className="text-neutral-400 font-mono truncate max-w-[120px]">
                              event {r.eventScopeId.slice(0, 8)}…
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 align-top max-w-md text-xs">
                          <div className="line-clamp-3">{r.body}</div>
                          {r.retractedReason && (
                            <div className="text-neutral-500 mt-1 italic">
                              retracted: {r.retractedReason}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 align-top text-xs">
                          <StateBadge state={r.moderationState} retracted={!!r.retractedAt} />
                        </td>
                        <td className="py-2 px-3 align-top text-xs text-neutral-500">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StateBadge({ state, retracted }: { state: string; retracted: boolean }) {
  if (retracted) {
    return (
      <span className="inline-block px-2 py-0.5 rounded border text-xs font-medium bg-neutral-100 text-neutral-500 border-neutral-200">
        retracted
      </span>
    );
  }
  const tone =
    state === "cleared" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    state === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
    state === "hidden" ? "bg-red-50 text-red-700 border-red-200" :
    "bg-neutral-100 text-neutral-500 border-neutral-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium capitalize ${tone}`}>
      {state}
    </span>
  );
}
