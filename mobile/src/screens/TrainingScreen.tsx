/**
 * Training Screen (Plan Tab) — "Your Flow" with 3 tabbed views
 *
 * Flow tab:  Readiness ring + AI banner + day summary + vertical timeline
 * Week tab:  Stacked bar chart + day detail card
 * Month tab: Gradient month calendar + events list (preserved from v1)
 *
 * Month range: ±100 years (2400 pages) — effectively infinite.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  RefreshControl,
  Pressable,
  Dimensions,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import PagerView from 'react-native-pager-view';
import {
  SkeletonCard,
  ErrorState,
} from '../components';
import { EventCard } from '../components/calendar';
import { FlowTabSwitcher, type FlowTab } from '../components/flow/FlowTabSwitcher';
import { ReadinessRing } from '../components/flow/ReadinessRing';
import { AIHeadsUp } from '../components/flow/AIHeadsUp';
import { FlowDaySummary } from '../components/flow/FlowDaySummary';
import { FlowTimeline } from '../components/flow/FlowTimeline';
import { WeekBarChart } from '../components/flow/WeekBarChart';
import { WeekDayDetail } from '../components/flow/WeekDayDetail';
import { ReadinessBadge } from '../components/ReadinessBadge';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import {
  spacing,
  layout,
  shadows,
  fontFamily,
} from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../hooks/useAuth';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { useCalendarData } from '../hooks/useCalendarData';
import {
  getMonthDays,
  getWeekDays,
  isSameDay,
  toDateStr,
  formatMonthYear,
} from '../utils/calendarHelpers';
import type { CalendarEvent, ReadinessLevel } from '../types';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// FlatList month data: ±100 years = 2400 pages (effectively infinite)
const TOTAL_MONTHS = 2400;
const CENTER_INDEX = 1200;
const MONTH_INDICES = Array.from({ length: TOTAL_MONTHS }, (_, i) => i);

// ── Mock data ──
// TODO: Remove these once real events are flowing
const MOCK_EVENTS: CalendarEvent[] = [
  // ── March 1 (Sun) ──
  { id: 'm-1a', userId: 'demo', name: 'Morning Run',           type: 'training',    sport: 'general',  date: '2026-03-01', startTime: '07:00', endTime: '07:45', intensity: 'LIGHT',    notes: '5 km easy pace',                    createdAt: '' },
  { id: 'm-1b', userId: 'demo', name: 'Football Training',     type: 'training',    sport: 'football', date: '2026-03-01', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Passing drills & rondos',            createdAt: '' },
  // ── March 2 (Mon) ──
  { id: 'm-2a', userId: 'demo', name: 'Gym — Lower Body',      type: 'training',    sport: 'general',  date: '2026-03-02', startTime: '07:00', endTime: '08:00', intensity: 'MODERATE', notes: 'Squats, lunges, deadlifts',         createdAt: '' },
  { id: 'm-2b', userId: 'demo', name: 'Football Training',     type: 'training',    sport: 'football', date: '2026-03-02', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Small-sided games',                 createdAt: '' },
  { id: 'm-2c', userId: 'demo', name: 'Study Block',           type: 'study_block', sport: 'general',  date: '2026-03-02', startTime: '19:00', endTime: '21:00', intensity: null,       notes: 'Biology revision',                  createdAt: '' },
  // ── March 3 (Tue) ──
  { id: 'm-3a', userId: 'demo', name: 'Padel Training',        type: 'training',    sport: 'padel',    date: '2026-03-03', startTime: '17:00', endTime: '18:30', intensity: 'MODERATE', notes: 'Bandeja & wall shots',               createdAt: '' },
  { id: 'm-3b', userId: 'demo', name: 'Stretching',            type: 'recovery',    sport: 'general',  date: '2026-03-03', startTime: '21:00', endTime: '21:30', intensity: 'LIGHT',    notes: 'Hip & hamstring focus',              createdAt: '' },
  // ── March 4 (Wed) ──
  { id: 'm-4a', userId: 'demo', name: 'Sprint Drills',         type: 'training',    sport: 'football', date: '2026-03-04', startTime: '16:00', endTime: '17:00', intensity: 'HARD',     notes: '30m repeats × 10',                  createdAt: '' },
  { id: 'm-4b', userId: 'demo', name: 'Padel Match',           type: 'match',       sport: 'padel',    date: '2026-03-04', startTime: '18:30', endTime: '20:00', intensity: 'HARD',     notes: 'League doubles',                    createdAt: '' },
  // ── March 5 (Thu) ──
  { id: 'm-5a', userId: 'demo', name: 'Recovery Session',      type: 'recovery',    sport: 'general',  date: '2026-03-05', startTime: '09:00', endTime: '10:00', intensity: 'LIGHT',    notes: 'Foam rolling + stretching',          createdAt: '' },
  { id: 'm-5b', userId: 'demo', name: 'Study Block',           type: 'study_block', sport: 'general',  date: '2026-03-05', startTime: '14:00', endTime: '16:00', intensity: null,       notes: 'Maths problem sets',                 createdAt: '' },
  // ── March 6 (Fri) ──
  { id: 'm-6a', userId: 'demo', name: 'Football Training',     type: 'training',    sport: 'football', date: '2026-03-06', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Crossing & finishing',               createdAt: '' },
  { id: 'm-6b', userId: 'demo', name: 'Gym — Upper Body',      type: 'training',    sport: 'general',  date: '2026-03-06', startTime: '18:00', endTime: '19:00', intensity: 'MODERATE', notes: 'Bench, rows, shoulders',             createdAt: '' },
  // ── March 7 (Sat) ──
  { id: 'm-7a', userId: 'demo', name: 'Football Match',        type: 'match',       sport: 'football', date: '2026-03-07', startTime: '10:00', endTime: '11:30', intensity: 'HARD',     notes: 'League matchday 12',                 createdAt: '' },
  { id: 'm-7b', userId: 'demo', name: 'Post-Match Recovery',   type: 'recovery',    sport: 'general',  date: '2026-03-07', startTime: '15:00', endTime: '15:45', intensity: 'LIGHT',    notes: 'Ice bath + compression',             createdAt: '' },
  // ── March 8 (Sun) ──
  { id: 'm-8a', userId: 'demo', name: 'Active Recovery',       type: 'recovery',    sport: 'general',  date: '2026-03-08', startTime: '09:00', endTime: '10:00', intensity: 'REST',     notes: 'Walk + yoga',                        createdAt: '' },
  { id: 'm-8b', userId: 'demo', name: 'Padel Social',          type: 'other',       sport: 'padel',    date: '2026-03-08', startTime: '17:00', endTime: '18:30', intensity: 'LIGHT',    notes: 'Casual doubles with friends',        createdAt: '' },
  // ── March 9 (Mon) ──
  { id: 'm-9a', userId: 'demo', name: 'Gym — Legs',            type: 'training',    sport: 'general',  date: '2026-03-09', startTime: '07:00', endTime: '08:00', intensity: 'HARD',     notes: 'Heavy squat day',                    createdAt: '' },
  { id: 'm-9b', userId: 'demo', name: 'Football Training',     type: 'training',    sport: 'football', date: '2026-03-09', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Set pieces & dead balls',            createdAt: '' },
  // ── March 10 (Tue) ──
  { id: 'm-10a', userId: 'demo', name: 'Padel Training',       type: 'training',    sport: 'padel',    date: '2026-03-10', startTime: '17:00', endTime: '18:30', intensity: 'MODERATE', notes: 'Vibora & smash technique',            createdAt: '' },
  { id: 'm-10b', userId: 'demo', name: 'Study Block',          type: 'study_block', sport: 'general',  date: '2026-03-10', startTime: '19:30', endTime: '21:00', intensity: null,       notes: 'Chemistry lab prep',                  createdAt: '' },
  // ── March 11 (Wed) ──
  { id: 'm-11a', userId: 'demo', name: 'Study Block',          type: 'study_block', sport: 'general',  date: '2026-03-11', startTime: '08:00', endTime: '10:00', intensity: null,       notes: 'Physics exam prep',                   createdAt: '' },
  { id: 'm-11b', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-11', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Defensive shape',                     createdAt: '' },
  { id: 'm-11c', userId: 'demo', name: 'Stretching',           type: 'recovery',    sport: 'general',  date: '2026-03-11', startTime: '21:00', endTime: '21:30', intensity: 'LIGHT',    notes: 'Full body mobility',                  createdAt: '' },
  // ── March 12 (Thu) ──
  { id: 'm-12a', userId: 'demo', name: 'Physics Exam',         type: 'exam',        sport: 'general',  date: '2026-03-12', startTime: '09:00', endTime: '11:00', intensity: null,       notes: 'Chapters 4-7',                        createdAt: '' },
  { id: 'm-12b', userId: 'demo', name: 'Light Jog',            type: 'training',    sport: 'general',  date: '2026-03-12', startTime: '16:00', endTime: '16:30', intensity: 'LIGHT',    notes: 'Post-exam de-stress',                 createdAt: '' },
  // ── March 13 (Fri) ──
  { id: 'm-13a', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-13', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Attacking patterns',                  createdAt: '' },
  { id: 'm-13b', userId: 'demo', name: 'Padel Training',       type: 'training',    sport: 'padel',    date: '2026-03-13', startTime: '18:00', endTime: '19:00', intensity: 'MODERATE', notes: 'Net play drills',                     createdAt: '' },
  // ── March 14 (Sat) ──
  { id: 'm-14a', userId: 'demo', name: 'Football Match',       type: 'match',       sport: 'football', date: '2026-03-14', startTime: '10:00', endTime: '11:30', intensity: 'HARD',     notes: 'League matchday 13',                  createdAt: '' },
  { id: 'm-14b', userId: 'demo', name: 'Recovery Swim',        type: 'recovery',    sport: 'general',  date: '2026-03-14', startTime: '15:00', endTime: '16:00', intensity: 'LIGHT',    notes: '30 min easy laps',                    createdAt: '' },
  { id: 'm-14c', userId: 'demo', name: 'Study Block',          type: 'study_block', sport: 'general',  date: '2026-03-14', startTime: '19:00', endTime: '21:00', intensity: null,       notes: 'English essay draft',                 createdAt: '' },
  // ── March 15 (Sun) ──
  { id: 'm-15a', userId: 'demo', name: 'Rest Day',             type: 'recovery',    sport: 'general',  date: '2026-03-15', startTime: null,    endTime: null,     intensity: 'REST',     notes: 'Full rest',                           createdAt: '' },
  { id: 'm-15b', userId: 'demo', name: 'Meal Prep',            type: 'other',       sport: 'general',  date: '2026-03-15', startTime: '17:00', endTime: '18:30', intensity: null,       notes: 'Week meals + snacks',                 createdAt: '' },
  // ── March 16–31 + April ──
  { id: 'm-16a', userId: 'demo', name: 'Gym — Push',           type: 'training',    sport: 'general',  date: '2026-03-16', startTime: '07:00', endTime: '08:00', intensity: 'MODERATE', notes: 'Chest, shoulders, triceps',           createdAt: '' },
  { id: 'm-16b', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-16', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Pressing triggers',                   createdAt: '' },
  { id: 'm-17a', userId: 'demo', name: 'Padel Training',       type: 'training',    sport: 'padel',    date: '2026-03-17', startTime: '17:00', endTime: '18:30', intensity: 'MODERATE', notes: 'Lob defence & bajada',                createdAt: '' },
  { id: 'm-17b', userId: 'demo', name: 'Study Block',          type: 'study_block', sport: 'general',  date: '2026-03-17', startTime: '19:30', endTime: '21:00', intensity: null,       notes: 'History notes',                       createdAt: '' },
  { id: 'm-18a', userId: 'demo', name: 'Sprint Session',       type: 'training',    sport: 'football', date: '2026-03-18', startTime: '16:00', endTime: '17:00', intensity: 'HARD',     notes: 'Agility ladder + cones',              createdAt: '' },
  { id: 'm-18b', userId: 'demo', name: 'Padel Match',          type: 'match',       sport: 'padel',    date: '2026-03-18', startTime: '19:00', endTime: '20:30', intensity: 'HARD',     notes: 'Tournament quarter-final',            createdAt: '' },
  { id: 'm-19a', userId: 'demo', name: 'Recovery Session',     type: 'recovery',    sport: 'general',  date: '2026-03-19', startTime: '07:30', endTime: '08:15', intensity: 'LIGHT',    notes: 'Foam rolling + cold plunge',          createdAt: '' },
  { id: 'm-19b', userId: 'demo', name: 'Gym — Pull',           type: 'training',    sport: 'general',  date: '2026-03-19', startTime: '12:00', endTime: '13:00', intensity: 'MODERATE', notes: 'Deadlifts, pull-ups, rows',           createdAt: '' },
  { id: 'm-20a', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-20', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Pre-match tactical',                  createdAt: '' },
  { id: 'm-20b', userId: 'demo', name: 'Visualisation',        type: 'other',       sport: 'general',  date: '2026-03-20', startTime: '21:00', endTime: '21:30', intensity: null,       notes: 'Match-day mental prep',               createdAt: '' },
  { id: 'm-21a', userId: 'demo', name: 'Football Match',       type: 'match',       sport: 'football', date: '2026-03-21', startTime: '14:00', endTime: '15:30', intensity: 'HARD',     notes: 'League matchday 14',                  createdAt: '' },
  { id: 'm-21b', userId: 'demo', name: 'Post-Match Ice Bath',  type: 'recovery',    sport: 'general',  date: '2026-03-21', startTime: '17:00', endTime: '17:30', intensity: 'LIGHT',    notes: '10 min cold immersion',               createdAt: '' },
  { id: 'm-22a', userId: 'demo', name: 'Active Recovery',      type: 'recovery',    sport: 'general',  date: '2026-03-22', startTime: '09:00', endTime: '10:00', intensity: 'REST',     notes: 'Pool session + sauna',                createdAt: '' },
  { id: 'm-22b', userId: 'demo', name: 'Study Block',          type: 'study_block', sport: 'general',  date: '2026-03-22', startTime: '14:00', endTime: '16:00', intensity: null,       notes: 'Maths revision',                      createdAt: '' },
  { id: 'm-23a', userId: 'demo', name: 'Gym — Legs',           type: 'training',    sport: 'general',  date: '2026-03-23', startTime: '07:00', endTime: '08:00', intensity: 'HARD',     notes: 'Squat PR attempt',                    createdAt: '' },
  { id: 'm-23b', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-23', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Ball retention under pressure',       createdAt: '' },
  { id: 'm-23c', userId: 'demo', name: 'Physio Appointment',   type: 'other',       sport: 'general',  date: '2026-03-23', startTime: '18:30', endTime: '19:15', intensity: null,       notes: 'Knee check-up',                       createdAt: '' },
  { id: 'm-24a', userId: 'demo', name: 'Padel Training',       type: 'training',    sport: 'padel',    date: '2026-03-24', startTime: '17:00', endTime: '18:30', intensity: 'MODERATE', notes: 'Serve & return patterns',             createdAt: '' },
  { id: 'm-24b', userId: 'demo', name: 'Stretching',           type: 'recovery',    sport: 'general',  date: '2026-03-24', startTime: '21:00', endTime: '21:30', intensity: 'LIGHT',    notes: 'Hamstrings & calves',                 createdAt: '' },
  { id: 'm-25a', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-25', startTime: '16:00', endTime: '17:30', intensity: 'HARD',     notes: 'Match simulation',                    createdAt: '' },
  { id: 'm-25b', userId: 'demo', name: 'Study Block',          type: 'study_block', sport: 'general',  date: '2026-03-25', startTime: '19:00', endTime: '20:30', intensity: null,       notes: 'Biology lab report',                  createdAt: '' },
  { id: 'm-26a', userId: 'demo', name: 'Maths Exam',           type: 'exam',        sport: 'general',  date: '2026-03-26', startTime: '09:00', endTime: '11:00', intensity: null,       notes: 'Calculus & algebra',                  createdAt: '' },
  { id: 'm-26b', userId: 'demo', name: 'Padel Match',          type: 'match',       sport: 'padel',    date: '2026-03-26', startTime: '18:00', endTime: '19:30', intensity: 'HARD',     notes: 'Tournament semi-final',               createdAt: '' },
  { id: 'm-27a', userId: 'demo', name: 'Recovery Walk',        type: 'recovery',    sport: 'general',  date: '2026-03-27', startTime: '08:00', endTime: '08:45', intensity: 'LIGHT',    notes: '30 min easy walk',                    createdAt: '' },
  { id: 'm-27b', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-27', startTime: '16:00', endTime: '17:30', intensity: 'LIGHT',    notes: 'Light session pre-match',             createdAt: '' },
  { id: 'm-28a', userId: 'demo', name: 'Cup Semi-Final',       type: 'match',       sport: 'football', date: '2026-03-28', startTime: '15:00', endTime: '16:30', intensity: 'HARD',     notes: 'Biggest match of the season',         createdAt: '' },
  { id: 'm-28b', userId: 'demo', name: 'Team Dinner',          type: 'other',       sport: 'general',  date: '2026-03-28', startTime: '19:00', endTime: '21:00', intensity: null,       notes: 'Post-match team meal',                createdAt: '' },
  { id: 'm-29a', userId: 'demo', name: 'Rest Day',             type: 'recovery',    sport: 'general',  date: '2026-03-29', startTime: null,    endTime: null,     intensity: 'REST',     notes: 'Full rest after semi-final',          createdAt: '' },
  { id: 'm-29b', userId: 'demo', name: 'Meal Prep',            type: 'other',       sport: 'general',  date: '2026-03-29', startTime: '16:00', endTime: '17:30', intensity: null,       notes: 'Match-week nutrition',                createdAt: '' },
  { id: 'm-30a', userId: 'demo', name: 'Gym — Core',           type: 'training',    sport: 'general',  date: '2026-03-30', startTime: '07:00', endTime: '07:45', intensity: 'MODERATE', notes: 'Planks, anti-rotation, hanging',      createdAt: '' },
  { id: 'm-30b', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-03-30', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Cup final preparation',               createdAt: '' },
  { id: 'm-31a', userId: 'demo', name: 'Padel Training',       type: 'training',    sport: 'padel',    date: '2026-03-31', startTime: '17:00', endTime: '18:00', intensity: 'LIGHT',    notes: 'Touch & feel session',                createdAt: '' },
  { id: 'm-31b', userId: 'demo', name: 'Study Block',          type: 'study_block', sport: 'general',  date: '2026-03-31', startTime: '19:30', endTime: '21:00', intensity: null,       notes: 'Exam revision schedule',              createdAt: '' },
  { id: 'm-a1a', userId: 'demo', name: 'Football Training',    type: 'training',    sport: 'football', date: '2026-04-01', startTime: '16:00', endTime: '17:30', intensity: 'MODERATE', notes: 'Final tactical session',              createdAt: '' },
  { id: 'm-a1b', userId: 'demo', name: 'Sports Massage',       type: 'recovery',    sport: 'general',  date: '2026-04-01', startTime: '18:30', endTime: '19:30', intensity: 'LIGHT',    notes: 'Deep tissue legs',                    createdAt: '' },
  { id: 'm-a5a', userId: 'demo', name: 'Cup Final',            type: 'match',       sport: 'football', date: '2026-04-05', startTime: '14:00', endTime: '16:00', intensity: 'HARD',     notes: 'Season finale!',                      createdAt: '' },
  { id: 'm-a5b', userId: 'demo', name: 'Team Celebration',     type: 'other',       sport: 'general',  date: '2026-04-05', startTime: '18:00', endTime: '22:00', intensity: null,       notes: 'End-of-season party',                 createdAt: '' },
];

// Mock readiness for today (hypothetical check-in)
const MOCK_READINESS: { score: number; level: ReadinessLevel } = {
  score: 72,
  level: 'GREEN',
};

// Mark first event of today as completed
const INITIAL_COMPLETED = new Set(['m-2a']);

// Grid dimensions (6 rows always — getMonthDays returns 42 cells)
const CELL_HEIGHT = 44;
const ROW_GAP = 2;
const ROW_COUNT = 6;
const GRID_PAD_TOP = 14;
const GRID_PAD_BOTTOM = 10;
const DAY_LABELS_HEIGHT = 26;
const CALENDAR_HEIGHT =
  GRID_PAD_TOP + DAY_LABELS_HEIGHT + ROW_COUNT * (CELL_HEIGHT + ROW_GAP) + GRID_PAD_BOTTOM;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrainingScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Plan'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

// ---------------------------------------------------------------------------
// Month ↔ FlatList index helpers
// ---------------------------------------------------------------------------

function indexToMonthDate(index: number, baseYear: number, baseMonth: number): Date {
  const total = baseYear * 12 + baseMonth + (index - CENTER_INDEX);
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return new Date(y, m, 1);
}

function monthDateToIndex(date: Date, baseYear: number, baseMonth: number): number {
  return CENTER_INDEX + (date.getFullYear() * 12 + date.getMonth()) - (baseYear * 12 + baseMonth);
}

// ---------------------------------------------------------------------------
// GradientMonthGrid — one page in the horizontal FlatList
// ---------------------------------------------------------------------------

const GradientMonthGrid = React.memo(function GradientMonthGrid({
  monthDate,
  selectedDay,
  onDayPress,
  events,
  colors,
}: {
  monthDate: Date;
  selectedDay: Date;
  onDayPress: (date: Date) => void;
  events: CalendarEvent[];
  colors: ThemeColors;
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthDays = useMemo(() => getMonthDays(year, month), [year, month]);
  const today = useMemo(() => new Date(), []);
  const gs = useMemo(() => createGridStyles(colors), [colors]);

  // Map each date → dot color based on daily load
  // Load per event: HARD=3, MODERATE=2, LIGHT/null=1
  // Total: 1-2 green (free), 3-4 orange (moderate), 5+ red (busy)
  const dayLoadColors = useMemo(() => {
    const loads = new Map<string, number>();
    for (const evt of events) {
      const prev = loads.get(evt.date) ?? 0;
      const w = evt.intensity === 'HARD' ? 3 : evt.intensity === 'MODERATE' ? 2 : 1;
      loads.set(evt.date, prev + w);
    }
    const colors = new Map<string, string>();
    for (const [date, load] of loads) {
      colors.set(date, load >= 5 ? '#E74C3C' : load >= 3 ? '#FF9500' : '#30D158');
    }
    return colors;
  }, [events]);

  const rows = useMemo(() => {
    const r: (typeof monthDays)[] = [];
    for (let i = 0; i < monthDays.length; i += 7) r.push(monthDays.slice(i, i + 7));
    return r;
  }, [monthDays]);

  return (
    <View style={gs.page}>
      <LinearGradient
        colors={['#FF9B6B', '#66E8FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={gs.gradientCard}
      >
        <View style={gs.dayLabelsRow}>
          {DAY_LABELS.map((l) => (
            <View key={l} style={gs.dayLabelCell}>
              <Text style={gs.dayLabelText}>{l}</Text>
            </View>
          ))}
        </View>

        {rows.map((row, ri) => (
          <View key={ri} style={gs.gridRow}>
            {row.map((day) => {
              const isToday = isSameDay(day.date, today);
              const isSelected = isSameDay(day.date, selectedDay) && day.isCurrentMonth;
              const dotColor = dayLoadColors.get(day.dateStr);

              return (
                <Pressable
                  key={day.dateStr}
                  style={[
                    gs.dayCell,
                    !day.isCurrentMonth && gs.dayCellOutside,
                    isToday && gs.dayCellToday,
                    isSelected && !isToday && gs.dayCellSelected,
                  ]}
                  onPress={() => day.isCurrentMonth && onDayPress(day.date)}
                >
                  <Text
                    style={[
                      gs.dayNumber,
                      !day.isCurrentMonth && gs.dayNumberOutside,
                      isToday && gs.dayNumberToday,
                    ]}
                  >
                    {day.dayNumber}
                  </Text>
                  {dotColor && day.isCurrentMonth && (
                    <View style={[gs.eventDot, { backgroundColor: dotColor }]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </LinearGradient>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Grid Styles — Rounded card with horizontal margin
// ---------------------------------------------------------------------------

function createGridStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    page: {
      width: SCREEN_WIDTH,
      paddingHorizontal: 16,
    },
    gradientCard: {
      paddingHorizontal: 10,
      paddingTop: GRID_PAD_TOP,
      paddingBottom: GRID_PAD_BOTTOM,
      borderRadius: 20,
      overflow: 'hidden',
    },
    dayLabelsRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    dayLabelCell: {
      flex: 1,
      alignItems: 'center',
    },
    dayLabelText: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: 'rgba(255,255,255,0.6)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    gridRow: {
      flexDirection: 'row',
      marginBottom: ROW_GAP,
    },
    dayCell: {
      flex: 1,
      height: CELL_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: CELL_HEIGHT / 2,
    },
    dayCellOutside: {
      opacity: 0.25,
    },
    dayCellToday: {
      backgroundColor: '#FFFFFF',
    },
    dayCellSelected: {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    dayNumber: {
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: '#FFFFFF',
    },
    dayNumberOutside: {
      color: 'rgba(255,255,255,0.4)',
    },
    dayNumberToday: {
      color: '#FF6B35',
      fontFamily: fontFamily.bold,
    },
    eventDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
      position: 'absolute',
      bottom: 3,
    },
  });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TrainingScreen({ navigation }: TrainingScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FlowTab>('flow');
  const [completedEvents, setCompletedEvents] = useState<Set<string>>(
    () => new Set(INITIAL_COMPLETED),
  );

  // ─── Pager for swipe-between-tabs ───
  const pagerRef = useRef<PagerView>(null);
  const TAB_ORDER: FlowTab[] = ['flow', 'week', 'month'];
  const tabScrollPosition = useSharedValue(0);

  const handleTabChange = useCallback((tab: FlowTab) => {
    setActiveTab(tab);
    const pageIndex = TAB_ORDER.indexOf(tab);
    pagerRef.current?.setPage(pageIndex);
  }, []);

  const handlePageSelected = useCallback(
    (e: NativeSyntheticEvent<{ position: number }>) => {
      const page = e.nativeEvent.position;
      const tab = TAB_ORDER[page];
      if (tab && tab !== activeTab) {
        setActiveTab(tab);
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    },
    [activeTab],
  );

  const handlePageScroll = useCallback(
    (e: NativeSyntheticEvent<{ position: number; offset: number }>) => {
      tabScrollPosition.value = e.nativeEvent.position + e.nativeEvent.offset;
    },
    [],
  );

  // ─── Calendar data hook ───
  const calendar = useCalendarData();
  const {
    events: realEvents,
    checkins,
    isLoading,
    backendError,
    setSelectedDate,
    refresh,
    handleDeleteEvent,
  } = calendar;

  // Merge real events with mock preview events
  const events = useMemo(
    () => [...realEvents, ...MOCK_EVENTS],
    [realEvents],
  );

  // Track whether initial load is done
  const hasLoadedOnce = useRef(false);
  useEffect(() => {
    if (!isLoading && !hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
    }
  }, [isLoading]);

  useEffect(() => {
    calendar.setViewMode('month');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Base date anchors ───
  const baseYear = useRef(new Date().getFullYear()).current;
  const baseMonth = useRef(new Date().getMonth()).current;

  // ─── Current display month ───
  const [displayMonth, setDisplayMonth] = useState<Date>(
    () => new Date(baseYear, baseMonth, 1),
  );
  const currentIndexRef = useRef(CENTER_INDEX);
  const flatListRef = useRef<FlatList<number>>(null);

  // ─── Selected day ───
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  // Sync hook's selectedDate with displayMonth for data fetching
  useEffect(() => {
    setSelectedDate(displayMonth);
  }, [displayMonth, setSelectedDate]);

  // Is currently viewing the current month?
  const isOnCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      displayMonth.getFullYear() === now.getFullYear() &&
      displayMonth.getMonth() === now.getMonth()
    );
  }, [displayMonth]);

  // ─── FlatList scroll handlers ───

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (page === currentIndexRef.current) return;
      currentIndexRef.current = page;
      const newMonth = indexToMonthDate(page, baseYear, baseMonth);
      setDisplayMonth(newMonth);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [baseYear, baseMonth],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
      }, 100);
    },
    [],
  );

  // ─── Arrow navigation ───

  const navigateByArrow = useCallback(
    (direction: 1 | -1) => {
      const newIndex = currentIndexRef.current + direction;
      if (newIndex < 0 || newIndex >= TOTAL_MONTHS) return;
      currentIndexRef.current = newIndex;
      flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
      const newMonth = indexToMonthDate(newIndex, baseYear, baseMonth);
      setDisplayMonth(newMonth);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [baseYear, baseMonth],
  );

  // ─── Jump to today ───

  const goToToday = useCallback(() => {
    const now = new Date();
    const todayIndex = monthDateToIndex(
      new Date(now.getFullYear(), now.getMonth(), 1),
      baseYear,
      baseMonth,
    );
    currentIndexRef.current = todayIndex;
    flatListRef.current?.scrollToIndex({ index: todayIndex, animated: true });
    setDisplayMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [baseYear, baseMonth]);

  // ─── Day tap ───

  const handleDayPress = useCallback((date: Date) => {
    setSelectedDay(date);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // ─── Pull to refresh ───

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refresh]);

  // ─── Event completion handlers ───

  const handleCompleteEvent = useCallback((eventId: string) => {
    setCompletedEvents((prev) => new Set(prev).add(eventId));
  }, []);

  const handleSkipEvent = useCallback((eventId: string) => {
    setCompletedEvents((prev) => new Set(prev).add(eventId));
  }, []);

  const handleUndoEvent = useCallback((eventId: string) => {
    setCompletedEvents((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }, []);

  // ─── Navigate to FullChat ───

  const handleAIPress = useCallback(() => {
    navigation.navigate('FullChat');
  }, [navigation]);

  // ─── Events for selected/today ───

  const todayStr = toDateStr(new Date());
  const selectedDayStr = toDateStr(selectedDay);

  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => e.date === selectedDayStr)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return 1;
          return 0;
        }),
    [events, selectedDayStr],
  );

  const todayEvents = useMemo(
    () =>
      events
        .filter((e) => e.date === todayStr)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return 1;
          return 0;
        }),
    [events, todayStr],
  );

  const selectedDayLabel = useMemo(() => {
    if (isSameDay(selectedDay, new Date())) return 'Today';
    return selectedDay.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }, [selectedDay]);

  // ─── Week data (for Week tab) ───

  const weekDays = useMemo(() => getWeekDays(selectedDay), [selectedDay]);

  const weekEvents = useMemo(
    () => {
      const weekDateStrs = new Set(weekDays.map((wd) => wd.dateStr));
      return events.filter((e) => weekDateStrs.has(e.date));
    },
    [events, weekDays],
  );

  const weekSelectedDayEvents = useMemo(
    () =>
      events
        .filter((e) => e.date === selectedDayStr)
        .sort((a, b) => {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
          if (a.startTime) return -1;
          if (b.startTime) return 1;
          return 0;
        }),
    [events, selectedDayStr],
  );

  // ─── Header text ───

  const weekdayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // ─── FlatList renderItem ───

  const renderMonth = useCallback(
    ({ item }: ListRenderItemInfo<number>) => {
      const monthDate = indexToMonthDate(item, baseYear, baseMonth);
      return (
        <GradientMonthGrid
          monthDate={monthDate}
          selectedDay={selectedDay}
          onDayPress={handleDayPress}
          events={events}
          colors={colors}
        />
      );
    },
    [baseYear, baseMonth, selectedDay, handleDayPress, events, colors],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    [],
  );

  const keyExtractor = useCallback((item: number) => String(item), []);

  // ─── Loading state ───

  if (isLoading && !hasLoadedOnce.current) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerArea}>
          <Text style={styles.screenTitle}>Your Flow</Text>
          <HeaderProfileButton
            initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
            photoUrl={profile?.photoUrl}
          />
        </View>
        <View style={styles.loadingContainer}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ───

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Header ─── */}
      <View style={styles.headerArea}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.headerSubtitle}>TOMO · {weekdayName}</Text>
            <Text style={styles.screenTitle}>Your Flow</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <ReadinessBadge level={MOCK_READINESS.level} size="small" />
          <HeaderProfileButton
            initial={profile?.name?.charAt(0)?.toUpperCase() || '?'}
            photoUrl={profile?.photoUrl}
          />
        </View>
      </View>

      {/* Error banner */}
      {backendError && (
        <ErrorState
          message="Could not load data. Pull to retry."
          onRetry={refresh}
          compact
        />
      )}

      {/* ─── Tab Switcher ─── */}
      <FlowTabSwitcher activeTab={activeTab} onTabChange={handleTabChange} scrollPosition={tabScrollPosition} />

      {/* ─── Swipeable Pager (Flow | Week | Month) ─── */}
      <View style={{ flex: 1 }}>
        <ScrollFadeOverlay />
        <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
        overdrag
      >
        {/* ─── Page 0: Flow ─── */}
        <View key="flow" style={styles.pagerPage}>
          <ScrollView
            style={styles.eventsScroll}
            contentContainerStyle={styles.flowContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent1}
              />
            }
          >
            {/* Readiness + AI row */}
            <View style={styles.readinessRow}>
              <ReadinessRing
                score={MOCK_READINESS.score}
                level={MOCK_READINESS.level}
                size={72}
              />
              <View style={styles.aiWrap}>
                <AIHeadsUp
                  readinessLevel={MOCK_READINESS.level}
                  archetype={profile?.archetype}
                  onPress={handleAIPress}
                />
              </View>
            </View>

            {/* Day summary */}
            <FlowDaySummary
              events={todayEvents}
              completedEventIds={completedEvents}
            />

            {/* Timeline */}
            <View style={styles.timelineSection}>
              <FlowTimeline
                events={todayEvents}
                completedEventIds={completedEvents}
                onComplete={handleCompleteEvent}
                onSkip={handleSkipEvent}
                onUndo={handleUndoEvent}
              />
            </View>
          </ScrollView>
        </View>

        {/* ─── Page 1: Week ─── */}
        <View key="week" style={styles.pagerPage}>
          <ScrollView
            style={styles.eventsScroll}
            contentContainerStyle={styles.flowContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent1}
              />
            }
          >
            <WeekBarChart
              weekDays={weekDays}
              events={weekEvents}
              selectedDate={selectedDay}
              onDayPress={handleDayPress}
            />

            <WeekDayDetail
              date={selectedDay}
              events={weekSelectedDayEvents}
              weekEvents={weekEvents}
              checkins={checkins}
            />

            {/* Events for selected day */}
            <View style={styles.weekEventsSection}>
              <View style={styles.eventsSectionHeader}>
                <View style={styles.eventsDayDot} />
                <Text style={styles.eventsSectionTitle}>{selectedDayLabel}</Text>
                <Text style={styles.eventsCount}>
                  {dayEvents.length > 0
                    ? `${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}`
                    : ''}
                </Text>
              </View>
              {dayEvents.length > 0 ? (
                dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onDelete={handleDeleteEvent}
                  />
                ))
              ) : (
                <View style={styles.noEventsContainer}>
                  <Ionicons name="calendar-outline" size={28} color={colors.textInactive} />
                  <Text style={styles.noEventsText}>No events</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        {/* ─── Page 2: Month ─── */}
        <View key="month" style={styles.pagerPage}>
          <ScrollView
            style={styles.eventsScroll}
            contentContainerStyle={styles.monthScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent1}
              />
            }
          >
            {/* Month header: ← March 2026 → */}
            <View style={styles.monthRow}>
              <Pressable
                onPress={() => navigateByArrow(-1)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={({ pressed }) => pressed && styles.arrowPressed}
              >
                <Ionicons name="chevron-back" size={22} color={colors.textOnDark} />
              </Pressable>

              <View style={styles.monthTitleRow}>
                <Text style={styles.monthTitle}>{formatMonthYear(displayMonth)}</Text>
                {!isOnCurrentMonth && (
                  <Pressable
                    onPress={goToToday}
                    style={styles.todayPill}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.todayPillText}>Today</Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                onPress={() => navigateByArrow(1)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={({ pressed }) => pressed && styles.arrowPressed}
              >
                <Ionicons name="chevron-forward" size={22} color={colors.textOnDark} />
              </Pressable>
            </View>

            {/* Calendar FlatList */}
            <View style={styles.calendarContainer}>
              <FlatList
                ref={flatListRef}
                data={MONTH_INDICES}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={CENTER_INDEX}
                getItemLayout={getItemLayout}
                renderItem={renderMonth}
                keyExtractor={keyExtractor}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                onScrollToIndexFailed={handleScrollToIndexFailed}
                windowSize={3}
                maxToRenderPerBatch={2}
                initialNumToRender={1}
                removeClippedSubviews={Platform.OS === 'android'}
                decelerationRate="fast"
                nestedScrollEnabled
              />
            </View>

            {/* Events section */}
            <View style={styles.eventsScrollContent}>
              <View style={styles.eventsSectionHeader}>
                <View style={styles.eventsDayDot} />
                <Text style={styles.eventsSectionTitle}>{selectedDayLabel}</Text>
                <Text style={styles.eventsCount}>
                  {dayEvents.length > 0
                    ? `${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}`
                    : ''}
                </Text>
              </View>

              {dayEvents.length > 0 ? (
                dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onDelete={handleDeleteEvent}
                  />
                ))
              ) : (
                <View style={styles.noEventsContainer}>
                  <Ionicons name="calendar-outline" size={36} color={colors.textInactive} />
                  <Text style={styles.noEventsText}>No events</Text>
                  <Text style={styles.noEventsSubtext}>
                    Tap + to add an event for this day
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
        </PagerView>
      </View>

      {/* ─── FAB ─── */}
      <Pressable
        onPress={() => navigation.navigate('AddEvent')}
        accessibilityRole="button"
        accessibilityLabel="Add event"
        style={({ pressed }) => [styles.fabWrap, pressed && { opacity: 0.8 }]}
      >
        <LinearGradient
          colors={colors.gradientOrangeCyan}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ─── Header ───
    headerArea: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingVertical: spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerSubtitle: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.textMuted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    screenTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.textOnDark,
    },
    loadingContainer: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.md,
    },

    // ─── Pager ───
    pager: {
      flex: 1,
    },
    pagerPage: {
      flex: 1,
    },

    // ─── Flow Tab Content ───
    flowContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: layout.navHeight + spacing.xl,
      gap: spacing.md,
    },
    readinessRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    aiWrap: {
      flex: 1,
    },
    timelineSection: {
      marginTop: spacing.xs,
    },

    // ─── Week Tab ───
    weekEventsSection: {
      marginTop: spacing.sm,
    },

    // ─── Month header with arrows ───
    monthRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingBottom: 10,
    },
    monthTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    monthTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      color: colors.textOnDark,
    },
    todayPill: {
      backgroundColor: colors.accent1,
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: 14,
    },
    todayPillText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 13,
      color: '#FFFFFF',
    },
    arrowPressed: {
      opacity: 0.5,
    },

    // ─── Calendar FlatList container ───
    calendarContainer: {
      height: CALENDAR_HEIGHT,
    },

    // ─── Events section ───
    eventsScroll: {
      flex: 1,
    },
    eventsScrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.md,
      paddingBottom: layout.navHeight + spacing.xl,
    },
    monthScrollContent: {
      paddingBottom: layout.navHeight + spacing.xl,
    },
    eventsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: spacing.md,
    },
    eventsDayDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent1,
    },
    eventsSectionTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textOnDark,
      flex: 1,
    },
    eventsCount: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    noEventsContainer: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    noEventsText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textMuted,
    },
    noEventsSubtext: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
    },

    // ─── FAB ───
    fabWrap: {
      position: 'absolute',
      right: layout.screenMargin,
      bottom: spacing.lg,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.glowOrange,
    },
  });
}
