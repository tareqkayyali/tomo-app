/**
 * Tomo Type Definitions
 */

// Readiness levels
export type ReadinessLevel = 'GREEN' | 'YELLOW' | 'RED';

// Intensity levels
export type IntensityLevel = 'REST' | 'LIGHT' | 'MODERATE' | 'HARD';

// Sports (only supported sports)
export type Sport = 'football' | 'basketball' | 'tennis' | 'padel';

// Archetypes
export type Archetype = 'phoenix' | 'titan' | 'blade' | 'surge';

export interface ArchetypeInfo {
  emoji: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare';
  description: string;
  fatalFlaw: string;
  calmMessage: string;
}

// Gender
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

// Season Phase
export type SeasonPhase = 'pre_season' | 'in_season' | 'off_season';

// Primary Goal
export type PrimaryGoal =
  | 'improve_fitness'
  | 'get_recruited'
  | 'recover_from_injury'
  | 'stay_consistent'
  | 'have_fun';

// Roles
export type UserRole = 'player' | 'coach' | 'parent';
export type RelationshipType = 'coach' | 'parent';
export type RelationshipStatus = 'pending' | 'accepted' | 'declined' | 'revoked';
export type SuggestionType = 'study_block' | 'exam_date' | 'test_result' | 'calendar_event';
export type SuggestionStatus = 'pending' | 'accepted' | 'edited' | 'declined' | 'expired';

// User
export interface User {
  id: string;
  uid: string;
  email: string;
  name: string;
  displayName?: string;
  age: number;
  sport: Sport;
  role: UserRole;
  displayRole?: string | null;
  region?: string;
  teamId?: string | null;
  archetype?: Archetype | null;
  archetypeInfo?: ArchetypeInfo | null;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  streakMultiplier: number;
  streakFreezeTokens: number;
  milestonesUnlocked: string[];

  // Onboarding fields
  onboardingComplete?: boolean;
  height?: number | null;
  weight?: number | null;
  gender?: Gender | null;
  position?: string | null;
  playingStyle?: string | null;
  weeklyTrainingDays?: number;
  typicalSessionLength?: number | null;
  seasonPhase?: SeasonPhase;
  typicalSleepHours?: number | null;
  baselineEnergy?: number | null;
  injuries?: string | null;
  painAreas?: string[];
  isStudent?: boolean;
  schoolHours?: number | null;
  examPeriods?: string | null;
  schoolSchedule?: SchoolSchedule;
  primaryGoal?: PrimaryGoal | null;
  selfSelectedArchetype?: Archetype | null;
  healthKitConnected?: boolean;
  fcmToken?: string | null;
  parentalConsent?: boolean;
  // Phase 1/3: 'active' (default) | 'awaiting_parent' | 'revoked'. When
  // 'awaiting_parent' the app is in sandbox mode and writes to sensitive
  // tables (chat, check-ins, health) are blocked by migration 062.
  consentStatus?: 'active' | 'awaiting_parent' | 'revoked';
  dateOfBirth?: string | null;
  selectedSports?: string[];
  photoUrl?: string | null;

  // Study plan fields
  studySubjects?: string[];
  examSchedule?: ExamEntry[];
  trainingPreferences?: TrainingPreferences;
  studyPlanConfig?: StudyPlanConfig;
  trainingPlanConfig?: TrainingPlanConfig;

  // Enhanced profile fields
  customTrainingTypes?: CustomTrainingType[];

  // Wearable connections
  connectedWearables?: ConnectedWearables;

  // Historical Data (Profile > Historical Data) — pre-Tomo context
  trainingStartedAt?: string | null;      // YYYY-MM-DD
  trainingHistoryNote?: string | null;    // <=280 chars
}

