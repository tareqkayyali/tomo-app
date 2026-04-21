/**
 * ProgramsSection — Signal Dashboard programs tab.
 *
 * Layout contract (April 2026):
 *   ACTIVE · N     — full cards for programs the athlete has flagged Active.
 *                    Always expanded. Source shown as eyebrow (COACH / AI /
 *                    PLAYER ADDED). Coach programs can be activated too.
 *   PROGRAMS · N   — one collapsible flat list (down chevron = expanded by
 *                    default). Holds every non-active program: coach-assigned,
 *                    AI-recommended, player-added. Each row carries the source
 *                    eyebrow inline so the old sub-groups (Must Do / Recommended /
 *                    Supplementary / My Picks / Coach Assigned) are gone.
 *
 * Card header layout keeps the Active pill with the eyebrow (top-right) and
 * the expand chevron vertically centered on the far right, so taps don't
 * collide. Done / Not-for-me live inside the expanded content only.
 *
 * Source of truth for the Active list is usePrograms (GET /programs/active),
 * which returns full snapshots so active programs survive AI re-generation.
 * Active programs are NEVER re-rendered in the Programs list (no duplication).
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
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

const CATEGORY_EMOJI: Record<string, string> = {
  sprint: '', sled: '', strength: '', nordic: '', plyometric: '',
  agility: '', endurance: '', power: '', hip_mobility: '', acl_prevention: '',
  groin: '', ankle_stability: '', passing: '', shooting: '', dribbling: '',
  first_touch: '', crossing: '', heading: '', defensive: '', goalkeeping: '',
  set_piece: '', tactical: '', scanning: '', combination_play: '',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: colors.tomoSage,
  intermediate: colors.warning,
  advanced: colors.error,
};

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
  const { colors } = useTheme();
  const safePrograms = programs || ({} as any);
  const recommendations: Recommendation[] = safePrograms.recommendations || [];
  const dataStatus = (programs as any)?.dataStatus;

  const [calendarSheetProgram, setCalendarSheetProgram] = useState<any>(null);
  const [forYouExpanded, setForYouExpanded] = useState(true);

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
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.tomoSage + '12' }]}>
            <SmartIcon name={loadingMsg.icon} size={28} color={colors.tomoSage} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.tomoCream }]}>{loadingMsg.title}</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>{loadingMsg.subtitle}</Text>
          <View style={styles.ctaRow}>
            {onNavigateCheckin && (
              <Pressable
                style={({ pressed }) => [styles.ctaButton, { backgroundColor: colors.tomoSage, opacity: pressed ? 0.8 : 1 }]}
                onPress={onNavigateCheckin}
              >
                <SmartIcon name="checkmark-circle-outline" size={16} color={colors.tomoCream} />
                <Text style={styles.ctaButtonText}>Daily Check-in</Text>
              </Pressable>
            )}
            {onForceRefresh && (
              <Pressable
                style={({ pressed }) => [styles.ctaButton, { backgroundColor: colors.tomoSage, opacity: pressed ? 0.8 : 1 }]}
                onPress={onForceRefresh}
              >
                <SmartIcon name="refresh-outline" size={16} color={colors.tomoCream} />
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
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.tomoSage + '12' }]}>
            <SmartIcon name="barbell-outline" size={28} color={colors.tomoSage} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.tomoCream }]}>No Programs Yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Tap below to generate personalized training programs based on your profile.
          </Text>
          {onForceRefresh && (
            <Pressable
              style={({ pressed }) => [styles.ctaButton, { backgroundColor: colors.tomoSage, opacity: pressed ? 0.8 : 1, marginTop: 12 }]}
              onPress={onForceRefresh}
            >
              <SmartIcon name="sparkles-outline" size={16} color={colors.tomoCream} />
              <Text style={styles.ctaButtonText}>Generate Programs</Text>
            </Pressable>
          )}
        </View>
      </GlassCard>
    );
  }

  // ── Derive the two lists: Active (dedup source) + For You (everything else, deduped) ──
  const activeIds = new Set(activeEntries.map((e) => e.programId));
  const playerAddedIds = new Set(playerAddedEntries.map((e) => e.programId));

  // Active list: rehydrate each entry's snapshot (fall back to live recommendation if snapshot missing).
  const activePrograms: Recommendation[] = activeEntries
    .map<Recommendation | null>((entry) => {
      if (entry.program) {
        return { ...entry.program, source: entry.source || deriveSource(entry.program) };
      }
      const live = recommendations.find((r) => r.programId === entry.programId);
      if (live) return { ...live, source: entry.source || deriveSource(live) };
      return null;
    })
    .filter((p): p is Recommendation => p !== null);

  // For You list: coach + AI recs from snapshot + player-added (from entries), minus active.
  const seen = new Set<string>(activeIds);
  const forYou: Recommendation[] = [];
  for (const r of recommendations) {
    if (seen.has(r.programId)) continue;
    seen.add(r.programId);
    forYou.push({ ...r, source: deriveSource(r) });
  }
  for (const entry of playerAddedEntries) {
    if (seen.has(entry.programId)) continue;
    if (!entry.program) continue;
    seen.add(entry.programId);
    forYou.push({ ...entry.program, source: 'player_added' });
  }

  const handleToggleFrom = (program: Recommendation) => onToggleActive?.(program);
  const handleDismissPlayerAdded = (id: string) => {
    if (playerAddedIds.has(id)) onPlayerDeselect?.(id);
    else onProgramDismiss?.(id);
  };

  return (
    <View style={styles.container}>
      {/* Deep Refresh Indicator */}
      {isDeepRefreshing && (
        <View style={[styles.refreshBanner, { backgroundColor: colors.accentSubtle }]}>
          <SmartIcon name={(shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0]).icon} size={16} color={colors.tomoSage} />
          <Text style={[styles.refreshText, { color: colors.tomoSage }]}>
            {(shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0]).title}...
          </Text>
        </View>
      )}

      {/* Program Search */}
      <View style={styles.searchContainer}>
        <SmartIcon name="search" size={16} color={searchFocused ? colors.tomoSage : colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.tomoCream }]}
          placeholder="Search programs... (sprint, strength, agility)"
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={handleSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }} hitSlop={8}>
            <SmartIcon name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {searchFocused && searchResults.length > 0 && (
        <View style={[styles.searchDropdown, { backgroundColor: colors.cream03, borderColor: colors.cream10 }]}>
          {searchResults.map((prog) => (
            <Pressable
              key={prog.id}
              style={({ pressed }) => [styles.searchResultRow, pressed && { opacity: 0.7 }]}
              onPress={() => handleAddProgram(prog)}
              disabled={playerSelectedIds.includes(prog.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.searchResultName, { color: colors.tomoCream }]} numberOfLines={1}>{prog.name}</Text>
                <Text style={[styles.searchResultMeta, { color: colors.muted }]}>
                  {prog.type} · {prog.difficulty} · {prog.duration_minutes}min
                </Text>
              </View>
              {playerSelectedIds.includes(prog.id) ? (
                <View style={[styles.addBadge, { backgroundColor: colors.sage15 }]}>
                  <SmartIcon name="checkmark" size={14} color={colors.tomoSage} />
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: colors.tomoSage }}>Added</Text>
                </View>
              ) : (
                <View style={[styles.addBadge, { backgroundColor: colors.sage15 }]}>
                  <SmartIcon name="add" size={14} color={colors.tomoSage} />
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: colors.tomoSage }}>Add</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* ── ACTIVE · N ──────────────────────────────────────────── */}
      {activePrograms.length > 0 && (
        <View style={styles.group}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>ACTIVE · {activePrograms.length}</Text>
          </View>
          {activePrograms.map((p) => (
            <ProgramCard
              key={p.programId}
              program={p}
              colors={colors}
              isActive={true}
              onToggleActive={() => handleToggleFrom(p)}
              onDone={onProgramDone}
              onAddToCalendar={setCalendarSheetProgram}
              hideNotForMe
            />
          ))}
        </View>
      )}

      {/* ── PROGRAMS · N ────────────────────────────────────────── */}
      {forYou.length > 0 && (
        <View style={styles.group}>
          <Pressable
            onPress={() => setForYouExpanded((v) => !v)}
            style={styles.sectionHeader}
          >
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>
              PROGRAMS · {forYou.length}
            </Text>
            <SmartIcon
              name={forYouExpanded ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.muted}
            />
          </Pressable>

          {forYouExpanded && forYou.map((p) => (
            <ProgramCard
              key={p.programId}
              program={p}
              colors={colors}
              isActive={false}
              onToggleActive={() => handleToggleFrom(p)}
              onDone={onProgramDone}
              onDismiss={playerAddedIds.has(p.programId) ? handleDismissPlayerAdded : onProgramDismiss}
              onAddToCalendar={setCalendarSheetProgram}
            />
          ))}
        </View>
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
// Program Card
// ────────────────────────────────────────────────────────────────────────

function ProgramCard({
  program,
  colors,
  onDone,
  onDismiss,
  isActive,
  onToggleActive,
  hideNotForMe,
  onAddToCalendar,
}: {
  program: Recommendation;
  colors: any;
  onDone?: (programId: string) => void;
  onDismiss?: (programId: string) => void;
  isActive?: boolean;
  onToggleActive?: () => void;
  hideNotForMe?: boolean;
  onAddToCalendar?: (program: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'done' | 'dismissed' | null>(null);
  const emoji = CATEGORY_EMOJI[program.category] || '';
  const diffColor = DIFFICULTY_COLORS[program.difficulty] || colors.muted;
  const source = deriveSource(program);

  const sourceColor =
    source === 'coach' ? colors.accent :
    source === 'ai_recommended' ? colors.tomoSage :
    colors.muted;

  return (
    <Pressable onPress={() => !confirmAction && setExpanded(!expanded)}>
      <GlassCard>
        {/* Collapsed row — Active pill lives with the eyebrow at the top-right so
            it's visually well separated from the expand chevron on the middle-right. */}
        <View style={styles.cardHeader}>
          {emoji ? <Text style={styles.cardEmoji}>{emoji}</Text> : null}
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <Text style={[styles.sourceEyebrow, { color: sourceColor, flex: 1 }]} numberOfLines={1}>
                {SOURCE_LABEL[source]}
              </Text>
              {onToggleActive && (
                <Pressable
                  style={({ pressed }) => [
                    styles.cardActionBtn,
                    isActive ? styles.cardActionBtnSelected : styles.cardActionBtnDefault,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={(e) => { e.stopPropagation(); onToggleActive(); }}
                  onStartShouldSetResponder={() => true}
                  onTouchEnd={(e) => e.stopPropagation()}
                  hitSlop={8}
                >
                  <SmartIcon name={isActive ? 'flame' : 'flame-outline'} size={12} color={isActive ? colors.accent : colors.muted} />
                  <Text style={[styles.cardActionText, { color: isActive ? colors.accent : colors.muted }]}>Active</Text>
                </Pressable>
              )}
            </View>
            <Text style={[styles.programName, { color: colors.tomoCream }]} numberOfLines={1}>{program.name}</Text>
            <Text style={[styles.programMeta, { color: colors.muted }]}>
              {program.frequency} · {program.durationMin} min · {(program as any).durationWeeks || 4}wks
            </Text>
          </View>
          <SmartIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} style={{ marginLeft: 10 }} />
        </View>

        {/* Inline confirmation */}
        {confirmAction && (() => {
          const isDone = confirmAction === 'done';
          return (
            <View style={[styles.confirmRow, { backgroundColor: isDone ? colors.accentSubtle : colors.tomoSage + '10', borderRadius: borderRadius.sm, marginTop: spacing.sm }]}>
              <SmartIcon name={isDone ? 'checkmark-circle' : 'close-circle'} size={18} color={isDone ? colors.accent : colors.tomoSage} />
              <Text style={[styles.confirmLabel, { color: colors.tomoCream }]} numberOfLines={1}>
                {isDone ? 'Mark as done?' : 'Remove this?'}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.confirmChip, { backgroundColor: colors.cream06, opacity: pressed ? 0.7 : 1 }]}
                onPress={(e) => { e.stopPropagation(); setConfirmAction(null); }}
              >
                <Text style={[styles.confirmChipText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmChip, { backgroundColor: isDone ? colors.accent : colors.tomoSage, opacity: pressed ? 0.8 : 1 }]}
                onPress={(e) => {
                  e.stopPropagation();
                  if (confirmAction === 'done' && onDone) onDone(program.programId);
                  if (confirmAction === 'dismissed' && onDismiss) onDismiss(program.programId);
                  setConfirmAction(null);
                }}
              >
                <Text style={[styles.confirmChipText, { color: colors.tomoCream }]}>{isDone ? 'Done' : 'Remove'}</Text>
              </Pressable>
            </View>
          );
        })()}

        {/* Expanded content */}
        {expanded && (
          <View style={styles.expandedContent}>
            {(program as any).coachName && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <SmartIcon name="person-circle-outline" size={14} color={colors.muted} />
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.muted }}>
                  Assigned by Coach {(program as any).coachName}
                </Text>
              </View>
            )}

            <View style={styles.metaRow}>
              <View style={[styles.diffBadge, { backgroundColor: diffColor + '22' }]}>
                <Text style={[styles.diffText, { color: diffColor }]}>{program.difficulty}</Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: program.type === 'physical' ? colors.accentSoft : colors.secondarySubtle }]}>
                <Text style={[styles.typeText, { color: program.type === 'physical' ? colors.accent : colors.muted }]}>
                  {program.type}
                </Text>
              </View>
            </View>

            <View style={[styles.impactBanner, { backgroundColor: sourceColor + '10' }]}>
              <SmartIcon name="flash" size={14} color={sourceColor} />
              <Text style={[styles.impactText, { color: sourceColor }]}>{program.impact}</Text>
            </View>

            {program.positionNote ? (
              <View style={[styles.positionBadge, { backgroundColor: colors.tomoSage + '12' }]}>
                <SmartIcon name="football-outline" size={12} color={colors.tomoSage} />
                <Text style={[styles.positionBadgeText, { color: colors.tomoSage }]}>{program.positionNote}</Text>
              </View>
            ) : null}

            {program.phvWarnings?.length > 0 && (
              <View style={[styles.warningBadge, { backgroundColor: colors.secondarySubtle }]}>
                <SmartIcon name="warning-outline" size={12} color={colors.error} />
                <Text style={styles.warningText}>{program.phvWarnings[0]}</Text>
              </View>
            )}

            <Text style={[styles.descriptionText, { color: colors.muted }]}>{program.description}</Text>

            <View style={styles.prescriptionRow}>
              <RxChip label="Sets" value={String(program.prescription.sets)} colors={colors} />
              <RxChip label="Reps" value={program.prescription.reps} colors={colors} />
              <RxChip label="RPE" value={program.prescription.rpe} colors={colors} />
              <RxChip label="Rest" value={program.prescription.rest} colors={colors} />
              <RxChip label="Intensity" value={program.prescription.intensity} colors={colors} />
            </View>

            {program.reason && (
              <View style={[styles.reasonBlock, { backgroundColor: colors.cream03, borderWidth: 1, borderColor: colors.cream10 }]}>
                <View style={styles.reasonHeader}>
                  <SmartIcon name="bulb-outline" size={14} color={colors.tomoSage} />
                  <Text style={[styles.reasonLabel, { color: colors.tomoSage }]}>Why this program</Text>
                </View>
                <Text style={[styles.reasonText, { color: colors.tomoCream }]}>{program.reason}</Text>
              </View>
            )}

            {program.tags && program.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {program.tags.slice(0, 4).map((tag) => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: colors.cream06 }]}>
                    <Text style={[styles.tagText, { color: colors.muted }]}>#{tag.replace(/_/g, '')}</Text>
                  </View>
                ))}
              </View>
            )}

            {program.prescription.coachingCues?.length > 0 && (
              <View style={styles.cuesBlock}>
                <Text style={[styles.cuesTitle, { color: colors.muted }]}>Coaching cues</Text>
                {program.prescription.coachingCues.map((c, i) => (
                  <Text key={i} style={[styles.cueText, { color: colors.tomoCream }]}>
                    {'\u2022'} {c}
                  </Text>
                ))}
              </View>
            )}

            {program.phvWarnings?.length > 1 && (
              <View style={[styles.phvExpandedBlock, { backgroundColor: colors.secondarySubtle }]}>
                <Text style={[styles.phvExpandedTitle, { color: colors.error }]}>Growth considerations</Text>
                {program.phvWarnings.map((w, i) => (
                  <Text key={i} style={[styles.phvExpandedText, { color: colors.error }]}>• {w}</Text>
                ))}
              </View>
            )}

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
                style={[styles.askTomoButton, { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder, borderWidth: 1 }]}
              >
                <SmartIcon name="barbell-outline" size={16} color={colors.muted} />
                <Text style={[styles.askTomoText, { color: colors.muted }]}>Add to Training</Text>
              </Pressable>
            )}

            <View onStartShouldSetResponder={() => true} onTouchEnd={(e) => e.stopPropagation()}>
              <AskTomoChip
                prompt={`Explain my ${program.name} program drills`}
                label="Ask Tomo about this program"
              />
            </View>

            {/* Done / Not for me — only surfaced when the card is expanded */}
            {(onDone || (onDismiss && !hideNotForMe)) && (
              <View
                style={styles.cardActions}
                onStartShouldSetResponder={() => true}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {onDone && (
                  <Pressable
                    style={({ pressed }) => [styles.cardActionBtn, styles.cardActionBtnDefault, pressed && { opacity: 0.7 }]}
                    onPress={(e) => { e.stopPropagation(); setConfirmAction('done'); }}
                  >
                    <SmartIcon name="checkmark-circle-outline" size={14} color={colors.muted} />
                    <Text style={[styles.cardActionText, { color: colors.muted }]}>Done</Text>
                  </Pressable>
                )}
                {onDismiss && !hideNotForMe && (
                  <Pressable
                    style={({ pressed }) => [styles.cardActionBtn, styles.cardActionBtnDefault, pressed && { opacity: 0.7 }]}
                    onPress={(e) => { e.stopPropagation(); setConfirmAction('dismissed'); }}
                  >
                    <SmartIcon name="close-circle-outline" size={14} color={colors.muted} />
                    <Text style={[styles.cardActionText, { color: colors.muted }]}>Not for me</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

function RxChip({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.rxChip, { backgroundColor: colors.cream03, borderWidth: 1, borderColor: colors.cream10 }]}>
      <Text style={[styles.rxLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.rxValue, { color: colors.tomoCream }]}>{value}</Text>
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

  group: { gap: spacing.xs },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },

  sourceEyebrow: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardEmoji: { fontSize: 24, marginTop: 2 },
  programName: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  programMeta: { fontFamily: fontFamily.regular, fontSize: 11 },
  diffBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  diffText: { fontFamily: fontFamily.medium, fontSize: 9, textTransform: 'capitalize' as const },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  typeText: { fontFamily: fontFamily.medium, fontSize: 9 },

  impactBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  impactText: { fontFamily: fontFamily.medium, fontSize: 12, flex: 1, lineHeight: 17 },

  positionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
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
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  warningText: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.error },

  expandedContent: { marginTop: spacing.sm, gap: spacing.sm },
  descriptionText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
  prescriptionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rxChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  rxLabel: { fontFamily: fontFamily.regular, fontSize: 9 },
  rxValue: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  reasonBlock: { borderRadius: borderRadius.sm, padding: spacing.sm, gap: 4 },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reasonLabel: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  reasonText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontFamily: fontFamily.regular, fontSize: 10 },
  cuesBlock: { gap: 4 },
  cuesTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  cueText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
  phvExpandedBlock: { borderRadius: borderRadius.sm, padding: spacing.sm, gap: 4 },
  phvExpandedTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  phvExpandedText: { fontFamily: fontFamily.regular, fontSize: 11 },

  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  confirmLabel: { fontFamily: fontFamily.medium, fontSize: 13, flex: 1 },
  confirmChip: { paddingHorizontal: spacing.compact, paddingVertical: 5, borderRadius: borderRadius.full },
  confirmChipText: { fontFamily: fontFamily.semiBold, fontSize: 12 },

  askTomoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginTop: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  askTomoText: { fontFamily: fontFamily.medium, fontSize: 13 },

  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  cardActionBtnDefault: { backgroundColor: colors.cream06, borderColor: colors.cream10 },
  cardActionBtnSelected: { backgroundColor: colors.sage12, borderColor: colors.sage30 },
  cardActionText: { fontFamily: fontFamily.medium, fontSize: 12 },

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
