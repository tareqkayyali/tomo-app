/**
 * Study Plan Generator
 *
 * Pure TypeScript function that generates study blocks based on:
 * - Exam schedule (subjects, dates, types)
 * - Training preferences (gym/club days)
 * - Parent-configured parameters (sessions/week per subject, time slots, strategy)
 */

import type {
  StudyPlanConfig,
  ExamEntry,
  TrainingPreferences,
  StudyBlock,
} from '../types';

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

// ── Generator ────────────────────────────────────────────────────────

export function generateStudyPlan(
  config: StudyPlanConfig,
  examSchedule: ExamEntry[],
  trainingPreferences: TrainingPreferences,
): StudyBlock[] {
  if (examSchedule.length === 0) return [];

  // Deduplicate exams by (subject + examDate) — keep first occurrence
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
    excludedDays,
  } = config;

  // Combine all training days
  const trainingDays = new Set<number>([
    ...(trainingPreferences.gymFixedDays || []),
    ...(trainingPreferences.clubFixedDays || []),
  ]);

  // 1. Date range: tomorrow -> latest exam date
  const tomorrow = addDays(new Date(), 1);
  tomorrow.setHours(0, 0, 0, 0);

  const latestExamDate = dedupedExams.reduce((latest, exam) => {
    const d = new Date(exam.examDate);
    return d > latest ? d : latest;
  }, new Date(dedupedExams[0].examDate));

  if (latestExamDate < tomorrow) return []; // all exams already passed

  // 2. Calculate slots per day
  const startMin = timeToMinutes(timeSlotStart);
  const endMin = timeToMinutes(timeSlotEnd);
  const totalMinutes = endMin - startMin;
  const maxSlotsPerDay = Math.floor(totalMinutes / sessionDuration);

  if (maxSlotsPerDay <= 0) return [];

  // 3. Sort exams by strategy
  const sortedExams = [...dedupedExams].sort((a, b) => {
    const dateA = new Date(a.examDate).getTime();
    const dateB = new Date(b.examDate).getTime();
    // last_exam_first (closest exam gets priority) = ascending sort
    // first_exam_first (furthest exam gets priority) = descending sort
    return strategy === 'last_exam_first' ? dateA - dateB : dateB - dateA;
  });

  // 4. Build day availability map
  // Track how many slots are used per day
  const usedSlots: Record<string, number> = {};

  function getAvailableSlots(dateStr: string, dayOfWeek: number): number {
    const base = maxSlotsPerDay;
    // On training days, reduce available slots by 1
    const trainingPenalty = trainingDays.has(dayOfWeek) ? 1 : 0;
    const available = Math.max(0, base - trainingPenalty);
    const used = usedSlots[dateStr] || 0;
    return Math.max(0, available - used);
  }

  const blocks: StudyBlock[] = [];
  let blockId = 0;

  // 5. For each exam (in priority order), distribute sessions
  for (const exam of sortedExams) {
    const examDate = new Date(exam.examDate);
    examDate.setHours(0, 0, 0, 0);

    const targetPerWeek = daysPerSubject[exam.subject] || 2;

    // Days before exam (from tomorrow to day before exam)
    const examDateStr = toDateStr(examDate);
    const daysBeforeExam: { date: Date; dateStr: string }[] = [];

    let cursor = new Date(tomorrow);
    while (cursor < examDate) {
      const dow = cursor.getDay();
      const dateStr = toDateStr(cursor);

      // Skip excluded days
      if (!excludedDays.includes(dow)) {
        daysBeforeExam.push({ date: new Date(cursor), dateStr });
      }
      cursor = addDays(cursor, 1);
    }

    if (daysBeforeExam.length === 0) continue;

    // Calculate total sessions needed (proportional to weeks remaining)
    const weeksRemaining = Math.max(1, daysBeforeExam.length / 7);
    const totalSessionsNeeded = Math.round(targetPerWeek * weeksRemaining);

    // Distribute evenly: pick days spread across the range
    // Interval = total available days / sessions needed
    let sessionsPlaced = 0;

    if (totalSessionsNeeded > 0 && daysBeforeExam.length > 0) {
      const interval = Math.max(1, Math.floor(daysBeforeExam.length / totalSessionsNeeded));

      for (let i = 0; i < daysBeforeExam.length && sessionsPlaced < totalSessionsNeeded; i += interval) {
        const { dateStr, date } = daysBeforeExam[i];
        const dow = date.getDay();

        if (getAvailableSlots(dateStr, dow) <= 0) {
          // Try next day instead
          continue;
        }

        const used = usedSlots[dateStr] || 0;
        const trainingPenalty = trainingDays.has(dow) ? 1 : 0;
        const slotIndex = used + trainingPenalty;
        const blockStart = startMin + slotIndex * sessionDuration;
        const blockEnd = blockStart + sessionDuration;

        if (blockEnd > endMin) continue; // won't fit

        blocks.push({
          id: `sp_${++blockId}`,
          subject: exam.subject,
          date: dateStr,
          startTime: minutesToTime(blockStart),
          endTime: minutesToTime(blockEnd),
          examDate: exam.examDate,
          examType: exam.examType,
        });

        usedSlots[dateStr] = (usedSlots[dateStr] || 0) + 1;
        sessionsPlaced++;
      }

      // If we couldn't place enough, do a second pass filling gaps
      if (sessionsPlaced < totalSessionsNeeded) {
        for (const { dateStr, date } of daysBeforeExam) {
          if (sessionsPlaced >= totalSessionsNeeded) break;
          const dow = date.getDay();

          if (getAvailableSlots(dateStr, dow) <= 0) continue;

          // Check if we already placed a session for this subject on this day
          const alreadyHas = blocks.some((b) => b.date === dateStr && b.subject === exam.subject);
          if (alreadyHas) continue;

          const used = usedSlots[dateStr] || 0;
          const trainingPenalty = trainingDays.has(dow) ? 1 : 0;
          const slotIndex = used + trainingPenalty;
          const blockStart = startMin + slotIndex * sessionDuration;
          const blockEnd = blockStart + sessionDuration;

          if (blockEnd > endMin) continue;

          blocks.push({
            id: `sp_${++blockId}`,
            subject: exam.subject,
            date: dateStr,
            startTime: minutesToTime(blockStart),
            endTime: minutesToTime(blockEnd),
            examDate: exam.examDate,
            examType: exam.examType,
          });

          usedSlots[dateStr] = (usedSlots[dateStr] || 0) + 1;
          sessionsPlaced++;
        }
      }
    }
  }

  // 6. Sort output by date then start time
  blocks.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.startTime.localeCompare(b.startTime);
  });

  return blocks;
}