// Historical Data DTOs (Profile > Historical Data)
export interface HistoricalInjury {
  id: string;
  bodyArea: string;
  severity: 'minor' | 'moderate' | 'severe';
  year: number;
  weeksOut: number | null;
  resolved: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoricalTestEntry {
  id: string;
  testType: string;
  score: number;
  date: string;
  unit: string | null;
  notes: string | null;
  createdAt: string;
}

export interface HistoricalDataResponse {
  trainingStartedAt: string | null;
  trainingHistoryNote: string | null;
  historicalTests: HistoricalTestEntry[];
  injuries: HistoricalInjury[];
}

export interface ConnectedWearables {
  whoop?: { connected: boolean; connectedAt?: string };
  appleWatch?: { connected: boolean; connectedAt?: string };
}
// Education type
export type EducationType = 'school' | 'university';

// Onboarding Data
export interface OnboardingData {
  height?: number;
  weight?: number;
  gender: Gender;
  position?: string;
  playingStyle?: string;
  primaryGoal: PrimaryGoal;

  // Education
  educationType?: EducationType;
  educationYear?: number;

  // Sport selection (multi-sport)
  selectedSports?: string[];

  // Football-specific onboarding
  footballPosition?: string;
  footballExperience?: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  footballCompetition?: 'recreational' | 'club' | 'academy' | 'professional';
  footballSelfAssessment?: Record<string, number>;

  // Date of birth & age
  dateOfBirth?: string; // ISO date string (YYYY-MM-DD)
  age?: number;

  // Legacy fields (kept for backward compat)
  weeklyTrainingDays?: number;
  typicalSessionLength?: number;
  seasonPhase?: SeasonPhase;
  typicalSleepHours?: number;
  baselineEnergy?: number;
  injuries?: string;
  painAreas?: string[];
  isStudent?: boolean;
  schoolHours?: number;
  examPeriods?: string;
  selfSelectedArchetype?: Archetype;
}
// Sport Positions Response
export interface SportPositionsResponse {
  sport: string;
  positions: string[];
  playingStyles: string[];
}

// Check-in (fixed to match backend fields)
export interface CheckinData {
  energy: number;
  soreness: number;
  sleepHours: number;
  painFlag: boolean;
  painLocation?: string;
  effortYesterday?: number;
  mood?: number;
  academicStress?: number;
}

export interface Checkin extends CheckinData {
  id: string;
  odataType?: string;
  userId: string;
  date: string;
  readinessLevel?: ReadinessLevel | null;
  planId?: string | null;
  createdAt: string;
}

// Exercise
export interface Exercise {
  name: string;
  duration?: string;
  sets?: number;
  reps?: string;
  notes?: string;
}

// Plan
export interface Plan {
  id: string;
  date: string;
  readinessLevel: ReadinessLevel;
  recommendedIntensity: IntensityLevel;
  recommendation: string;
  decisionExplanation?: string | { summary: string; factors: string[] };
  exercises?: Exercise[];
  warmup?: Exercise[];
  mainWorkout?: Exercise[];
  cooldown?: Exercise[];
  focusAreas?: string[];
  alerts?: Array<{ type: string; message: string }>;
  recoveryTips?: string[];
  archetypeMessage?: string;
  duration?: number;
}

// Progress
export interface ProgressData {
  currentStreak: number;
  longestStreak: number;
  totalPoints: number;
  weeklyPoints: number;
  streakMultiplier: number;
  totalCheckIns: number;
  milestonesUnlocked?: string[];
  nextMilestone?: {
    id: string;
    days: number;
    reward: string;
  };
  progressPercent?: number;
  daysToNext?: number;
  streakFreezeTokens?: number;
}

// Gamification
export interface GamificationData {
  streak?: {
    currentStreak: number;
    multiplier: number;
    usedFreeze: boolean;
    longestStreak: number;
  };
  progress: ProgressData;
  milestones?: {
    unlockedMilestones: string[];
    newlyUnlocked: Array<{ id: string; days: number; reward: string }>;
    nextMilestone: { id: string; days: number; reward: string } | null;
  };
  archetype?: {
    newlyAssigned?: boolean;
    assigned?: boolean;
    archetype?: Archetype;
    archetypeInfo?: ArchetypeInfo;
    checkinsNeeded?: number;
    explanation?: string;
  };
}

// Leaderboard
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  displayName?: string;
  totalPoints: number;
  currentStreak: number;
  archetype?: Archetype | null;
  sport?: Sport;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  total: number;
}

