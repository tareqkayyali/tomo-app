/**
 * Notification Templates — 22 notification types across 7 categories.
 *
 * Each template defines the category, default priority, title/body with {var}
 * interpolation, chips, actions, grouping behavior, and expiry config.
 *
 * Reference: Files/tomo_notification_center_p1.md §3
 */

// ─── Types ────────────────────────────────────────────────────────────

export type NotificationCategory =
  | 'critical'
  | 'training'
  | 'coaching'
  | 'academic'
  | 'triangle'
  | 'cv'
  | 'system';

export type NotificationType =
  // Critical
  | 'LOAD_WARNING_SPIKE'
  | 'INJURY_RISK_FLAG'
  | 'WELLNESS_CRITICAL'
  // Training
  | 'JOURNAL_PRE_SESSION'
  | 'JOURNAL_POST_SESSION'
  | 'SESSION_STARTING_SOON'
  | 'STREAK_AT_RISK'
  | 'REST_DAY_REMINDER'
  // Check-in
  | 'CHECKIN_REMINDER'
  // Sleep (under training category — recovery input)
  | 'BEDTIME_REMINDER'
  | 'SLEEP_QUALITY_DROPPING'
  | 'PRE_MATCH_SLEEP_IMPORTANCE'
  // Coaching
  | 'NEW_RECOMMENDATION'
  | 'PERSONAL_BEST'
  | 'CHECKIN_STREAK_MILESTONE'
  | 'READINESS_TREND_UP'
  // Academic
  | 'EXAM_APPROACHING'
  | 'DUAL_LOAD_SPIKE'
  | 'STUDY_TRAINING_CONFLICT'
  // Triangle
  | 'COACH_ASSESSMENT_ADDED'
  | 'PARENT_SCHEDULE_FLAG'
  | 'TRIANGLE_ALIGNMENT_CHANGE'
  // CV
  | 'CV_SHARE_VIEWED'
  | 'CV_UPDATE_AVAILABLE'
  | 'CV_COMPLETENESS_MILESTONE'
  // System (legacy migration)
  | 'SYSTEM_MESSAGE';

export interface ChipTemplate {
  label: string; // supports {var}
  style: 'red' | 'green' | 'amber' | 'blue' | 'orange' | 'purple';
}

export interface ActionTemplate {
  label: string;
  deep_link: string; // supports {var}
  resolves?: boolean;
  dismisses?: boolean;
}

export type GroupUpdateBehavior = 'replace_body' | 'increment_count' | 'extend_expiry';

export interface ExpiryConfig {
  ttl_hours?: number;
  expires_at_field?: string; // e.g. 'session_start_time', 'midnight_same_day'
  resolve_condition?: string; // human-readable, enforced in expiryResolver
  inherits_from?: string;
}

export interface NotificationTemplate {
  type: NotificationType;
  category: NotificationCategory;
  priority: number; // 1-5
  title: string;
  body: string;
  chips: ChipTemplate[];
  primary_action: ActionTemplate;
  secondary_action?: ActionTemplate;
  group_key_pattern?: string; // e.g. '{athlete_id}', '{athlete_id}_{cv_type}_{date}'
  group_update_behavior?: GroupUpdateBehavior;
  expiry: ExpiryConfig;
  can_dismiss: boolean; // false for P1 critical
}

// ─── Priority Map ────────────────────────────────────────────────────

export const CATEGORY_PRIORITY: Record<NotificationCategory, number> = {
  critical: 1,
  training: 2,
  coaching: 3,
  academic: 2,
  triangle: 3,
  cv: 4,
  system: 5,
};

// ─── Category Colors ─────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<NotificationCategory, string> = {
  critical: '#E74C3C',
  training: '#F4501E',
  coaching: '#2ECC71',
  academic: '#3498DB',
  triangle: '#8E44AD',
  cv: '#F39C12',
  system: '#888888',
};

