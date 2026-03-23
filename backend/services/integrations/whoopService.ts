/**
 * WHOOP API Service — handles OAuth token management and data fetching.
 *
 * WHOOP API docs: https://developer.whoop.com/docs
 * Base URL: https://api.prod.whoop.com/developer
 * Auth: https://api.prod.whoop.com/oauth/oauth2
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// Type helper: wearable_connections table is not yet in generated types.
// After running the migration and regenerating types, remove these casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wearableTable = () => (supabaseAdmin() as any).from("wearable_connections");

// ── Config ──
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

const WHOOP_CLIENT_ID = process.env.WHOOP_CLIENT_ID || "";
const WHOOP_CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET || "";
const WHOOP_REDIRECT_URI =
  process.env.WHOOP_REDIRECT_URI ||
  "https://api.my-tomo.com/api/v1/integrations/whoop/callback";

const WHOOP_SCOPES = [
  "read:recovery",
  "read:sleep",
  "read:workout",
  "read:cycles",
  "read:profile",
  "read:body_measurement",
].join(" ");

// ── Types ──
export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  } | null;
}

export interface WhoopSleep {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: { baseline_milli: number; need_from_sleep_debt_milli: number };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  } | null;
}

export interface WhoopWorkout {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  score_state: string;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
    percent_recorded: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    altitude_change_meter?: number;
    zone_duration: {
      zone_zero_milli: number;
      zone_one_milli: number;
      zone_two_milli: number;
      zone_three_milli: number;
      zone_four_milli: number;
      zone_five_milli: number;
    };
  } | null;
}

export interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string | null;
  timezone_offset: string;
  score_state: string;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  } | null;
}

export interface WhoopProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface WhoopBodyMeasurement {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

// ── OAuth URL ──
export function getWhoopAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID,
    redirect_uri: WHOOP_REDIRECT_URI,
    response_type: "code",
    scope: WHOOP_SCOPES,
    state,
  });
  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

// ── Token Exchange ──
export async function exchangeCodeForTokens(
  code: string
): Promise<WhoopTokens> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: WHOOP_CLIENT_ID,
      client_secret: WHOOP_CLIENT_SECRET,
      redirect_uri: WHOOP_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WHOOP token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── Token Refresh ──
export async function refreshWhoopTokens(
  refreshToken: string
): Promise<WhoopTokens> {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: WHOOP_CLIENT_ID,
      client_secret: WHOOP_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WHOOP token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── Get Valid Access Token (auto-refresh if expired) ──
export async function getValidAccessToken(userId: string): Promise<string> {
  const { data: conn, error } = await wearableTable()
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "whoop")
    .single();

  if (error || !conn) {
    throw new Error("WHOOP not connected");
  }

  // Check if token is still valid (5 min buffer)
  const expiresAt = conn.token_expires_at
    ? new Date(conn.token_expires_at).getTime()
    : 0;
  const isExpired = Date.now() > expiresAt - 5 * 60 * 1000;

  // Reject __pending__ tokens (user started OAuth but never completed)
  if (conn.access_token === "__pending__") {
    throw new Error("WHOOP connection incomplete — user must reconnect");
  }

  if (!isExpired) {
    return conn.access_token;
  }

  // Refresh the token
  if (!conn.refresh_token) {
    // Mark connection as needing re-auth
    await wearableTable()
      .update({ sync_status: "auth_required", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", "whoop");
    throw new Error("WHOOP refresh token missing — user must reconnect");
  }

  let tokens;
  try {
    tokens = await refreshWhoopTokens(conn.refresh_token);
  } catch (e: any) {
    // If refresh fails with 401/invalid_grant, mark as needing re-auth
    if (e.message?.includes("401") || e.message?.includes("invalid_grant")) {
      await wearableTable()
        .update({ sync_status: "auth_required", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("provider", "whoop");
      throw new Error("WHOOP token expired — user must reconnect");
    }
    throw e;
  }

  // Update stored tokens — check for write errors
  const { error: updateErr } = await wearableTable()
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "whoop");

  if (updateErr) {
    console.error("[whoopService] Failed to persist refreshed tokens:", updateErr.message);
  }

  return tokens.access_token;
}

// ── API Helpers ──
async function whoopGet<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${WHOOP_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WHOOP API ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  // Debug: log raw WHOOP response shape
  const recordCount = Array.isArray(json?.records) ? json.records.length : 'N/A';
  console.log(`[whoopGet] ${path} → ${res.status}, records: ${recordCount}, nextToken: ${json?.next_token || 'none'}`);
  return json;
}

// ── Data Fetchers (v2 API) ──
export async function fetchRecoveries(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<WhoopRecovery[]> {
  const data = await whoopGet<{ records: WhoopRecovery[] }>(
    accessToken,
    "/v2/recovery",
    { start: startDate, end: endDate, limit: "25" }
  );
  return data.records || [];
}

export async function fetchSleeps(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<WhoopSleep[]> {
  const data = await whoopGet<{ records: WhoopSleep[] }>(
    accessToken,
    "/v2/activity/sleep",
    { start: startDate, end: endDate, limit: "25" }
  );
  return data.records || [];
}

export async function fetchWorkouts(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<WhoopWorkout[]> {
  const data = await whoopGet<{ records: WhoopWorkout[] }>(
    accessToken,
    "/v2/activity/workout",
    { start: startDate, end: endDate, limit: "25" }
  );
  return data.records || [];
}

export async function fetchCycles(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<WhoopCycle[]> {
  const data = await whoopGet<{ records: WhoopCycle[] }>(
    accessToken,
    "/v2/cycle",
    { start: startDate, end: endDate, limit: "25" }
  );
  return data.records || [];
}

export async function fetchProfile(
  accessToken: string
): Promise<WhoopProfile> {
  return whoopGet<WhoopProfile>(accessToken, "/v2/user/profile/basic");
}

export async function fetchBodyMeasurement(
  accessToken: string
): Promise<WhoopBodyMeasurement> {
  return whoopGet<WhoopBodyMeasurement>(
    accessToken,
    "/v2/user/measurement/body"
  );
}

// ── Store Connection ──
export async function storeWhoopConnection(
  userId: string,
  tokens: WhoopTokens,
  externalUserId?: string
) {
  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();

  const { error } = await wearableTable().upsert(
    {
      user_id: userId,
      provider: "whoop",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      external_user_id: externalUserId || null,
      scopes: tokens.scope ? tokens.scope.split(" ") : [],
      last_sync_at: null,
      sync_status: "idle",
      sync_error: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  if (error) {
    throw new Error(`Failed to store WHOOP connection: ${error.message}`);
  }
}

// ── Remove Connection ──
export async function removeWhoopConnection(userId: string) {
  const { error } = await wearableTable()
    .delete()
    .eq("user_id", userId)
    .eq("provider", "whoop");

  if (error) {
    throw new Error(`Failed to remove WHOOP connection: ${error.message}`);
  }
}

// ── Update Sync Status ──
export async function updateSyncStatus(
  userId: string,
  status: "idle" | "syncing" | "error",
  errorMsg?: string
) {
  await wearableTable()
    .update({
      sync_status: status,
      sync_error: errorMsg || null,
      ...(status === "idle" ? { last_sync_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "whoop");
}
