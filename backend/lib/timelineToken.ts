/**
 * Mints + resolves persisted tokens for the Timeline PDF export feature.
 *
 * A token is a URL-safe random string used as the public render key:
 *   /t-timeline/<token>?print=1
 *
 * Owner-bound: the row in `timeline_share_tokens` carries user_id, range,
 * and selected event types. Lookups use the service-role admin client so
 * the public render route can read without an auth header (mirrors how
 * `cv_profiles.share_slug` is resolved anonymously).
 */

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface TimelineToken {
  token: string;
  user_id: string;
  from_date: string; // YYYY-MM-DD
  to_date: string;   // YYYY-MM-DD
  event_types: string[];
  view_count: number;
}

export async function mintTimelineToken(args: {
  userId: string;
  fromDate: string;
  toDate: string;
  eventTypes: string[];
}): Promise<string> {
  const token = randomBytes(18).toString("base64url");

  const db = supabaseAdmin();
  const { error } = await (db as any)
    .from("timeline_share_tokens")
    .insert({
      token,
      user_id: args.userId,
      from_date: args.fromDate,
      to_date: args.toDate,
      event_types: args.eventTypes,
    });

  if (error) {
    throw new Error(`Failed to mint timeline token: ${error.message}`);
  }
  return token;
}

export async function resolveTimelineToken(token: string): Promise<TimelineToken | null> {
  const db = supabaseAdmin();
  const { data, error } = await (db as any)
    .from("timeline_share_tokens")
    .select("token, user_id, from_date, to_date, event_types, view_count")
    .eq("token", token)
    .single();

  if (error || !data) return null;
  return data as TimelineToken;
}

export async function recordTimelineView(token: string): Promise<void> {
  const db = supabaseAdmin();
  // Read-then-write atomic increment (low-traffic counter; same pattern as
  // cv_profiles.share_views_count in cvPublicView.ts).
  const { data: current } = await (db as any)
    .from("timeline_share_tokens")
    .select("view_count")
    .eq("token", token)
    .single();

  if (current) {
    await (db as any)
      .from("timeline_share_tokens")
      .update({
        view_count: (current.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("token", token);
  }
}
