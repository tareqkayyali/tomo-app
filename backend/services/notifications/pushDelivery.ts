/**
 * Push Delivery — Expo push notification delivery with quiet hours,
 * category toggles, daily cap, and per-category Android channels.
 *
 * Called by notificationEngine after creating a notification.
 * Respects athlete preferences from athlete_notification_preferences.
 *
 * Reference: Files/tomo_notification_center_p2.md §12
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { NotificationCategory } from './notificationTemplates';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const db = () => supabaseAdmin() as any;

// Category → Android channel mapping
const CATEGORY_CHANNELS: Record<NotificationCategory, string> = {
  critical: 'tomo-critical',
  training: 'tomo-training',
  coaching: 'tomo-coaching',
  academic: 'tomo-academic',
  triangle: 'tomo-triangle',
  cv: 'tomo-cv',
  system: 'tomo-system',
};

// Categories that bypass quiet hours
const QUIET_HOURS_BYPASS: Set<NotificationCategory> = new Set(['critical']);

// Category → push preference field mapping
const CATEGORY_PREF_FIELD: Record<NotificationCategory, string> = {
  critical: 'push_critical',
  training: 'push_training',
  coaching: 'push_coaching',
  academic: 'push_academic',
  triangle: 'push_triangle',
  cv: 'push_cv',
  system: 'push_system',
};

interface PushResult {
  sent: boolean;
  queued: boolean;
  reason?: string;
}

/**
 * Schedule push delivery for a notification.
 * Checks preferences, quiet hours, and daily cap before sending.
 */
export async function schedulePush(
  athleteId: string,
  notificationId: string,
  category: NotificationCategory,
  title: string,
  body: string,
  deepLink?: string,
): Promise<PushResult> {
  const dbClient = db();

  console.log(`[pushDelivery] schedulePush called for ${athleteId}, category=${category}, notif=${notificationId}`);

  // 1. Get athlete preferences
  const { data: prefs } = await dbClient
    .from('athlete_notification_preferences')
    .select('*')
    .eq('athlete_id', athleteId)
    .single();

  const preferences = prefs ?? {
    quiet_hours_start: '23:00',
    quiet_hours_end: '07:00',
    push_critical: true,
    push_training: true,
    push_coaching: true,
    push_academic: true,
    push_triangle: true,
    push_cv: false,
    push_system: false,
    max_push_per_day: 5,
  };

  console.log(`[pushDelivery] prefs found: ${!!prefs}, category toggle: ${preferences[CATEGORY_PREF_FIELD[category]]}`);

  // 2. Check category toggle
  const prefField = CATEGORY_PREF_FIELD[category];
  if (prefField && preferences[prefField] === false) {
    console.log(`[pushDelivery] BLOCKED: category_disabled (${category})`);
    return { sent: false, queued: false, reason: 'category_disabled' };
  }

  // 3. Check daily cap
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: pushesToday } = await dbClient
    .from('athlete_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', athleteId)
    .eq('push_sent', true)
    .gte('push_sent_at', todayStart.toISOString());

  console.log(`[pushDelivery] pushesToday=${pushesToday}, cap=${preferences.max_push_per_day}`);

  if ((pushesToday ?? 0) >= (preferences.max_push_per_day ?? 5)) {
    console.log(`[pushDelivery] BLOCKED: daily_cap_reached`);
    return { sent: false, queued: false, reason: 'daily_cap_reached' };
  }

  // 4. Check quiet hours (night + school hours)
  const bypassQuietHours = QUIET_HOURS_BYPASS.has(category);
  const inQuiet = isInQuietHours(preferences.quiet_hours_start, preferences.quiet_hours_end);
  console.log(`[pushDelivery] quietHours: in=${inQuiet}, bypass=${bypassQuietHours}, range=${preferences.quiet_hours_start}-${preferences.quiet_hours_end}`);

  if (!bypassQuietHours && inQuiet) {
    await dbClient
      .from('athlete_notifications')
      .update({ push_queued: true })
      .eq('id', notificationId);

    console.log(`[pushDelivery] QUEUED: quiet_hours`);
    return { sent: false, queued: true, reason: 'quiet_hours' };
  }

  // 4b. Check school hours quiet (only if explicitly enabled — opt-in, not opt-out)
  if (!bypassQuietHours && preferences.school_hours_quiet === true) {
    const inSchool = await isInSchoolHours(dbClient, athleteId);
    if (inSchool) {
      await dbClient
        .from('athlete_notifications')
        .update({ push_queued: true })
        .eq('id', notificationId);

      console.log(`[pushDelivery] QUEUED: school_hours`);
      return { sent: false, queued: true, reason: 'school_hours' };
    }
  }

  // 5. Get push token
  const { data: tokenRow } = await dbClient
    .from('player_push_tokens')
    .select('expo_push_token')
    .eq('user_id', athleteId)
    .single();

  console.log(`[pushDelivery] token found: ${!!tokenRow?.expo_push_token}, token prefix: ${tokenRow?.expo_push_token?.slice(0, 20)}...`);

  if (!tokenRow?.expo_push_token) {
    console.log(`[pushDelivery] BLOCKED: no_push_token`);
    return { sent: false, queued: false, reason: 'no_push_token' };
  }

  // 6. Send push
  const sent = await sendExpoPush(
    tokenRow.expo_push_token,
    title,
    body,
    {
      notificationId,
      type: category,
      deepLink: deepLink ?? '',
    },
    CATEGORY_CHANNELS[category],
  );

  console.log(`[pushDelivery] sendExpoPush result: ${sent}`);

  if (sent) {
    await dbClient
      .from('athlete_notifications')
      .update({
        push_sent: true,
        push_sent_at: new Date().toISOString(),
      })
      .eq('id', notificationId);
  }

  return { sent, queued: false };
}

