/**
 * Admin API — single quote (update / delete).
 *
 * PATCH /api/v1/admin/content-items/quotes/[id]
 *   Partial update. Any subset of { text, author, subcategory, active, sort_order }.
 *
 * DELETE /api/v1/admin/content-items/quotes/[id]
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const QUOTE_SUBCATEGORIES = [
  "high_energy",
  "recovery",
  "low_sleep",
  "streak",
  "general",
] as const;

const quoteUpdateSchema = z
  .object({
    text: z.string().min(1).max(500).optional(),
    author: z.string().min(1).max(120).optional(),
    subcategory: z.enum(QUOTE_SUBCATEGORIES).optional(),
    active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field is required",
  });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = quoteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid quote update", detail: parsed.error.format() },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;

  // Read existing row first so PATCH is a true partial update on the jsonb
  // content field. If the row isn't a quote, we refuse.
  const { data: existing, error: readErr } = await db
    .from("content_items")
    .select("id, category, content, subcategory, active, sort_order")
    .eq("id", id)
    .single();

  if (readErr || !existing) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (existing.category !== "quotes") {
    return NextResponse.json(
      { error: "Not a quote" },
      { status: 400 }
    );
  }

  const current = existing.content ?? {};
  const updates: Record<string, unknown> = {};
  if (parsed.data.text !== undefined || parsed.data.author !== undefined) {
    updates.content = {
      text: parsed.data.text ?? current.text ?? "",
      author: parsed.data.author ?? current.author ?? "",
    };
  }
  if (parsed.data.subcategory !== undefined)
    updates.subcategory = parsed.data.subcategory;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  if (parsed.data.sort_order !== undefined)
    updates.sort_order = parsed.data.sort_order;

  const { data, error } = await db
    .from("content_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update quote", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;
  const { data: existing } = await db
    .from("content_items")
    .select("category")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (existing.category !== "quotes") {
    return NextResponse.json({ error: "Not a quote" }, { status: 400 });
  }

  const { error } = await db.from("content_items").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to delete quote", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
