/**
 * SchedulingCapsule — Interactive schedule-aware session booking card.
 *
 * Replaces the 8-step multi_step flow with a single card. Backend
 * pre-fetches 5 days of calendar data (existing events + available
 * slots from the scheduling engine). The athlete picks a day, then
 * either taps an existing training session to update or an available
 * slot to create new. Focus + intensity selectors complete the form.
 * One tap on Confirm, one server call, done.
 *
 * Data shape: see ai-service/app/flow/patterns/scheduling_capsule.py
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { colors } from '../../../theme/colors';
import { spacing, borderRadius, fontFamily } from '../../../theme';
import type { CapsuleAction, VisualCard } from '../../../types/chat';
import { PillSelector } from './shared/PillSelector';
import { CapsuleSubmitButton } from './shared/CapsuleSubmitButton';

// ── Types ────────────────────────────────────────────────────────────

interface ExistingEvent {
  id: string;        // UUID from calendar_events table
  name: string;
  startTime: string; // "6:00 AM"
  endTime: string;   // "7:10 AM"
  type: string;
}

interface AvailableSlot {
  start24: string;   // "20:30"
  end24: string;     // "21:30"
  label: string;     // "8:30 PM - 9:30 PM"
  score: number;
}

interface DayData {
  date: string;           // "2026-04-16"
  label: string;          // "Today" / "Tomorrow" / "Friday"
  dayOfWeek: string;      // "Wednesday"
  existingEvents: ExistingEvent[];
  availableSlots: AvailableSlot[];
}

interface SchedulingContext {
  prefilledTitle?: string;
  prefilledDate?: string;
  prefilledFocus?: string;
  prefilledTime?: string;
  prefilledIntensity?: string;
  days: DayData[];
  focusOptions: Array<{ id: string; label: string }>;
  intensityOptions: Array<{ id: string; label: string }>;
  trainingCategories?: Array<{ id: string; label: string }>;
  readinessLevel?: string;
  sport?: string;
  durationMin?: number;
  linkedPrograms?: Array<{ slug: string; name: string }>;
  prefilledLinkedProgramSlug?: string | null;
}

type TimeBandId = 'morning' | 'afternoon' | 'evening' | 'night';

const TIME_BANDS: Array<{ id: TimeBandId; label: string; hint: string }> = [
  { id: 'morning', label: 'Morning', hint: '5am – 12pm' },
  { id: 'afternoon', label: 'Afternoon', hint: '12 – 5pm' },
  { id: 'evening', label: 'Evening', hint: '5 – 10pm' },
  { id: 'night', label: 'Night', hint: '10pm – 5am' },
];

function parseStartMinutes(start24: string): number {
  const [h, m] = start24.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getSlotTimeBand(start24: string): TimeBandId {
  const t = parseStartMinutes(start24);
  if (t < 5 * 60 || t >= 22 * 60) return 'night';
  if (t < 12 * 60) return 'morning';
  if (t < 17 * 60) return 'afternoon';
  return 'evening';
}

/** Local start instant for a calendar day (YYYY-MM-DD) + 24h clock "HH:MM" */
function localSlotStartDate(dayYmd: string, start24: string): Date {
  const [y, mo, d] = dayYmd.split('-').map(Number);
  const [h, m] = start24.split(':').map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, h || 0, m || 0, 0, 0);
}

function isSlotStartInTheFuture(
  dayYmd: string,
  start24: string,
  now: Date
): boolean {
  return localSlotStartDate(dayYmd, start24) > now;
}

function filterFutureSlots(
  dayYmd: string,
  slots: AvailableSlot[],
  now: Date
): AvailableSlot[] {
  return slots.filter((s) => isSlotStartInTheFuture(dayYmd, s.start24, now));
}

/** Parse a display time like "4:00 PM" or "11:30 AM" to minutes since midnight. */
function parseDisplayTimeMinutes(displayTime: string): number {
  const match = displayTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'AM' && h === 12) h = 0;
  else if (period === 'PM' && h !== 12) h += 12;
  return h * 60 + m;
}

