/**
 * Event Hint Parser — extracts date, time, event type, and title
 * from natural language messages for the Event Edit Capsule.
 */

import type { PlayerContext } from "./contextBuilder";

interface EventHints {
  title?: string;
  eventType?: 'training' | 'match' | 'study' | 'exam' | 'recovery' | 'other';
  date?: string;
  startTime?: string;
  endTime?: string;
  intensity?: 'REST' | 'LIGHT' | 'MODERATE' | 'HARD';
}

export function parseEventHints(message: string, context: PlayerContext): EventHints {
  const hints: EventHints = {};
  const lower = message.toLowerCase();

  // ── Event type detection ──
  if (/\b(training|train|practice|session)\b/i.test(lower)) {
    hints.eventType = 'training';
    hints.title = extractTitle(lower, 'training');
  } else if (/\b(match|game)\b/i.test(lower)) {
    hints.eventType = 'match';
    hints.title = extractTitle(lower, 'match');
  } else if (/\b(recovery|rest|stretch)\b/i.test(lower)) {
    hints.eventType = 'recovery';
    hints.title = 'Recovery';
  } else if (/\b(study|study block|revision)\b/i.test(lower)) {
    hints.eventType = 'study';
    hints.title = 'Study Block';
  } else if (/\b(exam|test|assessment)\b/i.test(lower)) {
    hints.eventType = 'exam';
    hints.title = extractTitle(lower, 'exam');
  } else if (/\b(gym|weights|strength|lift)\b/i.test(lower)) {
    hints.eventType = 'training';
    hints.title = 'Gym Session';
  } else if (/\b(workout)\b/i.test(lower)) {
    hints.eventType = 'training';
    hints.title = 'Workout';
  }

  // ── Date detection ──
  const todayDate = new Date(`${context.todayDate}T12:00:00`);

  if (/\btoday\b/i.test(lower)) {
    hints.date = context.todayDate;
  } else if (/\btomorrow\b/i.test(lower)) {
    hints.date = addDays(todayDate, 1);
  } else if (/\bday after tomorrow\b/i.test(lower)) {
    hints.date = addDays(todayDate, 2);
  }

  // Day names: "on Monday", "this Thursday"
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      hints.date = getNextWeekday(context.todayDate, i);
      break;
    }
  }

  // Explicit date: "on March 28", "on 28/03"
  const explicitDate = lower.match(/(\d{4}-\d{2}-\d{2})/);
  if (explicitDate) {
    hints.date = explicitDate[1];
  }

  // ── Time detection ──
  // "at 5pm", "at 17:00", "at 5:30pm"
  const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    // If no am/pm and hour < 7, assume PM (athletes don't train at 5am usually)
    if (!ampm && hour >= 1 && hour <= 7) hour += 12;

    hints.startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    hints.endTime = `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  // Time range: "6-8pm", "from 5 to 7"
  const rangeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (rangeMatch && !timeMatch) {
    let startH = parseInt(rangeMatch[1], 10);
    const startM = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
    let endH = parseInt(rangeMatch[3], 10);
    const endM = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : 0;
    const ampm = rangeMatch[5]?.toLowerCase();

    if (ampm === 'pm') {
      if (endH < 12) endH += 12;
      if (startH < 12 && startH < endH - 12) startH += 12;
    }
    if (!ampm && startH <= 7) { startH += 12; endH += 12; }

    hints.startTime = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    hints.endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  // ── Intensity detection ──
  if (/\b(hard|intense|high intensity)\b/i.test(lower)) hints.intensity = 'HARD';
  else if (/\b(light|easy|low intensity)\b/i.test(lower)) hints.intensity = 'LIGHT';
  else if (/\b(moderate|medium)\b/i.test(lower)) hints.intensity = 'MODERATE';

  return hints;
}

function extractTitle(lower: string, eventWord: string): string {
  // Try to extract a meaningful title like "club training", "speed session"
  const patterns = [
    new RegExp(`(\\w+)\\s+${eventWord}`, 'i'),
    new RegExp(`${eventWord}\\s+(\\w+)`, 'i'),
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m && m[1] && !['a', 'an', 'my', 'add', 'create', 'schedule', 'book', 'new', 'the', 'tomorrow', 'today', 'on', 'at', 'for'].includes(m[1])) {
      return capitalize(m[1]) + ' ' + capitalize(eventWord);
    }
  }
  return capitalize(eventWord);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function addDays(date: Date, days: number): string {
  const d = new Date(date.getTime() + days * 86400000);
  return d.toISOString().split('T')[0];
}

function getNextWeekday(todayStr: string, targetDay: number): string {
  const today = new Date(`${todayStr}T12:00:00`);
  const currentDay = today.getDay();
  let diff = targetDay - currentDay;
  if (diff <= 0) diff += 7; // Always next occurrence
  return addDays(today, diff);
}
