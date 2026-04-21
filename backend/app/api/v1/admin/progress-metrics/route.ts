import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { progressMetricCreateSchema } from '@/lib/validation/progressMetricSchemas';
import {
  listProgressMetrics,
  createProgressMetric,
} from '@/services/admin/progressMetricAdminService';

// ─── GET: list all metrics (admin view, includes disabled) ───────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  try {
    const metrics = await listProgressMetrics();
    return NextResponse.json({ metrics });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list progress metrics', detail: String(err) },
      { status: 500 },
    );
  }
}

// ─── POST: create a new metric ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const parsed = progressMetricCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createProgressMetric({
      ...parsed.data,
      updated_by: auth.user.id,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create progress metric', detail: String(err) },
      { status: 500 },
    );
  }
}