export interface UserRank {
  rank: number;
  totalPoints: number;
  currentStreak: number;
}

export interface NearbyRanksResponse {
  userRank: UserRank;
  nearby: LeaderboardEntry[];
}

// Feedback
export interface FeedbackData {
  didWorkout: boolean;
  actualIntensity: string;
  followedPlan: boolean;
  notes?: string;
}

// Calendar Event Sport
export type EventSport = 'football' | 'padel' | 'general';

// Calendar Event
export interface LinkedProgram {
  programId: string;
  name: string;
  category?: string;
  linkedAt: string;
  expiresAt: string;
}

// Journal state for training/match/recovery events
export type JournalState = 'empty' | 'pre_set' | 'complete';

// Structured drill written by the AI multi_step build_session flow.
// Persisted as JSONB on calendar_events.session_plan (migration 046).
export interface SessionPlanDrill {
  name: string;
  category?: string;
  durationMin?: number;
  intensity?: 'LIGHT' | 'MODERATE' | 'HARD' | string;
  description?: string;
}

export interface SessionPlan {
  builtBy?: string;          // 'tomo' | 'manual'
  focus?: string;            // 'endurance' | 'strength' | 'speed' | ...
  totalMinutes?: number;
  drills?: SessionPlanDrill[];
}

export interface CalendarEventAdjustment {
  move: 'time_shift' | 'day_shift' | 'swap';
  from: { date: string; startTime: string };
  to: { date: string; startTime: string };
  reason: string;
}

export interface CalendarEventMetadata {
  // Stamped by /api/v1/week-plan/commit when the event was created via
  // the planner. Lets Timeline narrate repair moves on tap long after
  // the originating chat session closes.
  week_plan?: {
    week_plan_id: string;
    status: 'clean' | 'adjusted' | 'dropped';
    adjustments?: CalendarEventAdjustment[];
  };
  // Generic extension point for future creators (journal-linked,
  // external integrations, …). Indexer uses .week_plan specifically.
  [key: string]: unknown;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  name: string;
  type: 'training' | 'match' | 'recovery' | 'study_block' | 'exam' | 'other';
  sport: EventSport;
  date: string;
  startTime: string | null;
  endTime: string | null;
  intensity: IntensityLevel | null;
  notes: string;
  createdAt: string;
  linkedPrograms?: LinkedProgram[];
  sessionPlan?: SessionPlan | null;
  // Journal fields (only for training/match/recovery events)
  journalState?: JournalState | null;
  preTarget?: string | null;
  postOutcome?: string | null;
  // Completion toggle — backed by calendar_events.completed + completed_at.
  // Athletes mark sessions done via the Timeline row checkmark; drives
  // the weekly compliance cron (see athlete_week_plans).
  completed?: boolean;
  completedAt?: string | null;
  // State-machine position from migration 086. 'scheduled' | 'completed' |
  // 'skipped' | 'deleted'. When null (old data), callers should treat the
  // row as 'scheduled' and rely on `completed` for compatibility.
  status?: 'scheduled' | 'completed' | 'skipped' | 'deleted' | null;
  // Provenance stamped by the week planner, etc. See CalendarEventMetadata.
  metadata?: CalendarEventMetadata;
  // P3.4: present when the event carries a coach/parent disagreement
  // detected by detectConflict(). When true, the ConflictPill renders
  // and tapping it opens a seeded Ask Tomo mediation session.
  hasConflict?: boolean;
  conflictAxis?: 'intent' | 'timing' | 'load' | 'explicit' | 'unknown';
}

