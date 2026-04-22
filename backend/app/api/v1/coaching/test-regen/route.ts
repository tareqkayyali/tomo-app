/**
 * GET /api/v1/coaching/test-regen
 *
 * Diagnostic endpoint — synchronously invokes the dynamic-hero-coaching
 * generator for the authenticated athlete and returns the full result
 * (source, text, context hash, error if any). Use to verify the pipeline
 * end-to-end without waiting for an event handler or boot lazy regen.
 *
 * Safe to keep in production — it's auth-gated to the athlete themselves
 * and runs the same code path as the silent regens, just synchronously.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateAndPersistHeroCoaching } from '@/services/coaching/dynamicHeroCoaching';

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  try {
    const result = await generateAndPersistHeroCoaching(auth.user.id);
    return NextResponse.json({
      ok: true,
      athleteId: auth.user.id,
      result,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        athleteId: auth.user.id,
        error: err?.message ?? String(err),
        stack: err?.stack ?? null,
      },
      { status: 500 },
    );
  }
}
