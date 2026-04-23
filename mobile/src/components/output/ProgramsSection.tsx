/**
 * ProgramsSection — Signal Dashboard programs tab.
 *
 * Orbit theme (April 2026):
 *   The brand sphere does not rotate. Instead, vertical proximity to "NOW"
 *   becomes the spatial metaphor for engagement.
 *
 *   NOW              — small sphere glyph + "NOW" label centered at top, with a
 *                      soft radial glow bleeding into the upper region.
 *   IN ORBIT · N     — programs the athlete has activated. Each card carries a
 *                      4-dot altitude column on the left (top dot lit) and a
 *                      compact ProgressRing showing week-of progress derived
 *                      from activatedAt + durationWeeks.
 *   PARKED · N       — soft horizon divider, then a flat library list of every
 *                      non-active program (coach + AI + player_added). Rows are
 *                      dimmer + flatter; altitude dots fade with depth.
 *
 *   Cards still expand on tap into the full body (signal callout, params grid,
 *   why-block, hashtags, coaching cues, Add to Training, Ask Tomo, Done /
 *   Not for me). All callbacks + props + search behavior are preserved from the
 *   pre-orbit layout — this is a drop-in visual replacement.
 *
 * Source of truth for the In Orbit list is usePrograms (GET /programs/active),
 * which returns full snapshots so active programs survive AI re-generation.
 * Active programs are NEVER re-rendered in the Parked list (no duplication).
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Path } from 'react-native-svg';
import { SmartIcon } from '../SmartIcon';
import { AskTomoChip } from '../mastery/AskTomoChip';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import { AttachToTrainingSheet } from './AddToCalendarSheet';
import type { OutputSnapshot, ProgramCatalogItem, ActiveProgramEntry } from '../../services/api';
import { searchProgramCatalog } from '../../services/api';
import { colors } from '../../theme/colors';

type Recommendation = OutputSnapshot['programs']['recommendations'][0];
type Source = 'coach' | 'ai_recommended' | 'player_added';

interface Props {
  programs: OutputSnapshot['programs'];
  gaps?: string[];
  isDeepRefreshing?: boolean;
  onForceRefresh?: () => void;
  onNavigateCheckin?: () => void;
  onNavigateTests?: () => void;
  onNavigateSettings?: () => void;
  onProgramDone?: (programId: string) => void;
  onProgramDismiss?: (programId: string) => void;
  /** Full active program entries (from GET /programs/active). */
  activeEntries?: ActiveProgramEntry[];
  /** Toggle active. Receives full program so caller can snapshot it. */
  onToggleActive?: (program: Recommendation) => void;
  /** Full player-added program entries (from GET /programs/active). */
  playerAddedEntries?: ActiveProgramEntry[];
  /** When the athlete adds a program from the catalog search. */
  onPlayerSelect?: (program: ProgramCatalogItem) => void;
  /** Remove a player-added program (unpicks it). */
  onPlayerDeselect?: (programId: string) => void;
}

const SOURCE_LABEL: Record<Source, string> = {
  coach: 'COACH',
  ai_recommended: 'AI RECOMMENDED',
  player_added: 'PLAYER ADDED',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: colors.tomoSage,
  intermediate: colors.warning,
  advanced: colors.error,
};

// Cream opacities used by the orbit layout that aren't in the theme tokens.
// Scoped here because they are spatial-design-only values.
const CREAM_25 = 'rgba(245,243,237,0.25)';
const CREAM_40 = 'rgba(245,243,237,0.40)';
const CREAM_70 = 'rgba(245,243,237,0.70)';
const CREAM_90 = 'rgba(245,243,237,0.90)';

const LOADING_MESSAGES = [
  { title: 'Scanning Your Profile', subtitle: 'Position, age band, growth stage...', icon: 'body-outline' as const },
  { title: 'Reading Your Benchmarks', subtitle: 'Comparing your test results to peers...', icon: 'stats-chart-outline' as const },
  { title: 'Checking Your Gaps', subtitle: 'Finding where you can improve fastest...', icon: 'search-outline' as const },
  { title: 'Matching Programs', subtitle: 'Filtering 200+ drills for your needs...', icon: 'filter-outline' as const },
  { title: 'Balancing Your Week', subtitle: 'Speed, strength, skills, recovery...', icon: 'calendar-outline' as const },
  { title: 'Tuning Intensity', subtitle: 'Adjusting load to your readiness...', icon: 'pulse-outline' as const },
  { title: 'Adding Coach Tips', subtitle: 'Writing cues specific to your data...', icon: 'chatbubble-ellipses-outline' as const },
  { title: 'Final Touches', subtitle: 'Personalizing your training plan...', icon: 'sparkles-outline' as const },
];

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function deriveSource(program: Recommendation): Source {
  if (program.source === 'coach' || program.source === 'ai_recommended' || program.source === 'player_added') {
    return program.source;
  }
  if (program.coachId || program.programId?.startsWith('coach_')) return 'coach';
  return 'ai_recommended';
}