export interface CalendarEventInput {
  name: string;
  type: 'training' | 'match' | 'recovery' | 'study_block' | 'exam' | 'other';
  sport?: EventSport;
  date: string;
  startTime?: string;
  endTime?: string;
  intensity?: IntensityLevel;
  notes?: string;
}

// Event type alias for reuse
export type EventType = 'training' | 'match' | 'recovery' | 'study_block' | 'exam' | 'other';

// Day Lock
export interface DayLockStatus {
  locked: boolean;
  lockedAt: string | null;
}

// Calendar Event Patch (for drag-drop time updates)
export interface CalendarEventPatch {
  date?: string;
  startTime?: string;
  endTime?: string | null;
}

// Ghost Calendar — AI-suggested events based on detected patterns
export interface GhostSuggestion {
  name: string;
  type: EventType;
  dayOfWeek: number; // 0=Sun, 1=Mon, ... 6=Sat
  startTime: string | null;
  endTime: string | null;
  intensity: IntensityLevel | null;
  occurrences: number;
  confidence: number; // 0–1
  patternDescription: string;
}

export interface GhostEvent {
  ghostId: string;
  patternSource: string;
  confidence: number;
  isGhost: true;
  name: string;
  type: EventType;
  sport: EventSport;
  date: string;
  startTime: string | null;
  endTime: string | null;
  intensity: IntensityLevel | null;
}

export type DisplayEvent = (CalendarEvent & { isGhost?: false }) | GhostEvent;

export interface GhostSuggestionWithDate {
  suggestion: GhostSuggestion;
  date: string;
}

export interface GhostSuggestionsResponse {
  suggestions: GhostSuggestionWithDate[];
}

// Focus View — simplified single-card items
export interface FocusItem {
  id: string;
  title: string;
  subtitle: string;
  time: string | null;
  type: EventType | 'plan';
  intensity: IntensityLevel | null;
  source: 'event' | 'plan' | 'ghost';
}

// Chat Calendar Notification — shown as toast in Plan tab
export interface ChatCalendarNotification {
  eventName: string;
  eventDate: string;
  eventTime: string | null;
  createdAt: string;
}

// BlazePod Sessions
export interface BlazePodSession {
  id: string;
  userId: string;
  drillId: string;
  drillName: string;
  sets: number;
  totalTouches: number;
  bestReactionTime: number | null;
  avgReactionTime: number | null;
  rpe: number;
  durationSeconds: number;
  notes: string;
  createdAt: string;
}

export interface BlazePodHistoryResponse {
  sessions: BlazePodSession[];
  count: number;
}

// Sleep
export type SleepSource = 'healthkit' | 'manual';
export type SleepQuality = 'poor' | 'fair' | 'good' | 'excellent';

export interface SleepLog {
  id: string;
  userId: string;
  date: string;
  hours: number;
  quality: SleepQuality;
  source: SleepSource;
  pointsAwarded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SleepSyncRequest {
  date: string;
  totalHours: number;
  quality?: SleepQuality;
  source: SleepSource;
  rawSamples?: unknown[];
}

export interface SleepSyncResponse {
  sleepLog: SleepLog;
  pointsAwarded: {
    basePoints: number;
    multiplier: number;
    finalPoints: number;
  } | null;
}

export interface SleepHistoryResponse {
  sleepLogs: SleepLog[];
  count: number;
}

// Notification Preferences
export interface NotificationPreferences {
  userId: string;
  dailyReminder: boolean;
  dailyReminderTime: string;
  streakReminders: boolean;
  milestoneAlerts: boolean;
  redDayGuidance: boolean;
  weeklySummary: boolean;
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences;
}

// Chat
export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  metadata: {
    intent?: string;
    mode?: string;
  } | null;
}

