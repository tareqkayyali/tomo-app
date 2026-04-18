/**
 * API Service for Tomo
 * Handles all backend API calls
 */

import { Platform } from 'react-native';
import { getIdToken } from './auth';
import { API_BASE_URL, REQUEST_TIMEOUT, MAX_RETRIES, INITIAL_RETRY_DELAY } from './apiConfig';
import { stripEmoji } from '../utils/stripEmoji';
import type {
  CheckinData,
  CheckinResponse,
  TodayResponse,
  UserResponse,
  Checkin,
  ApiError,
  User,
  Sport,
  UserRole,
  ProgressData,
  LeaderboardResponse,
  FeedbackData,
  CalendarEvent,
  CalendarEventInput,
  ChatSendResponse,
  ChatMessagesResponse,
  ChatSuggestionsResponse,
  OnboardingData,
  SportPositionsResponse,
  SleepSyncRequest,
  SleepSyncResponse,
  SleepHistoryResponse,
  NotificationPreferences,
  NotificationPreferencesResponse,
  PrivacySettings,
  PrivacySettingsResponse,
  GhostSuggestionsResponse,
  DailyBriefing,
} from '../types';

/**
 * Delay helper for retry backoff
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a network-level error worth retrying
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // network failures
  // AbortError from AbortController timeout — DOMException may not exist in React Native
  if (error && typeof error === 'object' && 'name' in error && (error as any).name === 'AbortError') return true;
  return false;
}

/**
 * Make authenticated API request with timeout and retry logic
 */
/**
 * Recursively strip ALL emoji from API responses.
 * - Fields named 'emoji' → blanked to ''
 * - ALL string values → emoji characters stripped (event names like "😴 Sleep" → "Sleep")
 * Tomo 友: no emoji in UI — backend/CMS may send them but we never render them.
 */
function stripEmojiFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return stripEmoji(obj);
  if (Array.isArray(obj)) return obj.map(stripEmojiFields);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'emoji' && typeof value === 'string') {
        result[key] = '';
      } else {
        result[key] = stripEmojiFields(value);
      }
    }
    return result;
  }
  return obj;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getIdToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${API_BASE_URL}${endpoint}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        // Backend may return { error: "string" } or { error: { message: "string" } }
        const errMsg =
          typeof data?.error === 'string'
            ? data.error
            : data?.error?.message || `Request failed (${response.status})`;
        throw new Error(errMsg);
      }

      return stripEmojiFields(data) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      // Only retry on network/timeout errors, not API errors
      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        throw error;
      }

      // Exponential backoff: 1s, 2s
      await delay(INITIAL_RETRY_DELAY * Math.pow(2, attempt));
    }
  }

  throw lastError;
}

// ============================================
// Boot — Pre-fetch athlete state during app loading
// ============================================

export interface BootData {
  name: string;
  sport: string;
  position: string | null;
  isStudent: boolean;
  age: number | null;
  streak: number;
  snapshot: Record<string, any> | null;
  todayEvents: {
    id: string;
    title: string;
    type: string;
    startAt: string;
    endAt: string | null;
    intensity: number | null;
  }[];
  latestCheckin: {
    readiness: string;
    energy: number;
    soreness: number;
    sleepHours: number;
    mood: number;
    date: string;
  } | null;
  activeRecs: {
    type: string;
    priority: number;
    title: string;
    bodyShort: string | null;
  }[];
  benchmarkSummary: {
    overallPercentile: number;
    topStrength: string | null;
    topGap: string | null;
  } | null;
  /** Per-metric percentile snapshots — keyed by metricKey (e.g. "hrv_rmssd", "cmj", "sprint_30m") */
  metricPercentiles: Record<string, { percentile: number; zone: string; value: number }>;
  upcomingExams: { title: string; date: string }[];
  currentActiveEvent: {
    id: string;
    title: string;
    type: string;
    startAt: string;
    endAt: string | null;
    intensity: number | null;
  } | null;
  tomorrowFirstEvent: {
    id: string;
    title: string;
    type: string;
    startAt: string;
    endAt: string | null;
    intensity: number | null;
  } | null;
  tomoIntelligenceScore: number | null;
  adaptationCoefficient: number | null;

  // ── Signal Layer (Dashboard) ──
  signalContext: {
    key: string;
    displayName: string;
    subtitle: string;
    color: string;
    heroBackground: string;
    arcOpacity: { large: number; medium: number; small: number };
    pillBackground: string;
    barRgba: string;
    coachingColor: string;
    pills: { label: string; subLabel: string }[];
    coaching: string;
    triggerRows: { metric: string; value: string; baseline: string; delta: string; isPositive: boolean }[];
    adaptedPlan: { sessionName: string; sessionMeta: string } | null;
    showUrgencyBadge: boolean;
    urgencyLabel: string | null;
    signalId: string;
    priority: number;
    evaluatedAt: string;
  } | null;
  recentVitals: { date: string; sleep_hours: number | null; hrv_morning_ms: number | null; energy: number | null; soreness: number | null; mood: number | null; readiness_score: number | null }[];
  yesterdayVitals: { readiness_score: number | null; soreness: number | null; hrv_morning_ms: number | null; sleep_hours: number | null; energy: number | null; mood: number | null } | null;

  // ── Dashboard Enrichment ──
  dashboardRecs: {
    recId: string;
    type: string;
    priority: number;
    title: string;
    bodyShort: string | null;
    bodyLong: string | null;
    context: Record<string, unknown>;
    createdAt: string;
  }[];
  dailyLoad: {
    date: string;
    trainingLoadAu: number;
    sessionCount: number;
  }[];
  activePrograms: {
    programId: string;
    startedAt: string;
    metadata: Record<string, unknown>;
  }[];
  coachProgrammes: {
    id: string;
    name: string;
    description: string | null;
    seasonCycle: string;
    startDate: string;
    weeks: number;
    coachId: string;
  }[];
  recommendedPrograms: {
    programId: string;
    name: string;
    category: string;
    type: string;
    priority: 'mandatory' | 'high' | 'medium';
    durationWeeks: number;
    durationMin: number;
    description: string;
    impact: string;
    frequency: string;
    difficulty: string;
    tags: string[];
    reason: string;
    positionNote: string;
  }[];

  // ── Planning Context (360 planning fields) ──
  planningContext: {
    athlete_mode: string;
    dual_load_zone: string | null;
    applicable_protocol_ids: string[] | null;
    exam_proximity_score: number | null;
    data_confidence_score: number | null;
  } | null;

  // ── Performance Director Context ──
  pdContext: {
    activeProtocols: {
      id: string;
      protocolKey: string;
      name: string;
      severity: string;
      actions: string[];
    }[];
  } | null;

  // ── Dashboard Layout (CMS-managed, screen-level) ──
  dashboardLayout: DashboardLayoutSection[];

  // ── Panel Layouts (CMS-managed, Wave 3b.1) ──
  // Per-panel ordered sub-sections for the three slide-up panels.
  // Mobile iterates and dispatches each item by component_type; an empty
  // array for any panel = use the panel's hardcoded fallback order.
  panelLayouts?: {
    program: DashboardLayoutSection[];
    metrics: DashboardLayoutSection[];
    progress: DashboardLayoutSection[];
  };

  fetchedAt: string;
}

export interface DashboardLayoutSection {
  section_key: string;
  display_name: string;
  component_type: string;
  sort_order: number;
  config: Record<string, unknown>;
  coaching_text: string | null;
}

/**
 * Fetch boot data during app loading screen.
 * Returns athlete snapshot + today's events + checkin + recs + benchmarks.
 */
export async function getBootData(): Promise<BootData> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return apiRequest<BootData>(`/api/v1/boot?tz=${encodeURIComponent(tz)}`);
}

// ============================================
// Check-in & Plan APIs
// ============================================

/**
 * Submit daily check-in
 */
export async function submitCheckin(checkinData: CheckinData): Promise<CheckinResponse> {
  return apiRequest<CheckinResponse>('/api/v1/checkin', {
    method: 'POST',
    body: JSON.stringify(checkinData),
  });
}

/**
 * Get today's check-in and plan
 */
export async function getToday(): Promise<TodayResponse> {
  return apiRequest<TodayResponse>('/api/v1/today');
}

/**
 * Get check-in history
 */
export async function getCheckins(limit: number = 30): Promise<{ count: number; checkins: Checkin[] }> {
  return apiRequest<{ count: number; checkins: Checkin[] }>(`/api/v1/checkins?limit=${limit}`);
}

/**
 * Submit workout feedback
 */
export async function submitFeedback(feedback: FeedbackData): Promise<{ compliance: unknown; gamification: { progress: ProgressData } }> {
  return apiRequest('/api/v1/feedback', {
    method: 'POST',
    body: JSON.stringify(feedback),
  });
}

/**
 * Get user stats
 */
export async function getStats(): Promise<{
  user: Partial<User>;
  progress: ProgressData;
  compliance: {
    totalDays: number;
    fullCompliance: number;
    partialCompliance: number;
    noCompliance: number;
    complianceRate: number;
  };
  recentPoints: Array<{
    basePoints: number;
    multiplier: number;
    finalPoints: number;
    reason: string;
    timestamp: string;
  }>;
}> {
  return apiRequest('/api/v1/stats');
}

// ============================================
// User APIs
// ============================================

/**
 * Map snake_case API user response to camelCase frontend User type.
 * Supabase returns snake_case columns; our frontend types use camelCase.
 */
function mapUserFromApi(raw: Record<string, unknown>): User {
  return {
    id: (raw.id as string) || '',
    uid: (raw.id as string) || '',
    email: (raw.email as string) || '',
    name: (raw.name as string) || '',
    displayName: (raw.display_name as string) || (raw.name as string) || '',
    age: (raw.age as number) || 0,
    sport: (raw.sport as Sport) || 'football',
    role: (raw.role as UserRole) || 'player',
    displayRole: (raw.display_role as string | null) || null,
    region: (raw.region as string) || undefined,
    teamId: (raw.team_id as string | null) || null,
    archetype: (raw.archetype as string | null) || null,
    totalPoints: (raw.total_points as number) || 0,
    currentStreak: (raw.current_streak as number) || 0,
    longestStreak: (raw.longest_streak as number) || 0,
    streakMultiplier: (raw.streak_multiplier as number) || 1,
    streakFreezeTokens: (raw.freeze_tokens as number) || 0,
    milestonesUnlocked: (raw.milestones_unlocked as string[]) || [],
    onboardingComplete: !!(raw.onboarding_complete),
    height: (raw.height as number | null) ?? null,
    weight: (raw.weight as number | null) ?? null,
    gender: (raw.gender as string | null) ?? null,
    // Phase 2 finalize writes football players' position to
    // users.football_position (not users.position). Prefer the
    // sport-specific column, fall back to the generic.
    position: ((raw.football_position as string | null) ?? (raw.position as string | null)) ?? null,
    playingStyle: (raw.playing_style as string | null) ?? null,
    weeklyTrainingDays: (raw.weekly_training_days as number) ?? undefined,
    typicalSessionLength: (raw.typical_session_length as number | null) ?? null,
    seasonPhase: (raw.season_phase as string) ?? undefined,
    typicalSleepHours: (raw.typical_sleep_hours as number | null) ?? null,
    baselineEnergy: (raw.baseline_energy as number | null) ?? null,
    injuries: (raw.injuries as string | null) ?? null,
    painAreas: (raw.pain_areas as string[]) || [],
    isStudent: !!(raw.is_student),
    schoolHours: (raw.school_hours as number | null) ?? null,
    examPeriods: (raw.exam_periods as string | null) ?? null,
    primaryGoal: (raw.primary_goal as string | null) ?? null,
    selfSelectedArchetype: (raw.self_selected_archetype as string | null) ?? null,
    healthKitConnected: !!(raw.health_kit_connected),
    fcmToken: (raw.fcm_token as string | null) ?? null,
    parentalConsent: !!(raw.parental_consent),
    consentStatus: (raw.consent_status as User['consentStatus']) ?? 'active',
    selectedSports: (raw.selected_sports as string[]) || [],
    photoUrl: (raw.photo_url as string | null) ?? null,

    // Study plan fields
    studySubjects: (raw.study_subjects as string[]) || [],
    examSchedule: (raw.exam_schedule as unknown[]) as User['examSchedule'] || [],
    trainingPreferences: (raw.training_preferences as User['trainingPreferences']) || undefined,
    studyPlanConfig: (raw.study_plan_config as User['studyPlanConfig']) || undefined,
    customTrainingTypes: (raw.custom_training_types as User['customTrainingTypes']) || undefined,
    connectedWearables: (raw.connected_wearables as User['connectedWearables']) || undefined,
    dateOfBirth: (raw.date_of_birth as string | null) ?? null,
  } as User;
}

