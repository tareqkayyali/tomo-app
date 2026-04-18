/**
 * GET /api/v1/chat/pills/most-used
 *
 * Returns the 4 pill IDs for this user's empty-state Dynamic mode.
 *
 * Ranking: COUNT(*) DESC over chat_pill_usage for source='empty_state'
 * in the last 60 days, restricted to pills that are still enabled and
 * allowed in empty state. If fewer than 4 unique pills exist in the
 * user's history (or none), the result is padded from
 * `emptyState.defaultFallbackIds` in order, skipping duplicates.
 *
 * Auth: Bearer (uses x-user-id set by proxy).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_CHAT_PILLS_CONFIG } from "@/lib/chatPills/defaults";
import type { ChatPillsConfig } from "@/lib/chatPills/types";

const LOOKBACK_DAYS = 60;
const TARGET = 4;

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;

  // Load current library in parallel with usage history
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();

  const [configRes, usageRes] = await Promise.all([
    db
      .from("ui_config")
      .select("config_value")
      .eq("config_key", "chat_pills")
      .single(),
    db
      .from("chat_pill_usage")
      .select("pill_id")
      .eq("user_id", auth.user.id)
      .eq("source", "empty_state")
      .gte("used_at", since),
  ]);

  const config: ChatPillsConfig =
    (configRes.data?.config_value as ChatPillsConfig) ?? DEFAULT_CHAT_PILLS_CONFIG;

  const eligible = new Set(
    config.library
      .filter((p) => p.enabled && p.allowInEmptyState)
      .map((p) => p.id)
  );

  const counts = new Map<string, number>();
  for (const row of (usageRes.data ?? []) as Array<{ pill_id: string }>) {
    if (!eligible.has(row.pill_id)) continue;
    counts.set(row.pill_id, (counts.get(row.pill_id) ?? 0) + 1);
  }

  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  // Pad to TARGET from fallback, skipping duplicates and non-eligible IDs.
  // If the fallback is also short (library was edited to drop IDs), fall back
  // to the first N enabled library entries in library order.
  const out: string[] = [];
  const push = (id: string) => {
    if (out.length >= TARGET) return;
    if (out.includes(id)) return;
    if (!eligible.has(id)) return;
    out.push(id);
  };
  for (const id of ranked) push(id);
  for (const id of config.emptyState.defaultFallbackIds) push(id);
  for (const pill of config.library) {
    if (pill.enabled && pill.allowInEmptyState) push(pill.id);
  }

  return NextResponse.json(
    { pillIds: out.slice(0, TARGET) },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