/** Compute current week (1..durationWeeks) from activation date. */
function deriveWeekProgress(activatedAt: string | null | undefined, durationWeeks: number): { week: number; weeks: number; pct: number } {
  const weeks = Math.max(1, durationWeeks);
  if (!activatedAt) return { week: 1, weeks, pct: 100 / weeks };
  const start = new Date(activatedAt).getTime();
  if (Number.isNaN(start)) return { week: 1, weeks, pct: 100 / weeks };
  const elapsedDays = Math.max(0, (Date.now() - start) / 86400000);
  const week = Math.min(weeks, Math.max(1, Math.floor(elapsedDays / 7) + 1));
  const pct = Math.min(100, Math.max(0, (week / weeks) * 100));
  return { week, weeks, pct };
}

// ────────────────────────────────────────────────────────────────────────
// Sphere — the brand mark, sage radial gradient with optional outer ring.
// ────────────────────────────────────────────────────────────────────────

let sphereCounter = 0;
function Sphere({ size = 18, ring = true, ringAlpha = 0.28 }: { size?: number; ring?: boolean; ringAlpha?: number }) {
  const id = React.useMemo(() => `sph${++sphereCounter}`, []);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}-g`} cx="38%" cy="32%" r="70%">
          <Stop offset="0%" stopColor="#C8DCC3" />
          <Stop offset="35%" stopColor="#9AB896" />
          <Stop offset="75%" stopColor="#7A9B76" />
          <Stop offset="100%" stopColor="#5E7A5B" />
        </RadialGradient>
        <RadialGradient id={`${id}-h`} cx="35%" cy="28%" r="30%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {ring && <Circle cx="50" cy="50" r="44" fill="none" stroke={`rgba(245,243,237,${ringAlpha})`} strokeWidth={1.6} />}
      <Circle cx="50" cy="50" r="26" fill={`url(#${id}-g)`} />
      <Circle cx="50" cy="50" r="26" fill={`url(#${id}-h)`} />
    </Svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// OrbitGlow — soft sage radial glow that bleeds down behind the NOW sphere.
// Implemented with react-native-svg's RadialGradient to match the design's
// faint atmospheric feel without faking it via stacked translucent circles.
// ────────────────────────────────────────────────────────────────────────

function OrbitGlow({ height = 220 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { height, overflow: 'hidden' }]}>
      <Svg width="100%" height={height}>
        <Defs>
          <RadialGradient id="orbitGlow" cx="50%" cy="0%" rx="55%" ry="65%">
            <Stop offset="0%" stopColor="#9AB896" stopOpacity={0.16} />
            <Stop offset="55%" stopColor="#9AB896" stopOpacity={0.04} />
            <Stop offset="100%" stopColor="#9AB896" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={`M 0 0 H 1000 V ${height} H 0 Z`} fill="url(#orbitGlow)" />
      </Svg>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// AltitudeColumn — 4-dot vertical scale that sits in the card's left gutter.
// active=true → bright sage with top dot glowing. active=false → dim cream.
// ────────────────────────────────────────────────────────────────────────

function AltitudeColumn({ altitude, active, paddingTop = 14 }: { altitude: number; active: boolean; paddingTop?: number }) {
  const litColor = active ? colors.tomoSageDim : CREAM_25;
  const dimColor = active ? colors.cream10 : colors.cream06;
  return (
    <View style={[styles.altCol, { paddingTop }]}>
      {[3, 2, 1, 0].map((i) => {
        const lit = i < altitude;
        const isTop = i === altitude - 1;
        return (
          <View
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              backgroundColor: lit ? litColor : dimColor,
              shadowColor: isTop && active ? colors.tomoSageDim : 'transparent',
              shadowOpacity: isTop && active ? 0.9 : 0,
              shadowRadius: isTop && active ? 4 : 0,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        );
      })}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ProgressRing — compact week-progress arc on each in-orbit card.
// ────────────────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 34, color }: { pct: number; size?: number; color: string }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.cream10} strokeWidth={stroke} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ProgramsSection
// ────────────────────────────────────────────────────────────────────────

export function ProgramsSection({
  programs,
  isDeepRefreshing,
  onForceRefresh,
  onNavigateCheckin,
  onProgramDone,
  onProgramDismiss,
  activeEntries = [],
  onToggleActive,
  playerAddedEntries = [],
  onPlayerSelect,
  onPlayerDeselect,
}: Props) {
  const { colors: themeColors } = useTheme();
  const safePrograms = programs || ({} as any);
  const recommendations: Recommendation[] = safePrograms.recommendations || [];
  const dataStatus = (programs as any)?.dataStatus;

  const [calendarSheetProgram, setCalendarSheetProgram] = useState<any>(null);

  // ── Program Search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProgramCatalogItem[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerSelectedIds = playerAddedEntries.map((e) => e.programId);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      if (!q.trim()) { setSearchResults([]); return; }
      try {
        const res = await searchProgramCatalog(q);
        const existingIds = new Set(recommendations.map((r) => r.programId));
        setSearchResults((res.programs || []).filter((p) => !existingIds.has(p.id)).slice(0, 6));
      } catch { setSearchResults([]); }
    }, 250);
  }, [recommendations]);

  const handleAddProgram = useCallback((program: ProgramCatalogItem) => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
    onPlayerSelect?.(program);
  }, [onPlayerSelect]);

  // ── Loading messages ──
  const [shuffledMsgs, setShuffledMsgs] = React.useState(() => shuffleArray(LOADING_MESSAGES));
  const [loadingMsgIndex, setLoadingMsgIndex] = React.useState(0);

  React.useEffect(() => {
    if (dataStatus !== 'generating' && !isDeepRefreshing) return;
    setShuffledMsgs(shuffleArray(LOADING_MESSAGES));
    setLoadingMsgIndex(0);
    const interval = setInterval(() => {
      setLoadingMsgIndex((prev) => {
        const next = prev + 1;
        if (next >= LOADING_MESSAGES.length) {
          setShuffledMsgs(shuffleArray(LOADING_MESSAGES));
          return 0;
        }
        return next;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [dataStatus, isDeepRefreshing]);

  const hasAnyPrograms = recommendations.length > 0 || playerAddedEntries.length > 0 || activeEntries.length > 0;

  // ── Generating empty state ──
  if (dataStatus === 'generating' && !hasAnyPrograms) {
    const loadingMsg = shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0];
    return (
      <GlassCard>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.tomoSage + '12' }]}>
            <SmartIcon name={loadingMsg.icon} size={28} color={themeColors.tomoSage} />
          </View>
          <Text style={[styles.emptyTitle, { color: themeColors.tomoCream }]}>{loadingMsg.title}</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.muted }]}>{loadingMsg.subtitle}</Text>
          <View style={styles.ctaRow}>
            {onNavigateCheckin && (
              <Pressable
                style={({ pressed }) => [styles.ctaButton, { backgroundColor: themeColors.tomoSage, opacity: pressed ? 0.8 : 1 }]}
                onPress={onNavigateCheckin}
              >
                <SmartIcon name="checkmark-circle-outline" size={16} color={themeColors.tomoCream} />
                <Text style={styles.ctaButtonText}>Daily Check-in</Text>
              </Pressable>
            )}
            {onForceRefresh && (
              <Pressable
                style={({ pressed }) => [styles.ctaButton, { backgroundColor: themeColors.tomoSage, opacity: pressed ? 0.8 : 1 }]}
                onPress={onForceRefresh}
              >
                <SmartIcon name="refresh-outline" size={16} color={themeColors.tomoCream} />
                <Text style={styles.ctaButtonText}>Generate Now</Text>
              </Pressable>
            )}
          </View>
        </View>
      </GlassCard>
    );
  }

  // ── True empty state ──
  if (!hasAnyPrograms) {
    return (
      <GlassCard>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.tomoSage + '12' }]}>
            <SmartIcon name="barbell-outline" size={28} color={themeColors.tomoSage} />
          </View>
          <Text style={[styles.emptyTitle, { color: themeColors.tomoCream }]}>No Programs Yet</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.muted }]}>
            Tap below to generate personalized training programs based on your profile.
          </Text>
          {onForceRefresh && (
            <Pressable
              style={({ pressed }) => [styles.ctaButton, { backgroundColor: themeColors.tomoSage, opacity: pressed ? 0.8 : 1, marginTop: 12 }]}
              onPress={onForceRefresh}
            >
              <SmartIcon name="sparkles-outline" size={16} color={themeColors.tomoCream} />
              <Text style={styles.ctaButtonText}>Generate Programs</Text>
            </Pressable>
          )}
        </View>
      </GlassCard>
    );
  }

  // ── Derive the two lists: In Orbit (active) + Parked (everything else, deduped) ──
  const activeIds = new Set(activeEntries.map((e) => e.programId));
  const playerAddedIds = new Set(playerAddedEntries.map((e) => e.programId));

  // In Orbit list: rehydrate each entry's snapshot + carry activatedAt for week math.
  type OrbitItem = { program: Recommendation; activatedAt: string };
  const inOrbit: OrbitItem[] = activeEntries
    .map<OrbitItem | null>((entry) => {
      if (entry.program) {
        return { program: { ...entry.program, source: entry.source || deriveSource(entry.program) }, activatedAt: entry.activatedAt };
      }
      const live = recommendations.find((r) => r.programId === entry.programId);
      if (live) return { program: { ...live, source: entry.source || deriveSource(live) }, activatedAt: entry.activatedAt };
      return null;
    })
    .filter((p): p is OrbitItem => p !== null);

  // Parked list: coach + AI recs from snapshot + player-added, minus active.
  const seen = new Set<string>(activeIds);
  const parked: Recommendation[] = [];
  for (const r of recommendations) {
    if (seen.has(r.programId)) continue;
    seen.add(r.programId);
    parked.push({ ...r, source: deriveSource(r) });
  }
  for (const entry of playerAddedEntries) {
    if (seen.has(entry.programId)) continue;
    if (!entry.program) continue;
    seen.add(entry.programId);
    parked.push({ ...entry.program, source: 'player_added' });
  }

  const handleToggleFrom = (program: Recommendation) => onToggleActive?.(program);
  const handleDismissPlayerAdded = (id: string) => {
    if (playerAddedIds.has(id)) onPlayerDeselect?.(id);
    else onProgramDismiss?.(id);
  };

  // Altitude assignment: top of orbit = 4, descending by index, floored at 1.
  const orbitAltitude = (i: number) => Math.max(1, 4 - i);
  // Parked altitude: gentle fade in pairs (3,3,2,2,1,1,1,...).
  const parkedAltitude = (i: number) => Math.max(1, 3 - Math.floor(i / 2));

  return (
    <View style={styles.container}>
      {/* Deep Refresh Indicator */}
      {isDeepRefreshing && (
        <View style={[styles.refreshBanner, { backgroundColor: themeColors.accentSubtle }]}>
          <SmartIcon name={(shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0]).icon} size={16} color={themeColors.tomoSage} />
          <Text style={[styles.refreshText, { color: themeColors.tomoSage }]}>
            {(shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0]).title}...
          </Text>
        </View>
      )}

      {/* Program Search */}
      <View style={styles.searchContainer}>
        <SmartIcon name="search" size={16} color={searchFocused ? themeColors.tomoSage : themeColors.muted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.tomoCream }]}
          placeholder="Search programs... (sprint, strength, agility)"
          placeholderTextColor={themeColors.muted}
          value={searchQuery}
          onChangeText={handleSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }} hitSlop={8}>
            <SmartIcon name="close-circle" size={16} color={themeColors.muted} />
          </Pressable>
        )}
      </View>

      {searchFocused && searchResults.length > 0 && (
        <View style={[styles.searchDropdown, { backgroundColor: themeColors.cream03, borderColor: themeColors.cream10 }]}>
          {searchResults.map((prog) => (
            <Pressable
              key={prog.id}
              style={({ pressed }) => [styles.searchResultRow, pressed && { opacity: 0.7 }]}
              onPress={() => handleAddProgram(prog)}
              disabled={playerSelectedIds.includes(prog.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.searchResultName, { color: themeColors.tomoCream }]} numberOfLines={1}>{prog.name}</Text>
                <Text style={[styles.searchResultMeta, { color: themeColors.muted }]}>
                  {prog.type} · {prog.difficulty} · {prog.duration_minutes}min
                </Text>
              </View>
              {playerSelectedIds.includes(prog.id) ? (
                <View style={[styles.addBadge, { backgroundColor: themeColors.sage15 }]}>
                  <SmartIcon name="checkmark" size={14} color={themeColors.tomoSage} />
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: themeColors.tomoSage }}>Added</Text>
                </View>
              ) : (
                <View style={[styles.addBadge, { backgroundColor: themeColors.sage15 }]}>
                  <SmartIcon name="add" size={14} color={themeColors.tomoSage} />
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: themeColors.tomoSage }}>Add</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* ── NOW marker + soft glow ── */}
      <View style={styles.nowZone}>
        <OrbitGlow height={220} />
        <View style={styles.nowStack}>
          <Sphere size={20} ring={false} />
          <Text style={styles.nowLabel}>NOW</Text>
        </View>
      </View>

      {/* ── IN ORBIT · N ──────────────────────────────────────── */}
      <Text style={styles.orbitLabel}>IN ORBIT · {inOrbit.length}</Text>
      {inOrbit.length === 0 ? (
        <View style={[styles.orbitEmpty, { borderColor: themeColors.cream10 }]}>
          <Sphere size={14} ring={true} ringAlpha={0.2} />
          <Text style={[styles.orbitEmptyText, { color: themeColors.muted }]}>
            Pull a program in from below to bring it into orbit.
          </Text>
        </View>
      ) : (
        <View style={styles.orbitList}>
          {inOrbit.map(({ program, activatedAt }, i) => (
            <OrbitCard
              key={program.programId}
              program={program}
              activatedAt={activatedAt}
              altitude={orbitAltitude(i)}
              colors={themeColors}
              onToggleActive={() => handleToggleFrom(program)}
              onDone={onProgramDone}
              onAddToCalendar={setCalendarSheetProgram}
            />
          ))}
        </View>
      )}

      {/* ── Horizon · PARKED · N ─────────────────────────────── */}
      {parked.length > 0 && (
        <>
          <View style={styles.horizon}>
            <View style={styles.horizonLine}>
              <View style={[styles.horizonLineHalf, styles.horizonLineLeft]} />
            </View>
            <Text style={[styles.horizonLabel, { color: themeColors.muted }]}>PARKED · {parked.length}</Text>
            <View style={styles.horizonLine}>
              <View style={[styles.horizonLineHalf, styles.horizonLineRight]} />
            </View>
          </View>

          <View style={styles.parkedList}>
            {parked.map((p, i) => (
              <ParkedRow
                key={p.programId}
                program={p}
                altitude={parkedAltitude(i)}
                colors={themeColors}
                onToggleActive={() => handleToggleFrom(p)}
                onDone={onProgramDone}
                onDismiss={playerAddedIds.has(p.programId) ? handleDismissPlayerAdded : onProgramDismiss}
                onAddToCalendar={setCalendarSheetProgram}
              />
            ))}
          </View>
        </>
      )}

      <AttachToTrainingSheet
        visible={!!calendarSheetProgram}
        onClose={() => setCalendarSheetProgram(null)}
        program={calendarSheetProgram}
      />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// OrbitCard — In-orbit (active) program card with altitude column +
// progress ring. Tap to expand into the full body.
// ────────────────────────────────────────────────────────────────────────

function OrbitCard({
  program,
  activatedAt,
  altitude,
  colors: themeColors,
  onDone,
  onToggleActive,
  onAddToCalendar,
}: {
  program: Recommendation;
  activatedAt: string;
  altitude: number;
  colors: any;
  onDone?: (programId: string) => void;
  onToggleActive?: () => void;
  onAddToCalendar?: (program: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'done' | null>(null);
  const source = deriveSource(program);
  const sourceColor = source === 'coach' ? themeColors.accent : themeColors.tomoSageDim;

  const durationWeeks = (program as any).durationWeeks || 4;
  const { week, weeks, pct } = deriveWeekProgress(activatedAt, durationWeeks);

  return (
    <Pressable onPress={() => !confirmAction && setExpanded(!expanded)} style={styles.orbitRow}>
      <AltitudeColumn altitude={altitude} active />
      <View style={[styles.orbitCard, { backgroundColor: themeColors.cream03, borderColor: themeColors.cream10 }]}>
        {/* Top row: eyebrow + progress ring */}
        <View style={styles.orbitHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.sourceEyebrow, { color: sourceColor }]} numberOfLines={1}>
              {SOURCE_LABEL[source]}
            </Text>
            <Text style={[styles.programName, { color: themeColors.tomoCream }]} numberOfLines={2}>{program.name}</Text>
            <Text style={[styles.programMeta, { color: themeColors.muted }]}>
              {program.frequency} · {program.durationMin} min · {weeks}wks · wk {week} of {weeks}
            </Text>
          </View>
          <ProgressRing pct={pct} size={34} color={sourceColor} />
        </View>

        {/* Inline Done confirmation */}
        {confirmAction === 'done' && (
          <View style={[styles.confirmRow, { backgroundColor: themeColors.accentSubtle, marginTop: spacing.sm }]}>
            <SmartIcon name="checkmark-circle" size={18} color={themeColors.accent} />
            <Text style={[styles.confirmLabel, { color: themeColors.tomoCream }]} numberOfLines={1}>Mark as done?</Text>
            <Pressable
              style={({ pressed }) => [styles.confirmChip, { backgroundColor: themeColors.cream06, opacity: pressed ? 0.7 : 1 }]}
              onPress={(e) => { e.stopPropagation(); setConfirmAction(null); }}
            >
              <Text style={[styles.confirmChipText, { color: themeColors.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.confirmChip, { backgroundColor: themeColors.accent, opacity: pressed ? 0.8 : 1 }]}
              onPress={(e) => {
                e.stopPropagation();
                if (onDone) onDone(program.programId);
                setConfirmAction(null);
              }}
            >
              <Text style={[styles.confirmChipText, { color: themeColors.tomoCream }]}>Done</Text>
            </Pressable>
          </View>
        )}

        {expanded && (
          <ExpandedBody
            program={program}
            colors={themeColors}
            isActive
            onToggleActive={onToggleActive}
            onDone={onDone ? () => setConfirmAction('done') : undefined}
            onAddToCalendar={onAddToCalendar}
          />
        )}
      </View>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ParkedRow — flat library row. Lives below the horizon; collapses to a
// single line, expands into the same full body as in-orbit cards.
// ────────────────────────────────────────────────────────────────────────

function ParkedRow({
  program,
  altitude,
  colors: themeColors,
  onDone,
  onDismiss,
  onToggleActive,
  onAddToCalendar,
}: {
  program: Recommendation;
  altitude: number;
  colors: any;
  onDone?: (programId: string) => void;
  onDismiss?: (programId: string) => void;
  onToggleActive?: () => void;
  onAddToCalendar?: (program: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'done' | 'dismissed' | null>(null);
  const source = deriveSource(program);
  const sourceColor = source === 'coach' ? themeColors.accent : themeColors.tomoSageDim;

  return (
    <Pressable onPress={() => !confirmAction && setExpanded((v) => !v)} style={styles.parkedRowOuter}>
      <View style={styles.parkedRow}>
        <AltitudeColumn altitude={altitude} active={false} paddingTop={2} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.parkedEyebrow, { color: sourceColor }]} numberOfLines={1}>
            {SOURCE_LABEL[source]}
          </Text>
          <Text style={[styles.parkedName, { color: CREAM_90 }]} numberOfLines={2}>{program.name}</Text>
          <Text style={[styles.parkedMeta, { color: themeColors.muted }]}>
            {program.frequency} · {program.durationMin} min · {(program as any).durationWeeks || 4} wks
          </Text>
        </View>
        <SmartIcon
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={CREAM_25}
        />
      </View>

      {/* Inline confirmation */}
      {confirmAction && (() => {
        const isDone = confirmAction === 'done';
        return (
          <View style={[styles.confirmRow, {
            backgroundColor: isDone ? themeColors.accentSubtle : themeColors.tomoSage + '10',
            marginTop: spacing.sm,
            marginLeft: 16,
          }]}>
            <SmartIcon name={isDone ? 'checkmark-circle' : 'close-circle'} size={18} color={isDone ? themeColors.accent : themeColors.tomoSage} />
            <Text style={[styles.confirmLabel, { color: themeColors.tomoCream }]} numberOfLines={1}>
              {isDone ? 'Mark as done?' : 'Remove this?'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.confirmChip, { backgroundColor: themeColors.cream06, opacity: pressed ? 0.7 : 1 }]}
              onPress={(e) => { e.stopPropagation(); setConfirmAction(null); }}
            >
              <Text style={[styles.confirmChipText, { color: themeColors.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.confirmChip, { backgroundColor: isDone ? themeColors.accent : themeColors.tomoSage, opacity: pressed ? 0.8 : 1 }]}
              onPress={(e) => {
                e.stopPropagation();
                if (confirmAction === 'done' && onDone) onDone(program.programId);
                if (confirmAction === 'dismissed' && onDismiss) onDismiss(program.programId);
                setConfirmAction(null);
              }}
            >
              <Text style={[styles.confirmChipText, { color: themeColors.tomoCream }]}>{isDone ? 'Done' : 'Remove'}</Text>
            </Pressable>
          </View>
        );
      })()}

      {expanded && (
        <View style={{ marginLeft: 16, marginTop: spacing.sm }}>
          <ExpandedBody
            program={program}
            colors={themeColors}
            isActive={false}
            onToggleActive={onToggleActive}
            onDone={onDone ? () => setConfirmAction('done') : undefined}
            onDismiss={onDismiss ? () => setConfirmAction('dismissed') : undefined}
            onAddToCalendar={onAddToCalendar}
          />
        </View>
      )}
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────────
// ExpandedBody — shared between OrbitCard and ParkedRow. Mirrors the
// pre-orbit expanded body so feature behavior + parameters are unchanged.
// ────────────────────────────────────────────────────────────────────────

function ExpandedBody({
  program,
  colors: themeColors,
  isActive,
  onToggleActive,
  onDone,
  onDismiss,
  onAddToCalendar,
}: {
  program: Recommendation;
  colors: any;
  isActive: boolean;
  onToggleActive?: () => void;
  onDone?: () => void;
  onDismiss?: () => void;
  onAddToCalendar?: (program: any) => void;
}) {
  const diffColor = DIFFICULTY_COLORS[program.difficulty] || themeColors.muted;

  return (
    <View style={styles.expandedContent}>
      {(program as any).coachName && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <SmartIcon name="person-circle-outline" size={14} color={themeColors.muted} />
          <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: themeColors.muted }}>
            Assigned by Coach {(program as any).coachName}
          </Text>
        </View>
      )}

      <View style={styles.metaRow}>
        <View style={[styles.diffBadge, { backgroundColor: diffColor + '22', borderColor: diffColor + '40', borderWidth: 1 }]}>
          <Text style={[styles.diffText, { color: diffColor }]}>{program.difficulty}</Text>
        </View>
        <View style={[styles.typeBadge, {
          backgroundColor: program.type === 'physical' ? themeColors.accentSoft : themeColors.secondarySubtle,
        }]}>
          <Text style={[styles.typeText, { color: program.type === 'physical' ? themeColors.accent : themeColors.muted }]}>
            {program.type}
          </Text>
        </View>
      </View>

      <View style={[styles.impactBanner, { backgroundColor: themeColors.sage08, borderColor: themeColors.sage20, borderWidth: 1 }]}>
        <SmartIcon name="flash" size={14} color={themeColors.tomoSageDim} />
        <Text style={[styles.impactText, { color: themeColors.tomoSageDim }]}>{program.impact}</Text>
      </View>

      {program.positionNote ? (
        <View style={[styles.positionBadge, { backgroundColor: themeColors.tomoSage + '12' }]}>
          <SmartIcon name="football-outline" size={12} color={themeColors.tomoSage} />
          <Text style={[styles.positionBadgeText, { color: themeColors.tomoSage }]}>{program.positionNote}</Text>
        </View>
      ) : null}

      {program.phvWarnings?.length > 0 && (
        <View style={[styles.warningBadge, { backgroundColor: themeColors.secondarySubtle }]}>
          <SmartIcon name="warning-outline" size={12} color={themeColors.error} />
          <Text style={styles.warningText}>{program.phvWarnings[0]}</Text>
        </View>
      )}

      <Text style={[styles.descriptionText, { color: themeColors.muted }]}>{program.description}</Text>

      <View style={styles.prescriptionRow}>
        <RxChip label="Sets" value={String(program.prescription.sets)} colors={themeColors} />
        <RxChip label="Reps" value={program.prescription.reps} colors={themeColors} />
        <RxChip label="RPE" value={program.prescription.rpe} colors={themeColors} />
        <RxChip label="Rest" value={program.prescription.rest} colors={themeColors} />
        <RxChip label="Intensity" value={program.prescription.intensity} colors={themeColors} />
      </View>

      {program.reason && (
        <View style={[styles.reasonBlock, { backgroundColor: themeColors.cream03, borderWidth: 1, borderColor: themeColors.cream10 }]}>
          <View style={styles.reasonHeader}>
            <SmartIcon name="sparkles-outline" size={12} color={themeColors.tomoSageDim} />
            <Text style={[styles.reasonLabel, { color: themeColors.tomoSageDim }]}>Why this program</Text>
          </View>
          <Text style={[styles.reasonText, { color: CREAM_70 }]}>{program.reason}</Text>
        </View>
      )}

      {program.tags && program.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {program.tags.slice(0, 4).map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: themeColors.cream06, borderColor: themeColors.cream10, borderWidth: 1 }]}>
              <Text style={[styles.tagText, { color: CREAM_70 }]}>#{tag.replace(/_/g, '')}</Text>
            </View>
          ))}
        </View>
      )}

      {program.prescription.coachingCues?.length > 0 && (
        <View style={styles.cuesBlock}>
          <Text style={[styles.cuesTitle, { color: CREAM_90 }]}>Coaching cues</Text>
          {program.prescription.coachingCues.map((c, i) => (
            <View key={i} style={styles.cueRow}>
              <Text style={[styles.cueBullet, { color: themeColors.muted }]}>{'\u2022'}</Text>
              <Text style={[styles.cueText, { color: CREAM_70 }]}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      {program.phvWarnings?.length > 1 && (
        <View style={[styles.phvExpandedBlock, { backgroundColor: themeColors.secondarySubtle }]}>
          <Text style={[styles.phvExpandedTitle, { color: themeColors.error }]}>Growth considerations</Text>
          {program.phvWarnings.map((w, i) => (
            <Text key={i} style={[styles.phvExpandedText, { color: themeColors.error }]}>• {w}</Text>
          ))}
        </View>
      )}

      {/* CTA stack: Add to Training (outline) → Ask Tomo (solid) → Done / Not for me */}
      {onAddToCalendar && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onAddToCalendar({
              programId: program.programId,
              name: program.name,
              durationMin: program.durationMin,
              durationWeeks: (program as any).durationWeeks || 4,
              type: program.type,
              category: program.category,
              difficulty: program.difficulty,
              description: program.description,
              frequency: program.frequency,
              prescription: program.prescription,
            });
          }}
          style={[styles.addBtn, { borderColor: themeColors.cream15 }]}
        >
          <SmartIcon name="barbell-outline" size={14} color={themeColors.tomoCream} />
          <Text style={[styles.addBtnText, { color: themeColors.tomoCream }]}>Add to Training</Text>
        </Pressable>
      )}

      <View onStartShouldSetResponder={() => true} onTouchEnd={(e) => e.stopPropagation()}>
        <AskTomoChip
          prompt={`Explain my ${program.name} program drills`}
          label="Ask Tomo about this program"
        />
      </View>

      {(onDone || onDismiss || onToggleActive) && (
        <View
          style={styles.cardActions}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {onToggleActive && (
            <Pressable
              style={({ pressed }) => [
                styles.cardActionBtn,
                isActive ? { backgroundColor: themeColors.sage12, borderColor: themeColors.sage30 } : { backgroundColor: themeColors.cream06, borderColor: themeColors.cream10 },
                pressed && { opacity: 0.7 },
              ]}
              onPress={(e) => { e.stopPropagation(); onToggleActive(); }}
              hitSlop={6}
            >
              <SmartIcon name={isActive ? 'flame' : 'flame-outline'} size={12} color={isActive ? themeColors.tomoSage : themeColors.muted} />
              <Text style={[styles.cardActionText, { color: isActive ? themeColors.tomoSage : themeColors.muted }]}>
                {isActive ? 'In orbit' : 'Pull into orbit'}
              </Text>
            </Pressable>
          )}
          {onDone && (
            <Pressable
              style={({ pressed }) => [styles.cardActionBtn, { backgroundColor: themeColors.cream06, borderColor: themeColors.cream10 }, pressed && { opacity: 0.7 }]}
              onPress={(e) => { e.stopPropagation(); onDone(); }}
            >
              <SmartIcon name="checkmark-circle-outline" size={12} color={themeColors.muted} />
              <Text style={[styles.cardActionText, { color: themeColors.muted }]}>Done</Text>
            </Pressable>
          )}
          {onDismiss && (
            <Pressable
              style={({ pressed }) => [styles.cardActionBtn, { backgroundColor: themeColors.cream06, borderColor: themeColors.cream10 }, pressed && { opacity: 0.7 }]}
              onPress={(e) => { e.stopPropagation(); onDismiss(); }}
            >
              <SmartIcon name="close-circle-outline" size={12} color={themeColors.muted} />
              <Text style={[styles.cardActionText, { color: themeColors.muted }]}>Not for me</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function RxChip({ label, value, colors: themeColors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.rxChip, { backgroundColor: themeColors.cream03, borderWidth: 1, borderColor: themeColors.cream10 }]}>
      <Text style={[styles.rxLabel, { color: themeColors.muted }]}>{label}</Text>
      <Text style={[styles.rxValue, { color: themeColors.tomoCream }]}>{value}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.cream03,
    borderWidth: 1,
    borderColor: colors.cream10,
    marginBottom: spacing.xs,
  },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, padding: 0 },
  searchDropdown: { borderRadius: borderRadius.md, borderWidth: 1, marginBottom: spacing.sm, overflow: 'hidden' },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.compact,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cream10,
  },
  searchResultName: { fontFamily: fontFamily.medium, fontSize: 13 },
  searchResultMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 1 },
  addBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: borderRadius.full },

  refreshBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  refreshText: { fontFamily: fontFamily.medium, fontSize: 13 },

  // ── NOW marker zone ──────────────────────────────────────────────
  nowZone: {
    position: 'relative',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 6,
    minHeight: 60,
  },
  nowStack: { alignItems: 'center', gap: 6 },
  nowLabel: {
    fontSize: 9,
    fontFamily: fontFamily.medium,
    color: CREAM_40,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  // ── Section labels ───────────────────────────────────────────────
  orbitLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 2,
    color: CREAM_40,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  orbitList: { gap: 10, marginTop: 10 },
  orbitEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  orbitEmptyText: { fontFamily: fontFamily.regular, fontSize: 12, flex: 1 },

  // ── Orbit card ───────────────────────────────────────────────────
  orbitRow: { flexDirection: 'row', gap: 12 },
  altCol: { alignItems: 'center', gap: 4 },
  orbitCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  orbitHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sourceEyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  programName: { fontFamily: fontFamily.medium, fontSize: 15, letterSpacing: -0.25 },
  programMeta: { fontFamily: fontFamily.regular, fontSize: 11.5, marginTop: 3 },

  // ── Horizon ──────────────────────────────────────────────────────
  horizon: {
    marginTop: 22,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  horizonLine: { flex: 1, height: 1 },
  horizonLineHalf: { flex: 1, height: 1, backgroundColor: colors.cream15 },
  horizonLineLeft: { opacity: 0.6 },
  horizonLineRight: { opacity: 0.6 },
  horizonLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  // ── Parked rows ──────────────────────────────────────────────────
  parkedList: { gap: 6 },
  parkedRowOuter: { paddingVertical: 4 },
  parkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 8,
    opacity: 0.85,
  },
  parkedEyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 8.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    opacity: 0.85,
    marginBottom: 3,
  },
  parkedName: { fontFamily: fontFamily.medium, fontSize: 13, letterSpacing: -0.15 },
  parkedMeta: { fontFamily: fontFamily.regular, fontSize: 10.5, marginTop: 2 },

  // ── Expanded body ────────────────────────────────────────────────
  expandedContent: { marginTop: spacing.sm, gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  diffBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  diffText: { fontFamily: fontFamily.medium, fontSize: 11, textTransform: 'capitalize' as const, letterSpacing: 0.1 },
  typeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  typeText: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 0.1 },

  impactBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  impactText: { fontFamily: fontFamily.regular, fontSize: 11.5, flex: 1, lineHeight: 17, letterSpacing: -0.05 },

  positionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  positionBadgeText: { fontFamily: fontFamily.medium, fontSize: 11 },

  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  warningText: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.error },

  descriptionText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, letterSpacing: -0.05 },
  prescriptionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rxChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', minWidth: 52 },
  rxLabel: { fontFamily: fontFamily.regular, fontSize: 9, letterSpacing: 0.6, textTransform: 'capitalize' as const },
  rxValue: { fontFamily: fontFamily.semiBold, fontSize: 13, marginTop: 3, letterSpacing: -0.2 },
  reasonBlock: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, gap: 6 },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reasonLabel: { fontFamily: fontFamily.semiBold, fontSize: 11.5, letterSpacing: -0.05 },
  reasonText: { fontFamily: fontFamily.regular, fontSize: 11.5, lineHeight: 17, letterSpacing: -0.05 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontFamily: fontFamily.regular, fontSize: 10.5, letterSpacing: -0.05 },
  cuesBlock: { gap: 4, marginTop: 4 },
  cuesTitle: { fontFamily: fontFamily.semiBold, fontSize: 12, letterSpacing: -0.05 },
  cueRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  cueBullet: { fontSize: 11.5, lineHeight: 17 },
  cueText: { fontFamily: fontFamily.regular, fontSize: 11.5, lineHeight: 17, letterSpacing: -0.05, flex: 1 },
  phvExpandedBlock: { borderRadius: borderRadius.sm, padding: spacing.sm, gap: 4 },
  phvExpandedTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  phvExpandedText: { fontFamily: fontFamily.regular, fontSize: 11 },

  // ── Confirm rows ─────────────────────────────────────────────────
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  confirmLabel: { fontFamily: fontFamily.medium, fontSize: 13, flex: 1 },
  confirmChip: { paddingHorizontal: spacing.compact, paddingVertical: 5, borderRadius: borderRadius.full },
  confirmChipText: { fontFamily: fontFamily.semiBold, fontSize: 12 },

  // ── CTA stack ────────────────────────────────────────────────────
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'transparent',
    marginTop: 8,
  },
  addBtnText: { fontFamily: fontFamily.medium, fontSize: 13 },

  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  cardActionText: { fontFamily: fontFamily.medium, fontSize: 11.5 },

  // ── Empty / loading states ───────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.lg, lineHeight: 19 },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  ctaButtonText: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.tomoCream },
});
