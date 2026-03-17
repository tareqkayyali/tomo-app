/**
 * Study Plan Generator — Exam-Backwards Scheduling
 *
 * Two-phase algorithm:
 *   Phase 1 "Crunch Zone": Walk backwards from last exam, reserving study days
 *     for each exam's subject. Each exam gets AT LEAST 1 day before it.
 *     If exams are too close, allows 2 subjects per day.
 *   Phase 2 "General Period": From study start date forward to crunch zone,
 *     apply strategy (closest/furthest first) with daysPerSubject rates.
 *
 * Key rules:
 *   - Study happens on ALL 7 days (excludedDays is ignored)
 *   - Max 2 subjects per day in crunch zone when days are tight
 *   - Max 1 subject per day in general period
 *   - Conflict-aware: respects existing calendar events + school hours
 */

import type {
  StudyPlanConfig,
  ExamEntry,
  TrainingPreferences,
  StudyBlock,
  CalendarEvent,
  SchoolSchedule,
  GeneratorResult,
} from '../types';
import type { EffectiveRules } from '../hooks/useScheduleRules';

// ── Helpers ──────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

type Interval = [number, number]; // [startMin, endMin]

/**
 * Merge overlapping/touching intervals.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr[0] <= last[1]) {
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

/**
 * Find the first free slot of `duration` minutes within [windowStart, windowEnd]
 * that does not overlap any occupied interval.
 */
function findFreeSlot(
  occupied: Interval[],
  windowStart: number,
  windowEnd: number,
  duration: number,
): { start: number; end: number } | null {
  let cursor = windowStart;

  for (const [occStart, occEnd] of occupied) {
    if (occEnd <= cursor) continue;

    if (occStart > cursor) {
      const gapEnd = Math.min(occStart, windowEnd);
      if (gapEnd - cursor >= duration) {
        return { start: cursor, end: cursor + duration };
      }
    }

    cursor = Math.max(cursor, occEnd);
    if (cursor + duration > windowEnd) return null;
  }

  if (windowEnd - cursor >= duration) {
    return { start: cursor, end: cursor + duration };
  }

  return null;
}

// ── Generator ────────────────────────────────────────────────────────

