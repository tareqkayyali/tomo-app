"use client";

/**
 * Admin → Consent documents + version management (P5.3, 2026-04-18).
 *
 * Manages the consent_documents ledger per migration 065. Bumping a
 * version marks every active grant of that consent_type for re-consent
 * with a 30-day grace window (hard-gated server-side). This page shows
 * the current version matrix + a Dry-Run preview of how many users a
 * bump would affect BEFORE writing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

interface VersionRow {
  version: string;
  consent_type: string;
  jurisdiction: string;
  body_hash: string;
  title: string | null;
  effective_at: string;
  retired_at: string | null;
}

interface Group {
  key: string;
  consentType: string;
  jurisdiction: string;
  versions: VersionRow[];
}

const VALID_CONSENT_TYPES = [
  "tos", "privacy", "coppa_parental", "gdpr_k_parental",
  "ccpa_sale_optout", "analytics", "marketing", "ai_coaching",
  "coach_visibility", "parent_visibility", "moderated_content_view",
] as const;

type ConsentType = (typeof VALID_CONSENT_TYPES)[number];

export default function ConsentsAdminPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bump form state
  const [consentType, setConsentType] = useState<ConsentType>("privacy");
  const [jurisdiction, setJurisdiction] = useState("GLOBAL");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [dryResult, setDryResult] = useState<{ affectedUsers: number; hash: string; version: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/admin/consents", { credentials: "include" });
      if (!res.ok) throw new Error(`consents fetch failed: ${res.status}`);
      const json = await res.json();
      setGroups(json.groups ?? []);
      setCounts(json.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const formValid = useMemo(() => {
    return (
      VALID_CONSENT_TYPES.includes(consentType) &&
      jurisdiction.trim().length > 0 &&
      /^\d+\.\d+\.\d+$/.test(version.trim()) &&
      bodyMd.trim().length >= 10
    );
  }, [consentType, jurisdiction, version, bodyMd]);

  const runDry = useCallback(async () => {
    setSubmitting(true);
    setFormError(null);
    setDryResult(null);
    try {
      const res = await fetch("/api/v1/admin/consents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentType,
          jurisdiction: jurisdiction.trim(),
          version: version.trim(),
          title: title.trim() || undefined,
          bodyMd,
          dryRun: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `dry-run failed: ${res.status}`);
      setDryResult({ affectedUsers: json.affectedUsers, hash: json.hash, version: json.version });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [consentType, jurisdiction, version, title, bodyMd]);

  const publish = useCallback(async () => {
    if (!dryResult) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/v1/admin/consents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentType,
          jurisdiction: jurisdiction.trim(),
          version: version.trim(),
          title: title.trim() || undefined,
          bodyMd,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `publish failed: ${res.status}`);
      setDryResult(null);
      setVersion("");
      setBodyMd("");
      setTitle("");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [dryResult, consentType, jurisdiction, version, title, bodyMd, load]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Consent documents</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Versioned legal text ledger. Publishing a new version marks every
          active grant of that consent_type for re-consent with a 30-day
          grace window. Dry-run first to preview impact.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ─── Publish form ─── */}
      <section className="rounded border border-neutral-200 p-4 space-y-3 bg-white">
        <h2 className="text-lg font-semibold">Bump a version</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">Consent type</span>
            <select
              value={consentType}
              onChange={(e) => setConsentType(e.target.value as ConsentType)}
              className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm"
            >
              {VALID_CONSENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">Jurisdiction</span>
            <input
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="GLOBAL, US-CA, EU, UK, UAE, KSA"
              className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-neutral-500 mb-1">Version (semver)</span>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.1.0"
              className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm"
            />
          </label>
        </div>
        <label className="text-sm block">
          <span className="block text-xs text-neutral-500 mb-1">Title (optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Terms of Service"
            className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm"
          />
        </label>
        <label className="text-sm block">
          <span className="block text-xs text-neutral-500 mb-1">Body markdown</span>
          <textarea
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={8}
            placeholder="Paste the full legal text. sha256 is computed server-side for the audit trail."
            className="w-full px-2 py-1.5 rounded border border-neutral-300 text-sm font-mono"
          />
        </label>

        {formError && (
          <div className="text-sm text-red-700">{formError}</div>
        )}

        {dryResult && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">
              Dry-run: {dryResult.affectedUsers} user{dryResult.affectedUsers === 1 ? "" : "s"} would need to re-consent.
            </div>
            <div className="text-xs mt-1">
              version {dryResult.version} · sha256 {dryResult.hash.slice(0, 16)}…
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={runDry}
            disabled={!formValid || submitting}
            className="px-3 py-1.5 rounded-md border border-neutral-300 text-sm disabled:opacity-50"
          >
            {submitting ? "Running…" : "Dry run"}
          </button>
          <button
            onClick={publish}
            disabled={!dryResult || submitting}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
          >
            Publish new version
          </button>
        </div>
      </section>

      {/* ─── Version matrix ─── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Current versions</h2>
        {loading ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="text-sm text-neutral-500">No consent documents published yet.</div>
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => {
              const latest = g.versions[0];
              const retired = g.versions.filter((v) => v.retired_at);
              return (
                <div key={g.key} className="rounded border border-neutral-200 p-4 bg-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        {g.consentType}{" "}
                        <span className="text-xs font-normal text-neutral-500">· {g.jurisdiction}</span>
                      </div>
                      {latest && (
                        <div className="text-xs text-neutral-500 mt-0.5">
                          latest: v{latest.version}
                          {latest.title ? ` · ${latest.title}` : ""}
                          {" · "}
                          {new Date(latest.effective_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {counts[g.consentType] ?? 0} active grant{(counts[g.consentType] ?? 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  {g.versions.length > 1 && (
                    <div className="mt-2 text-xs text-neutral-500">
                      history: {g.versions.slice(1).map((v) => `v${v.version}`).join(", ")}
                      {retired.length > 0 ? ` · ${retired.length} retired` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
