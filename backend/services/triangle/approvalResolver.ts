// Triangle — approval resolver.
//
// Pure function. Zero I/O. Given an approval request + the decision
// chain so far + the athlete's age tier, returns the resolved status +
// who/why. Callers persist the result; this module never touches the DB.
//
// Parent-supersedes-coach rule:
//   - T1 / T2 minors: a parent decision is ALWAYS authoritative. Even
//     if the coach approved first, a subsequent parent decline
//     (or approval) overrides. Parent-supersedes-coach is the default
//     supersede_rule for T1/T2 approval requests created by the API.
//   - T3: default first_decision rule applies unless explicit opt-in.
//
// Safety gates are out of scope of this module. Approval is a human
// authority signal; the ACWR / PHV filter is applied deterministically
// at the call site (programPublish etc.) AFTER the approval resolves.

import type { AgeTier } from "@/types";

export type ApproverRole = "parent" | "coach" | "athlete" | "system";
export type Decision = "accept" | "decline" | "edit";
export type SupersedeRule = "first_decision" | "parent_supersedes_coach" | "unanimous";
export type ResolvedStatus = "pending" | "accepted" | "edited" | "declined" | "expired";

export interface ChainEntry {
  role: ApproverRole;
  user_id: string;
  decision: Decision;
  at: string; // ISO
  notes?: string;
}

export interface ApprovalRequestMeta {
  ageTier: AgeTier;
  requiredApproverRole: ApproverRole | null;
  supersedeRule: SupersedeRule;
  // When unanimous, callers pass the full set of approvers expected.
  // first_decision / parent_supersedes_coach only need requiredApproverRole.
  requiredApprovers?: ApproverRole[];
}

export interface ResolvedResult {
  status: ResolvedStatus;
  resolvedBy?: string;     // user_id from the decision that resolved
  resolvedByRole?: ApproverRole;
  rationale: string;       // human-readable for audit + UI
}

const STILL_PENDING: ResolvedResult = {
  status: "pending",
  rationale: "awaiting required approver",
};

// Sort the decision chain oldest-first so we can walk it deterministically.
function byAtAsc(a: ChainEntry, b: ChainEntry): number {
  return a.at.localeCompare(b.at);
}

function firstBy(
  chain: ChainEntry[],
  predicate: (e: ChainEntry) => boolean
): ChainEntry | null {
  for (const e of chain) if (predicate(e)) return e;
  return null;
}

export function resolveApproval(
  meta: ApprovalRequestMeta,
  chain: ChainEntry[]
): ResolvedResult {
  const sorted = [...chain].sort(byAtAsc);

  // ── parent_supersedes_coach ────────────────────────────────────────
  // Used for T1/T2 minors. A parent decision is final; if no parent
  // decision yet, we wait even if the coach has already decided.
  if (meta.supersedeRule === "parent_supersedes_coach") {
    const parentDecision = firstBy(sorted, (e) => e.role === "parent");
    if (parentDecision) {
      // Coach may have decided earlier; parent overrides.
      const coachFirst = firstBy(sorted, (e) => e.role === "coach");
      const overrode = coachFirst != null && coachFirst.decision !== parentDecision.decision;
      return {
        status: mapDecision(parentDecision.decision),
        resolvedBy: parentDecision.user_id,
        resolvedByRole: "parent",
        rationale: overrode
          ? "parent decision overrides earlier coach decision (T1/T2 minor)"
          : "parent decision",
      };
    }
    // No parent decision yet. Even if coach has accepted, we wait.
    return {
      status: "pending",
      rationale: "parent approval required (T1/T2 minor) — awaiting parent",
    };
  }

  // ── first_decision ─────────────────────────────────────────────────
  // The earliest decision from the required approver role resolves.
  if (meta.supersedeRule === "first_decision") {
    if (meta.requiredApproverRole) {
      const d = firstBy(sorted, (e) => e.role === meta.requiredApproverRole);
      if (!d) return STILL_PENDING;
      return {
        status: mapDecision(d.decision),
        resolvedBy: d.user_id,
        resolvedByRole: meta.requiredApproverRole,
        rationale: `${meta.requiredApproverRole} decision (first_decision)`,
      };
    }
    // No required role — take any first decision.
    const d = sorted[0];
    if (!d) return STILL_PENDING;
    return {
      status: mapDecision(d.decision),
      resolvedBy: d.user_id,
      resolvedByRole: d.role,
      rationale: `${d.role} decision (first_decision, no required role)`,
    };
  }

  // ── unanimous ──────────────────────────────────────────────────────
  // Every role in requiredApprovers must accept; any decline resolves.
  if (meta.supersedeRule === "unanimous") {
    const required = meta.requiredApprovers ?? [];
    if (required.length === 0) {
      // Nothing required → empty unanimity is vacuously satisfied.
      return { status: "accepted", rationale: "unanimous (no approvers required)" };
    }

    // Any decline resolves immediately.
    const firstDecline = firstBy(sorted, (e) => e.decision === "decline");
    if (firstDecline) {
      return {
        status: "declined",
        resolvedBy: firstDecline.user_id,
        resolvedByRole: firstDecline.role,
        rationale: `unanimous failed — ${firstDecline.role} declined`,
      };
    }

    // Check that every required role has accepted.
    const acceptedRoles = new Set(
      sorted.filter((e) => e.decision === "accept").map((e) => e.role)
    );
    const missing = required.filter((r) => !acceptedRoles.has(r));
    if (missing.length === 0) {
      const last = sorted[sorted.length - 1];
      return {
        status: "accepted",
        resolvedBy: last?.user_id,
        resolvedByRole: last?.role,
        rationale: "unanimous — all required approvers accepted",
      };
    }

    // Any edit in the chain? edit is neither accept nor decline — treat
    // as "still waiting" but surface the edit marker in rationale.
    const lastEdit = firstBy(sorted.slice().reverse(), (e) => e.decision === "edit");
    return {
      status: lastEdit ? "edited" : "pending",
      rationale: lastEdit
        ? `unanimous — ${lastEdit.role} proposed an edit; awaiting ${missing.join(",")}`
        : `unanimous — awaiting ${missing.join(",")}`,
    };
  }

  // Exhaustive — should never hit.
  return STILL_PENDING;
}

function mapDecision(d: Decision): ResolvedStatus {
  if (d === "accept") return "accepted";
  if (d === "decline") return "declined";
  return "edited";
}

// ── Convenience: pick default supersede rule from tier ──────────────
// Called at creation time to set suggestions.supersede_rule. T1/T2 →
// parent_supersedes_coach; T3 → first_decision unless caller overrides.
export function defaultSupersedeRuleForTier(tier: AgeTier): SupersedeRule {
  if (tier === "T1" || tier === "T2" || tier === "UNKNOWN") {
    return "parent_supersedes_coach";
  }
  return "first_decision";
}