/** Wrap any API response that has a `.user` field to map it */
function mapUserResponse(raw: { user: Record<string, unknown> }): UserResponse {
  return { user: mapUserFromApi(raw.user) };
}

/**
 * Get current user profile
 */
export async function getUser(): Promise<UserResponse> {
  const raw = await apiRequest<{ user: Record<string, unknown> }>('/api/v1/user');
  return mapUserResponse(raw);
}

/**
 * Update user profile
 */
export async function updateUser(updates: Partial<User>): Promise<UserResponse> {
  const raw = await apiRequest<{ user: Record<string, unknown> }>('/api/v1/user', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return mapUserResponse(raw);
}

/**
 * Register new user
 *
 * Requires date_of_birth + legal versions per Phase 1 compliance.
 * Server rejects <13 with code UNDER_MIN_AGE and stale versions with
 * STALE_LEGAL_VERSION — callers should surface these to the UI.
 */
export type RegisterUserPayload = {
  name: string;
  displayName?: string;
  sport?: string;
  role?: UserRole;
  displayRole?: string;
  dateOfBirth: string; // YYYY-MM-DD
  tosVersion: string;
  privacyVersion: string;
  regionCode?: string;
};

export type RegisterUserResponse = UserResponse & {
  ageBand?: string;
  consentStatus?: 'active' | 'awaiting_parent' | 'revoked';
  requiresParentalConsent?: boolean;
};

export async function registerUser(userData: RegisterUserPayload): Promise<RegisterUserResponse> {
  const raw = await apiRequest<{
    user: Record<string, unknown>;
    ageBand?: string;
    consentStatus?: 'active' | 'awaiting_parent' | 'revoked';
    requiresParentalConsent?: boolean;
  }>('/api/v1/user/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
  const base = mapUserResponse(raw);
  return {
    ...base,
    ageBand: raw.ageBand,
    consentStatus: raw.consentStatus,
    requiresParentalConsent: raw.requiresParentalConsent,
  };
}

// ============================================
// Onboarding APIs (Phase 2)
// ============================================

export type OnboardingStep = 'sport' | 'position' | 'heightWeight' | 'goal';

export type OnboardingAnswers = {
  sport?: 'football' | 'soccer' | 'basketball' | 'tennis' | 'padel';
  position?: string;
  heightCm?: number;
  weightKg?: number;
  primaryGoal?: 'get_better' | 'stay_consistent' | 'recover' | 'get_recruited' | 'have_fun';
};

export type OnboardingState = {
  step: OnboardingStep;
  answers: OnboardingAnswers;
  updatedAt: string;
};

/**
 * Save a single step's answers. Server merges into the existing
 * users.onboarding_state JSONB. Returns the full merged state.
 */
export async function saveOnboardingProgress(
  step: OnboardingStep,
  answers: OnboardingAnswers
): Promise<OnboardingState> {
  const res = await apiRequest<{ state: OnboardingState; alreadyComplete?: boolean }>(
    '/api/v1/user/onboarding/progress',
    {
      method: 'POST',
      body: JSON.stringify({ step, answers }),
    }
  );
  return res.state;
}

/**
 * Load current onboarding state so the mobile navigator can resume
 * at the last unanswered step.
 */
export async function getOnboardingProgress(): Promise<{
  state: OnboardingState | null;
  onboardingComplete: boolean;
}> {
  return apiRequest<{ state: OnboardingState | null; onboardingComplete: boolean }>(
    '/api/v1/user/onboarding/progress'
  );
}

/**
 * Finalize onboarding: materialises answers into top-level columns,
 * seeds My Rules, fires the PHV event, flips onboarding_complete.
 * The client may optionally pass the last screen's answers in the
 * body as insurance against a lost /progress save.
 */
export async function finalizeOnboarding(
  answers?: OnboardingAnswers
): Promise<{ user: unknown; ageBand?: string }> {
  return apiRequest<{ user: unknown; ageBand?: string }>(
    '/api/v1/user/onboarding/finalize',
    {
      method: 'POST',
      body: JSON.stringify(answers ?? {}),
    }
  );
}

// ============================================
// Leaderboard APIs
// ============================================

/**
 * Get global leaderboard
 */
export async function getGlobalLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('/api/v1/leaderboards/global');
}

/**
 * Get streak leaderboard
 */
export async function getStreakLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('/api/v1/leaderboards/streaks');
}

/**
 * Get local/region leaderboard
 */
export async function getLocalLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('/api/v1/leaderboards/local');
}

/**
 * Get archetype leaderboard
 */
export async function getArchetypeLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('/api/v1/leaderboards/archetype');
}

/**
 * Get team leaderboard
 */
export async function getTeamLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('/api/v1/leaderboards/team');
}

/**
 * Get nearby ranks for current user
 */
export async function getNearbyRanks(): Promise<unknown> {
  return apiRequest('/api/v1/leaderboards/nearby');
}

/**
 * Get archetypes info
 */
export async function getArchetypes(): Promise<unknown> {
  return apiRequest('/api/v1/archetypes');
}

// ============================================
// Onboarding APIs
// ============================================

/**
 * Submit onboarding profile data
 */
export async function submitOnboarding(
  data: OnboardingData,
): Promise<UserResponse> {
  const raw = await apiRequest<{ user: Record<string, unknown> }>('/api/v1/user/onboarding', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return mapUserResponse(raw);
}

/**
 * Get sport-specific positions and playing styles
 */
export async function getSportPositions(
  sport: string,
): Promise<SportPositionsResponse> {
  return apiRequest<SportPositionsResponse>(`/api/v1/sports/${sport}/positions`);
}

// ============================================
// Calendar Event APIs
// ============================================

/** Get user's IANA timezone */
function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  eventData: CalendarEventInput,
): Promise<{ event: CalendarEvent }> {
  return apiRequest<{ event: CalendarEvent }>('/api/v1/calendar/events', {
    method: 'POST',
    body: JSON.stringify({ ...eventData, timezone: getUserTimezone() }),
  });
}

/**
 * Get calendar events for a specific date
 */
export async function getCalendarEventsByDate(
  date: string,
): Promise<{ events: CalendarEvent[] }> {
  const tz = encodeURIComponent(getUserTimezone());
  return apiRequest<{ events: CalendarEvent[] }>(
    `/api/v1/calendar/events?date=${date}&tz=${tz}`,
  );
}

/**
 * Get calendar events for a date range
 */
export async function getCalendarEventsByRange(
  startDate: string,
  endDate: string,
): Promise<{ events: CalendarEvent[] }> {
  const tz = encodeURIComponent(getUserTimezone());
  return apiRequest<{ events: CalendarEvent[] }>(
    `/api/v1/calendar/events?startDate=${startDate}&endDate=${endDate}&tz=${tz}`,
  );
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/api/v1/calendar/events/${eventId}`, {
    method: 'DELETE',
  });
}

/**
 * Update a calendar event (partial — e.g. time change from drag-drop)
 */
export async function updateCalendarEvent(
  eventId: string,
  patch: { date?: string; startTime?: string; endTime?: string | null; notes?: string; name?: string; intensity?: string | null },
): Promise<{ event: CalendarEvent }> {
  return apiRequest<{ event: CalendarEvent }>(`/api/v1/calendar/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...patch, timezone: getUserTimezone() }),
  });
}

/**
 * Toggle a calendar event's completed flag. Server manages
 * completed_at transition (sets on false→true, clears on undo).
 * Drives the weekly compliance cron — without this being called,
 * athlete_week_plans.compliance_rate stays null and adaptive /suggest
 * defaults never kick in for week 2+.
 */
