/**
 * Admin API — Motivational Quotes (stored in content_items, category='quotes').
 *
 * GET  — lists all quotes, newest first.
 * POST — creates a new quote.
 *
 * Shape in content_items:
 *   category    = 'quotes'
 *   subcategory = 'high_energy' | 'recovery' | 'low_sleep' | 'streak' | 'general'
 *   content     = { text: string, author: string }
 *   active      = boolean
 *   sort_order  = number
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

const quoteCreateSchema = z.object({
  text: z.string().min(1).max(500),
  author: z.string().min(1).max(120),
  subcategory: z.enum(QUOTE_SUBCATEGORIES),
  active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("content_items")
    .select("id, subcategory, content, active, sort_order, created_at, updated_at")
    .eq("category", "quotes")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to list quotes", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    quotes: data ?? [],
    subcategories: QUOTE_SUBCATEGORIES,
  });
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

  const parsed = quoteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid quote", detail: parsed.error.format() },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin() as any;
  const { data, error } = await db
    .from("content_items")
    .insert({
      category: "quotes",
      subcategory: parsed.data.subcategory,
      content: { text: parsed.data.text, author: parsed.data.author },
      active: parsed.data.active,
      sort_order: parsed.data.sort_order,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create quote", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
