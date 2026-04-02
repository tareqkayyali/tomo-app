import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NOTIFICATION_TEMPLATES } from "@/services/notifications/notificationTemplates";

const HEADERS = { "api-version": "v1" };

// Cast to `any` — notification_template_overrides table may not be in generated types yet.
const db = () => supabaseAdmin() as any;

/**
 * GET /api/v1/admin/notifications/templates
 *
 * Returns all notification templates with CMS overrides applied.
 * Code-defined templates serve as defaults; DB overrides take precedence.
 */
export async function GET() {
  // Load CMS overrides from DB (gracefully skip if table doesn't exist)
  let overrides: Record<string, { title?: string; body?: string; priority?: number; enabled?: boolean }> = {};
  try {
    const { data } = await db()
      .from('notification_template_overrides')
      .select('notification_type, title, body, priority, enabled');
    if (data) {
      for (const row of data) {
        overrides[row.notification_type] = row;
      }
    }
  } catch {
    // Table may not exist yet — return code defaults only
  }

  const templates = Object.values(NOTIFICATION_TEMPLATES).map((t) => {
    const override = overrides[t.type];
    return {
      type: t.type,
      category: t.category,
      priority: override?.priority ?? t.priority,
      title: override?.title ?? t.title,
      body: override?.body ?? t.body,
      can_dismiss: t.can_dismiss,
      enabled: override?.enabled ?? true,
      expiry_hours: t.expiry.ttl_hours ?? null,
      group_key_pattern: t.group_key_pattern ?? null,
      group_update_behavior: t.group_update_behavior ?? null,
      has_override: !!override,
    };
  });

  return NextResponse.json({ templates }, { headers: HEADERS });
}

/**
 * PUT /api/v1/admin/notifications/templates
 *
 * Persist a template override. Upserts into notification_template_overrides.
 * Body: { type: string, title?: string, body?: string, priority?: number, enabled?: boolean }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, title, body: bodyText, priority, enabled } = body;

    if (!type || !NOTIFICATION_TEMPLATES[type as keyof typeof NOTIFICATION_TEMPLATES]) {
      return NextResponse.json(
        { error: `Unknown notification type: ${type}` },
        { status: 400, headers: HEADERS }
      );
    }

    const updates: Record<string, unknown> = { notification_type: type, updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (bodyText !== undefined) updates.body = bodyText;
    if (priority !== undefined) updates.priority = priority;
    if (enabled !== undefined) updates.enabled = enabled;

    const { error } = await db()
      .from('notification_template_overrides')
      .upsert(updates, { onConflict: 'notification_type' });

    if (error) {
      console.error('[admin] Template override save failed:', error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: HEADERS }
      );
    }

    return NextResponse.json({ success: true, type }, { headers: HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to save template override' },
      { status: 500, headers: HEADERS }
    );
  }
}