export async function setCalendarEventCompleted(
  eventId: string,
  completed: boolean,
): Promise<{ event: CalendarEvent }> {
  return apiRequest<{ event: CalendarEvent }>(`/api/v1/calendar/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ completed, timezone: getUserTimezone() }),
  });
}

// ============================================
// Program Search API
// ============================================

export interface ProgramSearchResult {
  id: string;
  name: string;
  category: string;
  type: string;
  duration_weeks?: number;
  difficulty?: string;
  description?: string;
}

export async function searchPrograms(
  query?: string,
  category?: string,
): Promise<{ programs: ProgramSearchResult[] }> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('category', category);
  const qs = params.toString();
  return apiRequest(`/api/v1/programs${qs ? '?' + qs : ''}`);
}

// ============================================
// Event-scoped Linked Programs API
// ============================================
// Canonical home for linked programs (post migration 049). Replaces the
// schedule_rules.preferences.training_categories[].linkedPrograms anti-pattern.
// Each link/unlink is a durable op — no "Save" needed, the EventEditScreen
// uses these directly so unlinking is immediate.

export interface EventLinkedProgram {
  id: string;           // join row id
  programId: string;    // training_programs.id
  name: string;
  category: string;
  type: string;
  description: string;
  durationMinutes: number;
  durationWeeks: number;
  difficulty: string;
  tags: string[];
  linkedAt: string;
  linkedBy: 'user' | 'tomo' | 'admin';
}

export async function getEventLinkedPrograms(
  eventId: string,
): Promise<{ linkedPrograms: EventLinkedProgram[] }> {
  return apiRequest(`/api/v1/calendar/events/${eventId}/linked-programs`);
}

export async function linkProgramToEvent(
  eventId: string,
  programId: string,
  linkedBy: 'user' | 'tomo' | 'admin' = 'user',
): Promise<{ link: { id: string; programId: string; linkedAt: string; linkedBy: string; name: string; category: string } }> {
  return apiRequest(`/api/v1/calendar/events/${eventId}/linked-programs`, {
    method: 'POST',
    body: JSON.stringify({ programId, linkedBy }),
  });
}

export async function unlinkProgramFromEvent(
  eventId: string,
  programId: string,
): Promise<{ success: boolean }> {
  return apiRequest(
    `/api/v1/calendar/events/${eventId}/linked-programs?programId=${encodeURIComponent(programId)}`,
    { method: 'DELETE' },
  );
}

// ============================================
// Training Journal APIs
// ============================================

export interface JournalEntry {
  id: string;
  user_id: string;
  calendar_event_id: string;
  event_date: string;
  training_category: string;
  training_name: string;
  pre_target: string | null;
  pre_mental_cue: string | null;
  pre_focus_tag: string | null;
  pre_set_at: string | null;
  post_outcome: 'fell_short' | 'hit_it' | 'exceeded' | null;
  post_reflection: string | null;
  post_next_focus: string | null;
  post_body_feel: number | null;
  post_set_at: string | null;
  journal_variant: 'standard' | 'recovery' | 'match';
  ai_insight: string | null;
  journal_state: 'empty' | 'pre_set' | 'complete';
  locked_at: string | null;
}

export async function saveJournalPreSession(input: {
  calendar_event_id: string;
  pre_target: string;
  pre_mental_cue?: string;
  pre_focus_tag?: string;
}): Promise<{ journal_id: string; journal_state: string; message: string }> {
  return apiRequest('/api/v1/journal/pre-session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function saveJournalPostSession(input: {
  journal_id: string;
  post_outcome: 'fell_short' | 'hit_it' | 'exceeded';
  post_reflection: string;
  post_next_focus?: string;
  post_body_feel?: number;
}): Promise<{ journal_id: string; journal_state: string; ai_insight: string | null; message: string }> {
  return apiRequest('/api/v1/journal/post-session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getJournalForEvent(calendarEventId: string): Promise<{ journal: JournalEntry | null }> {
  return apiRequest(`/api/v1/journal/${calendarEventId}`);
}

export async function getJournalHistory(
  limit: number = 20,
  offset: number = 0,
): Promise<{ journals: JournalEntry[]; total: number }> {
  return apiRequest(`/api/v1/journal?limit=${limit}&offset=${offset}`);
}

// ============================================
// Day Lock APIs
// ============================================

/**
 * Get lock status for a day
 */
export async function getDayLockStatus(date: string): Promise<{ locked: boolean; lockedAt: string | null }> {
  return apiRequest<{ locked: boolean; lockedAt: string | null }>(`/api/v1/calendar/day-lock?date=${date}`);
}

/**
 * Lock a day
 */
export async function lockDay(date: string): Promise<{ locked: boolean; lockedAt: string | null }> {
  return apiRequest<{ locked: boolean; lockedAt: string | null }>('/api/v1/calendar/day-lock', {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
}

/**
 * Unlock a day
 */
export async function unlockDay(date: string): Promise<{ locked: boolean }> {
  return apiRequest<{ locked: boolean }>(`/api/v1/calendar/day-lock?date=${date}`, {
    method: 'DELETE',
  });
}

// ============================================
// Ghost Suggestion APIs
// ============================================

/**
 * Get AI-suggested ghost events based on detected patterns
 */
export async function getGhostSuggestions(): Promise<GhostSuggestionsResponse> {
  return apiRequest<GhostSuggestionsResponse>('/api/v1/calendar/ghost-suggestions');
}

/**
 * Confirm a ghost suggestion and create a real calendar event
 */
export async function confirmGhostSuggestion(
  data: CalendarEventInput,
): Promise<{ event: CalendarEvent }> {
  return apiRequest<{ event: CalendarEvent }>('/api/v1/calendar/ghost-suggestions/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Dismiss a ghost suggestion so it won't reappear
 */
export async function dismissGhostSuggestion(
  patternKey: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>('/api/v1/calendar/ghost-suggestions/dismiss', {
    method: 'POST',
    body: JSON.stringify({ patternKey }),
  });
}

// ============================================
// Chat APIs
// ============================================

/**
 * Send a chat message and get AI response
 * Uses a longer timeout (60s) since Claude with tool use can take 20-30s
 * Accepts optional AbortSignal for cancellation
 */
export async function sendChatMessage(
  message: string,
  signal?: AbortSignal,
): Promise<ChatSendResponse> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const url = `${API_BASE_URL}/api/v1/chat/send`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 60000);

  // If external signal aborts, also abort our controller
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Request cancelled');
    }
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      const errMsg = (data as ApiError).error?.message || 'Request failed';
      throw new Error(errMsg);
    }
    return data as ChatSendResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/** SSE event from the streaming chat endpoint */
export interface StreamEvent {
  type: 'delta' | 'status' | 'done' | 'error';
  text?: string;
  error?: string;
  userMessage?: ChatSendResponse['userMessage'];
  aiMessage?: ChatSendResponse['aiMessage'];
  intent?: string;
}

/**
 * Stream a chat message response via SSE (ChatGPT-style word-by-word)
 * Uses XMLHttpRequest for React Native SSE compatibility
 */
export async function streamChatMessage(
  message: string,
  onDelta: (text: string) => void,
  onStatus: (text: string) => void,
  onDone: (data: { userMessage: ChatSendResponse['userMessage']; aiMessage: ChatSendResponse['aiMessage']; intent: string }) => void,
  onError: (error: string) => void,
): Promise<void> {
  const token = await getIdToken();
  if (!token) {
    onError('Not authenticated');
    return;
  }

  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_BASE_URL}/api/v1/chat/stream`;

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    let lastIndex = 0;
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;

      // Parse SSE events from the new data chunk
      // Backend sends: event: <type>\ndata: <json>\n\n
      const lines = newData.split('\n');
      let currentEventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.substring(7).trim();
          continue;
        }
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.substring(6));
          switch (currentEventType) {
            case 'delta':
              if (data.text) onDelta(data.text);
              break;
            case 'status':
              if (data.status) onStatus(data.status);
              break;
            case 'done':
              if (data.userMessage && data.aiMessage) {
                onDone({
                  userMessage: data.userMessage,
                  aiMessage: data.aiMessage,
                  intent: data.intent || '',
                });
              }
              break;
            case 'error':
              onError(data.error || 'Stream error');
              break;
          }
          currentEventType = '';
        } catch {
          // Ignore parse errors on partial chunks
        }
      }
    };

    xhr.onloadend = () => finish();

    xhr.onerror = () => {
      onError('Network error');
      finish();
    };

    xhr.ontimeout = () => {
      onError('Request timed out');
      finish();
    };

    // Longer timeout for streaming (60s vs 15s for regular requests)
    xhr.timeout = 60000;
    xhr.send(JSON.stringify({ message }));
  });
}

/**
 * Stream agent chat — SSE endpoint with status events during tool execution.
 * Sends: status (tool execution), done (final result), error.
 * Use this for real-time UX; falls back to non-streaming /chat/agent if SSE fails.
 */
export async function streamAgentMessage(
  payload: {
    message: string;
    sessionId?: string;
    activeTab?: string;
    timezone?: string;
    confirmedAction?: any;
    capsuleAction?: any;
  },
  onStatus: (status: string) => void,
  onDone: (data: any) => void,
  onError: (error: string) => void,
): Promise<void> {
  const token = await getIdToken();
  if (!token) {
    onError('Not authenticated');
    return;
  }

  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_BASE_URL}/api/v1/chat/agent-stream`;

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    let lastIndex = 0;
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;

      const lines = newData.split('\n');
      let currentEventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.substring(7).trim();
          continue;
        }
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.substring(6));
          switch (currentEventType) {
            case 'status':
              if (data.status) onStatus(data.status);
              break;
            case 'done':
              onDone(data);
              break;
            case 'error':
              onError(data.error || 'Stream error');
              break;
          }
          currentEventType = '';
        } catch {
          // Ignore parse errors on partial chunks
        }
      }
    };

    xhr.onloadend = () => finish();
    xhr.onerror = () => { onError('Network error'); finish(); };
    xhr.ontimeout = () => { onError('Request timed out'); finish(); };
    xhr.timeout = 60000;
    xhr.send(JSON.stringify(payload));
  });
}

/**
 * Get recent chat messages
 */
export async function getChatMessages(
  limit: number = 20,
): Promise<ChatMessagesResponse> {
  return apiRequest<ChatMessagesResponse>(`/api/v1/chat/messages?limit=${limit}`);
}

/**
 * Get dynamic suggestion chips
 */
export async function getChatSuggestions(): Promise<ChatSuggestionsResponse> {
  return apiRequest<ChatSuggestionsResponse>('/api/v1/chat/suggestions');
}

/**
 * Get daily briefing for Command & Control Center
 * Passes local hour for timezone-aware greetings
 */
export async function getBriefing(): Promise<DailyBriefing> {
  const hour = new Date().getHours();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return apiRequest<DailyBriefing>(`/api/v1/chat/briefing?hour=${hour}&tz=${encodeURIComponent(tz)}`);
}

// ============================================
// Agent Chat — Command Center (complements existing chat)
// ============================================

export interface AgentChatRequest {
  message: string;
  sessionId?: string;
  activeTab?: string;
  timezone?: string; // IANA timezone e.g. "Asia/Riyadh"
  confirmedAction?: {
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
    actions?: Array<{
      toolName: string;
      toolInput: Record<string, any>;
      agentType: string;
      preview: string;
    }>;
  };
  capsuleAction?: {
    type: string;
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
  };
}

export interface AgentChatResponse {
  message: string;
  structured?: import('../types/chat').TomoResponse | null;
  sessionId?: string;
  refreshTargets: string[];
  pendingConfirmation: {
    toolName: string;
    toolInput: Record<string, any>;
    agentType: string;
    preview: string;
    /** Batch actions — when multiple writes need confirmation */
    actions?: Array<{
      toolName: string;
      toolInput: Record<string, any>;
      agentType: string;
      preview: string;
    }>;
  } | null;
  context: {
    ageBand: string | null;
    readinessScore: string | null;
    activeTab: string;
  };
}

/**
 * Send a message to the agent-based chat endpoint.
 * Routes to specialized agents (Timeline, Output, Mastery)
 * and can execute calendar operations, log check-ins, etc.
 */
export async function sendAgentChatMessage(
  payload: AgentChatRequest,
  signal?: AbortSignal,
): Promise<AgentChatResponse> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const url = `${API_BASE_URL}/api/v1/chat/agent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Request cancelled');
    }
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Agent chat request failed');
    }

    return data as AgentChatResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * SSE streaming chat — sends a message and streams back deltas in real-time.
 *
 * Uses XMLHttpRequest for React Native compatibility (fetch doesn't support
 * ReadableStream on mobile). XHR fires onprogress with partial responseText,
 * allowing us to parse SSE events incrementally.
 */