export function generateStudyPlan(
  config: StudyPlanConfig,
  examSchedule: ExamEntry[],
  trainingPreferences: TrainingPreferences,
  existingEvents: CalendarEvent[] = [],
  schoolSchedule?: SchoolSchedule,
  effectiveRules?: EffectiveRules,
): GeneratorResult {
  if (examSchedule.length === 0) return { blocks: [], warnings: [] };

  // Deduplicate exams by (subject + examDate)
  const seenKeys = new Set<string>();
  const dedupedExams = examSchedule.filter((e) => {
    const key = `${e.subject}_${e.examDate}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const {
    daysPerSubject,
    timeSlotStart,
    timeSlotEnd,
    sessionDuration,
    strategy,
    // excludedDays is intentionally IGNORED — study happens all 7 days
  } = config;

  // Clamp study window to day bounds if effective rules provided
  let windowStartMin = timeToMinutes(timeSlotStart);
  let windowEndMin = timeToMinutes(timeSlotEnd);

  if (effectiveRules) {
    const boundsStart = effectiveRules.dayBounds.startHour * 60;
    const boundsEnd = effectiveRules.dayBounds.endHour * 60;
    windowStartMin = Math.max(windowStartMin, boundsStart);
    windowEndMin = Math.min(windowEndMin, boundsEnd);
  }

  const gapMinutes = effectiveRules?.buffers?.default ?? 0;

  if (windowEndMin - windowStartMin < sessionDuration) {
    return { blocks: [], warnings: ['Study time window is too small for one session.'] };
  }

  // ── Date range ──
  const tomorrow = addDays(new Date(), 1);
  tomorrow.setHours(0, 0, 0, 0);

  // Sort exams chronologically (earliest first)
  const examsByDate = [...dedupedExams].sort(
    (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime(),
  );

  const earliestExamDate = new Date(examsByDate[0].examDate);
  earliestExamDate.setHours(0, 0, 0, 0);
  const latestExamDate = new Date(examsByDate[examsByDate.length - 1].examDate);
  latestExamDate.setHours(0, 0, 0, 0);

  if (latestExamDate < tomorrow) {
    return { blocks: [], warnings: ['All exams have already passed.'] };
  }

  // ── Build per-day occupied intervals ──
  const occupiedMap = new Map<string, Interval[]>();

  function getOccupied(dateStr: string): Interval[] {
    if (!occupiedMap.has(dateStr)) {
      occupiedMap.set(dateStr, []);
    }
    return occupiedMap.get(dateStr)!;
  }

  // Add existing calendar events with gap buffer
  for (const evt of existingEvents) {
    if (!evt.startTime || !evt.endTime) continue;
    const intervals = getOccupied(evt.date);
    const start = Math.max(0, timeToMinutes(evt.startTime) - gapMinutes);
    const end = timeToMinutes(evt.endTime) + gapMinutes;
    intervals.push([start, end]);
  }

  // Add school hours on school days for entire planning window
  if (schoolSchedule?.startTime && schoolSchedule?.endTime && schoolSchedule?.days?.length) {
    const schoolStartMin = timeToMinutes(schoolSchedule.startTime);
    const schoolEndMin = timeToMinutes(schoolSchedule.endTime);
    if (schoolStartMin < schoolEndMin) {
      let cursor = new Date(tomorrow);
      while (cursor <= latestExamDate) {
        const dow = cursor.getDay();
        if (schoolSchedule.days.includes(dow)) {
          getOccupied(toDateStr(cursor)).push([schoolStartMin, schoolEndMin]);
        }
        cursor = addDays(cursor, 1);
      }
    }
  }

  // Pre-merge occupied intervals
  for (const [dateStr, intervals] of occupiedMap) {
    occupiedMap.set(dateStr, mergeIntervals(intervals));
  }

  // ── Track subjects per day and placed blocks ──
  const daySubjects = new Map<string, string[]>(); // date → subjects assigned
  const blocks: StudyBlock[] = [];
  const warnings: string[] = [];
  let blockId = 0;

  // Build a map of exam dates → subjects being examined that day
  // On exam days, we CAN study — but only for a DIFFERENT subject (the next upcoming exam)
  const examDateSubjects = new Map<string, Set<string>>();
  for (const exam of examsByDate) {
    if (!examDateSubjects.has(exam.examDate)) {
      examDateSubjects.set(exam.examDate, new Set());
    }
    examDateSubjects.get(exam.examDate)!.add(exam.subject);
  }

  /**
   * Try to place a study block on a given day.
   * maxPerDay: 1 for general period, 2 for crunch zone when tight.
   */
  function tryPlaceBlock(
    dateStr: string,
    subject: string,
    examDate: string,
    examType: string,
    maxSubjectsPerDay: number,
  ): boolean {
    // On exam days: don't study the subject being examined, but CAN study other subjects
    const examsToday = examDateSubjects.get(dateStr);
    if (examsToday?.has(subject)) return false;

    // Don't schedule before tomorrow
    if (dateStr < toDateStr(tomorrow)) return false;

    // Don't study for a subject on or after its exam date (exam is done)
    if (dateStr >= examDate) return false;

    const existing = daySubjects.get(dateStr) ?? [];

    // Check subject limit per day
    if (existing.length >= maxSubjectsPerDay) return false;

    // Don't place same subject twice on same day
    if (existing.includes(subject)) return false;

    // Find a free time slot
    const occupied = mergeIntervals(getOccupied(dateStr));
    const slot = findFreeSlot(occupied, windowStartMin, windowEndMin, sessionDuration);
    if (!slot) return false;

    // Place the block
    blocks.push({
      id: `sp_${++blockId}`,
      subject,
      date: dateStr,
      startTime: minutesToTime(slot.start),
      endTime: minutesToTime(slot.end),
      examDate,
      examType: examType as any,
    });

    // Mark slot as occupied
    getOccupied(dateStr).push([slot.start, slot.end]);
    occupiedMap.set(dateStr, mergeIntervals(getOccupied(dateStr)));

    // Track subject for this day
    existing.push(subject);
    daySubjects.set(dateStr, existing);

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Crunch Zone — backwards from last exam
  // ═══════════════════════════════════════════════════════════════════

  console.log('[StudyPlan] Phase 1: Crunch zone — backwards scheduling');

  // Track how many days each exam got in crunch zone
  const crunchDaysPerExam = new Map<string, number>(); // examKey → count

  // Walk exams from latest to earliest
  for (let i = examsByDate.length - 1; i >= 0; i--) {
    const exam = examsByDate[i];
    const examDate = new Date(exam.examDate);
    examDate.setHours(0, 0, 0, 0);

    // Skip exams that have already passed
    if (examDate < tomorrow) continue;

    const examKey = `${exam.subject}_${exam.examDate}`;

    // Boundary: day after previous exam, or limited lookback for first exam
    let boundaryDate: Date;
    if (i > 0) {
      const prevExamDate = new Date(examsByDate[i - 1].examDate);
      prevExamDate.setHours(0, 0, 0, 0);
      // Day after prev exam — don't overlap with prev exam's crunch
      boundaryDate = addDays(prevExamDate, 1);
    } else {
      // First exam: crunch zone only covers a limited window before it
      // (daysPerSubject days, min 2) — the rest is handled by Phase 2 general period
      const crunchDays = Math.max(daysPerSubject[exam.subject] || 2, 2);
      boundaryDate = addDays(examDate, -crunchDays);
    }

    // Ensure boundary is not before tomorrow
    if (boundaryDate < tomorrow) {
      boundaryDate = new Date(tomorrow);
    }

    // Walk backwards from day before exam to boundary
    let daysAssigned = 0;
    let cursor = addDays(examDate, -1); // day before exam

    while (cursor >= boundaryDate) {
      const dateStr = toDateStr(cursor);
      // First pass: prefer 1 subject per day
      if (tryPlaceBlock(dateStr, exam.subject, exam.examDate, exam.examType, 1)) {
        daysAssigned++;
      }
      cursor = addDays(cursor, -1);
    }

    crunchDaysPerExam.set(examKey, daysAssigned);

    console.log(
      `[StudyPlan] Crunch: ${exam.subject} (${exam.examDate}) — ${daysAssigned} days assigned`,
    );
  }

  // Exam-day study: on exam days, study for the NEXT upcoming exam
  for (let i = 0; i < examsByDate.length - 1; i++) {
    const currentExam = examsByDate[i];
    const nextExam = examsByDate[i + 1];
    const currentExamDate = new Date(currentExam.examDate);
    currentExamDate.setHours(0, 0, 0, 0);

    if (currentExamDate < tomorrow) continue;

    const dateStr = toDateStr(currentExamDate);

    // On exam day, study for the next exam's subject (if different)
    if (currentExam.subject !== nextExam.subject) {
      if (tryPlaceBlock(dateStr, nextExam.subject, nextExam.examDate, nextExam.examType, 2)) {
        console.log(`[StudyPlan] Exam-day study: ${dateStr} — studying ${nextExam.subject} (while taking ${currentExam.subject})`);
      }
    }
  }

  // Second pass: for exams with 0 days, allow doubling (2 subjects per day)
  for (let i = examsByDate.length - 1; i >= 0; i--) {
    const exam = examsByDate[i];
    const examDate = new Date(exam.examDate);
    examDate.setHours(0, 0, 0, 0);

    if (examDate < tomorrow) continue;

    const examKey = `${exam.subject}_${exam.examDate}`;
    if ((crunchDaysPerExam.get(examKey) ?? 0) > 0) continue; // already has days

    console.log(`[StudyPlan] Crunch doubling: ${exam.subject} needs a slot (exams too close)`);

    // Try to double up on days near this exam
    let cursor = addDays(examDate, -1);
    const searchLimit = addDays(examDate, -14); // look up to 2 weeks back
    let placed = false;

    while (cursor >= tomorrow && cursor >= searchLimit) {
      const dateStr = toDateStr(cursor);
      if (tryPlaceBlock(dateStr, exam.subject, exam.examDate, exam.examType, 2)) {
        crunchDaysPerExam.set(examKey, 1);
        placed = true;
        console.log(`[StudyPlan] Crunch doubled: ${exam.subject} on ${dateStr}`);
        break;
      }
      cursor = addDays(cursor, -1);
    }

    if (!placed) {
      warnings.push(
        `Could not find any study slot for ${exam.subject} before ${new Date(exam.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: General Period — fill ALL remaining days from tomorrow
  //          to latest exam with round-robin subject distribution
  // ═══════════════════════════════════════════════════════════════════

  console.log('[StudyPlan] Phase 2: General period — forward scheduling (filling gaps)');

  // General period covers tomorrow → latest exam date
  // It fills any day NOT already claimed by the crunch zone
  const generalStart = new Date(tomorrow);
  const generalEnd = latestExamDate; // go all the way to the last exam date

  // Order subjects by strategy
  const uniqueSubjects = [...new Set(examsByDate.map((e) => e.subject))];
  const subjectOrder =
    strategy === 'last_exam_first'
      ? uniqueSubjects // closest exam first (already sorted by date asc)
      : [...uniqueSubjects].reverse(); // furthest first

  // Build a weighted round-robin cycle based on daysPerSubject
  // e.g., if Math=3, Science=2, cycle = [Math, Science, Math, Science, Math]
  const cycle: { subject: string; examDate: string; examType: string }[] = [];
  const maxRate = Math.max(...subjectOrder.map((s) => daysPerSubject[s] || 2), 1);

  for (let round = 0; round < maxRate; round++) {
    for (const subj of subjectOrder) {
      const rate = daysPerSubject[subj] || 2;
      if (round < rate) {
        const exam = examsByDate.find((e) => e.subject === subj);
        if (exam) {
          cycle.push({ subject: subj, examDate: exam.examDate, examType: exam.examType });
        }
      }
    }
  }

  if (cycle.length > 0) {
    let cycleIdx = 0;
    let dayCursor = new Date(generalStart);

    while (dayCursor <= generalEnd) {
      const dateStr = toDateStr(dayCursor);

      // Skip days that already have a crunch block (already fully assigned)
      const existingOnDay = daySubjects.get(dateStr) ?? [];

      if (existingOnDay.length === 0) {
        // No crunch block here — place a general-period block
        let placed = false;
        for (let attempt = 0; attempt < cycle.length; attempt++) {
          const entry = cycle[(cycleIdx + attempt) % cycle.length];
          if (tryPlaceBlock(dateStr, entry.subject, entry.examDate, entry.examType, 1)) {
            cycleIdx = (cycleIdx + attempt + 1) % cycle.length;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Fully occupied day — advance cycle anyway
          cycleIdx = (cycleIdx + 1) % cycle.length;
        }
      }
      // If day already has a crunch block, leave it — don't overwrite

      dayCursor = addDays(dayCursor, 1);
    }
  }

  console.log(`[StudyPlan] General period: ${toDateStr(generalStart)} → ${toDateStr(generalEnd)} (filled gaps around crunch blocks)`);

  // ── Sort output by date then start time ──
  blocks.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.startTime.localeCompare(b.startTime);
  });

  console.log(`[StudyPlan] Total: ${blocks.length} blocks, ${warnings.length} warnings`);

  return { blocks, warnings };
}
