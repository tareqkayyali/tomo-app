import { colors } from '../theme/colors';
/**
 * Programme Types — Coach drill builder + player notification types.
 */

// ── Enums ────────────────────────────────────────────────────────

export type SeasonCycle = 'pre_season' | 'in_season' | 'off_season' | 'exam_period';
export type ProgrammeStatus = 'draft' | 'published' | 'archived';
export type TargetType = 'all' | 'position_group' | 'individual';
export type ProgressionType = 'none' | 'load_5pct' | 'load_10pct' | 'reps_plus1' | 'sets_plus1';
export type DrillCategory = 'warmup' | 'training' | 'cooldown' | 'recovery' | 'activation';

export type NotificationType =
  | 'coach_drill_assigned'
  | 'coach_programme_published'
  | 'readiness_alert'
  | 'benchmark_pr'
  | 'streak_milestone'
  | 'ai_recommendation'
  | 'suggestion_received'
  | 'suggestion_resolved'
  | 'relationship_accepted'
  | 'relationship_declined'
  | 'test_result_added'
  | 'parent_link_request'
  | 'coach_link_request'
  | 'study_info_request';

// ── Constants ────────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<DrillCategory, string> = {
  warmup: colors.warning,
  training: colors.accent,
  cooldown: colors.info,
  recovery: colors.accent,
  activation: colors.error,
};

export const CATEGORY_LABELS: Record<DrillCategory, string> = {
  warmup: 'Warm-up',
  training: 'Training',
  cooldown: 'Cool-down',
  recovery: 'Recovery',
  activation: 'Activation',
};

export const CATEGORY_ICONS: Record<DrillCategory, string> = {
  warmup: '',
  training: '',
  cooldown: '',
  recovery: '',
  activation: '',
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CYCLE_LABELS: Record<SeasonCycle, string> = {
  pre_season: 'Pre-season',
  in_season: 'In-season',
  off_season: 'Off-season',
  exam_period: 'Exam period',
};

export const CYCLE_COLORS: Record<SeasonCycle, string> = {
  pre_season: colors.info,
  in_season: colors.accent,
  off_season: colors.accent,
  exam_period: colors.info,
};

// ── Interfaces ───────────────────────────────────────────────────

export interface CoachProgramme {
  id: string;
  coachId: string;
  name: string;
  description?: string;
  seasonCycle: SeasonCycle;
  startDate: string;
  weeks: number;
  status: ProgrammeStatus;
  targetType: TargetType;
  targetPositions: string[];
  targetPlayerIds: string[];
  createdAt: string;
  updatedAt: string;
  drills?: ProgrammeDrill[];
}

export interface ProgrammeDrill {
  id: string;
  programmeId: string;
  drillId: string;
  drillName?: string;
  drillCategory?: DrillCategory;
  weekNumber: number;
  dayOfWeek: number;
  sets: number;
  reps: string;
  intensity: string;
  restSeconds: number;
  rpeTarget: number;
  durationMin?: number;
  tempoNote?: string;
  coachNotes?: string;
  repeatWeeks: number;
  progression: ProgressionType;
  isMandatory: boolean;
  orderInDay: number;
  targetOverride?: string;
  targetPosition?: string;
  targetPlayerIds?: string[];
}

export interface DrillFormState {
  drillId: string;
  drillName: string;
  category: DrillCategory;
  weekNumber: number;
  dayOfWeek: number;
  sets: number;
  reps: string;
  intensity: string;
  restSeconds: number;
  rpeTarget: number;
  durationMin: number;
  tempoNote: string;
  coachNotes: string;
  repeatWeeks: number;
  progression: ProgressionType;
  isMandatory: boolean;
  targetOverride: 'programme' | 'position_group' | 'individual';
  targetPosition: string;
  targetPlayerIds: string[];
}

// ── Notification Types ───────────────────────────────────────────

export interface PlayerNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, any>;
  read: boolean;
  isActed: boolean;
  actionLabel?: string;
  actionData: Record<string, any>;
  sourceId?: string;
  sourceType?: string;
  createdAt: string;
  expiresAt?: string;
}

/** Data shape inside notification.data for coach_drill_assigned */
export interface DrillAssignedNotifData {
  programmeId: string;
  programmeName: string;
  coachName: string;
  drillCount: number;
  scheduledDate: string;
  drills: {
    drillId: string;
    drillName: string;
    drillCategory: string;
    sets: number;
    reps: string;
    intensity: string;
    restSeconds: number;
    rpeTarget: number;
    durationMin?: number;
    coachNotes?: string;
    isMandatory: boolean;
    scheduledDate: string;
    dayOfWeek: number;
  }[];
}