export async function sendAgentChatMessageStreaming(
  payload: AgentChatRequest,
  callbacks: {
    onDelta: (text: string) => void;
    onStatus: (status: string) => void;
    onDone: (response: AgentChatResponse) => void;
    onError: (error: Error) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const token = await getIdToken();
  if (!token) {
    callbacks.onError(new Error('Not authenticated'));
    return;
  }

  const url = `${API_BASE_URL}/api/v1/chat/agent?stream=true`;

  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    let processedLength = 0;
    let currentEvent = '';
    let lineBuffer = ''; // Buffer for partial lines across XHR chunks
    let settled = false;

    const settle = () => {
      if (!settled) { settled = true; resolve(); }
    };

    // Handle abort
    if (signal) {
      if (signal.aborted) { settle(); return; }
      signal.addEventListener('abort', () => { xhr.abort(); settle(); });
    }

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    // Dispatch a fully-received SSE line
    const processLine = (line: string) => {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          if (currentEvent === 'delta') {
            callbacks.onDelta(data.text);
          } else if (currentEvent === 'status') {
            callbacks.onStatus(data.status);
          } else if (currentEvent === 'done') {
            callbacks.onDone(data as AgentChatResponse);
          } else if (currentEvent === 'error') {
            callbacks.onError(new Error(data.error));
          }
        } catch { /* ignore malformed SSE line */ }
        currentEvent = '';
      }
    };

    // Process partial SSE data as it arrives, buffering incomplete lines
    xhr.onprogress = () => {
      const newText = xhr.responseText.substring(processedLength);
      processedLength = xhr.responseText.length;

      // Prepend any leftover from the previous chunk
      const fullText = lineBuffer + newText;
      const lines = fullText.split('\n');

      // Last element may be an incomplete line — keep it for next chunk
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        processLine(line);
      }
    };

    xhr.onload = () => {
      // Flush any remaining buffered line (final SSE data may arrive without trailing \n)
      if (lineBuffer.trim()) {
        processLine(lineBuffer);
        lineBuffer = '';
      }
      if (xhr.status >= 400) {
        try {
          const errData = JSON.parse(xhr.responseText);
          callbacks.onError(new Error(errData.error || `HTTP ${xhr.status}`));
        } catch {
          callbacks.onError(new Error(`HTTP ${xhr.status}`));
        }
      }
      settle();
    };

    xhr.onerror = () => {
      if (!signal?.aborted) {
        callbacks.onError(new Error('Stream connection failed'));
      }
      settle();
    };

    xhr.onabort = () => settle();

    xhr.send(JSON.stringify(payload));
  });
}

/**
 * Transcribe audio to text using Whisper via the backend.
 * Accepts a local file URI (e.g. from expo-av recording).
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'voice.m4a',
  } as any);

  const response = await fetch(`${API_BASE_URL}/api/v1/chat/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Transcription failed');
  }

  const data = await response.json();
  return data.text;
}

// ============================================
// Chat Sessions — Server-side session management
// ============================================

export async function listChatSessions(): Promise<import('../types/chat').ChatSession[]> {
  const data = await apiRequest<{ sessions: import('../types/chat').ChatSession[] }>(
    '/api/v1/chat/sessions',
  );
  return data.sessions;
}

export async function createChatSession(): Promise<import('../types/chat').ChatSession> {
  const data = await apiRequest<{ session: import('../types/chat').ChatSession }>(
    '/api/v1/chat/sessions',
    { method: 'POST' },
  );
  return data.session;
}

export async function loadChatSession(
  sessionId: string,
): Promise<import('../types/chat').ChatMessageRecord[]> {
  const data = await apiRequest<{ messages: import('../types/chat').ChatMessageRecord[] }>(
    `/api/v1/chat/sessions/${sessionId}`,
  );
  return data.messages;
}

export async function endChatSession(sessionId: string): Promise<void> {
  await apiRequest(`/api/v1/chat/sessions/${sessionId}`, { method: 'DELETE' });
}

// ============================================
// For You — AI Recommendations
// ============================================

export interface ForYouQuickAction {
  label: string;
  icon: string;
  screen: string;
  params?: Record<string, unknown>;
}

export interface ForYouContent {
  greeting: string;
  readiness: {
    score: number;
    status: 'green' | 'yellow' | 'red' | 'unknown';
    label: string;
  };
  focusArea: {
    attribute: string;
    attributeKey: string;
    score: number;
    headline: string;
    description: string;
    drills: string[];
    color: string;
    ctaScreen: string;
    ctaLabel: string;
  } | null;
  tomorrowPreview: {
    intensity: string;
    workoutType: string;
    duration: number;
    description: string;
  } | null;
  recoveryTips: Array<{
    emoji: string;
    title: string;
    detail: string;
    color: string;
  }>;
  nextMilestone: {
    name: string;
    current: number;
    target: number;
    progress: number;
  } | null;
  peerInsight: string | null;
  challenge: {
    title: string;
    description: string;
    metric: string;
    ctaScreen: string;
  } | null;
  alerts: Array<{
    type: string;
    emoji: string;
    message: string;
    severity: 'info' | 'warn' | 'critical';
  }>;
  quickActions: ForYouQuickAction[];
  recommendations: Array<{
    recType: 'READINESS' | 'LOAD_WARNING' | 'RECOVERY' | 'DEVELOPMENT' | 'ACADEMIC' | 'CV_OPPORTUNITY' | 'TRIANGLE_ALERT' | 'MOTIVATION';
    priority: 1 | 2 | 3 | 4;
    title: string;
    bodyShort: string;
    bodyLong: string;
    confidence: number;
  }>;
  generatedAt: string;
}

/**
 * Get AI-generated For You recommendations.
 * Uses a longer timeout (45s) since Claude AI may take 10-20s.
 * Passes local hour for timezone-aware greetings.
 */
export async function getForYouRecommendations(): Promise<ForYouContent> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const hour = new Date().getHours();
  const url = `${API_BASE_URL}/api/v1/for-you?hour=${hour}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as any).error || `HTTP ${response.status}`);
    }

    const json = await response.json();
    return (json as any).data as ForYouContent;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

// ============================================
// Padel Progress APIs
// ============================================

/**
 * Sync padel progress data to backend (DNA card, shot mastery, rating)
 */
export async function syncPadelProgress(data: {
  dnaCard: Record<string, { score: number; trend: number; sources: string[]; sourcesAvailable: number; sourcesTotal: number }>;
  shotRatings: {
    overallShotMastery: number;
    shots: Record<string, { rating: number; subMetrics: Record<string, number>; trend: number; sessionsLogged: number }>;
    shotVarietyIndex: number;
    strongestShot: string;
    weakestShot: string;
  };
  padelRating: number;
  padelLevel: string;
  overallRating: number;
  tier: string;
}): Promise<{ padelProgress: unknown }> {
  return apiRequest<{ padelProgress: unknown }>('/api/v1/padel/progress', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ============================================
// BlazePod APIs
// ============================================

export interface BlazePodSessionInput {
  drillId: string;
  drillName: string;
  sets: number;
  totalTouches: number;
  bestReactionTime: number | null;
  avgReactionTime: number | null;
  rpe: number;
  durationSeconds: number;
  notes?: string;
}

export interface BlazePodSession extends BlazePodSessionInput {
  id: string;
  userId: string;
  createdAt: string;
}

/**
 * Save a BlazePod drill session
 */
export async function saveBlazePodSession(
  session: BlazePodSessionInput,
): Promise<{ session: BlazePodSession }> {
  return apiRequest<{ session: BlazePodSession }>('/api/v1/blazepods/session', {
    method: 'POST',
    body: JSON.stringify(session),
  });
}

/**
 * Get BlazePod session history
 */
export async function getBlazePodHistory(
  limit: number = 20,
): Promise<{ sessions: BlazePodSession[]; count: number }> {
  return apiRequest<{ sessions: BlazePodSession[]; count: number }>(
    `/api/v1/blazepods/history?limit=${limit}`,
  );
}

// ============================================
// Phone Test APIs
// ============================================

import type {
  PhoneTestSessionInput,
  PhoneTestSession,
  PhoneTestHistoryResponse,
} from '../types/phoneTests';

/**
 * Save a phone test session
 */
export async function savePhoneTestSession(
  session: PhoneTestSessionInput,
): Promise<{ session: PhoneTestSession }> {
  return apiRequest<{ session: PhoneTestSession }>('/api/v1/phone-tests/session', {
    method: 'POST',
    body: JSON.stringify(session),
  });
}

/**
 * Get phone test session history
 */
export async function getPhoneTestHistory(
  limit: number = 20,
  testId?: string,
): Promise<PhoneTestHistoryResponse> {
  const params = testId ? `?limit=${limit}&testId=${testId}` : `?limit=${limit}`;
  return apiRequest<PhoneTestHistoryResponse>(`/api/v1/phone-tests/history${params}`);
}

// ============================================
// Football Test APIs
// ============================================

import type {
  FootballTestResultInput,
  FootballTestResult,
  FootballTestHistoryResponse,
} from '../types/footballTests';

/**
 * Save a football test result
 */
export async function saveFootballTestResult(
  input: FootballTestResultInput,
): Promise<{ result: FootballTestResult }> {
  return apiRequest<{ result: FootballTestResult }>('/api/v1/football-tests/session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Get football test result history
 */
export async function getFootballTestHistory(
  limit: number = 20,
  testType?: string,
): Promise<FootballTestHistoryResponse> {
  const params = testType ? `?limit=${limit}&testType=${testType}` : `?limit=${limit}`;
  return apiRequest<FootballTestHistoryResponse>(`/api/v1/football-tests/history${params}`);
}

// ============================================
// Padel Shot APIs
// ============================================

import type {
  PadelShotSessionInput,
  PadelShotResult,
  PadelShotHistoryResponse,
} from '../types/padelShots';

/**
 * Save a padel shot session (multiple shot ratings)
 */
export async function savePadelShotSession(
  input: PadelShotSessionInput,
): Promise<{ results: PadelShotResult[]; count: number }> {
  return apiRequest<{ results: PadelShotResult[]; count: number }>('/api/v1/padel-shots/session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Get padel shot result history
 */
export async function getPadelShotHistory(
  limit: number = 50,
  shotType?: string,
): Promise<PadelShotHistoryResponse> {
  const params = shotType ? `?limit=${limit}&shotType=${shotType}` : `?limit=${limit}`;
  return apiRequest<PadelShotHistoryResponse>(`/api/v1/padel-shots/history${params}`);
}

// ============================================
// Health Data / Vitals APIs
// ============================================

export interface VitalsResponse {
  vitals: Record<string, Array<{ date: string; value: number; unit: string | null; source: string | null }>>;
  count: number;
}

export async function getVitals(days: number = 7, metric?: string): Promise<VitalsResponse> {
  const params = metric
    ? `?days=${days}&metric=${metric}`
    : `?days=${days}`;
  return apiRequest<VitalsResponse>(`/api/v1/health-data${params}`);
}

export async function logVital(data: {
  metricType: string;
  value: number;
  unit?: string;
  date?: string;
  source?: string;
}): Promise<{ data: unknown }> {
  return apiRequest<{ data: unknown }>('/api/v1/health-data', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================
// Test Catalog + My Results APIs
// ============================================

export interface TestCatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  emoji: string;
  description: string;
  direction: 'higher' | 'lower';
  tags: string[];
}

export async function searchTestCatalog(q?: string, category?: string): Promise<{ tests: TestCatalogItem[]; count: number }> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const qs = params.toString();
  return apiRequest<{ tests: TestCatalogItem[]; count: number }>(`/api/v1/tests/catalog${qs ? '?' + qs : ''}`);
}

export interface MyTestResult {
  id: string;
  testType: string;
  score: number | null;
  rawData: Record<string, unknown> | null;
  date: string;
  createdAt: string;
}

export async function getMyTestResults(limit: number = 50, testType?: string): Promise<{ results: MyTestResult[]; count: number }> {
  const params = testType
    ? `?limit=${limit}&testType=${testType}`
    : `?limit=${limit}`;
  return apiRequest<{ results: MyTestResult[]; count: number }>(`/api/v1/tests/my-results${params}`);
}

export async function logTestResult(data: {
  testType: string;
  score: number;
  unit?: string;
  date?: string;
  notes?: string;
}): Promise<{
  result: { id: string; testType: string; score: number; date: string };
  benchmark?: BenchmarkResult | null;
}> {
  return apiRequest<{
    result: { id: string; testType: string; score: number; date: string };
    benchmark?: BenchmarkResult | null;
  }>('/api/v1/tests/my-results', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteTestResult(metricKey: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/api/v1/tests/my-results?metricKey=${encodeURIComponent(metricKey)}`, {
    method: 'DELETE',
  });
}

