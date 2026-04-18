/**
 * Parent dual-mode helper (P4.2, 2026-04-18).
 *
 * Drives the ParentChildDetailScreen rendering branch based on the
 * child's age tier:
 *   T1 / T2 / UNKNOWN → Guardian mode (full visibility, approvals,
 *                                      urgent-flag annotation, study
 *                                      block widgets)
 *   T3                → Supporter mode (weekly digest,
 *                                      encouragement-focused,
 *                                      no approval powers, annotations
 *                                      gated by athlete preference)
 *
 * Pure function. Zero I/O. UNKNOWN tier defaults Guardian per
 * Apple 5.1.4 conservative rule — treat unknown-age user as minor.
 */

import type { AgeTier } from '../types';

export type ParentMode = 'guardian' | 'supporter';

export function parentModeForTier(tier: AgeTier | undefined): ParentMode {
  if (!tier) return 'guardian';
  if (tier === 'T3') return 'supporter';
  return 'guardian'; // T1, T2, UNKNOWN
}

// Feature flags that read off mode — single source of truth. If you
// find yourself writing `mode === 'guardian'` inline, add a flag here
// instead so the Guardian/Supporter capability matrix stays visible.
export interface ModeCapabilities {
  canApprovePrograms: boolean;      // parent-supersedes-coach authority
  canComposeAnnotations: boolean;   // write notes on calendar events
  canUrgentFlag: boolean;           // mark annotation urgent (bypass fatigue)
  canAddStudyBlocks: boolean;       // push study plan items
  canAddExams: boolean;             // push exam dates
  showProtectStudyWidget: boolean;  // "Protect study blocks" prompt
  showWeeklyDigest: boolean;        // Supporter surface
}

export function capabilitiesForMode(mode: ParentMode): ModeCapabilities {
  if (mode === 'guardian') {
    return {
      canApprovePrograms: true,
      canComposeAnnotations: true,
      canUrgentFlag: true,
      canAddStudyBlocks: true,
      canAddExams: true,
      showProtectStudyWidget: true,
      showWeeklyDigest: false,
    };
  }
  // supporter (T3)
  return {
    canApprovePrograms: false,
    canComposeAnnotations: false,   // gated by athlete's visibility preference
    canUrgentFlag: false,
    canAddStudyBlocks: false,
    canAddExams: false,
    showProtectStudyWidget: false,
    showWeeklyDigest: true,
  };
}
