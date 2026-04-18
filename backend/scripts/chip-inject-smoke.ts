/**
 * Live smoke test — chipInject with real Supabase.
 *
 * Toggles inResponse.enabled / shadowMode via SQL, then invokes
 * applyChipInjection() on a synthetic response/context. Prints the
 * observed mutation so we can confirm PR2 behaves as documented in the
 * RFC and chipInject.ts header.
 *
 * Run:  cd backend && npx tsx scripts/chip-inject-smoke.ts
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  applyChipInjection,
  __resetConfigCacheForTests,
} from "@/services/agents/chipInject";
import type { TomoResponse } from "@/services/agents/responseFormatter";
import type { PlayerContext } from "@/services/agents/contextBuilder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin() as any;

async function setFlags(enabled: boolean, shadowMode: boolean) {
  const { data } = await db
    .from("ui_config")
    .select("config_value")
    .eq("config_key", "chat_pills")
    .single();
  const cfg = data.config_value;
  cfg.inResponse.enabled = enabled;
  cfg.inResponse.shadowMode = shadowMode;
  await db
    .from("ui_config")
    .update({ config_value: cfg, updated_at: new Date().toISOString() })
    .eq("config_key", "chat_pills");
}

// Invalidate the module's in-memory cache between runs so each call
// re-reads from the DB. We do this by waiting past the 60s cache TTL
// (impractical for a smoke test) OR by re-requiring the module —
// easiest: short TTL by calling the exported helper via fresh import.
// Since applyChipInjection caches module-private state, we need a
// dynamic re-import. Do it via a timestamped query-string trick.

async function runOnce(label: string, enabled: boolean, shadowMode: boolean) {
  await setFlags(enabled, shadowMode);
  __resetConfigCacheForTests();
  const response: TomoResponse = {
    headline: "You're green today",
    cards: [],
    chips: [
      { label: "Log check-in", action: "I want to check in" },
      { label: "See schedule", action: "What's on my schedule today?" },
    ],
    contextTags: ["response:readiness", "readiness:green"],
  };
  const ctx: Partial<PlayerContext> = {
    todayDate: "2026-04-18",
    readinessScore: "Green",
    checkinDate: "2026-04-18",
    todayEvents: [],
    upcomingExams: [],
    upcomingEvents: [],
    benchmarkProfile: null,
    currentStreak: 5,
    snapshotEnrichment: null,
  };
  await applyChipInjection(response, ctx as PlayerContext);
  console.log(`\n=== ${label} (enabled=${enabled}, shadowMode=${shadowMode}) ===`);
  console.log("response.chips after:", JSON.stringify(response.chips));
}

(async () => {
  try {
    console.log("Smoke test — chipInject across flag states");
    await runOnce("A) OFF (baseline)", false, false);
    await runOnce("B) SHADOW (log-only)", false, true);
    await runOnce("C) ACTIVE (replace)", true, false);

    // Restore safe defaults
    await setFlags(false, false);
    console.log("\nFlags restored to safe defaults (enabled=false, shadowMode=false)");
  } catch (err) {
    console.error("Smoke failed:", err);
    process.exit(1);
  }
})();