/** For today, hide events that have already ended. */
function filterVisibleEvents(
  dayYmd: string,
  events: ExistingEvent[],
  now: Date
): ExistingEvent[] {
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dayYmd !== todayYmd) return events;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return events.filter((ev) => parseDisplayTimeMinutes(ev.endTime) > nowMinutes);
}

interface SchedulingCapsuleProps {
  card: VisualCard & { context?: SchedulingContext };
  onSubmit: (action: CapsuleAction) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = Math.min(h * 60 + (m || 0) + minutes, 23 * 60 + 59);
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

const DURATIONS = [
  { id: '30', label: '30 min' },
  { id: '45', label: '45 min' },
  { id: '60', label: '1 hr' },
  { id: '90', label: '1.5 hr' },
];

// ── Component ────────────────────────────────────────────────────────

export function SchedulingCapsuleComponent({ card, onSubmit }: SchedulingCapsuleProps) {
  const ctx = card.context as SchedulingContext | undefined;
  const days = ctx?.days ?? [];

  // Find the initial day index: prefilled date match or first day
  const initialDayIdx = useMemo(() => {
    if (ctx?.prefilledDate) {
      const idx = days.findIndex((d) => d.date === ctx.prefilledDate);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [days, ctx?.prefilledDate]);

  const [selectedDayIdx, setSelectedDayIdx] = useState(initialDayIdx);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedExisting, setSelectedExisting] = useState<ExistingEvent | null>(null);
  const [timeBand, setTimeBand] = useState<TimeBandId | null>(null);
  const [title, setTitle] = useState(ctx?.prefilledTitle ?? 'Training Session');
  const [focus, setFocus] = useState(ctx?.prefilledFocus ?? '');
  const [intensity, setIntensity] = useState(ctx?.prefilledIntensity ?? 'MODERATE');
  const [duration, setDuration] = useState(String(ctx?.durationMin ?? '60'));
  const [linkedProgramSlug, setLinkedProgramSlug] = useState<string | null>(() => {
    const pre = ctx?.prefilledLinkedProgramSlug;
    const progs = ctx?.linkedPrograms;
    if (pre && progs?.some((p) => p.slug === pre)) return pre;
    return null;
  });

  // When the server fills prefill after first paint, apply the linked program
  const linkedPrefillApplied = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const pre = ctx?.prefilledLinkedProgramSlug;
    if (!pre) return;
    if (!ctx?.linkedPrograms?.some((p) => p.slug === pre)) return;
    if (linkedPrefillApplied.current === pre) return;
    linkedPrefillApplied.current = pre;
    setLinkedProgramSlug(pre);
  }, [ctx?.prefilledLinkedProgramSlug, ctx?.linkedPrograms]);

  const selectedDay = days[selectedDayIdx] ?? null;
  const isRedReadiness = ctx?.readinessLevel === 'RED';

  const uniqueLinkedPrograms = useMemo(() => {
    const list = ctx?.linkedPrograms ?? [];
    const seen = new Set<string>();
    return list.filter((p) => {
      if (seen.has(p.slug)) return false;
      seen.add(p.slug);
      return true;
    });
  }, [ctx?.linkedPrograms]);

