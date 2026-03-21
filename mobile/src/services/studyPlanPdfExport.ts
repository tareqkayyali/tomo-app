/**
 * Study Plan PDF Export
 * Generates a monthly calendar grid PDF from a saved study plan.
 * Uses expo-print for HTML→PDF and expo-sharing for the share sheet.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SavedStudyPlan, StudyBlock } from '../types';
import { colors } from '../theme/colors';

// ─── Helpers ─────────────────────────────────────────────────────────

function getMonthsInRange(start: string, end: string): { year: number; month: number }[] {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const months: { year: number; month: number }[] = [];

  let cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const last = new Date(e.getFullYear(), e.getMonth(), 1);

  while (cur <= last) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function formatTime(t: string): string {
  // "14:30" → "2:30p"
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${pad2(m)}${ampm}`;
}

// Subject → consistent color
const SUBJECT_COLORS = [
  colors.warning, colors.warning, colors.error, colors.warning, colors.accent,
  colors.info, colors.error, colors.accent, colors.warning, colors.accentLight,
];

function subjectColor(subject: string, allSubjects: string[]): string {
  const idx = allSubjects.indexOf(subject);
  return SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
}

// ─── HTML Builder ────────────────────────────────────────────────────

function buildMonthHtml(
  year: number,
  month: number,
  blocksByDate: Map<string, StudyBlock[]>,
  examsByDate: Map<string, { subject: string; examType: string }[]>,
  allSubjects: string[],
): string {
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = '';

  // Empty leading cells
  for (let i = 0; i < firstDay; i++) {
    cells += '<div class="day-cell empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dk = dateKey(year, month, d);
    const blocks = blocksByDate.get(dk) || [];
    const exams = examsByDate.get(dk) || [];

    const isExamDay = exams.length > 0;
    const cellClass = isExamDay ? 'day-cell exam-day' : 'day-cell';

    let pills = '';
    for (const ex of exams) {
      pills += `<div class="exam-pill">📝 ${ex.subject} Exam</div>`;
    }
    for (const bl of blocks) {
      const col = subjectColor(bl.subject, allSubjects);
      pills += `<div class="study-pill" style="border-left: 3px solid ${col};">${bl.subject}<br/><span class="time">${formatTime(bl.startTime)}–${formatTime(bl.endTime)}</span></div>`;
    }

    cells += `<div class="${cellClass}"><div class="day-num">${d}</div>${pills}</div>`;
  }

  return `
    <div class="month-section">
      <div class="month-title">${monthName}</div>
      <div class="cal-grid">
        <div class="day-header">Sun</div><div class="day-header">Mon</div>
        <div class="day-header">Tue</div><div class="day-header">Wed</div>
        <div class="day-header">Thu</div><div class="day-header">Fri</div>
        <div class="day-header">Sat</div>
        ${cells}
      </div>
    </div>
  `;
}

// ─── Main Export ─────────────────────────────────────────────────────

export async function exportStudyPlanPdf(plan: SavedStudyPlan): Promise<void> {
  // Index blocks by date
  const blocksByDate = new Map<string, StudyBlock[]>();
  for (const b of plan.blocks) {
    const existing = blocksByDate.get(b.date) || [];
    existing.push(b);
    blocksByDate.set(b.date, existing);
  }

  // Index exams by date
  const examsByDate = new Map<string, { subject: string; examType: string }[]>();
  for (const e of plan.exams) {
    const existing = examsByDate.get(e.examDate) || [];
    existing.push({ subject: e.subject, examType: e.examType });
    examsByDate.set(e.examDate, existing);
  }

  // All unique subjects for color assignment
  const allSubjects = [...new Set(plan.blocks.map((b) => b.subject))];

  // Build month pages
  const months = getMonthsInRange(plan.dateRange.start, plan.dateRange.end);
  const monthHtmls = months.map(({ year, month }) =>
    buildMonthHtml(year, month, blocksByDate, examsByDate, allSubjects),
  );

  // Subject legend
  const legend = allSubjects
    .map((s) => {
      const col = subjectColor(s, allSubjects);
      return `<span class="legend-item"><span class="legend-dot" style="background:${col};"></span>${s}</span>`;
    })
    .join('');

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #1a1a2e; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #666; margin-bottom: 12px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .month-section { margin-bottom: 28px; page-break-inside: avoid; }
  .month-title { font-size: 17px; font-weight: 700; margin-bottom: 6px; color: #1a1a2e; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #e5e7eb; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
  .day-header { text-align: center; font-weight: 600; font-size: 10px; color: #888; padding: 6px 2px; background: #f9fafb; }
  .day-cell { min-height: 70px; background: #fff; padding: 4px; font-size: 10px; }
  .day-cell.empty { background: #fafafa; }
  .day-cell.exam-day { background: #FEF2F2; }
  .day-num { font-weight: 600; font-size: 11px; margin-bottom: 3px; color: #374151; }
  .study-pill { background: #f5f3ff; border-radius: 3px; padding: 2px 4px; margin: 1px 0; font-size: 8px; color: #4338ca; line-height: 1.3; }
  .study-pill .time { font-size: 7px; color: #6b7280; }
  .exam-pill { background: #FEE2E2; color: #DC2626; border-radius: 3px; padding: 2px 4px; margin: 1px 0; font-size: 8px; font-weight: 700; }
  @media print { .month-section { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>📚 Study Plan: ${plan.name}</h1>
  <div class="subtitle">${plan.blockCount} study sessions · ${plan.examCount} exams</div>
  <div class="legend">${legend}</div>
  ${monthHtmls.join('')}
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html: fullHtml });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Study Plan – ${plan.name}`,
  });
}
