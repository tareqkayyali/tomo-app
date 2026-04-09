/**
 * Cognitive Window Engine — Pure function service.
 *
 * Maps training session types to cognitive states and determines
 * optimal study timing relative to training sessions.
 *
 * Based on Tomporowski (2003) and Chang et al. (2012):
 * - Moderate exercise enhances cognition within 30 minutes
 * - High-intensity exercise temporarily impairs cognition for 2-3 hours
 * - Recovery activities can enhance focus immediately
 *
 * Zero DB access. CMS data (cognitive_windows table) is passed in.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CognitiveState = 'enhanced' | 'suppressed' | 'neutral';

export interface CognitiveWindowDefinition {
  id: string;
  session_type: string;
  cognitive_state: CognitiveState;
  optimal_study_delay_minutes: number;
  description: string | null;
}

export interface TrainingSessionContext {
  session_type: string;
  end_time: Date;
}

export interface StudyWindowResult {
  cognitive_state: CognitiveState;
  optimal_study_start: Date;
  delay_minutes: number;
  description: string | null;
  can_study_now: boolean;
}

// ---------------------------------------------------------------------------
// Default Windows (fallback when CMS data unavailable)
// ---------------------------------------------------------------------------

const DEFAULT_WINDOWS: CognitiveWindowDefinition[] = [
  { id: 'default_moderate', session_type: 'moderate_cardio', cognitive_state: 'enhanced', optimal_study_delay_minutes: 30, description: null },
  { id: 'default_high', session_type: 'high_intensity', cognitive_state: 'suppressed', optimal_study_delay_minutes: 180, description: null },
  { id: 'default_skill', session_type: 'skill_technical', cognitive_state: 'enhanced', optimal_study_delay_minutes: 60, description: null },
  { id: 'default_strength', session_type: 'strength', cognitive_state: 'neutral', optimal_study_delay_minutes: 120, description: null },
  { id: 'default_match', session_type: 'match', cognitive_state: 'suppressed', optimal_study_delay_minutes: 240, description: null },
  { id: 'default_recovery', session_type: 'recovery', cognitive_state: 'enhanced', optimal_study_delay_minutes: 0, description: null },
];

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Get the cognitive window for a training session type.
 *
 * @param sessionType - The type of training session just completed
 * @param cmsWindows - CMS-managed cognitive window definitions (optional, falls back to defaults)
 */
export function getCognitiveWindow(
  sessionType: string,
  cmsWindows?: CognitiveWindowDefinition[]
): CognitiveWindowDefinition {
  const windows = cmsWindows ?? DEFAULT_WINDOWS;
  const match = windows.find(w => w.session_type === sessionType);

  // Fall back to neutral if no match
  return match ?? {
    id: 'fallback_neutral',
    session_type: sessionType,
    cognitive_state: 'neutral' as CognitiveState,
    optimal_study_delay_minutes: 120,
    description: null,
  };
}

/**
 * Compute the optimal study window after a training session.
 *
 * @param session - The training session that just ended
 * @param now - Current time
 * @param cmsWindows - CMS-managed cognitive window definitions
 */
export function computeStudyWindow(
  session: TrainingSessionContext,
  now: Date,
  cmsWindows?: CognitiveWindowDefinition[]
): StudyWindowResult {
  const window = getCognitiveWindow(session.session_type, cmsWindows);

  const optimalStart = new Date(
    session.end_time.getTime() + window.optimal_study_delay_minutes * 60 * 1000
  );

  const canStudyNow = now >= optimalStart;

  return {
    cognitive_state: window.cognitive_state,
    optimal_study_start: optimalStart,
    delay_minutes: window.optimal_study_delay_minutes,
    description: window.description,
    can_study_now: canStudyNow,
  };
}

/**
 * Given multiple sessions in a day, find the best study slot.
 * Returns the earliest window where cognitive state is not suppressed.
 */
export function findBestStudySlot(
  sessions: TrainingSessionContext[],
  cmsWindows?: CognitiveWindowDefinition[]
): { earliest_study_time: Date; windows: StudyWindowResult[] } {
  if (sessions.length === 0) {
    return {
      earliest_study_time: new Date(),
      windows: [],
    };
  }

  const windows = sessions.map(s => computeStudyWindow(s, new Date(), cmsWindows));
  const sorted = windows.sort((a, b) => a.optimal_study_start.getTime() - b.optimal_study_start.getTime());

  // Find first non-suppressed window
  const bestWindow = sorted.find(w => w.cognitive_state !== 'suppressed') ?? sorted[0];

  return {
    earliest_study_time: bestWindow.optimal_study_start,
    windows: sorted,
  };
}