  // Clock for filtering "today" past slots; refresh periodically so the list stays valid.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const openSlotsForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return filterFutureSlots(
      selectedDay.date,
      selectedDay.availableSlots,
      now
    );
  }, [selectedDay, now]);

  // Filter existing events to only show tappable training sessions
  const trainingEvents = useMemo(() => {
    if (!selectedDay) return [];
    return selectedDay.existingEvents.filter(
      (e) => e.type === 'training' || e.type === 'match'
    );
  }, [selectedDay]);

  // Non-training events (shown as non-tappable context)
  const otherEvents = useMemo(() => {
    if (!selectedDay) return [];
    return selectedDay.existingEvents.filter(
      (e) => e.type !== 'training' && e.type !== 'match'
    );
  }, [selectedDay]);

  // Bands that have at least one still-available slot for the selected day
  const bandsWithSlots = useMemo(() => {
    if (!openSlotsForSelectedDay.length) {
      return [] as TimeBandId[];
    }
    const have = new Set<TimeBandId>();
    for (const s of openSlotsForSelectedDay) {
      have.add(getSlotTimeBand(s.start24));
    }
    return TIME_BANDS.map((b) => b.id).filter((id) => have.has(id));
  }, [openSlotsForSelectedDay]);

  const lastScheduleDateRef = useRef<string | null>(null);
  // When the selected *day* changes, reset the band: auto-pick if only one band has slots
  useEffect(() => {
    const d = selectedDay?.date;
    if (!d) return;
    if (lastScheduleDateRef.current === d) return;
    lastScheduleDateRef.current = d;
    const have = new Set<TimeBandId>();
    for (const s of openSlotsForSelectedDay) {
      have.add(getSlotTimeBand(s.start24));
    }
    const bandIds = TIME_BANDS.map((b) => b.id).filter((id) => have.has(id));
    if (bandIds.length === 1) {
      setTimeBand(bandIds[0]!);
    } else {
      setTimeBand(null);
    }
  }, [selectedDay?.date, openSlotsForSelectedDay]);

  // Clear slot if it falls outside the chosen band
  useEffect(() => {
    if (!selectedSlot || !timeBand) return;
    if (getSlotTimeBand(selectedSlot.start24) !== timeBand) {
      setSelectedSlot(null);
    }
  }, [timeBand, selectedSlot]);

  // If the clock moves and the current band no longer has future slots, re-pick or clear
  useEffect(() => {
    if (!timeBand) return;
    const anyInBand = openSlotsForSelectedDay.some(
      (s) => getSlotTimeBand(s.start24) === timeBand
    );
    if (anyInBand) return;
    const have = new Set<TimeBandId>();
    for (const s of openSlotsForSelectedDay) {
      have.add(getSlotTimeBand(s.start24));
    }
    const bandIds = TIME_BANDS.map((b) => b.id).filter((id) => have.has(id));
    if (bandIds.length === 1) setTimeBand(bandIds[0]!);
    else setTimeBand(null);
    setSelectedSlot(null);
  }, [timeBand, openSlotsForSelectedDay]);

  // Drop selection if that slot is no longer offered (e.g. time passed)
  useEffect(() => {
    if (!selectedSlot) return;
    const still = openSlotsForSelectedDay.some(
      (s) => s.start24 === selectedSlot.start24 && s.end24 === selectedSlot.end24
    );
    if (!still) setSelectedSlot(null);
  }, [openSlotsForSelectedDay, selectedSlot]);

  const slotsInSelectedBand = useMemo(() => {
    if (timeBand == null) return [];
    return openSlotsForSelectedDay.filter((s) => getSlotTimeBand(s.start24) === timeBand);
  }, [openSlotsForSelectedDay, timeBand]);

  // When day changes, reset slot/existing selection
  const handleDayChange = (idx: number) => {
    setSelectedDayIdx(idx);
    setSelectedSlot(null);
    setSelectedExisting(null);
  };

  // Select an available slot (deselects existing)
  const handleSlotSelect = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
    setSelectedExisting(null);
  };

  // Select an existing training event (deselects slot)
  const handleExistingSelect = (event: ExistingEvent) => {
    setSelectedExisting(event);
    setSelectedSlot(null);
  };

  // Validation
  const hasSelection = selectedSlot !== null || selectedExisting !== null;
  const canSubmit = hasSelection && focus && title.trim();

  // Intensity guard: if RED readiness, disable HARD
  const filteredIntensities = useMemo(() => {
    const options = ctx?.intensityOptions ?? [
      { id: 'LIGHT', label: 'Light' },
      { id: 'MODERATE', label: 'Moderate' },
      { id: 'HARD', label: 'Hard' },
    ];
    if (isRedReadiness) {
      return options.filter((o) => o.id !== 'HARD');
    }
    return options;
  }, [ctx?.intensityOptions, isRedReadiness]);

  // Ensure intensity isn't HARD when RED
  const safeIntensity = isRedReadiness && intensity === 'HARD' ? 'MODERATE' : intensity;

  const handleSubmit = () => {
    if (!selectedDay || !canSubmit) return;

    const computedEndTime = selectedSlot
      ? selectedSlot.end24
      : addMinutes('17:00', parseInt(duration) || 60);

    if (selectedSlot) {
      // Create new event at selected slot
      onSubmit({
        type: 'scheduling_capsule',
        toolName: 'create_event',
        toolInput: {
          title: title.trim(),
          event_type: 'training',
          date: selectedDay.date,
          start_time: selectedSlot.start24,
          end_time: selectedSlot.end24,
          intensity: safeIntensity,
          notes: focus ? `Focus: ${focus}` : '',
          ...(linkedProgramSlug
            ? { linked_program_slugs: [linkedProgramSlug] }
            : {}),
        },
        agentType: 'timeline',
      });
    } else if (selectedExisting) {
      // Update existing event with its UUID
      onSubmit({
        type: 'scheduling_capsule',
        toolName: 'update_event',
        toolInput: {
          event_id: selectedExisting.id,
          title: title.trim(),
          intensity: safeIntensity,
          notes: focus ? `Focus: ${focus}` : '',
        },
        agentType: 'timeline',
      });
    }
  };

  if (!selectedDay) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No schedule data available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Title input ── */}
      <TextInput
        style={styles.titleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Session title"
        placeholderTextColor={colors.textSecondary}
      />

      {/* ── Linked program (from player plan) ── */}
      {uniqueLinkedPrograms.length > 0 && (
        <View style={styles.linkedBlock}>
          <Text style={styles.groupLabel}>LINKED PROGRAM</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.linkedScroller}
            contentContainerStyle={styles.linkedScrollContent}
          >
            <Pressable
              onPress={() => setLinkedProgramSlug(null)}
              style={[
                styles.linkedChip,
                linkedProgramSlug === null && styles.linkedChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.linkedChipText,
                  linkedProgramSlug === null && styles.linkedChipTextSelected,
                ]}
              >
                None
              </Text>
            </Pressable>
            {uniqueLinkedPrograms.map((p, i) => {
              const on = linkedProgramSlug === p.slug;
              return (
                <Pressable
                  key={`${p.slug}-${i}`}
                  onPress={() => setLinkedProgramSlug(p.slug)}
                  style={[styles.linkedChip, on && styles.linkedChipSelected]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.linkedChipText,
                      on && styles.linkedChipTextSelected,
                    ]}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Day scroller ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dayScroller}
        contentContainerStyle={styles.dayScrollContent}
      >
        {days.map((day, idx) => {
          const isSelected = idx === selectedDayIdx;
          const slotCount = filterFutureSlots(day.date, day.availableSlots, now).length;
          return (
            <Pressable
              key={day.date}
              onPress={() => handleDayChange(idx)}
              style={[styles.dayChip, isSelected && styles.dayChipSelected]}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                {day.label}
              </Text>
              <Text style={[styles.daySlotCount, isSelected && styles.daySlotCountSelected]}>
                {slotCount > 0 ? `${slotCount} slot${slotCount > 1 ? 's' : ''}` : 'Full'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Readiness warning ── */}
      {isRedReadiness && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Readiness is RED -- high intensity disabled
          </Text>
        </View>
      )}

      {/* ── Day schedule ── */}
      <View style={styles.scheduleSection}>
        <Text style={styles.sectionLabel}>
          {selectedDay.dayOfWeek} {selectedDay.date}
        </Text>

        {/* Existing events — past events hidden when today is selected */}
        {filterVisibleEvents(selectedDay.date, selectedDay.existingEvents, new Date()).length > 0 && (
          <View style={styles.eventGroup}>
            <Text style={styles.groupLabel}>YOUR DAY</Text>
            {filterVisibleEvents(selectedDay.date, selectedDay.existingEvents, new Date()).map((ev, i) => {
              const isTraining = ev.type === 'training' || ev.type === 'match';
              const isSelected = selectedExisting?.id === ev.id;
              return (
                <Pressable
                  key={ev.id || `${ev.name}-${i}`}
                  onPress={isTraining ? () => handleExistingSelect(ev) : undefined}
                  disabled={!isTraining}
                  style={[
                    styles.eventRow,
                    isTraining && styles.eventRowTappable,
                    isSelected && styles.eventRowSelected,
                  ]}
                >
                  {isTraining && (
                    <View style={[styles.radio, isSelected && styles.radioSelected]} />
                  )}
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventName, !isTraining && styles.eventNameDimmed]}>
                      {ev.name}
                    </Text>
                    <Text style={styles.eventTime}>
                      {ev.startTime} - {ev.endTime}
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, typeColor(ev.type)]}>
                    <Text style={styles.typeBadgeText}>{ev.type.toUpperCase()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Time of day, then open slots in that band */}
        {openSlotsForSelectedDay.length > 0 ? (
          <View style={styles.eventGroup}>
            <Text style={styles.groupLabel}>OPEN SLOTS</Text>
            <Text style={styles.bandSubLabel}>1. Time of day</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bandScroller}
              contentContainerStyle={styles.bandScrollContent}
            >
              {bandsWithSlots.map((id) => {
                const def = TIME_BANDS.find((b) => b.id === id);
                const isSel = timeBand === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setTimeBand(id)}
                    style={[styles.bandChip, isSel && styles.bandChipSelected]}
                  >
                    <Text
                      style={[
                        styles.bandLabel,
                        isSel && styles.bandLabelSelected,
                      ]}
                    >
                      {def?.label ?? id}
                    </Text>
                    <Text
                      style={[
                        styles.bandHint,
                        isSel && styles.bandHintSelected,
                      ]}
                    >
                      {def?.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {timeBand == null && bandsWithSlots.length > 1 ? (
              <Text style={styles.bandPrompt}>Choose a time of day to see open slots</Text>
            ) : null}

            {timeBand != null && (
              <>
                <Text style={styles.bandSubLabel}>2. Pick a time</Text>
                {slotsInSelectedBand.length === 0 ? (
                  <Text style={styles.bandEmpty}>
                    No slots in this part of the day — try another time of day
                  </Text>
                ) : (
                  slotsInSelectedBand.map((slot) => {
                    const isSelected = selectedSlot?.start24 === slot.start24;
                    return (
                      <Pressable
                        key={`${slot.start24}-${slot.end24}`}
                        onPress={() => handleSlotSelect(slot)}
                        style={[
                          styles.eventRow,
                          styles.eventRowTappable,
                          styles.slotRow,
                          isSelected && styles.slotRowSelected,
                        ]}
                      >
                        <View
                          style={[styles.radio, isSelected && styles.radioSelected]}
                        />
                        <Text
                          style={[
                            styles.slotLabel,
                            isSelected && styles.slotLabelSelected,
                          ]}
                        >
                          {slot.label}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </>
            )}
          </View>
        ) : (
          <View style={styles.emptySlots}>
            <Text style={styles.emptyText}>
              No open slots this day -- try another day
            </Text>
          </View>
        )}
      </View>

      {/* ── Focus selector ── */}
      <PillSelector
        options={ctx?.focusOptions ?? []}
        selected={focus}
        onSelect={setFocus}
        label="Focus"
      />

      {/* ── Duration selector (new session only) ── */}
      {selectedSlot && (
        <PillSelector
          options={DURATIONS}
          selected={duration}
          onSelect={setDuration}
          label="Duration"
        />
      )}

      {/* ── Intensity selector ── */}
      <PillSelector
        options={filteredIntensities}
        selected={safeIntensity}
        onSelect={setIntensity}
        label="Intensity"
      />

      {/* ── Submit ── */}
      <CapsuleSubmitButton
        title={selectedExisting ? 'Update Session' : 'Book Session'}
        onPress={handleSubmit}
        disabled={!canSubmit}
      />
    </View>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────

function typeColor(type: string) {
  switch (type) {
    case 'training':
    case 'match':
      return { backgroundColor: `${colors.accent1}15` };
    case 'study':
    case 'study_block':
    case 'exam':
      return { backgroundColor: `${colors.accent2}15` };
    case 'recovery':
      return { backgroundColor: `${colors.accentSoft}15` };
    default:
      return { backgroundColor: `${colors.textInactive}15` };
  }
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingVertical: 8,
  },
  titleInput: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },

  // Day scroller
  dayScroller: {
    marginHorizontal: -4,
  },
  dayScrollContent: {
    gap: 6,
    paddingHorizontal: 4,
  },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.chipBackground,
    alignItems: 'center',
    minWidth: 70,
  },
  dayChipSelected: {
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.12)`,
  },
  dayLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  dayLabelSelected: {
    color: colors.accent1,
  },
  daySlotCount: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.textInactive,
    marginTop: 1,
  },
  daySlotCountSelected: {
    color: colors.accent1,
  },

  // Readiness warning
  warningBanner: {
    backgroundColor: `rgba(255, 80, 80, 0.1)`,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  warningText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#FF5050',
  },

  // Schedule section
  scheduleSection: {
    gap: 8,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textInactive,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventGroup: {
    gap: 4,
  },
  groupLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: colors.textInactive,
    letterSpacing: 0.8,
    marginTop: 4,
  },
  bandSubLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  bandPrompt: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    fontStyle: 'italic',
    marginTop: 6,
  },
  bandEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textInactive,
    marginTop: 4,
  },
  bandScroller: {
    marginHorizontal: -2,
  },
  bandScrollContent: {
    gap: 6,
    paddingVertical: 4,
  },
  bandChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.chipBackground,
    minWidth: 100,
  },
  bandChipSelected: {
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.1)`,
  },
  bandLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  bandLabelSelected: {
    color: colors.accent1,
  },
  bandHint: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    color: colors.textInactive,
    marginTop: 1,
  },
  bandHintSelected: {
    color: colors.textSecondary,
  },
  linkedBlock: {
    gap: 4,
  },
  linkedScroller: {
    marginHorizontal: -4,
  },
  linkedScrollContent: {
    gap: 6,
    paddingHorizontal: 4,
  },
  linkedChip: {
    maxWidth: 200,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.chipBackground,
  },
  linkedChipSelected: {
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.1)`,
  },
  linkedChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  linkedChipTextSelected: {
    color: colors.accent1,
  },

  // Event rows
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    gap: 8,
  },
  eventRowTappable: {
    backgroundColor: colors.chipBackground,
  },
  eventRowSelected: {
    borderWidth: 1,
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.08)`,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  eventNameDimmed: {
    color: colors.textInactive,
  },
  eventTime: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  typeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: borderRadius.full,
  },
  typeBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },

  // Radio indicator
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
  },
  radioSelected: {
    borderColor: colors.accent1,
    backgroundColor: colors.accent1,
  },

  // Slot rows
  slotRow: {
    backgroundColor: `rgba(122, 155, 118, 0.04)`,
  },
  slotRowSelected: {
    borderWidth: 1,
    borderColor: colors.accent1,
    backgroundColor: `rgba(122, 155, 118, 0.12)`,
  },
  slotLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  slotLabelSelected: {
    color: colors.accent1,
  },

  // Empty state
  emptySlots: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    textAlign: 'center',
  },
});
