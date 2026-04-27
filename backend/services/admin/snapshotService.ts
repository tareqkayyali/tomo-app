/**
 * Methodology Snapshot Service — Phase 2
 *
 * Snapshots are immutable frozen sets of directives. Exactly one row in
 * methodology_publish_snapshots has is_live = TRUE at any time (enforced
 * by partial unique index in the migration).
 *
 * Publishing flow:
 *   1. Gather all directives in status 'approved' or 'published'.
 *   2. Stamp them as 'published' (so future approvals don't accidentally
 *      ship until the next snapshot).
 *   3. Create the snapshot row with the resolved directive set as JSONB.
 *   4. Atomically swap is_live: clear the old live row, mark this one live.
 *
 * Rollback: clear is_live on the current live row, set it on the target.
 * The target snapshot's directives remain frozen — rollback is safe.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateInstructionsCache } from "@/services/instructions/resolver";
import { listDirectives, type MethodologyDirective } from "./directiveService";

const TABLE = "methodology_publish_snapshots";
const DIRECTIVES_TABLE = "methodology_directives";

const db = () => supabaseAdmin();

export interface PublishSnapshot {
  id: string;
  label: string;
  notes: string | null;
  directive_count: number;
  schema_version: number;
  is_live: boolean;
  published_by: string | null;
  published_at: string;
  retired_at: string | null;
}

export interface PublishSnapshotFull extends PublishSnapshot {
  directives: any[]; // resolved frozen directives
}

export async function listSnapshots(): Promise<PublishSnapshot[]> {
  const { data, error } = await (db() as any)
    .from(TABLE)
    .select("id,label,notes,directive_count,schema_version,is_live,published_by,published_at,retired_at")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PublishSnapshot[];
}

export async function getSnapshot(id: string): Promise<PublishSnapshotFull | null> {
  const { data, error } = await (db() as any)
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PublishSnapshotFull | null;
}

export async function getLiveSnapshot(): Promise<PublishSnapshotFull | null> {
  const { data, error } = await (db() as any)
    .from(TABLE)
    .select("*")
    .eq("is_live", true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PublishSnapshotFull | null;
}

export interface PublishOptions {
  label: string;
  notes?: string | null;
  publishedBy: string;
}

/**
 * Publish a new snapshot from currently approved+published directives.
 * Approved directives become 'published'. The new row becomes is_live;
 * the prior live row gets is_live=false.
 */
export async function publishSnapshot(opts: PublishOptions): Promise<PublishSnapshotFull> {
  // 1. Collect directives in approved or published state.
  const approved = await listDirectives({ status: "approved" });
  const alreadyPublished = await listDirectives({ status: "published" });
  const all: MethodologyDirective[] = [...approved, ...alreadyPublished];

  if (all.length === 0) {
    throw new Error(
      "There are no approved rules to publish yet. Approve some rules in the Rules tab first.",
    );
  }

  // 2. Build the resolved snapshot payload.
  const directivesJson = all.map((d) => ({
    id: d.id,
    document_id: d.document_id,
    directive_type: d.directive_type,
    audience: d.audience,
    sport_scope: d.sport_scope,
    age_scope: d.age_scope,
    phv_scope: d.phv_scope,
    position_scope: d.position_scope,
    mode_scope: d.mode_scope,
    priority: d.priority,
    payload: d.payload,
    source_excerpt: d.source_excerpt,
    confidence: d.confidence,
    status: "published",
    schema_version: d.schema_version,
    updated_at: d.updated_at,
  }));

  // 3. Clear current live snapshot (if any). Do this BEFORE inserting the new one
  //    so the partial unique index allows the insert.
  const { data: currentLive } = await (db() as any)
    .from(TABLE)
    .select("id")
    .eq("is_live", true)
    .maybeSingle();
  if (currentLive?.id) {
    const { error: clearErr } = await (db() as any)
      .from(TABLE)
      .update({ is_live: false, retired_at: new Date().toISOString() })
      .eq("id", currentLive.id);
    if (clearErr) throw clearErr;
  }

  // 4. Insert the new snapshot as live.
  const { data: snap, error: insertErr } = await (db() as any)
    .from(TABLE)
    .insert([
      {
        label: opts.label,
        notes: opts.notes ?? null,
        directives: directivesJson,
        directive_count: directivesJson.length,
        is_live: true,
        published_by: opts.publishedBy,
      },
    ])
    .select()
    .single();
  if (insertErr) {
    // Best-effort restore: re-mark previous live row.
    if (currentLive?.id) {
      await (db() as any)
        .from(TABLE)
        .update({ is_live: true, retired_at: null })
        .eq("id", currentLive.id);
    }
    throw insertErr;
  }

  // 5. Promote any approved-only directives to published.
  if (approved.length > 0) {
    const ids = approved.map((d) => d.id);
    const { error: promoteErr } = await (db() as any)
      .from(DIRECTIVES_TABLE)
      .update({
        status: "published",
        updated_by: opts.publishedBy,
        change_reason: `published in snapshot "${opts.label}"`,
      })
      .in("id", ids);
    if (promoteErr) {
      // Snapshot already created. Surface but do not roll back the snapshot —
      // the live row is correct; promotion is recoverable.
      throw new Error(
        `Snapshot ${snap.id} published but ${approved.length} directive(s) failed to promote: ${promoteErr.message}`,
      );
    }
  }

  // Phase 7: drop the resolver's in-memory snapshot cache so the next
  // request sees the new live snapshot immediately (no 60s wait).
  invalidateInstructionsCache();

  return snap as PublishSnapshotFull;
}

/**
 * Roll back to a prior snapshot. Clears is_live on the current row and
 * sets it on the target. The target's directives JSONB is what the
 * resolver will load.
 */
export async function rollbackToSnapshot(
  targetId: string,
  actorId: string,
): Promise<PublishSnapshotFull> {
  const target = await getSnapshot(targetId);
  if (!target) throw new Error("Snapshot not found");
  if (target.is_live) return target; // no-op

  const { data: currentLive } = await (db() as any)
    .from(TABLE)
    .select("id")
    .eq("is_live", true)
    .maybeSingle();
  if (currentLive?.id) {
    const { error } = await (db() as any)
      .from(TABLE)
      .update({ is_live: false, retired_at: new Date().toISOString() })
      .eq("id", currentLive.id);
    if (error) throw error;
  }

  const { data: updated, error: updErr } = await (db() as any)
    .from(TABLE)
    .update({ is_live: true, retired_at: null })
    .eq("id", targetId)
    .select()
    .single();
  if (updErr) throw updErr;

  // Best-effort: log the actor in case the audit table cares (audit trigger
  // is on directives, not snapshots; we use admin_audit_log via the route).
  void actorId;

  // Phase 7: invalidate resolver cache so rollback takes effect immediately.
  invalidateInstructionsCache();

  return updated as PublishSnapshotFull;
}
