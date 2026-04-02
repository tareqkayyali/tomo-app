import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  triggerSessionNotifications,
  triggerStreakAtRisk,
  triggerRestDayReminder,
  triggerBedtimeReminder,
} from '@/services/notifications/scheduledTriggers';
import { schedulePush } from '@/services/notifications/pushDelivery';
import { createNotification } from '@/services/notifications/notificationEngine';

/**
 * POST /api/v1/notifications/simulate
 *
 * Simulates real-life notification scenarios for testing.
 * Creates actual calendar events and triggers the full pipeline.
 *
 * Body: { scenario: "pre_session" | "post_session" | "streak" | "rest_day" | "bedtime" | "sleep_dropping" | "acwr_spike" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({ scenario: 'pre_session' }));
    const scenario = body.scenario ?? 'pre_session';

    // Accept athlete_id from body, or fall back to authenticated user, or hardcoded test ID
    let ATHLETE_ID = body.athlete_id ?? '8c15ffce-6416-4735-beb5-a144cd0ea2b2';
    if (!body.athlete_id) {
      const { requireAuth } = await import('@/lib/auth');
      const auth = requireAuth(req);
      if (!('error' in auth)) {
        ATHLETE_ID = auth.user.id;
      }
    }
    const db = supabaseAdmin() as any;
    const now = new Date();
    const results: Record<string, unknown> = { scenario };

    switch (scenario) {
      case 'pre_session': {
        // Create a training event starting in 60 min (within the 45-75 min window)
        const startAt = new Date(now.getTime() + 60 * 60000);
        const endAt = new Date(startAt.getTime() + 90 * 60000);

        const { data: event, error } = await db
          .from('calendar_events')
          .insert({
            user_id: ATHLETE_ID,
            title: 'Football Training',
            event_type: 'training',
            start_at: startAt.toISOString(),
            end_at: endAt.toISOString(),
            intensity: 'MODERATE',
          })
          .select('id')
          .single();

        if (error) {
          results.error = error.message;
          break;
        }
        results.event_created = event;
        results.starts_in = '60 min';

        // Run the session trigger — should pick up this event
        results.trigger_result = await triggerSessionNotifications();
        break;
      }

      case 'streak': {
        // Trigger streak at risk directly (doesn't need time gating for test)
        results.trigger_result = await triggerStreakAtRisk();
        break;
      }

      case 'rest_day': {
        // Trigger rest day reminder directly
        results.trigger_result = await triggerRestDayReminder();
        break;
      }

      case 'bedtime': {
        // Trigger bedtime reminder directly (bypasses time window)
        results.trigger_result = await triggerBedtimeReminder();
        break;
      }

      case 'sleep_dropping': {
        // Create SLEEP_QUALITY_DROPPING notification directly
        const { data: snapshot } = await db
          .from('athlete_snapshots')
          .select('acwr')
          .eq('athlete_id', ATHLETE_ID)
          .single();

        const notifId = await createNotification({
          athleteId: ATHLETE_ID,
          type: 'SLEEP_QUALITY_DROPPING',
          vars: {
            N: 4,
            acwr: ((snapshot?.acwr ?? 1.2) as number).toFixed(2),
          },
        });
        results.notification_id = notifId;
        break;
      }

      case 'acwr_spike': {
        // Create LOAD_WARNING_SPIKE notification directly
        const { data: snapshot } = await db
          .from('athlete_snapshots')
          .select('acwr')
          .eq('athlete_id', ATHLETE_ID)
          .single();

        const notifId = await createNotification({
          athleteId: ATHLETE_ID,
          type: 'LOAD_WARNING_SPIKE',
          vars: {
            N: 3,
            acwr: ((snapshot?.acwr ?? 1.62) as number).toFixed(2),
          },
        });
        results.notification_id = notifId;
        break;
      }

      case 'pre_match_sleep': {
        // Create a match event for tomorrow and trigger bedtime
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        tomorrow.setHours(16, 0, 0, 0);

        const { data: event } = await db
          .from('calendar_events')
          .insert({
            user_id: ATHLETE_ID,
            title: 'League Match',
            event_type: 'match',
            start_at: tomorrow.toISOString(),
            end_at: new Date(tomorrow.getTime() + 90 * 60000).toISOString(),
            intensity: 'HARD',
          })
          .select('id')
          .single();

        results.match_event = event;

        const notifId = await createNotification({
          athleteId: ATHLETE_ID,
          type: 'PRE_MATCH_SLEEP_IMPORTANCE',
          vars: {
            match_time: '4:00 PM',
            target_hours: '9',
            cutoff: '21:00',
            date: now.toISOString().split('T')[0],
          },
        });
        results.notification_id = notifId;
        break;
      }

      case 'exam_approaching': {
        const notifId = await createNotification({
          athleteId: ATHLETE_ID,
          type: 'EXAM_APPROACHING',
          vars: {
            subject: 'Mathematics',
            N: 3,
            dual_load: 68,
            date: 'Apr 2',
          },
        });
        results.notification_id = notifId;
        break;
      }

      case 'checkin_reminder': {
        const notifId = await createNotification({
          athleteId: ATHLETE_ID,
          type: 'CHECKIN_REMINDER',
          vars: {
            context: "School's done for the day",
            day_type: 'After school',
            date: now.toISOString().split('T')[0],
          },
        });
        results.notification_id = notifId;
        break;
      }

      case 'study_conflict': {
        const notifId = await createNotification({
          athleteId: ATHLETE_ID,
          type: 'STUDY_TRAINING_CONFLICT',
          vars: {
            day: 'Monday',
            date: now.toISOString().split('T')[0],
            study_block: 'Math Revision',
            session_name: 'Football Training',
          },
        });
        results.notification_id = notifId;
        break;
      }

      default:
        results.error = `Unknown scenario: ${scenario}. Valid: pre_session, streak, rest_day, bedtime, sleep_dropping, acwr_spike, pre_match_sleep, exam_approaching, study_conflict`;
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
