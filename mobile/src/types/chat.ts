/**
 * Chat Types — Frontend type definitions for Tomo structured responses.
 * Mirrors backend/services/agents/responseFormatter.ts
 */

// ── Card Types ───────────────────────────────────────────────────

export type CardType =
  | 'stat_row'
  | 'stat_grid'
  | 'schedule_list'
  | 'zone_stack'
  | 'clash_list'
  | 'benchmark_bar'
  | 'text_card'
  | 'coach_note'
  | 'confirm_card'
  | 'session_plan'
  | 'drill_card'
  | 'schedule_preview';

export interface StatRow {
  type: 'stat_row';
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  emoji?: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  type: 'training' | 'match' | 'study' | 'rest' | 'exam' | 'other';
  clash?: boolean;
}

export interface ScheduleList {
  type: 'schedule_list';
  date: string;
  items: ScheduleItem[];
}

export interface ZoneLevel {
  zone: 'green' | 'yellow' | 'red';
  label: string;
  detail: string;
}

export interface ZoneStack {
  type: 'zone_stack';
  current: 'green' | 'yellow' | 'red';
  levels: ZoneLevel[];
}

export interface ClashItem {
  event1: string;
  event2: string;
  time: string;
  fix: string;
}

export interface ClashList {
  type: 'clash_list';
  clashes: ClashItem[];
}

export interface BenchmarkBar {
  type: 'benchmark_bar';
  metric: string;
  value: number;
  percentile: number;
  unit: string;
  ageBand: string;
}

export interface TextCard {
  type: 'text_card';
  headline: string;
  body: string;
  emoji?: string;
}

export interface CoachNote {
  type: 'coach_note';
  note: string;
  source?: string;
}

export interface StatGridItem {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}

export interface StatGrid {
  type: 'stat_grid';
  items: StatGridItem[];
}

export interface ConfirmCard {
  type: 'confirm_card';
  headline: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
}

// ── Session Plan & Drill Cards ───────────────────────────────────

export interface SessionPlanItem {
  drillId: string;
  name: string;
  category: 'warmup' | 'training' | 'cooldown' | 'recovery' | 'activation';
  duration: number;
  intensity: 'light' | 'moderate' | 'hard';
  attributeKeys: string[];
  reason?: string;
}

export interface SessionPlan {
  type: 'session_plan';
  title: string;
  totalDuration: number;
  readiness: string;
  items: SessionPlanItem[];
}

export interface DrillCard {
  type: 'drill_card';
  drillId: string;
  name: string;
  description: string;
  category: string;
  duration: number;
  intensity: 'light' | 'moderate' | 'hard';
  equipment: string[];
  instructions: string[];
  tags: string[];
  progressionCount: number;
}

// ── Schedule Preview Card ────────────────────────────────────────

export interface SchedulePreviewEvent {
  title: string;
  event_type: string;
  date: string;
  startTime: string;
  endTime: string;
  intensity?: string;
  violations: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  alternatives: Array<{ startTime: string; endTime: string }>;
  accepted: boolean;
}

export interface SchedulePreviewCard {
  type: 'schedule_preview';
  events: SchedulePreviewEvent[];
  summary: { total: number; withViolations: number; blocked: number };
  scenario: string;
  confirmAction: string;
  confirmPayload: string;
}

export type VisualCard =
  | StatRow
  | StatGrid
  | ScheduleList
  | ZoneStack
  | ClashList
  | BenchmarkBar
  | TextCard
  | CoachNote
  | ConfirmCard
  | SessionPlan
  | DrillCard
  | SchedulePreviewCard;

// ── Action Chips ─────────────────────────────────────────────────

export interface ActionChip {
  label: string;
  action: string;
}

export interface ConfirmAction {
  label: string;
  toolName: string;
  toolInput: Record<string, any>;
  agentType: string;
}

// ── TomoResponse ─────────────────────────────────────────────────

export interface TomoResponse {
  headline: string;
  cards: VisualCard[];
  chips?: ActionChip[];
  confirm?: ConfirmAction;
}

// ── Session Types ────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  structured: TomoResponse | null;
  agent: string | null;
  token_count: number;
  created_at: string;
}
