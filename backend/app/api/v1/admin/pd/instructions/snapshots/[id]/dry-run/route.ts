import { NextRequest, NextResponse } from "next/server";
import { requireEnterprise } from "@/lib/admin/enterpriseAuth";
import {
  getLiveSnapshot,
  getSnapshot,
} from "@/services/admin/snapshotService";
import {
  matchesScope,
  sortByPriority,
  type ResolvedDirective,
  type ResolveScope,
  type Audience,
} from "@/services/instructions/resolver";

interface DryRunCollision {
  directive_type: string;
  scope_summary: string;
  winner: ResolvedDirective;
  shadowed: ResolvedDirective[];
}

interface DryRunSummary {
  directive_type: string;
  winner_id: string;
  plain_english: string;
  source_name: string;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function nameFor(d: ResolvedDirective): string {
  const p = d.payload ?? {};
  const candidate =
    asString((p as any).name) ||
    asString((p as any).title) ||
    asString((p as any).label);
  if (candidate) return candidate;
  if (d.source_excerpt) {
    const trimmed = d.source_excerpt.trim().slice(0, 60);
    return trimmed.length < d.source_excerpt.trim().length ? `${trimmed}…` : trimmed;
  }
  return "(unnamed rule)";
}

function plainEnglishFor(d: ResolvedDirective): string {
  const p = d.payload ?? {};
  const t = d.directive_type;
  switch (t) {
    case "identity": {
      const text = asString((p as any).text) || asString((p as any).description);
      if (!text) return "Persona defined (no text on this rule).";
      return text.length > 240 ? `${text.slice(0, 240)}…` : text;
    }
    case "tone": {
      const banned = asArray<string>((p as any).banned_phrases).map(String);
      const scaffold = asArray<string>((p as any).scaffolded_acronyms).map(String);
      const bits: string[] = [];
      if (banned.length) bits.push(`Avoid: ${banned.join(", ")}`);
      if (scaffold.length) bits.push(`Always explain: ${scaffold.join(", ")}`);
      return bits.length ? bits.join(" · ") : asString((p as any).summary) || "Tone rules apply.";
    }
    case "response_shape": {
      const sentenceCap = asNumber((p as any).max_sentences);
      const bullets = (p as any).allow_bullets;
      const emoji = asString((p as any).emoji_density);
      const bits: string[] = [];
      if (sentenceCap !== null) bits.push(`Up to ${sentenceCap} sentence${sentenceCap === 1 ? "" : "s"}`);
      if (typeof bullets === "boolean") bits.push(bullets ? "Bullets allowed" : "No bullets");
      if (emoji) bits.push(`Emoji: ${emoji}`);
      return bits.length ? bits.join(" · ") : "Reply shape rules apply.";
    }
    case "guardrail_phv": {
      const blocks = asArray<string>((p as any).blocked_exercises).map(String);
      const advisory = (p as any).advisory_only;
      const head = blocks.length ? `Blocks: ${blocks.join(", ")}` : "Growth-spurt guardrails apply.";
      return advisory ? `${head} (advisory)` : head;
    }
    case "guardrail_age": {
      const blocks = asArray<string>((p as any).blocked).map(String);
      return blocks.length ? `Age restrictions: ${blocks.join(", ")}` : "Age guardrails apply.";
    }
    case "guardrail_load": {
      const acwr = (p as any).acwr_max;
      const note = asNumber(acwr);
      return note !== null ? `Workload cap: ACWR ≤ ${note}` : "Workload safety rules apply.";
    }
    case "escalation": {
      const trigger = asString((p as any).trigger) || asString((p as any).condition);
      const audience = asArray<string>((p as any).notify).join(", ");
      if (trigger && audience) return `Alert ${audience} when ${trigger}`;
      if (trigger) return `Alert when ${trigger}`;
      return "Escalation rule applies.";
    }
    case "dashboard_section":
    case "signal_definition":
    case "program_rule": {
      const title = asString((p as any).title) || asString((p as any).label) || asString((p as any).name);
      const desc = asString((p as any).description) || asString((p as any).summary);
      if (title && desc) return `${title} — ${desc}`;
      if (title) return title;
      return "Dashboard / programs rule applies.";
    }
    default: {
      const summary = asString((p as any).summary);
      if (summary) return summary;
      try {
        const json = JSON.stringify(p);
        return json.length > 140 ? `${json.slice(0, 140)}…` : json;
      } catch {
        return "Rule applies.";
      }
    }
  }
}

function describeScopeShort(d: ResolvedDirective): string {
  const parts: string[] = [];
  if (d.position_scope.length) parts.push(d.position_scope.join("/"));
  if (d.age_scope.length) parts.push(d.age_scope.join("/"));
  if (d.sport_scope.length) parts.push(d.sport_scope.join("/"));
  if (d.mode_scope.length) parts.push(`during ${d.mode_scope.join("/")}`);
  if (parts.length === 0) return d.audience === "all" ? "Everyone" : d.audience;
  return parts.join(" ");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireEnterprise(req, "institutional_pd");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const url = new URL(req.url);
  const scope: ResolveScope = {
    audience: (url.searchParams.get("audience") as Audience) || "athlete",
    sport: url.searchParams.get("sport"),
    age_band: url.searchParams.get("age_band"),
    phv_stage: url.searchParams.get("phv_stage"),
    position: url.searchParams.get("position"),
    mode: url.searchParams.get("mode"),
  };

  try {
    const snap = id === "live" ? await getLiveSnapshot() : await getSnapshot(id);
    if (!snap) {
      return NextResponse.json(
        { error: "Snapshot not found" },
        { status: 404 },
      );
    }

    const raw = (snap.directives ?? []) as any[];
    const all: ResolvedDirective[] = raw.map((d) => ({
      id: String(d.id ?? ""),
      document_id: d.document_id ?? null,
      directive_type: String(d.directive_type),
      audience: (d.audience as Audience) ?? "all",
      sport_scope: Array.isArray(d.sport_scope) ? d.sport_scope : [],
      age_scope: Array.isArray(d.age_scope) ? d.age_scope : [],
      phv_scope: Array.isArray(d.phv_scope) ? d.phv_scope : [],
      position_scope: Array.isArray(d.position_scope) ? d.position_scope : [],
      mode_scope: Array.isArray(d.mode_scope) ? d.mode_scope : [],
      priority: typeof d.priority === "number" ? d.priority : 100,
      payload: (d.payload ?? {}) as Record<string, unknown>,
      source_excerpt: d.source_excerpt ?? null,
      status: String(d.status ?? "published"),
      schema_version: typeof d.schema_version === "number" ? d.schema_version : 1,
      updated_at: d.updated_at ?? null,
    }));

    const matches = all.filter((d) => matchesScope(d, scope));

    // Group matches by directive_type — within a single profile scope, anything
    // sharing a type is competing for that byType slot.
    const byType = new Map<string, ResolvedDirective[]>();
    for (const m of matches) {
      const arr = byType.get(m.directive_type);
      if (arr) arr.push(m);
      else byType.set(m.directive_type, [m]);
    }

    const collisions: DryRunCollision[] = [];
    const summaries: DryRunSummary[] = [];

    for (const [type, members] of byType) {
      const sorted = sortByPriority(members);
      const winner = sorted[0];
      summaries.push({
        directive_type: type,
        winner_id: winner.id,
        plain_english: plainEnglishFor(winner),
        source_name: nameFor(winner),
      });
      if (sorted.length > 1) {
        const [w, ...shadowed] = sorted;
        collisions.push({
          directive_type: type,
          scope_summary: describeScopeShort(w),
          winner: w,
          shadowed,
        });
      }
    }

    return NextResponse.json({
      snapshot: {
        id: snap.id,
        label: snap.label,
        is_live: snap.is_live,
        published_at: snap.published_at,
      },
      scope,
      matches,
      collisions,
      summaries,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Dry-run failed", detail: String(err) },
      { status: 500 },
    );
  }
}
