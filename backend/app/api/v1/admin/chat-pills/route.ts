/**
 * Admin API — CMS-managed Chat Pills library.
 *
 * GET  returns the current ChatPillsConfig + tag taxonomy payload (so the
 *      admin UI can populate tag pickers without a second round-trip).
 *      Falls back to DEFAULT_CHAT_PILLS_CONFIG when the ui_config row is
 *      missing (first boot after migration).
 *
 * POST replaces the config atomically. Zod-validated — invalid payloads
 *      return 400 with the full issue tree. Library IDs are checked for
 *      uniqueness and fixedIds / defaultFallbackIds must reference
 *      eligible library entries (see schema.ts superRefine).
 *
 * Auth: requireAdmin (is_admin flag on users).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { upsertUIConfig } from "@/services/admin/uiConfigAdminService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chatPillsConfigSchema } from "@/lib/chatPills/schema";
import { DEFAULT_CHAT_PILLS_CONFIG } from "@/lib/chatPills/defaults";
import { getTagTaxonomyPayload } from "@/lib/chatPills/tagTaxonomy";
import type { ChatPillsConfig } from "@/lib/chatPills/types";

const CONFIG_KEY = "chat_pills";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin() as any;
    const { data } = await db
      .from("ui_config")
      .select("config_value")
      .eq("config_key", CONFIG_KEY)
      .single();

    const config: ChatPillsConfig =
      (data?.config_value as ChatPillsConfig) ?? DEFAULT_CHAT_PILLS_CONFIG;

    return NextResponse.json({
      config,
      taxonomy: getTagTaxonomyPayload(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch chat pills config", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = chatPillsConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid chat pills config", detail: parsed.error.format() },
      { status: 400 }
    );
  }

  try {
    const saved = await upsertUIConfig({
      config_key: CONFIG_KEY,
      config_value: parsed.data,
    });
    return NextResponse.json(saved, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save chat pills config", detail: String(err) },
      { status: 500 }
    );
  }
}
