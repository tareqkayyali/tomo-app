/**
 * Stakeholder Handler — processes COACH_NOTE, COACH_ASSESSMENT, PARENT_INPUT,
 * and TRIANGLE_FLAG events.
 *
 * Angle 4 (The Triangle) of the Athlete Data Fabric.
 * Updates coachability index and triangle RAG status.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AthleteEvent, CoachAssessmentPayload, TriangleFlagPayload } from '../types';

/**
 * Handle stakeholder events.
 * - COACH_ASSESSMENT: updates coachability_index
 * - TRIANGLE_FLAG: updates triangle_rag
 * - COACH_NOTE / PARENT_INPUT: recorded in event stream, no snapshot computation needed
 */
export async function handleStakeholderEvent(event: AthleteEvent): Promise<void> {
  const db = supabaseAdmin();

  switch (event.event_type) {
    case 'COACH_ASSESSMENT': {
      const payload = event.payload as CoachAssessmentPayload;
      if (payload.overall_rating != null) {
        // Simple rolling average approach for coachability
        // Full longitudinal response-curve analysis is Phase 5
        const { data: snapshot } = await db
          .from('athlete_snapshots')
          .select('coachability_index')
          .eq('athlete_id', event.athlete_id)
          .single();

        const currentIndex = snapshot?.coachability_index ?? payload.overall_rating;
        // Exponential moving average (alpha = 0.3 for recent weighting)
        const newIndex = currentIndex * 0.7 + payload.overall_rating * 0.3;

        await db
          .from('athlete_snapshots')
          .upsert({
            athlete_id: event.athlete_id,
            coachability_index: Math.round(newIndex * 10) / 10,
            snapshot_at: new Date().toISOString(),
          }, { onConflict: 'athlete_id' });
      }
      break;
    }

    case 'TRIANGLE_FLAG': {
      const payload = event.payload as TriangleFlagPayload;
      const ragMap: Record<string, 'GREEN' | 'AMBER' | 'RED'> = {
        LOW: 'GREEN',
        MEDIUM: 'AMBER',
        HIGH: 'RED',
      };
      const rag = ragMap[payload.severity] || 'AMBER';

      await db
        .from('athlete_snapshots')
        .upsert({
          athlete_id: event.athlete_id,
          triangle_rag: rag,
          snapshot_at: new Date().toISOString(),
        }, { onConflict: 'athlete_id' });
      break;
    }

    // COACH_NOTE and PARENT_INPUT: no snapshot computation needed
    // They're recorded in the event stream for audit and context building
    default:
      break;
  }
}
