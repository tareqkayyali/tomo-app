/**
 * Shared calendar event helpers — used by player, coach, and parent endpoints.
 *
 * Maps between frontend CalendarEvent shape and DB calendar_events rows.
 */

/** Frontend uses "study_block", DB stores "study" */
const FRONTEND_TO_DB_TYPE: Record<string, string> = {
  study_block: "study",
};

/** DB stores "study", frontend expects "study_block" */
const DB_TO_FRONTEND_TYPE: Record<string, string> = {
  study: "study_block",
};

export function toDbEventType(frontendType: string): string {
  return FRONTEND_TO_DB_TYPE[frontendType] || frontendType;
}

export function toFrontendEventType(dbType: string): string {
  return DB_TO_FRONTEND_TYPE[dbType] || dbType;
}

/** Transform a raw DB row into the shape the frontend CalendarEvent expects */
export function mapDbRowToCalendarEvent(row: Record<string, unknown>) {
  const startAt = row.start_at ? String(row.start_at) : null;
  const endAt = row.end_at ? String(row.end_at) : null;

  // Extract date (YYYY-MM-DD) and time (HH:MM) from ISO timestamps
  const date = startAt ? startAt.slice(0, 10) : "";
  const startTime =
    startAt && startAt.length >= 16 ? startAt.slice(11, 16) : null;
  const endTime = endAt && endAt.length >= 16 ? endAt.slice(11, 16) : null;

  // Normalise "00:00" start times (means "no time set")
  const effectiveStartTime =
    startTime === "00:00" && !endTime ? null : startTime;

  return {
    id: row.id,
    userId: row.user_id,
    name: row.title,
    type: toFrontendEventType(String(row.event_type || "other")),
    sport: row.sport || "general",
    date,
    startTime: effectiveStartTime,
    endTime,
    intensity: row.intensity || null,
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

/**
 * Helper to compute endTime from startTime + duration (minutes).
 * Returns "HH:MM" string or null.
 */
export function addMinutesToTimeStr(
  startTime: string,
  minutes: number
): string | null {
  const [h, m] = startTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const totalMin = h * 60 + m + minutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}