// Re-export API_BASE_URL for diagnostics
export { API_BASE_URL } from './apiConfig';

// ============================================
// Sleep APIs
// ============================================

/**
 * Sync sleep data to backend (from HealthKit or manual entry)
 */
export async function syncSleep(data: SleepSyncRequest): Promise<SleepSyncResponse> {
  return apiRequest<SleepSyncResponse>('/api/v1/sleep/sync', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Get sleep log history
 */
export async function getSleepHistory(days: number = 14): Promise<SleepHistoryResponse> {
  return apiRequest<SleepHistoryResponse>(`/api/v1/sleep/history?days=${days}`);
}

// ============================================
// Notification APIs
// ============================================

/**
 * Get notification preferences
 */
export async function getNotificationSettings(): Promise<NotificationPreferencesResponse> {
  return apiRequest<NotificationPreferencesResponse>('/api/v1/notifications/settings');
}

/**
 * Update notification preferences
 */
export async function updateNotificationSettings(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferencesResponse> {
  return apiRequest<NotificationPreferencesResponse>('/api/v1/notifications/settings', {
    method: 'POST',
    body: JSON.stringify(prefs),
  });
}

// ============================================
// Privacy Settings APIs
// ============================================

/**
 * Get privacy settings
 */
export async function getPrivacySettings(): Promise<PrivacySettingsResponse> {
  return apiRequest<PrivacySettingsResponse>('/api/v1/user/privacy');
}

/**
 * Update privacy settings
 */
export async function updatePrivacySettings(
  settings: Partial<PrivacySettings>,
): Promise<{ privacySettings: PrivacySettings }> {
  return apiRequest<{ privacySettings: PrivacySettings }>('/api/v1/user/privacy', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// ============================================
// Health Check
// ============================================

/**
 * Check if API is healthy (no auth required)
 */
export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      signal: controller.signal,
    });
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// Multi-Role: Relationships
// ============================================

import type {
  Relationship,
  PlayerSummary,
  Suggestion,
  AppNotification,
} from '../types';

/**
 * Get all relationships for the current user
 */
export async function getRelationships(): Promise<{ relationships: Relationship[] }> {
  return apiRequest<{ relationships: Relationship[] }>('/api/v1/relationships');
}

/**
 * Generate an invite code (coach/parent only)
 */
export async function generateInviteCode(
  targetRole: 'coach' | 'parent',
): Promise<{ code: string; expiresAt: string }> {
  return apiRequest<{ code: string; expiresAt: string }>('/api/v1/relationships/invite', {
    method: 'POST',
    body: JSON.stringify({ targetRole }),
  });
}

/**
 * Accept an invite code (player only)
 */
export async function acceptInviteCode(
  code: string,
): Promise<{ relationshipId: string; guardianId: string; relationshipType: string }> {
  return apiRequest<{ relationshipId: string; guardianId: string; relationshipType: string }>(
    '/api/v1/relationships/accept',
    { method: 'POST', body: JSON.stringify({ code }) },
  );
}

/**
 * Revoke a relationship
 */
export async function revokeRelationship(relationshipId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/api/v1/relationships/${relationshipId}`, {
    method: 'DELETE',
  });
}

// ── Phase 3: child-initiated parent consent flow ──────────────────

/**
 * Player generates a 6-char code for their parent to enter. The
 * parent enters it on their Tomo app at /relationships/accept-guardian
 * which creates the relationship AND wires parental consent for the
 * child (flipping consent_status from 'awaiting_parent' to 'active').
 */
export async function generateParentInviteCode(): Promise<{
  code: string;
  expiresAt: string;
}> {
  return apiRequest<{ code: string; expiresAt: string }>(
    '/api/v1/relationships/invite-parent',
    { method: 'POST', body: JSON.stringify({}) }
  );
}

/**
 * Parent accepts a child-initiated code. Creates the relationship and
 * (if the child was awaiting consent) writes a parental consent row.
 */
export async function acceptAsGuardian(code: string): Promise<{
  relationshipId: string;
  childId: string;
  consentGranted: boolean;
}> {
  return apiRequest<{ relationshipId: string; childId: string; consentGranted: boolean }>(
    '/api/v1/relationships/accept-guardian',
    { method: 'POST', body: JSON.stringify({ code }) }
  );
}

// ============================================
// Multi-Role: Coach
// ============================================

/**
 * Get linked players (coach only)
 */
export async function getCoachPlayers(): Promise<{ players: PlayerSummary[] }> {
  return apiRequest<{ players: PlayerSummary[] }>('/api/v1/coach/players');
}

// P4.1 — Coach Dashboard (3 pillars).
export type CoachDashboardPillar = 'training' | 'metrics' | 'progress';

export interface CoachDashboardMetricsRow {
  playerId: string;
  name: string;
  sport: string;
  ageTier: 'T1' | 'T2' | 'T3' | 'UNKNOWN';
  readinessRag: string | null;
  acwr: number | null;
  dualLoadIndex: number | null;
  wellnessTrend: string | null;
  lastCheckinDate: string | null;
}

export interface CoachDashboardTrainingRow {
  playerId: string;
  name: string;
  sport: string;
  ageTier: 'T1' | 'T2' | 'T3' | 'UNKNOWN';
  drafts: number;
  pendingApproval: number;
  published: number;
  safetyFlagged: number;
}

export interface CoachDashboardProgressRow {
  playerId: string;
  name: string;
  sport: string;
  ageTier: 'T1' | 'T2' | 'T3' | 'UNKNOWN';
  currentStreak: number;
  totalPoints: number;
  masteryDelta30d: number | null;
  sessionsTotal: number | null;
  lastSessionAt: string | null;
}

export type CoachDashboardRow =
  | CoachDashboardMetricsRow
  | CoachDashboardTrainingRow
  | CoachDashboardProgressRow;

export async function getCoachDashboard<TPillar extends CoachDashboardPillar>(
  pillar: TPillar,
): Promise<{
  pillar: TPillar;
  rows: TPillar extends 'metrics'
    ? CoachDashboardMetricsRow[]
    : TPillar extends 'training'
      ? CoachDashboardTrainingRow[]
      : CoachDashboardProgressRow[];
}> {
  return apiRequest(`/api/v1/coach/dashboard?pillar=${encodeURIComponent(pillar)}`);
}

/**
 * Get player readiness history (coach only)
 */
export async function getPlayerReadiness(
  playerId: string,
): Promise<{ readiness: Array<Record<string, unknown>> }> {
  return apiRequest<{ readiness: Array<Record<string, unknown>> }>(
    `/api/v1/coach/players/${playerId}/readiness`,
  );
}

/**
 * Get player test history (coach only)
 */
export async function getPlayerTests(
  playerId: string,
): Promise<{ tests: Suggestion[] }> {
  return apiRequest<{ tests: Suggestion[] }>(`/api/v1/coach/players/${playerId}/tests`);
}

/**
 * Submit a test result for a player (coach only)
 */
export async function submitPlayerTest(
  playerId: string,
  data: { testType: string; sport: string; values: Record<string, unknown>; rawInputs?: Record<string, unknown> },
): Promise<{ suggestion: Suggestion }> {
  return apiRequest<{ suggestion: Suggestion }>(`/api/v1/coach/players/${playerId}/tests`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Create a training programme for a player (coach only)
 */
export async function createCoachProgramme(data: {
  name: string;
  description?: string;
  startDate: string;
  weeks: number;
  seasonCycle?: string;
  targetPlayerIds: string[];
  category?: string;
  intensity?: string;
  frequency?: string;
  drills?: Array<{ name: string; sets: string; reps: string; rest: string; notes: string }>;
  coachNotes?: string;
}): Promise<{ programme: any }> {
  return apiRequest<{ programme: any }>('/api/v1/coach/programmes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================
// Multi-Role: Parent
// ============================================

/**
 * Link a child by email (parent only — used during parent onboarding)
 * Custom error handling to surface specific API error messages.
 */
export async function linkChildByEmail(
  email: string,
): Promise<{ relationshipId: string; playerId: string; playerName: string }> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const url = `${API_BASE_URL}/api/v1/relationships/link-by-email`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();
  if (!response.ok) {
    // API returns { error: "message string" }
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || 'Request failed';
    throw new Error(msg);
  }
  return data;
}

/**
 * Link a player by email (coach only) — same endpoint, role determined server-side
 */
export async function linkPlayerByEmail(
  email: string,
): Promise<{ relationshipId: string; playerId: string; playerName: string }> {
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');

  const url = `${API_BASE_URL}/api/v1/relationships/link-by-email`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = typeof data.error === 'string' ? data.error : data.error?.message || 'Request failed';
    throw new Error(msg);
  }
  return data;
}

/**
 * Respond to a parent/coach link request (player only)
 */
export async function respondToParentLink(
  relationshipId: string,
  action: 'accept' | 'decline',
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(
    `/api/v1/relationships/${relationshipId}/respond`,
    { method: 'POST', body: JSON.stringify({ action }) },
  );
}

/**
 * Get linked children (parent only)
 */
export async function getParentChildren(): Promise<{ children: PlayerSummary[] }> {
  return apiRequest<{ children: PlayerSummary[] }>('/api/v1/parent/children');
}

// P4.3 — Parent Education Progress (parent-safe view; no clinical jargon).
export interface ParentEducationProgressResponse {
  childId: string;
  load: {
    label: 'Balanced' | 'Building' | 'Stressed' | 'Alarming' | 'Insufficient data';
    color: 'green' | 'amber' | 'red';
    hint: string;
  };
  nextExam: { subject: string; date: string; daysUntil: number } | null;
  streak: number | null;
  digest: Array<{
    icon: 'streak' | 'training' | 'study' | 'wellness' | 'milestone';
    text: string;
  }>;
  week: {
    trainingSessions: number;
    trainingMinutes: number;
    studySessions: number;
    studyMinutes: number;
    checkIns: number;
  } | null;
}

export async function getParentEducationProgress(
  childId: string,
): Promise<ParentEducationProgressResponse> {
  return apiRequest<ParentEducationProgressResponse>(
    `/api/v1/parent/education/progress?child_id=${encodeURIComponent(childId)}`,
  );
}

// P4.4 — T3 athlete visibility preferences matrix.
export type VisibilityDomain = 'training' | 'academic' | 'wellbeing' | 'safety' | 'logistics' | 'cv';

export interface VisibilityPreferenceRow {
  guardianId: string;
  domain: VisibilityDomain;
  visible: boolean;
  parentApprovalRequired: boolean;
  updatedAt: string;
}

export interface LinkedGuardian {
  guardianId: string;
  relationshipType: 'coach' | 'parent';
  name: string | null;
  email: string | null;
}

export async function getVisibilityPreferences(): Promise<{
  guardians: LinkedGuardian[];
  preferences: VisibilityPreferenceRow[];
}> {
  return apiRequest('/api/v1/visibility-preferences');
}

export async function putVisibilityPreferences(
  preferences: Array<{
    guardianId: string;
    domain: VisibilityDomain;
    visible: boolean;
    parentApprovalRequired?: boolean;
  }>,
): Promise<{ ok: boolean; updated: number }> {
  return apiRequest('/api/v1/visibility-preferences', {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  });
}

/**
 * Get child's calendar events (parent only)
 */
export async function getChildCalendar(
  childId: string,
  startDate: string,
  endDate: string,
  includeLockStatus = false,
): Promise<{ events: CalendarEvent[]; dayLocks?: Record<string, boolean> }> {
  const lockParam = includeLockStatus ? '&includeLockStatus=true' : '';
  return apiRequest<{ events: CalendarEvent[]; dayLocks?: Record<string, boolean> }>(
    `/api/v1/parent/children/${childId}/calendar?startDate=${startDate}&endDate=${endDate}${lockParam}`,
  );
}

/**
 * Get linked player's calendar events (coach only)
 */
export async function getCoachPlayerCalendar(
  playerId: string,
  startDate: string,
  endDate: string,
  includeLockStatus = false,
): Promise<{ events: CalendarEvent[]; dayLocks?: Record<string, boolean> }> {
  const lockParam = includeLockStatus ? '&includeLockStatus=true' : '';
  return apiRequest<{ events: CalendarEvent[]; dayLocks?: Record<string, boolean> }>(
    `/api/v1/coach/players/${playerId}/calendar?startDate=${startDate}&endDate=${endDate}${lockParam}`,
  );
}

/**
 * Get child's study profile (parent only)
 */
export async function getChildStudyProfile(
  childId: string,
): Promise<{ studyProfile: import('../types').StudyProfile }> {
  return apiRequest<{ studyProfile: import('../types').StudyProfile }>(
    `/api/v1/parent/children/${childId}/study-profile`,
  );
}

/**
 * Notify child to fill in study info (parent only)
 */
export async function notifyChildStudyInfo(
  childId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(
    `/api/v1/parent/children/${childId}/notify-study-info`,
    { method: 'POST' },
  );
}

/**
 * Suggest a study block for a child (parent only)
 */
export async function suggestStudyBlock(
  childId: string,
  data: { subject: string; startAt: string; endAt: string; priority?: string; notes?: string },
): Promise<{ suggestion: Suggestion }> {
  return apiRequest<{ suggestion: Suggestion }>(`/api/v1/parent/children/${childId}/study-block`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Add an exam date for a child (parent only)
 */
export async function suggestExam(
  childId: string,
  data: { subject: string; examType: string; examDate: string; notes?: string },
): Promise<{ suggestion: Suggestion }> {
  return apiRequest<{ suggestion: Suggestion }>(`/api/v1/parent/children/${childId}/exam`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ============================================
// Multi-Role: Suggestions
// ============================================

/**
 * Get suggestions (players: pending suggestions; coach/parent: authored suggestions)
 */
export async function getSuggestions(
  status?: string,
): Promise<{ suggestions: Suggestion[] }> {
  const params = status ? `?status=${status}` : '';
  return apiRequest<{ suggestions: Suggestion[] }>(`/api/v1/suggestions${params}`);
}

/**
 * Create a suggestion (coach/parent)
 */
export async function createSuggestion(data: {
  playerId: string;
  suggestionType: string;
  title: string;
  payload: Record<string, unknown>;
  expiresAt?: string;
}): Promise<{ suggestion: Suggestion }> {
  return apiRequest<{ suggestion: Suggestion }>('/api/v1/suggestions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Resolve a suggestion (player only)
 */
export async function resolveSuggestion(
  suggestionId: string,
  resolution: { status: 'accepted' | 'edited' | 'declined'; playerNotes?: string },
): Promise<{ suggestion: Suggestion }> {
  return apiRequest<{ suggestion: Suggestion }>(`/api/v1/suggestions/${suggestionId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(resolution),
  });
}

// ============================================
// Multi-Role: Notifications
// ============================================

/**
 * Get notifications
 */
export async function getNotifications(
  limit: number = 50,
): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  return apiRequest<{ notifications: AppNotification[]; unreadCount: number }>(
    `/api/v1/notifications?limit=${limit}`,
  );
}

/**
 * Mark a notification as read
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<{ notification: AppNotification }> {
  return apiRequest<{ notification: AppNotification }>(
    `/api/v1/notifications/${notificationId}/read`,
    { method: 'POST' },
  );
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>('/api/v1/notifications/read-all', {
    method: 'POST',
  });
}

// ── BENCHMARK API ──────────────────────────────────────────────────

import type {
  BenchmarkProfile,
  BenchmarkResult,
  MetricTrajectory,
  NormRow,
} from '../types/benchmarks';

export async function getBenchmarkProfile(): Promise<BenchmarkProfile | null> {
  try {
    return await apiRequest<BenchmarkProfile>('/api/v1/benchmarks/profile');
  } catch {
    return null;
  }
}

export async function logBenchmarkResult(
  metricKey: string,
  value: number,
  source?: string
): Promise<BenchmarkResult | null> {
  try {
    return await apiRequest<BenchmarkResult>(
      `/api/v1/benchmarks/metric/${metricKey}/`,
      {
        method: 'POST',
        body: JSON.stringify({ value, source: source ?? 'manual' }),
      }
    );
  } catch {
    return null;
  }
}

export async function getMetricTrajectory(
  metricKey: string,
  months: number = 12
): Promise<MetricTrajectory[]> {
  try {
    const res = await apiRequest<{ trajectory: MetricTrajectory[] }>(
      `/api/v1/benchmarks/metric/${metricKey}/?months=${months}`
    );
    return res.trajectory ?? [];
  } catch {
    return [];
  }
}

export async function getPositionNorms(
  position: string,
  ageBand: string,
  gender: string = 'male'
): Promise<NormRow[]> {
  try {
    const res = await apiRequest<{ norms: NormRow[] }>(
      `/api/v1/benchmarks/norms/?position=${position}&ageBand=${ageBand}&gender=${gender}`
    );
    return res.norms ?? [];
  } catch {
    return [];
  }
}

// ── Training Drills ──────────────────────────────────────────────

/** Public helper — fetch without auth token */
async function publicRequest<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Public request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface DrillListItem {
  id: string;
  name: string;
  sport_id: string;
  category: string;
  intensity: string;
  duration_minutes: number;
  attribute_keys: string[];
  age_bands: string[];
  position_keys: string[];
  description: string;
}

export interface DrillDetail extends DrillListItem {
  instructions: string[];
  equipment: { name: string; quantity: number; optional: boolean }[];
  progressions: { level: string; description: string; duration_minutes: number }[];
  tags: string[];
}

export interface RecommendedDrill {
  drill: DrillDetail;
  score: number;
  reason: string;
}

/** List / filter drills (public, no auth) */
export async function getDrills(filters?: {
  sport?: string;
  category?: string;
  intensity?: string;
  ageBand?: string;
}): Promise<DrillListItem[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.sport) params.set('sport', filters.sport);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.intensity) params.set('intensity', filters.intensity);
    if (filters?.ageBand) params.set('ageBand', filters.ageBand);
    const qs = params.toString();
    const res = await publicRequest<{ drills: DrillListItem[]; total: number }>(
      `/api/v1/training/drills${qs ? `?${qs}` : ''}`
    );
    return res.drills ?? [];
  } catch {
    return [];
  }
}

