import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { EnterpriseUser } from "@/lib/admin/enterpriseAuth";

/**
 * Admin audit log — append-only trail of CMS mutations.
 *
 * Every mutation performed by the admin panel should call `logAudit`
 * after the write commits. Failures are swallowed (logged to console
 * only) so audit-log problems never cascade into user-facing errors —
 * but a missing log row is still a bug.
 *
 * Schema: backend/supabase/migrations/00000000000076_admin_audit_log.sql
 * Viewer: /admin/audit
 */

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "activate"
  | "deactivate"
  | "role_change"
  | "impersonate_start"
  | "impersonate_end"
  | "bulk_import"
  | "config_change";

export interface AuditInput {
  actor: EnterpriseUser;
  action: AuditAction;
  resource_type: string;
  /** UUID or natural identifier (e.g. program name, flag key). */
  resource_id?: string | null;
  /**
   * Context for the audit viewer. For updates, prefer
   * `{ before: {...}, after: {...} }` so reviewers can diff.
   */
  metadata?: Record<string, unknown>;
  /** Tenant scope. Defaults to the actor's primary tenant. */
  tenant_id?: string | null;
  /** Request handle for IP + user-agent capture. Optional. */
  req?: NextRequest;
}

/**
 * Write one audit row. Non-throwing — a failure here must never block
 * the caller's response. Logs to stderr so CI / Railway logs surface
 * persistence errors.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const row = {
      actor_id: input.actor.id,
      actor_email: input.actor.email || null,
      actor_role: input.actor.primaryRole,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id ?? null,
      tenant_id: input.tenant_id ?? input.actor.primaryTenantId ?? null,
      metadata: input.metadata ?? {},
      ip_address: input.req ? extractIp(input.req) : null,
      user_agent: input.req ? input.req.headers.get("user-agent") : null,
    };

    // admin_audit_log not in generated types until regen — cast via any.
    const { error } = await db.from("admin_audit_log").insert(row);

    if (error) {
      console.error("[audit] insert failed:", error.message, row);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[audit] logAudit threw:", message);
  }
}

function extractIp(req: NextRequest): string | null {
  // Railway/Fastly chain: x-forwarded-for is the canonical source.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || null;
}