// ─── Templates ───────────────────────────────────────────────────────

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  // ═══ CRITICAL ═══
  LOAD_WARNING_SPIKE: {
    type: 'LOAD_WARNING_SPIKE',
    category: 'critical',
    priority: 1,
    title: 'ACWR spike \u2014 {N} days above 1.5',
    body: 'Your acute:chronic ratio hit {acwr}. Day {N} in the danger zone. Today should be rest or light technical only.',
    chips: [
      { label: 'ACWR {acwr}', style: 'red' },
      { label: 'Day {N}', style: 'red' },
    ],
    primary_action: { label: 'View load plan', deep_link: 'tomo://own-it?filter=load' },
    secondary_action: { label: 'I understand', deep_link: '', resolves: true },
    group_key_pattern: '{athlete_id}',
    group_update_behavior: 'replace_body',
    expiry: { ttl_hours: 168, resolve_condition: 'acwr < 1.3' },
    can_dismiss: false,
  },

  INJURY_RISK_FLAG: {
    type: 'INJURY_RISK_FLAG',
    category: 'critical',
    priority: 1,
    title: 'Injury risk flag \u2014 {body_part}',
    body: 'Your {body_part} has been flagged. Training has been modified automatically. Check your updated session.',
    chips: [
      { label: '{body_part}', style: 'red' },
      { label: 'Modified session', style: 'amber' },
    ],
    primary_action: { label: 'View modified session', deep_link: 'tomo://timeline?date=today' },
    group_key_pattern: '{athlete_id}_injury',
    group_update_behavior: 'replace_body',
    expiry: { ttl_hours: 168, resolve_condition: 'injury_risk_flag = false' },
    can_dismiss: false,
  },

  WELLNESS_CRITICAL: {
    type: 'WELLNESS_CRITICAL',
    category: 'critical',
    priority: 1,
    title: 'Wellbeing flag \u2014 3 low days in a row',
    body: 'Your check-in scores have been below 4 for 3 days. Training load has been adjusted. How are you doing?',
    chips: [{ label: 'Score < 4 \u00B7 3 days', style: 'red' }],
    primary_action: { label: 'Talk to Tomo', deep_link: 'tomo://chat?intent=wellbeing_check' },
    group_key_pattern: '{athlete_id}_wellness',
    group_update_behavior: 'replace_body',
    expiry: { ttl_hours: 72, resolve_condition: 'wellness_7d_avg >= 5' },
    can_dismiss: false,
  },

  // ═══ TRAINING ═══
  JOURNAL_PRE_SESSION: {
    type: 'JOURNAL_PRE_SESSION',
    category: 'training',
    priority: 2,
    title: 'Set your target \u2014 {session_name} in {N} min',
    body: 'Setting a specific target before you walk in sharpens focus. Takes 30 seconds.',
    chips: [
      { label: 'Today {time}', style: 'orange' },
      { label: '{category}', style: 'orange' },
    ],
    primary_action: { label: 'Set target', deep_link: 'tomo://chat?intent=journal_pre&event_id={event_id}' },
    secondary_action: { label: 'Later', deep_link: '', dismisses: true },
    group_key_pattern: '{event_id}_pre',
    expiry: { expires_at_field: 'session_start_time' },
    can_dismiss: true,
  },

  JOURNAL_POST_SESSION: {
    type: 'JOURNAL_POST_SESSION',
    category: 'training',
    priority: 2,
    title: 'Log your reflection \u2014 {session_name}',
    body: 'Your target was: "{pre_target}". How did it go?',
    chips: [{ label: 'Window closes in {N}h', style: 'amber' }],
    primary_action: { label: 'Log reflection', deep_link: 'tomo://chat?intent=journal_post&event_id={event_id}' },
    group_key_pattern: '{event_id}_post',
    expiry: { expires_at_field: 'midnight_same_day' },
    can_dismiss: true,
  },

  SESSION_STARTING_SOON: {
    type: 'SESSION_STARTING_SOON',
    category: 'training',
    priority: 2,
    title: '{session_name} starts in 30 minutes',
    body: 'No target set yet. Quick check-in before you start?',
    chips: [{ label: 'Starting at {time}', style: 'orange' }],
    primary_action: { label: 'Check in + set target', deep_link: 'tomo://chat?intent=journal_pre&event_id={event_id}' },
    group_key_pattern: '{event_id}_starting',
    expiry: { expires_at_field: 'session_start_time' },
    can_dismiss: true,
  },

  STREAK_AT_RISK: {
    type: 'STREAK_AT_RISK',
    category: 'training',
    priority: 2,
    title: '{N}-day streak at risk',
    body: "You haven't checked in today. Takes 10 seconds \u2014 keep the streak alive.",
    chips: [{ label: '{N}-day streak', style: 'orange' }],
    primary_action: { label: 'Check in now', deep_link: 'tomo://checkin' },
    group_key_pattern: '{athlete_id}_streak',
    expiry: { expires_at_field: 'midnight_same_day' },
    can_dismiss: true,
  },

  REST_DAY_REMINDER: {
    type: 'REST_DAY_REMINDER',
    category: 'training',
    priority: 2,
    title: 'Rest day \u2014 your ACWR needs this',
    body: "ACWR is at {acwr}. Today's rest day is doing real work. No gym, light walking only.",
    chips: [{ label: 'ACWR {acwr}', style: 'amber' }],
    primary_action: { label: 'Understood', deep_link: '', resolves: true },
    group_key_pattern: '{athlete_id}_rest_{date}',
    expiry: { expires_at_field: 'midnight_same_day' },
    can_dismiss: true,
  },

  // ═══ CHECK-IN ═══
  CHECKIN_REMINDER: {
    type: 'CHECKIN_REMINDER',
    category: 'training',
    priority: 2,
    title: 'Time to check in',
    body: '{context} \u2014 takes 10 seconds and keeps your coaching accurate.',
    chips: [{ label: '{day_type}', style: 'orange' }],
    primary_action: { label: 'Check in now', deep_link: 'tomo://checkin' },
    secondary_action: { label: 'Ask Tomo about this', deep_link: 'tomo://chat?intent=checkin_help', dismisses: true },
    group_key_pattern: '{athlete_id}_checkin_{date}',
    expiry: { expires_at_field: 'midnight_same_day' },
    can_dismiss: true,
  },

  // ═══ SLEEP (under training category) ═══
  BEDTIME_REMINDER: {
    type: 'BEDTIME_REMINDER',
    category: 'training',
    priority: 3,
    title: 'Wind down \u2014 bedtime in 30 min',
    body: 'Consistent sleep timing is the #1 factor in recovery quality. Screens off, lights low.',
    chips: [{ label: 'Bedtime {bedtime}', style: 'blue' }],
    primary_action: { label: 'Got it', deep_link: '', resolves: true },
    group_key_pattern: '{athlete_id}_bedtime_{date}',
    expiry: { ttl_hours: 2 },
    can_dismiss: true,
  },

  SLEEP_QUALITY_DROPPING: {
    type: 'SLEEP_QUALITY_DROPPING',
    category: 'training',
    priority: 2,
    title: 'Sleep quality dropping \u2014 {N} days below target',
    body: 'Poor sleep compounds load stress. Your ACWR is {acwr} \u2014 recovery capacity is reduced. Prioritise 8+ hours tonight.',
    chips: [
      { label: 'Sleep low \u00B7 {N} days', style: 'red' },
      { label: 'ACWR {acwr}', style: 'amber' },
    ],
    primary_action: { label: 'Talk to Tomo', deep_link: 'tomo://chat?intent=sleep_coach' },
    secondary_action: { label: 'View readiness', deep_link: 'tomo://own-it' },
    group_key_pattern: '{athlete_id}_sleep_quality',
    group_update_behavior: 'replace_body',
    expiry: { ttl_hours: 48, resolve_condition: 'sleep_quality_3d_avg >= 6' },
    can_dismiss: true,
  },

  PRE_MATCH_SLEEP_IMPORTANCE: {
    type: 'PRE_MATCH_SLEEP_IMPORTANCE',
    category: 'training',
    priority: 2,
    title: 'Match tomorrow \u2014 sleep is your edge',
    body: 'Extra 30 min sleep tonight = measurably faster reaction time and better decisions. Aim for {target_hours}h+. No screens after {cutoff}.',
    chips: [
      { label: 'Match {match_time}', style: 'orange' },
      { label: 'Sleep target {target_hours}h', style: 'blue' },
    ],
    primary_action: { label: 'Set alarm', deep_link: '', resolves: true },
    group_key_pattern: '{athlete_id}_prematch_sleep_{date}',
    expiry: { expires_at_field: 'midnight_same_day' },
    can_dismiss: true,
  },

  // ═══ COACHING ═══
  NEW_RECOMMENDATION: {
    type: 'NEW_RECOMMENDATION',
    category: 'coaching',
    priority: 3,
    title: '{rec_title}',
    body: '{rec_body_short}',
    chips: [{ label: 'P{priority} \u00B7 {rec_type}', style: 'green' }],
    primary_action: { label: 'View on Own It', deep_link: 'tomo://own-it?rec_id={rec_id}' },
    secondary_action: { label: 'Discuss with Tomo', deep_link: 'tomo://chat?rec_context={rec_id}' },
    group_key_pattern: '{rec_id}',
    group_update_behavior: 'replace_body',
    expiry: { inherits_from: 'rec.expires_at' },
    can_dismiss: true,
  },

  PERSONAL_BEST: {
    type: 'PERSONAL_BEST',
    category: 'coaching',
    priority: 3,
    title: 'New personal best \u2014 {test_name}',
    body: '{value} \u2014 {percentile}th percentile for {benchmark_group}. Your {phase} block is working.',
    chips: [
      { label: '{percentile}th percentile', style: 'green' },
      { label: 'New PB', style: 'green' },
    ],
    primary_action: { label: 'Add to CV', deep_link: 'tomo://cv?highlight={test_name}' },
    secondary_action: { label: 'Share with coach', deep_link: 'tomo://chat?intent=share_pb' },
    expiry: { ttl_hours: 336 },
    can_dismiss: true,
  },

  CHECKIN_STREAK_MILESTONE: {
    type: 'CHECKIN_STREAK_MILESTONE',
    category: 'coaching',
    priority: 3,
    title: '{N}-day check-in streak',
    body: 'Your readiness data is now significantly more accurate. Keep it going \u2014 the coaching gets better with every day.',
    chips: [{ label: '{N}-day streak', style: 'green' }],
    primary_action: { label: 'Check in today', deep_link: 'tomo://checkin' },
    expiry: { ttl_hours: 48 },
    can_dismiss: true,
  },

  READINESS_TREND_UP: {
    type: 'READINESS_TREND_UP',
    category: 'coaching',
    priority: 3,
    title: 'Readiness trending up this week',
    body: 'Your 7-day average is {current} \u2014 up {delta} points from last week. Good time to push your next strength session.',
    chips: [{ label: '+{delta} points', style: 'green' }],
    primary_action: { label: 'View readiness', deep_link: 'tomo://own-it' },
    expiry: { ttl_hours: 48 },
    can_dismiss: true,
  },

  // ═══ ACADEMIC ═══
  EXAM_APPROACHING: {
    type: 'EXAM_APPROACHING',
    category: 'academic',
    priority: 2,
    title: '{subject} exam in {N} days',
    body: 'Dual-load index projected at {dual_load} this week. Tomo has suggested a reduced training schedule \u2014 review the adjusted plan.',
    chips: [
      { label: 'Dual-load {dual_load}/100', style: 'amber' },
      { label: 'Exam {date}', style: 'blue' },
    ],
    primary_action: { label: 'View adjusted plan', deep_link: 'tomo://own-it?filter=academic' },
    expiry: { resolve_condition: 'exam_date < today' },
    can_dismiss: true,
  },

  DUAL_LOAD_SPIKE: {
    type: 'DUAL_LOAD_SPIKE',
    category: 'academic',
    priority: 2,
    title: 'High dual-load week \u2014 adjustment recommended',
    body: 'Academic + training load hit {dual_load}/100. Consider dropping the gym session and keeping technical only.',
    chips: [{ label: 'Dual-load {dual_load}/100', style: 'red' }],
    primary_action: { label: 'View recommendation', deep_link: 'tomo://own-it' },
    group_key_pattern: '{athlete_id}_dualload',
    group_update_behavior: 'replace_body',
    expiry: { ttl_hours: 72, resolve_condition: 'dual_load < 65' },
    can_dismiss: true,
  },

  STUDY_TRAINING_CONFLICT: {
    type: 'STUDY_TRAINING_CONFLICT',
    category: 'academic',
    priority: 2,
    title: 'Schedule conflict on {day}',
    body: '{study_block} overlaps with {session_name}. Tomo has flagged this for your review.',
    chips: [
      { label: '{day}', style: 'amber' },
      { label: 'Needs resolution', style: 'amber' },
    ],
    primary_action: { label: 'Resolve in calendar', deep_link: 'tomo://timeline?date={date}' },
    expiry: { resolve_condition: 'conflict_resolved = true' },
    can_dismiss: true,
  },

  // ═══ TRIANGLE ═══
  COACH_ASSESSMENT_ADDED: {
    type: 'COACH_ASSESSMENT_ADDED',
    category: 'triangle',
    priority: 3,
    title: 'New assessment from {coach_name}',
    body: '"{assessment_excerpt}"',
    chips: [{ label: '{assessment_type}', style: 'purple' }],
    primary_action: { label: 'View assessment', deep_link: 'tomo://chat?intent=coach_assessment' },
    secondary_action: { label: 'Reply in chat', deep_link: 'tomo://chat?intent=coach_response' },
    expiry: { ttl_hours: 168 },
    can_dismiss: true,
  },

  PARENT_SCHEDULE_FLAG: {
    type: 'PARENT_SCHEDULE_FLAG',
    category: 'triangle',
    priority: 3,
    title: 'Parent flagged a schedule conflict',
    body: '{parent_name} noted: "{flag_note}". This overlaps with {conflicting_event}.',
    chips: [
      { label: '{date}', style: 'amber' },
      { label: 'Needs resolution', style: 'amber' },
    ],
    primary_action: { label: 'View conflict', deep_link: 'tomo://chat?intent=parent_flag' },
    expiry: { ttl_hours: 168, resolve_condition: 'conflict_resolved' },
    can_dismiss: true,
  },

  TRIANGLE_ALIGNMENT_CHANGE: {
    type: 'TRIANGLE_ALIGNMENT_CHANGE',
    category: 'triangle',
    priority: 3,
    title: 'Tomo detected a conflict between coach and parent inputs',
    body: "This week's training schedule and academic expectations can't both be met. Tomo has suggested a resolution.",
    chips: [{ label: 'Triangle conflict', style: 'purple' }],
    primary_action: { label: 'View resolution', deep_link: 'tomo://own-it?filter=triangle' },
    expiry: { ttl_hours: 168 },
    can_dismiss: true,
  },

  // ═══ CV ═══
  CV_SHARE_VIEWED: {
    type: 'CV_SHARE_VIEWED',
    category: 'cv',
    priority: 4,
    title: 'Someone viewed your {cv_type} CV',
    body: 'Your shared profile link was opened {N} times in the last 24 hours.',
    chips: [
      { label: '{N} views', style: 'amber' },
      { label: '{cv_type}', style: 'amber' },
    ],
    primary_action: { label: 'View CV activity', deep_link: 'tomo://cv?tab=activity' },
    group_key_pattern: '{athlete_id}_{cv_type}_{date}',
    group_update_behavior: 'increment_count',
    expiry: { ttl_hours: 48 },
    can_dismiss: true,
  },

  CV_UPDATE_AVAILABLE: {
    type: 'CV_UPDATE_AVAILABLE',
    category: 'cv',
    priority: 4,
    title: 'New data available for your CV',
    body: "{reason} \u2014 your CV hasn't been updated in {N} days. It takes under 2 minutes.",
    chips: [{ label: 'CV {pct}% complete', style: 'amber' }],
    primary_action: { label: 'Update CV', deep_link: 'tomo://cv' },
    expiry: { ttl_hours: 168 },
    can_dismiss: true,
  },

  CV_COMPLETENESS_MILESTONE: {
    type: 'CV_COMPLETENESS_MILESTONE',
    category: 'cv',
    priority: 4,
    title: 'Club CV is {pct}% complete',
    body: 'Add {missing_section} to reach the next level and increase scout visibility.',
    chips: [{ label: '{pct}%', style: 'amber' }],
    primary_action: { label: 'Complete CV', deep_link: 'tomo://cv' },
    expiry: { ttl_hours: 336 },
    can_dismiss: true,
  },

  // ═══ SYSTEM ═══
  SYSTEM_MESSAGE: {
    type: 'SYSTEM_MESSAGE',
    category: 'system',
    priority: 5,
    title: '{title}',
    body: '{body}',
    chips: [],
    primary_action: { label: '{action_label}', deep_link: '{action_link}' },
    expiry: { ttl_hours: 168 },
    can_dismiss: true,
  },
};

// ─── Interpolation ───────────────────────────────────────────────────

export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : match;
  });
}

export function resolveChips(
  chipTemplates: ChipTemplate[],
  vars: Record<string, string | number>,
): Array<{ label: string; style: string }> {
  return chipTemplates.map((c) => ({
    label: interpolate(c.label, vars),
    style: c.style,
  }));
}

export function resolveAction(
  actionTemplate: ActionTemplate | undefined,
  vars: Record<string, string | number>,
): { label: string; deep_link: string; resolves?: boolean; dismisses?: boolean } | null {
  if (!actionTemplate) return null;
  return {
    label: interpolate(actionTemplate.label, vars),
    deep_link: interpolate(actionTemplate.deep_link, vars),
    ...(actionTemplate.resolves ? { resolves: true } : {}),
    ...(actionTemplate.dismisses ? { dismisses: true } : {}),
  };
}

export function resolveGroupKey(
  type: NotificationType,
  athleteId: string,
  vars: Record<string, string | number>,
): string | null {
  const template = NOTIFICATION_TEMPLATES[type];
  if (!template.group_key_pattern) return null;

  const allVars = { ...vars, athlete_id: athleteId };
  return interpolate(template.group_key_pattern, allVars);
}