export interface ChatSendResponse {
  userMessage: ChatMessage;
  aiMessage: ChatMessage;
  intent: string;
  remaining: number;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  count: number;
}

export interface SuggestionChip {
  label: string;
  message: string;
}

export interface ChatSuggestionsResponse {
  suggestions: SuggestionChip[];
}

// API Responses
export interface CheckinResponse {
  checkin: Checkin;
  plan: Plan;
  gamification: GamificationData;
}

export interface TodayResponse {
  needsCheckin: boolean;
  checkin: Checkin | null;
  plan: Plan | null;
  progress: ProgressData | null;
  gamification?: GamificationData | null;
}

export interface UserResponse {
  user: User;
}

// Privacy Settings
export interface PrivacySettings {
  passportEnabled: boolean;
  showVideoTests: boolean;
  showStreakData: boolean;
  showArchetype: boolean;
  showPhysicalProfile: boolean;
  showSleepData: boolean;
  showPoints: boolean;
}

export interface PrivacySettingsResponse {
  privacySettings: PrivacySettings;
  parentalConsentRequired: boolean;
}

// ─── Daily Briefing (Command & Control Center) ─────────────────────────────

export interface BriefingAlert {
  type: 'rest_needed' | 'acwr_warning' | 'pain_flag' | 'academic_stress' | 'streak_risk';
  emoji: string;
  message: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface QuickAction {
  label: string;
  icon: string;
  screen: string;
  params?: Record<string, unknown>;
}

export interface BriefingPlanSummary {
  intensity: string;
  workoutType: string;
  duration: number;
}

export interface BriefingEvent {
  title: string;
  time: string | null;
  type: string;
}

export interface DailyBriefing {
  greeting: string;
  readinessStatus: 'green' | 'yellow' | 'red' | 'unknown';
  readinessLabel: string;
  hasCheckedIn: boolean;
  streakCount: number;
  streakAtRisk: boolean;
  todayPlan: BriefingPlanSummary | null;
  upcomingEvents: BriefingEvent[];
  alerts: BriefingAlert[];
  quickActions: QuickAction[];
  archetypeEmoji: string | null;
}

// ─── Relationships ──────────────────────────────────────────────────────────

export interface Relationship {
  id: string;
  relationshipType: RelationshipType;
  status: RelationshipStatus;
  createdAt: string;
  acceptedAt: string | null;
  guardian: { id: string; name: string; email: string; role: string };
  player: { id: string; name: string; email: string; role: string };
}

// Triangle compliance authority tier. T1 <13 (COPPA), T2 13-15
// (GDPR-K 16 EU-wide), T3 ≥16, UNKNOWN = no DOB. Derived server-side
// in getLinkedPlayers (P1.1, migration 063).
export type AgeTier = 'T1' | 'T2' | 'T3' | 'UNKNOWN';

export interface PlayerSummary {
  id: string;
  name: string;
  email: string;
  sport: Sport;
  age?: number;
  ageTier?: AgeTier;
  currentStreak: number;
  totalPoints: number;
  // Snapshot-powered fields (role-filtered via Data Fabric Layer 2)
  readinessRag?: string | null;        // GREEN | AMBER | RED
  acwr?: number | null;
  dualLoadIndex?: number | null;
  wellnessTrend?: string | null;       // IMPROVING | STABLE | DECLINING
  lastSessionAt?: string | null;
  sessionsTotal?: number | null;
  // Legacy (backward compat)
  readiness?: ReadinessLevel | null;
  lastCheckinDate?: string | null;
}

// ─── Suggestions ────────────────────────────────────────────────────────────

export interface Suggestion {
  id: string;
  player_id: string;
  author_id: string;
  author_role: string;
  suggestion_type: SuggestionType;
  title: string;
  payload: Record<string, unknown>;
  status: SuggestionStatus;
  player_notes?: string | null;
  resolved_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  authorName?: string | null;
  playerName?: string | null;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export type NotificationType =
  | 'suggestion_received'
  | 'suggestion_resolved'
  | 'relationship_accepted'
  | 'relationship_declined'
  | 'test_result_added'
  | 'parent_link_request'
  | 'coach_link_request'
  | 'study_info_request'
  | 'coach_drill_assigned'
  | 'coach_programme_published';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ─── Study Plan Types ──────────────────────────────────────────────────────

export type ExamType = 'Quiz' | 'Mid-term' | 'Final' | 'Essay' | 'Presentation';

export interface ExamEntry {
  id: string;
  subject: string;
  examType: ExamType;
  examDate: string; // YYYY-MM-DD
  notes?: string;
}

export interface TrainingPreferences {
  gymSessionsPerWeek: number;
  gymFixedDays: number[];     // 0=Sun..6=Sat
  clubSessionsPerWeek: number;
  clubFixedDays: number[];
}

// School/University daily schedule
export interface SchoolSchedule {
  type: EducationType;      // 'school' | 'university'
  days: number[];           // 0=Sun..6=Sat
  startTime: string;        // HH:mm e.g. "08:00"
  endTime: string;          // HH:mm e.g. "15:00"
}

// Custom user-defined training type
export interface CustomTrainingType {
  id: string;
  name: string;             // "Gym", "Club", "Private Coach"
  icon: string;             // Ionicons name
  sessionsPerWeek: number;
  fixedDays: number[];      // 0=Sun..6=Sat
}

export interface StudyProfile {
  studySubjects: string[];
  examSchedule: ExamEntry[];
  trainingPreferences: TrainingPreferences;
  studyPlanConfig?: StudyPlanConfig;
  schoolHours?: number | null;
  name?: string;
}

export type StudyStrategy = 'last_exam_first' | 'first_exam_first';

export interface StudyPlanConfig {
  daysPerSubject: Record<string, number>; // subject -> sessions per week
  timeSlotStart: string; // HH:mm
  timeSlotEnd: string;   // HH:mm
  sessionDuration: 30 | 45 | 60 | 90;
  strategy: StudyStrategy;
  excludedDays: number[]; // 0=Sun..6=Sat
}

export interface StudyBlock {
  id: string;
  subject: string;
  date: string;      // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  examDate: string;
  examType: ExamType;
}

// Study plan generator result
export interface GeneratorResult {
  blocks: StudyBlock[];
  warnings: string[];  // e.g. "Could not place 2 Math sessions — not enough free days before Apr 15"
}

// ── Saved Study Plans ───────────────────────────────────────────────

export interface SavedStudyPlan {
  id: string;
  name: string;                  // "Mar 16 – Apr 20"
  createdAt: string;
  blocks: StudyBlock[];
  exams: { subject: string; examDate: string; examType: string }[];
  config: StudyPlanConfig;
  dateRange: { start: string; end: string };
  examCount: number;
  blockCount: number;
}

// ── Training Plan Types ─────────────────────────────────────────────

export type TrainingCategory = 'club' | 'gym' | 'personal' | string;

export interface TrainingCategoryConfig {
  id: string;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  mode: 'fixed_days' | 'days_per_week';
  fixedDays: number[];
  daysPerWeek: number;
  sessionDuration: number;
  preferredTime: 'morning' | 'afternoon' | 'evening';
  fixedStartTime?: string;
  fixedEndTime?: string;
  linkedPrograms?: { programId: string; name: string; category?: string }[];
}

export interface TrainingPlanConfig {
  categories: TrainingCategoryConfig[];
  planWeeks: number;
}

export interface TrainingBlock {
  id: string;
  categoryId: string;
  categoryLabel: string;
  categoryColor: string;
  date: string;
  startTime: string;
  endTime: string;
  linkedPrograms?: { programId: string; name: string }[];
}

export interface TrainingGeneratorResult {
  blocks: TrainingBlock[];
  warnings: string[];
}

// Error
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
