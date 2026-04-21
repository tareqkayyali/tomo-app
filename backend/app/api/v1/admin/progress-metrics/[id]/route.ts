import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/apiAuth';
import { progressMetricUpdateSchema } from '@/lib/validation/progressMetricSchemas';
import {
  getProgressMetricById,
  updateProgressMetric,
  deleteProgressMetric,
  toggleProgressMetric,
  duplicateProgressMetric,
} from '@/services/admin/progressMetricAdminService';

// ─── GET ────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    const metric = await getProgressMetricById(id);
    if (!metric) {
      return NextResponse.json(
        { error: 'Progress metric not found' },
        { status: 404 },
      );
    }
    return NextResponse.json(metric);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to get progress metric', detail: String(err) },
      { status: 500 },
    );
  }
}

// ─── PUT — update / toggle / duplicate ──────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  const body = await req.json();

  // Toggle quick-action
  if (body._action === 'toggle' && typeof body.is_enabled === 'boolean') {
    try {
      const metric = await toggleProgressMetric(id, body.is_enabled);
      return NextResponse.json(metric);
    } catch (err) {
      return NextResponse.json(
        { error: 'Failed to toggle progress metric', detail: String(err) },
        { status: 500 },
      );
    }
  }

  // Duplicate quick-action
  if (body._action === 'duplicate') {
    try {
      const created = await duplicateProgressMetric(id);
      return NextResponse.json(created, { status: 201 });
    } catch (err) {
      return NextResponse.json(
        { error: 'Failed to duplicate progress metric', detail: String(err) },
        { status: 500 },
      );
    }
  }

  // Standard update
  const parsed = progressMetricUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { _action, ...updates } = parsed.data;
  try {
    const metric = await updateProgressMetric(id, {
      ...updates,
      updated_by: auth.user.id,
    });
    return NextResponse.json(metric);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update progress metric', detail: String(err) },
      { status: 500 },
    );
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  try {
    await deleteProgressMetric(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete progress metric', detail: String(err) },
      { status: 500 },
    );
  }
}