/** Text search drills (public, no auth) */
export async function searchDrills(
  query: string,
  sport: string,
  filters?: { category?: string; intensity?: string; attribute?: string }
): Promise<DrillListItem[]> {
  try {
    const params = new URLSearchParams({ q: query, sport });
    if (filters?.category) params.set('category', filters.category);
    if (filters?.intensity) params.set('intensity', filters.intensity);
    if (filters?.attribute) params.set('attribute', filters.attribute);
    const res = await publicRequest<{ drills: DrillListItem[]; total: number }>(
      `/api/v1/training/drills/search?${params.toString()}`
    );
    return res.drills ?? [];
  } catch {
    return [];
  }
}

/** AI-recommended drills (requires auth) */
export async function getRecommendedDrills(options?: {
  category?: string;
  limit?: number;
  focus?: string;
  timezone?: string;
}): Promise<{ recommendations: RecommendedDrill[]; readiness: string }> {
  try {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.focus) params.set('focus', options.focus);
    if (options?.timezone) params.set('timezone', options.timezone);
    const qs = params.toString();
    return await apiRequest<{ recommendations: RecommendedDrill[]; readiness: string }>(
      `/api/v1/training/drills/recommend${qs ? `?${qs}` : ''}`
    );
  } catch {
    return { recommendations: [], readiness: 'Unknown' };
  }
}

// ── Fill My Week ────────────────────────────────────────────────

export async function autoFillWeek(gapMinutes = 30): Promise<{
  success: boolean;
  eventsCreated: number;
  events: CalendarEvent[];
  message: string;
}> {
  return apiRequest('/api/v1/calendar/auto-fill-week', {
    method: 'POST',
    body: JSON.stringify({ timezone: getUserTimezone(), gapMinutes }),
  });
}

// ── Player Drill Scheduling ──────────────────────────────────────

