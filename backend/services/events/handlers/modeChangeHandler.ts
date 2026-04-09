/**
 * Mode Change Handler — processes MODE_CHANGE events.
 *
 * When an athlete switches mode (Study/League/Balanced/Rest):
 * 1. Fetches CMS mode definition + merges with player override
 * 2. Writes mode fields to snapshot
 * 3. Records mode change in audit history
 *
 * Planning Intelligence layer of the Athlete Data Fabric.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getModeDefinition } from '../../scheduling/modeConfig';
import { logger } from '@/lib/logger';
import type { AthleteEvent, ModeChangePayload } from '../types';

/**
 * Handle MODE_CHANGE events.
 * Updates snapshot with new mode context and records change in history.
 */
export async function handleModeChange(event: AthleteEvent): Promise<void> {
  const db = supabaseAdmin();
  const payload = event.payload as ModeChangePayload;
  const { new_mode, previous_mode, trigger } = payload;

  // ── Fetch CMS mode definition (cached 5 min) ──
  const modeDefinition = await getModeDefinition(new_mode);
  if (!modeDefinition) {
    logger.warn('Mode definition not found', { mode: new_mode, athlete_id: event.athlete_id });
    return;
  }

  // ── Merge CMS params with player override ──
  // New columns from migration 036 — cast to bypass generated types until regen
  const { data: prefs } = await (db as any)
    .from('player_schedule_preferences')
    .select('mode_params_override')
    .eq('user_id', event.athlete_id)
    .maybeSingle();

  const playerOverride = prefs?.mode_params_override ?? {};
  const mergedParams = { ...modeDefinition.params, ...playerOverride };

  // ── Update player_schedule_preferences ──
  await (db as any)
    .from('player_schedule_preferences')
    .update({
      athlete_mode: new_mode,
      mode_changed_at: event.occurred_at,
    })
    .eq('user_id', event.athlete_id);

  // ── Write mode fields to snapshot (will be picked up by writeSnapshot) ──
  const balanceRatio = (mergedParams as any).studyTrainingBalanceRatio ?? null;

  await (db as any)
    .from('athlete_snapshots')
    .update({
      athlete_mode: new_mode,
      mode_changed_at: event.occurred_at,
      study_training_balance_ratio: balanceRatio,
    })
    .eq('athlete_id', event.athlete_id);

  // ── Record in audit trail (immutable) ──
  await (db as any)
    .from('athlete_mode_history')
    .insert({
      athlete_id: event.athlete_id,
      previous_mode: previous_mode ?? null,
      new_mode,
      trigger,
      changed_by: event.created_by,
      changed_at: event.occurred_at,
    });

  logger.info('Mode change processed', {
    athlete_id: event.athlete_id,
    previous_mode,
    new_mode,
    trigger,
  });
}
