// Parent Education Progress — pure label + digest builders.
//
// Parent-facing surface converts raw signals to parent-readable labels.
// NEVER expose raw ACWR / HRV / PHV to parents — they're clinical
// signals the athlete's coach and Tomo own. Parents see:
//   - "Your child's load is Balanced / Building / Stressed / Alarming"
//   - Exam proximity countdown
//   - A 3-5 bullet weekly digest composed from longitudinal memory
//     summaries + triangle inputs (P2.3)
//
// Pure. Zero I/O. Callers pre-fetch the raw signals.

export type DualLoadZone = "green" | "amber" | "red" | "critical" | null;

export type ParentLoadLabel = "Balanced" | "Building" | "Stressed" | "Alarming" | "Insufficient data";

export function parentLoadLabel(
  zone: DualLoadZone,
  dualLoadIndex: number | null
): { label: ParentLoadLabel; color: "green" | "amber" | "red"; hint: string } {
  if (zone == null || dualLoadIndex == null) {
    return {
      label: "Insufficient data",
      color: "amber",
      hint: "Tomo needs a few more days of check-ins before this stabilises.",
    };
  }
  if (zone === "critical") {
    return {
      label: "Alarming",
      color: "red",
      hint: "Academic + training stress is combining. Consider a rest day before the next big demand.",
    };
  }
  if (zone === "red") {
    return {
      label: "Stressed",
      color: "red",
      hint: "Load is elevated. A lighter week would help recovery.",
    };
  }
  if (zone === "amber") {
    return {
      label: "Building",
      color: "amber",
      hint: "Load is climbing. Watch sleep and recovery closely.",
    };
  }
  return {
    label: "Balanced",
    color: "green",
    hint: "Good balance between training and school right now.",
  };
}

export interface ExamProximity {
  nextExam: { subject: string; date: string } | null;
  daysUntil: number | null;
  protectedBlocksCompliant: boolean | null; // null if unknown
}

// Pick the next-upcoming exam from a list. Accepts heterogeneous date
// formats; caller is responsible for parsing. Sorted ascending; first
// non-past result wins.
export function nextExamFrom(
  exams: Array<{ subject: string; exam_date: string }>,
  now: Date = new Date()
): { subject: string; date: string; daysUntil: number } | null {
  if (!exams || exams.length === 0) return null;
  const future = exams
    .map((e) => ({ ...e, time: Date.parse(e.exam_date) }))
    .filter((e) => !Number.isNaN(e.time) && e.time >= now.getTime() - 86_400_000 * 0.5)
    .sort((a, b) => a.time - b.time);
  if (future.length === 0) return null;
  const winner = future[0];
  const daysUntil = Math.max(0, Math.round((winner.time - now.getTime()) / 86_400_000));
  return { subject: winner.subject, date: winner.exam_date, daysUntil };
}

export interface WeeklyDigestBullet {
  icon: "streak" | "training" | "study" | "wellness" | "milestone";
  text: string;
}

export interface DigestInput {
  weeklyDigestRow?: {
    training_sessions?: number | null;
    training_minutes?: number | null;
    study_sessions?: number | null;
    study_minutes_total?: number | null;
    check_ins_completed?: number | null;
    wellness_trend?: "IMPROVING" | "STABLE" | "DECLINING" | null;
  } | null;
  streak?: number | null;
  exam?: { subject: string; daysUntil: number } | null;
}

// Builds 3–5 parent-readable bullets. Never outputs clinical jargon
// (no ACWR, no HRV). Short sentences, present tense.
export function buildWeeklyDigest(input: DigestInput): WeeklyDigestBullet[] {
  const out: WeeklyDigestBullet[] = [];
  const row = input.weeklyDigestRow;

  if (typeof input.streak === "number" && input.streak > 0) {
    out.push({
      icon: "streak",
      text:
        input.streak === 1
          ? "1-day check-in streak — great start this week."
          : `${input.streak}-day check-in streak — strong consistency.`,
    });
  }

  if (row?.training_sessions != null && row.training_sessions > 0) {
    const mins = row.training_minutes ?? null;
    out.push({
      icon: "training",
      text: mins
        ? `${row.training_sessions} training session${row.training_sessions > 1 ? "s" : ""} this week (${mins} min total).`
        : `${row.training_sessions} training session${row.training_sessions > 1 ? "s" : ""} this week.`,
    });
  }

  if (row?.study_sessions != null && row.study_sessions > 0) {
    const mins = row.study_minutes_total ?? null;
    out.push({
      icon: "study",
      text: mins
        ? `${row.study_sessions} study block${row.study_sessions > 1 ? "s" : ""} this week (${mins} min total).`
        : `${row.study_sessions} study block${row.study_sessions > 1 ? "s" : ""} this week.`,
    });
  }

  if (row?.wellness_trend) {
    const map: Record<string, string> = {
      IMPROVING: "Wellness is trending up this week.",
      STABLE: "Wellness has been steady this week.",
      DECLINING: "Wellness is trending down — worth checking in.",
    };
    const line = map[row.wellness_trend];
    if (line) out.push({ icon: "wellness", text: line });
  }

  if (input.exam && input.exam.daysUntil <= 14) {
    out.push({
      icon: "milestone",
      text: input.exam.daysUntil === 0
        ? `${input.exam.subject} exam is today.`
        : input.exam.daysUntil === 1
          ? `${input.exam.subject} exam is tomorrow.`
          : `${input.exam.subject} exam in ${input.exam.daysUntil} days.`,
    });
  }

  // Cap at 5 bullets so the digest stays glanceable.
  return out.slice(0, 5);
}