export async function scheduleDrills(body: {
  drillIds: string[];
  startDate: string;
  daysPerWeek: number;
  selectedDays: number[];
}): Promise<{ success: boolean; eventsCreated: number; events: any[]; message: string }> {
  return apiRequest('/api/v1/player/drills/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Coach Programme API ──────────────────────────────────────────

import type { CoachProgramme, ProgrammeDrill, PlayerNotification } from '../types/programme';

export async function listProgrammes(): Promise<CoachProgramme[]> {
  try {
    const res = await apiRequest<{ programmes: CoachProgramme[] }>('/api/v1/coach/programmes');
    return res.programmes ?? [];
  } catch {
    return [];
  }
}

export async function createProgramme(data: {
  name: string;
  description?: string;
  seasonCycle?: string;
  startDate: string;
  weeks: number;
  targetType?: string;
  targetPositions?: string[];
  targetPlayerIds?: string[];
}): Promise<CoachProgramme | null> {
  try {
    const res = await apiRequest<{ programme: CoachProgramme }>('/api/v1/coach/programmes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.programme;
  } catch {
    return null;
  }
}

export async function getProgramme(id: string): Promise<CoachProgramme | null> {
  try {
    const res = await apiRequest<{ programme: CoachProgramme }>(`/api/v1/coach/programmes/${id}/`);
    return res.programme;
  } catch {
    return null;
  }
}

export async function addDrillToProgramme(
  programmeId: string,
  drill: Record<string, any>
): Promise<ProgrammeDrill[]> {
  try {
    const res = await apiRequest<{ drills: ProgrammeDrill[] }>(
      `/api/v1/coach/programmes/${programmeId}/`,
      { method: 'POST', body: JSON.stringify(drill) }
    );
    return res.drills ?? [];
  } catch {
    return [];
  }
}

export async function deleteProgrammeDrill(
  programmeId: string,
  drillRecordId: string
): Promise<void> {
  await apiRequest(`/api/v1/coach/programmes/${programmeId}/?drillRecordId=${drillRecordId}`, {
    method: 'DELETE',
  });
}

export async function publishProgramme(programmeId: string): Promise<{
  eventsCreated: number;
  playersTargeted: number;
  notificationsSent: number;
  message: string;
} | null> {
  try {
    return await apiRequest(`/api/v1/coach/programmes/${programmeId}/publish/`, {
      method: 'POST',
    });
  } catch {
    return null;
  }
}

export async function getCoachDrills(
  category?: string,
  q?: string,
  sport?: string
): Promise<any[]> {
  try {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (q) params.set('q', q);
    if (sport) params.set('sport', sport);
    const qs = params.toString();
    const res = await apiRequest<{ drills: any[] }>(`/api/v1/coach/drills/${qs ? `?${qs}` : ''}`);
    return res.drills ?? [];
  } catch {
    return [];
  }
}

// ── Player Notification API ──────────────────────────────────────

export async function getPlayerNotifications(
  unreadOnly = false
): Promise<{ notifications: PlayerNotification[]; unreadCount: number }> {
  try {
    return await apiRequest<{ notifications: PlayerNotification[]; unreadCount: number }>(
      `/api/v1/player/notifications?unread=${unreadOnly}`
    );
  } catch {
    return { notifications: [], unreadCount: 0 };
  }
}

export async function markAllPlayerNotificationsRead(): Promise<void> {
  await apiRequest('/api/v1/player/notifications', {
    method: 'POST',
    body: JSON.stringify({ action: 'mark_all_read' }),
  });
}

export async function actOnNotification(
  notifId: string,
  action: string
): Promise<any> {
  return await apiRequest(`/api/v1/player/notifications/${notifId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
}

export async function registerPushToken(token: string, platform: string): Promise<void> {
  await apiRequest('/api/v1/player/notifications', {
    method: 'POST',
    body: JSON.stringify({ expoPushToken: token, platform }),
  });
}

// ── Schedule Rules ──────────────────────────────────────────────

export interface ScheduleRulesResponse {
  preferences: Record<string, unknown>;
  scenario: string;
  athleteMode?: string;
  effectiveRules: {
    buffers: { default: number; afterHighIntensity: number; afterMatch: number; beforeMatch: number };
    intensityCaps: { maxHardPerWeek: number; maxSessionsPerDay: number; noHardBeforeMatch: boolean; noHardOnExamDay: boolean; recoveryDayAfterMatch: boolean };
    dayBounds: { startHour: number; endHour: number };
    weekendBounds?: { startHour: number; endHour: number };
    ruleCount: number;
  };
}

export async function getScheduleRules(): Promise<ScheduleRulesResponse> {
  return apiRequest<ScheduleRulesResponse>('/api/v1/schedule/rules');
}

export async function updateScheduleRules(
  preferences: Record<string, unknown>
): Promise<{ updated: boolean; scenario: string }> {
  return apiRequest<{ updated: boolean; scenario: string }>('/api/v1/schedule/rules', {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  });
}

/**
 * Persist the athlete's study-subjects list to
 * player_schedule_preferences.study_subjects. Avoids the
 * /api/v1/schedule/rules path (which requires SUPABASE_DB_URL).
 */
export async function updateStudySubjects(
  study_subjects: string[],
): Promise<{ ok: boolean; study_subjects: string[] }> {
  return apiRequest<{ ok: boolean; study_subjects: string[] }>(
    '/api/v1/week-plan/subjects',
    {
      method: 'PATCH',
      body: JSON.stringify({ study_subjects }),
    },
  );
}

// ── Auto-Block (sync school hours to calendar) ─────────────────

export async function syncAutoBlocks(params: {
  schoolDays: number[];
  schoolStart: string;
  schoolEnd: string;
  sleepStart?: string;
  sleepEnd?: string;
}): Promise<{ created: number; deleted: number }> {
  return apiRequest<{ created: number; deleted: number }>('/api/v1/calendar/auto-block', {
    method: 'POST',
    body: JSON.stringify({ ...params, timezone: getUserTimezone() }),
  });
}

// ── Schedule Validation ─────────────────────────────────────────

export interface ProposedEvent {
  title: string;
  event_type: string;
  date: string;
  startTime: string;
  endTime: string;
  intensity?: string;
  notes?: string;
}

export interface ScheduleValidationResponse {
  events: Array<ProposedEvent & {
    violations: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
    alternatives: Array<{ startTime: string; endTime: string }>;
    accepted: boolean;
  }>;
  summary: { total: number; withViolations: number; blocked: number };
  scenario: string;
}

export async function validateScheduleEvents(
  events: ProposedEvent[],
  timezone: string = 'Asia/Riyadh',
): Promise<ScheduleValidationResponse> {
  return apiRequest<ScheduleValidationResponse>('/api/v1/schedule/validate', {
    method: 'POST',
    body: JSON.stringify({ events, timezone }),
  });
}

// ── Output Snapshot ════════════════════════════════════════════════════

// ── Shared metric types ──────────────────────────────────────────────
export interface VitalMetric {
  metric: string;
  label: string;
  emoji: string;
  unit: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
  summary: string;
  color: string;
  // Context fields
  percentile?: number | null;
  zone?: string | null;
  zoneLabel?: string | null;
  baseline30d?: number | null;
  baselineDeviation?: number | null;
  contextInsight?: string | null;
}

export interface VitalStoryBlock {
  storyId: string;
  title: string;
  emoji: string;
  status: 'strong' | 'mixed' | 'weak';
  statusColor: string;
  narrative: string;
  contributingMetrics: string[];
}

export interface VitalGroup {
  groupId: string;
  displayName: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  metrics: VitalMetric[];
  ragStatus: 'green' | 'amber' | 'red' | 'none';
}

export interface BenchmarkMetric {
  metricKey: string;
  metricLabel: string;
  unit: string;
  direction: 'lower_better' | 'higher_better';
  value: number;
  percentile: number;
  zone: 'elite' | 'good' | 'average' | 'developing' | 'below';
  ageBand: string;
  position: string;
  competitionLvl: string;
  norm: { p10: number; p25: number; p50: number; p75: number; p90: number };
  message: string;
}

export interface TestGroupCategory {
  category: string;
  groupId: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  metrics: BenchmarkMetric[];
  categoryAvgPercentile: number;
  categorySummary: string;
}

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

export interface RawTestGroupTest {
  testType: string;
  score: number;
  unit: string;
  date: string;
  displayName: string;
  source?: string;
  coachName?: string;
}

export interface RawTestGroup {
  groupId: string;
  displayName: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  tests: RawTestGroupTest[];
}

export interface OutputSnapshot {
  vitals: {
    weekSummary: {
      metrics: VitalMetric[];
      periodStart: string;
      periodEnd: string;
      overallSummary: string;
    };
    vitalGroups: VitalGroup[];
    phv: {
      maturityOffset: number;
      phvStage: string;
      ltad: {
        stageName: string;
        stageKey: string;
        emoji: string;
        description: string;
        trainingFocus: string[];
        ageRange: string;
        progressPercent: number;
      };
      summary: string;
    } | null;
    readiness: {
      score: string | null;
      energy: number | null;
      soreness: number | null;
      sleepHours: number | null;
      mood: number | null;
      date: string | null;
      summary: string;
    };
  };
  metrics: {
    categories: TestGroupCategory[];
    radarProfile: RadarAxis[];
    rawTestGroups?: RawTestGroup[];
    overallPercentile: number | null;
    strengths: string[];
    gaps: string[];
    recentTests?: Array<{
      testType: string;
      score: number;
      unit: string;
      date: string;
      source?: string;
      coachId?: string;
      coachName?: string;
    }>;
  };
  programs: {
    recommendations: Array<{
      programId: string;
      name: string;
      category: string;
      type: 'physical' | 'technical';
      priority: 'mandatory' | 'high' | 'medium';
      durationMin: number;
      durationWeeks?: number;
      description: string;
      impact: string;
      frequency: string;
      difficulty: string;
      tags: string[];
      positionNote: string;
      reason: string;
      prescription: {
        sets: number;
        reps: string;
        intensity: string;
        rpe: string;
        rest: string;
        frequency: string;
        coachingCues: string[];
      };
      phvWarnings: string[];
      coachId?: string;
      coachName?: string;
      assignedAt?: string;
    }>;
    weeklyPlanSuggestion: string | null;
    weeklyStructure?: Record<string, number>;
    playerProfile: {
      ageBand: string;
      phvStage: string;
      position: string;
    };
    isAiGenerated?: boolean;
    generatedAt?: string | null;
  };
}

export async function getOutputSnapshot(targetPlayerId?: string): Promise<OutputSnapshot> {
  const params = new URLSearchParams();
  if (targetPlayerId) params.set('targetPlayerId', targetPlayerId);
  // Cache-bust to prevent stale browser cache
  params.set('_t', String(Date.now()));
  return apiRequest<OutputSnapshot>(`/api/v1/output/snapshot?${params.toString()}`);
}

export interface ProgramRefreshResponse {
  refreshed: boolean;
  count?: number;
  programs?: OutputSnapshot['programs'] | null;
  error?: string;
}

export async function refreshProgramRecommendations(force = false): Promise<ProgramRefreshResponse> {
  return apiRequest<ProgramRefreshResponse>(
    `/api/v1/programs/refresh${force ? '?force=true' : ''}`,
    { method: 'POST', body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) }
  );
}

// ── Athlete Snapshot (Layer 2 — Data Fabric) ────────────────────────
export interface AthleteSnapshotResponse {
  snapshot: AthleteSnapshot;
}

export interface AthleteSnapshot {
  athlete_id: string;
  snapshot_at: string;
  // Profile
  dob: string | null;
  sport: string | null;
  position: string | null;
  academic_year: number | null;
  // PHV
  phv_stage: string | null;
  phv_offset_years: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  // Readiness
  readiness_score: number | null;
  hrv_baseline_ms: number | null;
  hrv_today_ms: number | null;
  resting_hr_bpm: number | null;
  sleep_quality: number | null;
  injury_risk_flag: string | null;
  readiness_rag: string | null;
  // Load
  acwr: number | null;
  atl_7day: number | null;
  ctl_28day: number | null;
  dual_load_index: number | null;
  academic_load_7day: number | null;
  athletic_load_7day: number | null;
  // CV
  sessions_total: number;
  training_age_weeks: number;
  streak_days: number;
  cv_completeness: number | null;
  mastery_scores: Record<string, number>;
  strength_benchmarks: Record<string, number>;
  speed_profile: Record<string, number>;
  coachability_index: number | null;
  // Wellness
  wellness_7day_avg: number | null;
  wellness_trend: string | null;
  triangle_rag: string | null;
  // Intelligence
  tomo_intelligence_score: number | null;
  adaptation_coefficient: number | null;
  // Meta
  last_event_id: string | null;
  last_session_at: string | null;
  last_checkin_at: string | null;
}

/**
 * Fetch the authenticated athlete's pre-computed snapshot.
 * For coach/parent: pass athleteId to read a linked athlete.
 */
export async function getAthleteSnapshot(
  athleteId?: string
): Promise<AthleteSnapshot | null> {
  try {
    const params = athleteId ? `?athleteId=${athleteId}` : '';
    const res = await apiRequest<AthleteSnapshotResponse>(
      `/api/v1/snapshot${params}`
    );
    return res.snapshot;
  } catch {
    // 404 = no snapshot yet (first-time user) — not an error
    return null;
  }
}

// ---------------------------------------------------------------------------
// RIE Recommendations
// ---------------------------------------------------------------------------

export interface RIERecommendation {
  recId: string;
  athleteId: string;
  recType: string;
  priority: 1 | 2 | 3 | 4;
  status: string;
  title: string;
  bodyShort: string;
  bodyLong: string | null;
  confidenceScore: number;
  evidenceBasis: Record<string, unknown>;
  context: Record<string, unknown>;
  retrievedChunkIds: string[];
  createdAt: string;
  expiresAt: string | null;
}

interface RecommendationsResponse {
  recommendations: Array<{
    rec_id: string;
    athlete_id: string;
    rec_type: string;
    priority: 1 | 2 | 3 | 4;
    status: string;
    title: string;
    body_short: string;
    body_long: string | null;
    confidence_score: number;
    evidence_basis: Record<string, unknown>;
    context: Record<string, unknown>;
    retrieved_chunk_ids: string[];
    created_at: string;
    expires_at: string | null;
  }>;
}

export async function getRecommendations(limit = 15): Promise<RIERecommendation[]> {
  try {
    const res = await apiRequest<RecommendationsResponse>(
      `/api/v1/recommendations?limit=${limit}`
    );
    return (res.recommendations || []).map((r) => ({
      recId: r.rec_id,
      athleteId: r.athlete_id,
      recType: r.rec_type,
      priority: r.priority,
      status: r.status,
      title: r.title,
      bodyShort: r.body_short,
      bodyLong: r.body_long,
      confidenceScore: r.confidence_score,
      evidenceBasis: r.evidence_basis || {},
      context: r.context || {},
      retrievedChunkIds: r.retrieved_chunk_ids || [],
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Trigger a deep recommendation refresh using Claude + full PlayerContext.
 * Returns { refreshed: true, count } if new recs were generated, or
 * { refreshed: false, reason: 'not_stale' } if recs are still fresh (<6h).
 *
 * Uses a longer timeout (60s) since Claude analysis takes 10-30s.
 */
export async function refreshRecommendations(
  options?: { force?: boolean }
): Promise<{ refreshed: boolean; count?: number; reason?: string }> {
  try {
    const tz = getUserTimezone();
    const force = options?.force ? '?force=true' : '';
    const token = await getIdToken();
    if (!token) throw new Error('Not authenticated');

    const url = `${API_BASE_URL}/api/v1/recommendations/refresh${force}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-timezone': tz,
      },
      body: JSON.stringify({ timezone: tz }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`[refreshRecommendations] API error ${res.status}: ${errBody}`);
      return { refreshed: false, reason: 'api_error' };
    }
    return await res.json();
  } catch (err) {
    console.warn('[refreshRecommendations] Network error:', (err as Error).message);
    return { refreshed: false, reason: 'network_error' };
  }
}

// ---------------------------------------------------------------------------
// Offline-Safe Event Submission
// ---------------------------------------------------------------------------

/**
 * Submit an event to the backend with offline fallback.
 * If the API call fails (network error), queues the event locally.
 * The queue auto-flushes when connectivity is restored (via useEventQueue hook).
 */
export async function submitEventSafe(event: {
  athleteId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
}): Promise<void> {
  const { eventQueue } = await import('./eventQueue');
  const body = {
    athlete_id: event.athleteId,
    event_type: event.eventType,
    payload: event.payload,
    occurred_at: event.occurredAt || new Date().toISOString(),
  };

  try {
    await apiRequest('/api/v1/events/ingest', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch {
    // Network failure — queue for later delivery
    await eventQueue.enqueue({
      athleteId: event.athleteId,
      eventType: event.eventType,
      payload: event.payload,
      occurredAt: body.occurred_at,
    });
  }
}

// ── Mastery Snapshot ─────────────────────────────────────────────────

export interface MasteryMetric {
  metricKey: string;
  metricLabel: string;
  unit: string;
  direction: 'lower_better' | 'higher_better';
  playerValue: number | null;
  normP50: number;
  delta: number | null;
  percentile: number | null;
  zone: string | null;
  norm: { p10: number; p25: number; p50: number; p75: number; p90: number };
}

export interface MasteryPillar {
  groupId: string;
  displayName: string;
  emoji: string;
  colorTheme: string;
  priority: number;
  athleteDescription: string;
  metrics: MasteryMetric[];
  avgPercentile: number | null;
}

export type CardTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface MasterySnapshot {
  player: {
    name: string;
    age: number;
    position: string;
    ageBand: string;
    sport: string;
  };
  overallRating: number;
  cardTier: CardTier;
  radarProfile: RadarAxis[];
  /** P50 benchmark norms as radar values (the "target" shape) */
  benchmarkRadarProfile: RadarAxis[];
  pillars: MasteryPillar[];
  strengths: string[];
  gaps: string[];
  hasTestData: boolean;
}

export async function getMasterySnapshot(
  targetPlayerId?: string,
): Promise<MasterySnapshot> {
  const params = targetPlayerId ? `?targetPlayerId=${targetPlayerId}` : '';
  return apiRequest<MasterySnapshot>(`/api/v1/mastery/snapshot${params}`);
}

// ============================================
// Mastery — Trajectory
// ============================================

export interface TrajectoryPoint {
  date: string;
  score: number;
}

export interface TestTrajectory {
  testType: string;
  data: TrajectoryPoint[];
  improvement: number | null;
  improvementPct: number | null;
  totalTests: number;
  bestScore: number;
  bestDate: string;
  latestScore: number;
  latestDate: string;
}

export interface TrajectoryResponse {
  trajectories: Record<string, TestTrajectory>;
  months: number;
}

export async function getMasteryTrajectory(
  months = 6,
  targetPlayerId?: string,
): Promise<TrajectoryResponse> {
  const params = new URLSearchParams({ months: String(months) });
  if (targetPlayerId) params.set('targetPlayerId', targetPlayerId);
  return apiRequest<TrajectoryResponse>(`/api/v1/mastery/trajectory?${params}`);
}

// ============================================
// Mastery — Achievements
// ============================================

export interface MasteryMilestone {
  id: string;
  type: string;
  title: string;
  description: string | null;
  achieved_at: string;
}

export interface PersonalBest {
  score: number;
  date: string;
}

export interface NextMilestone {
  name: string;
  target: number;
  progress: number;
  type: 'streak' | 'tests' | 'points';
}

export interface AchievementsResponse {
  milestones: MasteryMilestone[];
  personalBests: Record<string, PersonalBest>;
  nextMilestone: NextMilestone | null;
  stats: {
    currentStreak: number;
    longestStreak: number;
    totalPoints: number;
    totalMilestones: number;
    totalTests: number;
  };
}

export async function getMasteryAchievements(
  limit = 20,
  targetPlayerId?: string,
): Promise<AchievementsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (targetPlayerId) params.set('targetPlayerId', targetPlayerId);
  return apiRequest<AchievementsResponse>(`/api/v1/mastery/achievements?${params}`);
}

// ============================================
// Mastery — Momentum
// ============================================

export interface StreakTier {
  label: string;
  emoji: string;
}

export interface MomentumResponse {
  consistencyScore: number;
  checkinRate: number;
  completionRate: number;
  streakDays: number;
  streakTier: StreakTier;
  ratingDelta: number;
  velocityLabel: string;
  tisScore: number | null;
  tisDelta: number | null;
}

export async function getMomentum(
  days = 30,
  targetPlayerId?: string,
): Promise<MomentumResponse> {
  const params = new URLSearchParams({ days: String(days) });
  if (targetPlayerId) params.set('targetPlayerId', targetPlayerId);
  return apiRequest<MomentumResponse>(`/api/v1/mastery/momentum?${params}`);
}

// ============================================
// Integrations (Wearable connections)
// ============================================

export interface IntegrationStatus {
  provider: string;
  connected: boolean;
  sync_status: string | null;
  sync_error: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
}

export async function getIntegrationStatus(): Promise<{ integrations: IntegrationStatus[] }> {
  return apiRequest<{ integrations: IntegrationStatus[] }>('/api/v1/integrations/status');
}

export async function syncWhoop(): Promise<{
  synced: boolean;
  events_emitted: number;
  health_data_written?: number;
  health_data_errors?: number;
  summary: { recoveries: number; sleeps: number; workouts: number; cycles: number };
}> {
  // WHOOP sync can take 30-60s for initial 30-day pull — use longer timeout
  const token = await getIdToken();
  if (!token) throw new Error('Not authenticated');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/integrations/whoop/sync`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'WHOOP sync failed');
    return data;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

export async function disconnectWhoop(): Promise<{ disconnected: boolean }> {
  return apiRequest('/api/v1/integrations/whoop', { method: 'DELETE' });
}

/**
 * Get the WHOOP OAuth authorize URL from the backend.
 * The backend creates a CSRF state token and returns the WHOOP OAuth URL.
 */
export async function getWhoopAuthorizeUrl(): Promise<string> {
  const platform = Platform.OS === 'web' ? 'web' : 'native';
  const data = await apiRequest<{ url: string }>(`/api/v1/integrations/whoop/authorize?platform=${platform}`);
  return data.url;
}

// ============================================
// WHOOP Data (full dataset for WhoopDataScreen)
// ============================================

export interface WhoopMetricValue {
  value: number;
  unit: string;
  label: string;
}

export interface WhoopDataCategory {
  date: string;
  metrics: Record<string, WhoopMetricValue>;
}

export interface WhoopDataResponse {
  connected: boolean;
  sync_status: string | null;
  sync_error: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
  hours_since_sync: number | null;
  data_fresh: boolean;
  categories: {
    recovery: WhoopDataCategory[];
    sleep: WhoopDataCategory[];
    workout: WhoopDataCategory[];
    cycle: WhoopDataCategory[];
  };
  metric_labels: Record<string, string>;
  days_requested: number;
  total_data_points: number;
}

export async function getWhoopData(days: number = 7): Promise<WhoopDataResponse> {
  return apiRequest<WhoopDataResponse>(`/api/v1/integrations/whoop/data?days=${days}`);
}

// ============================================
// Program Interactions (done/dismiss/active)
// ============================================

export async function interactWithProgram(
  programId: string,
  action: 'done' | 'dismissed' | 'active' | 'player_selected'
): Promise<{ success: boolean; toggled?: 'on' | 'off' }> {
  return apiRequest('/api/v1/programs/interact', {
    method: 'POST',
    body: JSON.stringify({ programId, action }),
  });
}

export interface ProgramCatalogItem {
  id: string;
  name: string;
  category: string;
  type: 'physical' | 'technical';
  description: string;
  difficulty: string;
  duration_minutes: number;
  tags: string[];
}

export async function searchProgramCatalog(q?: string): Promise<{ programs: ProgramCatalogItem[] }> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  return apiRequest<{ programs: ProgramCatalogItem[] }>(`/api/v1/programs${params.toString() ? '?' + params.toString() : ''}`);
}

export async function fetchActivePrograms(): Promise<{ programIds: string[]; playerSelectedIds?: string[] }> {
  return apiRequest('/api/v1/programs/active');
}
