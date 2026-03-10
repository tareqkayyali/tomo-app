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
 * Get current user profile
 */
export async function getUser(): Promise<UserResponse> {
  return apiRequest<UserResponse>('/api/v1/user');
}

/**
 * Update user profile
 */
export async function updateUser(updates: Partial<User>): Promise<UserResponse> {
  return apiRequest<UserResponse>('/api/v1/user', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * Register new user
 */
export async function registerUser(userData: {
  name: string;
  displayName?: string;
  age: number;
  sport: string;
  region?: string;
  teamId?: string;
}): Promise<UserResponse> {
  return apiRequest<UserResponse>('/api/v1/user/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
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
  return apiRequest<UserResponse>('/api/v1/user/onboarding', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
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
