/**
 * Plan Conflict Resolver — Pure function service.
 *
 * Resolves slot conflicts when the planning engine generates a weekly plan.
 * Uses protocol priority + mode params to decide which sessions win.
 *
 * Zero DB access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannedSlot {
  id: string;
  day: number;                   // 0 = Sunday, 6 = Saturday
  start_time: string;            // HH:MM
  end_time: string;              // HH:MM
  session_type: string;          // 'club', 'gym', 'study', 'match', 'recovery', 'personal'
  priority: number;              // Lower = higher priority
  is_fixed: boolean;             // Fixed slots (school, club) can't be moved
  duration_min: number;
  source: 'training' | 'study' | 'fixed' | 'recovery';
}

export interface ConflictResolution {
  kept: PlannedSlot[];
  removed: PlannedSlot[];
  moved: Array<{ slot: PlannedSlot; new_start: string; new_end: string }>;
  conflicts_found: number;
}

// ---------------------------------------------------------------------------
// Priority Map (default — overridden by mode params.priorityBoosts)
// ---------------------------------------------------------------------------

const BASE_PRIORITIES: Record<string, number> = {
  school: 1,
  exam: 1,
  match: 2,
  recovery: 3,
  club: 4,
  gym: 5,
  study: 6,
  personal: 7,
};

// ---------------------------------------------------------------------------
// Pure Functions
// ---------------------------------------------------------------------------

/**
 * Parse HH:MM time string to minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check if two time ranges overlap.
 */
function slotsOverlap(a: PlannedSlot, b: PlannedSlot): boolean {
  if (a.day !== b.day) return false;
  const aStart = timeToMinutes(a.start_time);
  const aEnd = timeToMinutes(a.end_time);
  const bStart = timeToMinutes(b.start_time);
  const bEnd = timeToMinutes(b.end_time);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Apply priority boosts from mode params.
 */
function applyPriorityBoosts(
  slot: PlannedSlot,
  boosts: Array<{ category: string; delta: number }>
): number {
  const boost = boosts.find(b => b.category === slot.session_type);
  return slot.priority - (boost?.delta ?? 0); // Lower number = higher priority
}

/**
 * Resolve conflicts in a set of planned slots.
 *
 * Strategy:
 * 1. Sort all slots by priority (lowest number wins)
 * 2. For each slot, check overlap with already-placed slots
 * 3. If conflict: fixed slots always win; otherwise higher priority wins
 * 4. Removed slots are reported for transparency
 *
 * @param slots - All proposed slots for the week
 * @param priorityBoosts - Mode-specific priority adjustments
 * @param bufferMinutes - Minimum gap between sessions (default 30)
 */
export function resolveConflicts(
  slots: PlannedSlot[],
  priorityBoosts: Array<{ category: string; delta: number }> = [],
  bufferMinutes = 30
): ConflictResolution {
  // Apply priority boosts and sort
  const boosted = slots.map(s => ({
    ...s,
    priority: applyPriorityBoosts(s, priorityBoosts),
  }));
  const sorted = boosted.sort((a, b) => a.priority - b.priority);

  const kept: PlannedSlot[] = [];
  const removed: PlannedSlot[] = [];
  let conflictsFound = 0;

  for (const slot of sorted) {
    const hasConflict = kept.some(placed => slotsOverlap(slot, placed));

    if (!hasConflict) {
      kept.push(slot);
    } else {
      conflictsFound++;
      // Fixed slots of equal or higher priority displace the conflicting placed slot
      if (slot.is_fixed) {
        const conflictIdx = kept.findIndex(placed => slotsOverlap(slot, placed));
        if (conflictIdx >= 0 && !kept[conflictIdx].is_fixed) {
          removed.push(kept[conflictIdx]);
          kept[conflictIdx] = slot;
          continue;
        }
      }
      removed.push(slot);
    }
  }

  return {
    kept,
    removed,
    moved: [], // Future: implement time-shifting for moveable slots
    conflicts_found: conflictsFound,
  };
}