/**
 * Deliver all queued push notifications for athletes whose quiet hours have ended.
 * Called by cron every 5 minutes.
 */
export async function deliverQueuedPushes(): Promise<number> {
  const dbClient = db();

  // Find queued notifications
  const { data: queued } = await dbClient
    .from('athlete_notifications')
    .select('id, athlete_id, title, body, category, primary_action')
    .eq('push_queued', true)
    .eq('push_sent', false)
    .in('status', ['unread', 'read'])
    .limit(50);

  if (!queued || queued.length === 0) return 0;

  let delivered = 0;
  for (const notif of queued) {
    // Check if athlete is still in quiet hours
    const { data: prefs } = await dbClient
      .from('athlete_notification_preferences')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('athlete_id', notif.athlete_id)
      .single();

    const qhStart = prefs?.quiet_hours_start ?? '23:00';
    const qhEnd = prefs?.quiet_hours_end ?? '07:00';

    if (isInQuietHours(qhStart, qhEnd)) continue; // Still in quiet hours

    // Get push token
    const { data: tokenRow } = await dbClient
      .from('player_push_tokens')
      .select('expo_push_token')
      .eq('user_id', notif.athlete_id)
      .single();

    if (!tokenRow?.expo_push_token) {
      // Clear queue flag — no token to send to
      await dbClient
        .from('athlete_notifications')
        .update({ push_queued: false })
        .eq('id', notif.id);
      continue;
    }

    const deepLink = (notif.primary_action as any)?.deep_link ?? '';
    const sent = await sendExpoPush(
      tokenRow.expo_push_token,
      notif.title,
      notif.body,
      { notificationId: notif.id, type: notif.category, deepLink },
      CATEGORY_CHANNELS[notif.category as NotificationCategory] ?? 'tomo-system',
    );

    if (sent) {
      await dbClient
        .from('athlete_notifications')
        .update({
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          push_queued: false,
        })
        .eq('id', notif.id);
      delivered++;
    }
  }

  return delivered;
}

// ─── Internal ────────────────────────────────────────────────────────

function isInQuietHours(startStr: string, endStr: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (startMinutes > endMinutes) {
    // Wraps midnight (e.g., 23:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

async function isInSchoolHours(dbClient: any, athleteId: string): Promise<boolean> {
  const { data: prefs } = await dbClient
    .from('player_schedule_preferences')
    .select('school_days, school_start, school_end')
    .eq('user_id', athleteId)
    .maybeSingle();

  const schoolDays: number[] = prefs?.school_days ?? [0, 1, 2, 3, 4]; // Sun-Thu default
  const schoolStart = prefs?.school_start ?? '08:00';
  const schoolEnd = prefs?.school_end ?? '15:00';

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  if (!schoolDays.includes(dayOfWeek)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = schoolStart.split(':').map(Number);
  const [eh, em] = schoolEnd.split(':').map(Number);

  return currentMinutes >= (sh * 60 + sm) && currentMinutes < (eh * 60 + em);
}

async function sendExpoPush(
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  channelId: string,
): Promise<boolean> {
  try {
    const payload = {
      to: expoPushToken,
      title,
      body,
      data,
      sound: 'default',
      channelId,
    };
    console.log(`[pushDelivery] Sending to Expo API:`, JSON.stringify(payload));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.text();
    console.log(`[pushDelivery] Expo API response: ${response.status} ${responseBody}`);

    if (!response.ok) {
      console.error(`[pushDelivery] HTTP error from Expo: ${response.status} ${responseBody}`);
      return false;
    }

    // Expo returns HTTP 200 even for per-ticket errors — must check data.status
    try {
      const json = JSON.parse(responseBody);
      // Single push: { data: { status: 'ok' | 'error', message?, details? } }
      const ticket = json?.data;
      if (ticket?.status === 'error') {
        console.error(`[pushDelivery] Expo ticket error: ${ticket.message} — details:`, ticket.details);
        // DeviceNotRegistered means the token is stale — could clean it up here
        if (ticket.details?.error === 'DeviceNotRegistered') {
          console.warn(`[pushDelivery] Token is no longer registered on device: ${expoPushToken.slice(0, 30)}...`);
        }
        return false;
      }
      if (ticket?.status === 'ok') {
        return true;
      }
      // Unexpected shape — log and treat as failure
      console.warn(`[pushDelivery] Unexpected Expo response shape:`, json);
      return false;
    } catch {
      // Non-JSON response — fall back to HTTP status check
      console.warn('[pushDelivery] Could not parse Expo response as JSON');
      return false;
    }
  } catch (err) {
    console.error('[pushDelivery] Send failed:', err);
    return false;
  }
}
