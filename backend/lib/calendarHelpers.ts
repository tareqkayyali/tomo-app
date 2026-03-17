/**
 * Shared calendar event helpers — used by player, coach, and parent endpoints.
 *
 * Maps between frontend CalendarEvent shape and DB calendar_events rows.
 * All DB timestamps are UTC (timestamptz). Conversion to local time uses IANA timezone.
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

/**
 * Convert a UTC ISO timestamp to local date "YYYY-MM-DD" and time "HH:MM" in a given timezone.
 */
function utcToLocal(isoStr: string, tz: string): { date: string; time: string } {
  const d = new Date(isoStr);
  const date = d.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  const time = d.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }); // HH:MM
  return { date, time };
}

/**
 * Convert a local date + time in a given timezone to a UTC ISO string for DB storage.
 */
export function localToUtc(date: string, time: string, tz: string): string {
  try {
    // Normalise time to HH:MM:SS
    const timeParts = time.split(":");
    const normTime = timeParts.length >= 3
      ? `${timeParts[0]}:${timeParts[1]}:${timeParts[2]}`
      : `${timeParts[0]}:${timeParts[1]}:00`;

    // Build a reference date for offset calculation using the target date
    // (handles DST transitions correctly by using the same date)
    const refDate = new Date(`${date}T12:00:00Z`); // use noon to avoid edge cases

    // Get UTC components of this reference date as seen in the target timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(refDate);

    const p: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") p[part.type] = part.value;
    }

    // Reconstruct what refDate looks like in the target timezone
    const tzDateStr = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`;
    const offsetMs = new Date(tzDateStr).getTime() - refDate.getTime();

    // Treat date+time as local in the target timezone, then subtract offset to get UTC
    const naive = new Date(`${date}T${normTime}Z`);
    return new Date(naive.getTime() - offsetMs).toISOString();
  } catch {
    // Fallback: treat as UTC
    return `${date}T${time}`;
  }
}

/** Transform a raw DB row into the shape the frontend CalendarEvent expects */
export function mapDbRowToCalendarEvent(
  row: Record<string, unknown>,
  tz: string = "UTC"
) {
  const startAt = row.start_at ? String(row.start_at) : null;
  const endAt = row.end_at ? String(row.end_at) : null;

  // Convert UTC timestamps to local date/time in the user's timezone
  let date = "";
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (startAt) {
    const local = utcToLocal(startAt, tz);
    date = local.date;
    startTime = local.time;
  }

  if (endAt) {
    const local = utcToLocal(endAt, tz);
    endTime = local.time;
  }

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
