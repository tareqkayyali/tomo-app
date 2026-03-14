/**
 * API Service for Tomo
 * Handles all backend API calls
 */

import { getIdToken } from './auth';
import { API_BASE_URL, REQUEST_TIMEOUT, MAX_RETRIES, INITIAL_RETRY_DELAY } from './apiConfig';
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
  if (error instanceof DOMException && error.name === 'AbortError') return true; // timeout
  return false;
}

/**
 * Make authenticated API request with timeout and retry logic
 */
async function apiRequest<T>(
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
        const error = data as ApiError;
        throw new Error(error.error?.message || 'Request failed');
      }

      return data as T;
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
    position: (raw.position as string | null) ?? null,
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
    selectedSports: (raw.selected_sports as string[]) || [],
    photoUrl: (raw.photo_url as string | null) ?? null,

    // Study plan fields
    studySubjects: (raw.study_subjects as string[]) || [],
    examSchedule: (raw.exam_schedule as unknown[]) as User['examSchedule'] || [],
    trainingPreferences: (raw.training_preferences as User['trainingPreferences']) || undefined,
    studyPlanConfig: (raw.study_plan_config as User['studyPlanConfig']) || undefined,
    schoolSchedule: (raw.school_schedule as User['schoolSchedule']) || undefined,
    customTrainingTypes: (raw.custom_training_types as User['customTrainingTypes']) || undefined,
    connectedWearables: (raw.connected_wearables as User['connectedWearables']) || undefined,
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
 */
export async function registerUser(userData: {
  name: string;
  displayName?: string;
  age?: number;
  sport?: string;
  role?: UserRole;
  displayRole?: string;
  region?: string;
  teamId?: string;
}): Promise<UserResponse> {
  const raw = await apiRequest<{ user: Record<string, unknown> }>('/api/v1/user/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
  return mapUserResponse(raw);
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

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  eventData: CalendarEventInput,
): Promise<{ event: CalendarEvent }> {
  return apiRequest<{ event: CalendarEvent }>('/api/v1/calendar/events', {
    method: 'POST',
    body: JSON.stringify(eventData),
  });
}

/**
 * Get calendar events for a specific date
 */
export async function getCalendarEventsByDate(
  date: string,
): Promise<{ events: CalendarEvent[] }> {
  return apiRequest<{ events: CalendarEvent[] }>(
    `/api/v1/calendar/events?date=${date}`,
  );
}

/**
 * Get calendar events for a date range
 */
export async function getCalendarEventsByRange(
  startDate: string,
  endDate: string,
): Promise<{ events: CalendarEvent[] }> {
  return apiRequest<{ events: CalendarEvent[] }>(
    `/api/v1/calendar/events?startDate=${startDate}&endDate=${endDate}`,
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
  patch: { date?: string; startTime?: string; endTime?: string | null },
): Promise<{ event: CalendarEvent }> {
  return apiRequest<{ event: CalendarEvent }>(`/api/v1/calendar/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
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
  return apiRequest<DailyBriefing>(`/api/v1/chat/briefing?hour=${hour}`);
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

// ============================================
// Multi-Role: Coach
// ============================================

/**
 * Get linked players (coach only)
 */
export async function getCoachPlayers(): Promise<{ players: PlayerSummary[] }> {
  return apiRequest<{ players: PlayerSummary[] }>('/api/v1/coach/players');
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
    return await apiRequest<BenchmarkProfile>('/api/v1/benchmarks/profile/');
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
