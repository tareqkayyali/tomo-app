/**
 * ProgramsSection — Gen Z redesign with natural language impact communication.
 *
 * Shows programs grouped by priority (Must Do / Recommended / Supplementary)
 * with weekly overview, position-specific insights, and impact descriptions
 * that communicate WHY each program matters in language athletes understand.
 */

import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import { spacing, fontFamily, borderRadius } from '../../theme';
import { GlassCard } from '../GlassCard';
import { GlowWrapper } from '../GlowWrapper';
import { AttachToTrainingSheet } from './AddToCalendarSheet';
import type { OutputSnapshot, ProgramCatalogItem } from '../../services/api';
import { searchProgramCatalog } from '../../services/api';
import { colors } from '../../theme/colors';

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
  activeIds?: string[];
  onToggleActive?: (programId: string) => void;
  playerSelectedIds?: string[];
  playerSelectedPrograms?: ProgramCatalogItem[];
  onPlayerSelect?: (program: ProgramCatalogItem) => void;
  onPlayerDeselect?: (programId: string) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  mandatory: colors.error,
  high: colors.warning,
  medium: colors.accent,
  player_selected: '#00D9FF',
};

const PRIORITY_LABELS: Record<string, string> = {
  mandatory: '🔥 Must Do',
  high: '⭐ Recommended',
  medium: '💡 Supplementary',
  player_selected: '🎯 My Pick',
};

const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  mandatory: 'These are non-negotiable for your position — skip these and you fall behind',
  high: 'Highly recommended to level up your game — prioritize these after must-dos',
  medium: 'Extra work to separate you from the pack — do these when time allows',
};

const CATEGORY_EMOJI: Record<string, string> = {
  sprint: '⚡', sled: '🛷', strength: '💪', nordic: '🦵', plyometric: '🦘',
  agility: '🔀', endurance: '🫁', power: '💥', hip_mobility: '🧘', acl_prevention: '🛡️',
  groin: '🦿', ankle_stability: '⚓', passing: '🎯', shooting: '⚽', dribbling: '🏃',
  first_touch: '🤲', crossing: '📐', heading: '🧠', defensive: '🏰', goalkeeping: '🧤',
  set_piece: '🎪', tactical: '♟️', scanning: '👁️', combination_play: '🤝',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: colors.accent,
  intermediate: colors.warning,
  advanced: colors.error,
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const LOADING_MESSAGES = [
  { title: 'Scanning Your Profile', subtitle: 'Position, age band, growth stage...', icon: 'body-outline' as const },
  { title: 'Reading Your Benchmarks', subtitle: 'Comparing your test results to peers...', icon: 'stats-chart-outline' as const },
  { title: 'Checking Your Gaps', subtitle: 'Finding where you can improve fastest...', icon: 'search-outline' as const },
  { title: 'Matching Programs', subtitle: 'Filtering 200+ drills for your needs...', icon: 'filter-outline' as const },
  { title: 'Balancing Your Week', subtitle: 'Speed, strength, skills, recovery...', icon: 'calendar-outline' as const },
  { title: 'Tuning Intensity', subtitle: 'Adjusting load to your readiness...', icon: 'pulse-outline' as const },
  { title: 'Adding Coach Tips', subtitle: 'Writing cues specific to your data...', icon: 'chatbubble-ellipses-outline' as const },
  { title: 'Final Touches', subtitle: 'Personalizing your training plan...', icon: 'sparkles-outline' as const },
  { title: 'Optimizing Recovery', subtitle: 'Factoring in your sleep and HRV...', icon: 'moon-outline' as const },
  { title: 'Position-Specific Drills', subtitle: 'Picking drills that match your role...', icon: 'football-outline' as const },
];

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function ProgramsSection({ programs, gaps = [], isDeepRefreshing, onForceRefresh, onNavigateCheckin, onNavigateTests, onNavigateSettings, onProgramDone, onProgramDismiss, activeIds = [], onToggleActive, playerSelectedIds = [], playerSelectedPrograms = [], onPlayerSelect, onPlayerDeselect }: Props) {
  const { colors } = useTheme();
  const safePrograms = programs || {} as any;
  const recommendations = safePrograms.recommendations || [];
  const { weeklyPlanSuggestion, weeklyStructure, playerProfile } = safePrograms;
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [coachGroupExpanded, setCoachGroupExpanded] = useState(true);
  const [myPicksExpanded, setMyPicksExpanded] = useState(true);
  const [calendarSheetProgram, setCalendarSheetProgram] = useState<any>(null);

  // ── Program Search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProgramCatalogItem[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  // addingProgram removed — add is now optimistic/instant
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      if (!q.trim()) { setSearchResults([]); return; }
      try {
        const res = await searchProgramCatalog(q);
        // Filter out already-recommended programs
        const existingIds = new Set((recommendations || []).map(r => r.programId));
        setSearchResults((res.programs || []).filter(p => !existingIds.has(p.id)).slice(0, 6));
      } catch { setSearchResults([]); }
    }, 250);
  }, [recommendations]);

  const handleAddProgram = useCallback((program: ProgramCatalogItem) => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
    // Optimistic — instantly add full program to local state via parent
    onPlayerSelect?.(program);
  }, [onPlayerSelect]);
  const isAiGenerated = (programs as any).isAiGenerated === true;
  const dataStatus = (programs as any).dataStatus;
  const dataNeeded: string[] = (programs as any).dataNeeded || [];

  const [shuffledMsgs, setShuffledMsgs] = React.useState(() => shuffleArray(LOADING_MESSAGES));
  const [loadingMsgIndex, setLoadingMsgIndex] = React.useState(0);

  React.useEffect(() => {
    if (dataStatus !== 'generating' && !isDeepRefreshing) return;
    setShuffledMsgs(shuffleArray(LOADING_MESSAGES));
    setLoadingMsgIndex(0);
    const interval = setInterval(() => {
      setLoadingMsgIndex(prev => {
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

  // Show generating banner ONLY when dataStatus is 'generating' AND no programs exist
  // If we have coach/player programs, show them with a small generating indicator
  const hasAnyPrograms = recommendations.length > 0 || playerSelectedPrograms.length > 0;

  if (dataStatus === 'generating' && !hasAnyPrograms) {
    const loadingMsg = shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0];
    return (
      <GlassCard>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.accent2 + '12' }]}>
            <Ionicons name={loadingMsg.icon} size={28} color={colors.accent2} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
            {loadingMsg.title}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            {loadingMsg.subtitle}
          </Text>

          {/* CTA buttons */}
          <View style={styles.ctaRow}>
            {onNavigateCheckin && (
              <Pressable
                style={({ pressed }) => [
                  styles.ctaButton,
                  { backgroundColor: colors.accent1, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={onNavigateCheckin}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.textOnDark} />
                <Text style={styles.ctaButtonText}>Daily Check-in</Text>
              </Pressable>
            )}
            {onForceRefresh && (
              <Pressable
                style={({ pressed }) => [
                  styles.ctaButton,
                  { backgroundColor: colors.accent2, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={onForceRefresh}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.textOnDark} />
                <Text style={styles.ctaButtonText}>Generate Now</Text>
              </Pressable>
            )}
          </View>
        </View>
      </GlassCard>
    );
  }

  // Empty state with retry — when no programs and not generating
  if (recommendations.length === 0) {
    return (
      <GlassCard>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.accent1 + '12' }]}>
            <Ionicons name="barbell-outline" size={28} color={colors.accent1} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
            No Programs Yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Tap below to generate personalized training programs based on your profile.
          </Text>
          {onForceRefresh && (
            <Pressable
              style={({ pressed }) => [
                styles.ctaButton,
                { backgroundColor: colors.accent1, opacity: pressed ? 0.8 : 1, marginTop: 12 },
              ]}
              onPress={onForceRefresh}
            >
              <Ionicons name="sparkles-outline" size={16} color={colors.textOnDark} />
              <Text style={styles.ctaButtonText}>Generate Programs</Text>
            </Pressable>
          )}
        </View>
      </GlassCard>
    );
  }

  // Separate coach-assigned programs from AI/inline programs
  const coachAssigned = recommendations.filter((r: any) => r.programId?.startsWith('coach_') || r.coachId);
  const aiPrograms = recommendations.filter((r: any) => !r.programId?.startsWith('coach_') && !r.coachId);

  // Separate active programs from the rest
  const activeSet = new Set(activeIds);
  const activePrograms = aiPrograms.filter((r) => activeSet.has(r.programId));
  const nonActiveAiPrograms = aiPrograms.filter((r) => !activeSet.has(r.programId));

  // Group non-active AI/inline by priority
  const mandatory = nonActiveAiPrograms.filter((r) => r.priority === 'mandatory');
  const high = nonActiveAiPrograms.filter((r) => r.priority === 'high');
  const medium = nonActiveAiPrograms.filter((r) => r.priority === 'medium');

  // Count physical vs technical
  const physicalCount = recommendations.filter((r) => r.type === 'physical').length;
  const technicalCount = recommendations.filter((r) => r.type === 'technical').length;

  // Weekly structure for day dots
  const totalWeeklySessions = weeklyStructure
    ? Object.values(weeklyStructure).reduce((a, b) => a + b, 0)
    : mandatory.length + Math.min(high.length, 3);

  return (
    <View style={styles.container}>
      {/* ── Deep Refresh Indicator ──────────────────────────────── */}
      {isDeepRefreshing && (
        <View style={[styles.refreshBanner, { backgroundColor: 'rgba(255, 107, 53, 0.08)' }]}>
          <Ionicons name={(shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0]).icon} size={16} color={colors.accent1} />
          <Text style={[styles.refreshText, { color: colors.accent1 }]}>
            {(shuffledMsgs[loadingMsgIndex] || LOADING_MESSAGES[0]).title}...
          </Text>
        </View>
      )}

      {/* ── Program Search Bar ─────────────────────────────── */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={searchFocused ? colors.accent1 : colors.textInactive} />
        <TextInput
          style={[styles.searchInput, { color: colors.textOnDark }]}
          placeholder="Search programs... (sprint, strength, agility)"
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Search results dropdown */}
      {searchFocused && searchResults.length > 0 && (
        <View style={[styles.searchDropdown, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          {searchResults.map((prog) => (
            <Pressable
              key={prog.id}
              style={({ pressed }) => [styles.searchResultRow, pressed && { opacity: 0.7 }]}
              onPress={() => handleAddProgram(prog)}
              disabled={playerSelectedIds.includes(prog.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.searchResultName, { color: colors.textOnDark }]} numberOfLines={1}>
                  {CATEGORY_EMOJI[prog.category] || '📋'} {prog.name}
                </Text>
                <Text style={[styles.searchResultMeta, { color: colors.textMuted }]}>
                  {prog.type} · {prog.difficulty} · {prog.duration_minutes}min
                </Text>
              </View>
              {playerSelectedIds.includes(prog.id) ? (
                <View style={[styles.addBadge, { backgroundColor: colors.accent + '18' }]}>
                  <Ionicons name="checkmark" size={14} color={colors.accent} />
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: colors.accent }}>Added</Text>
                </View>
              ) : (
                <View style={[styles.addBadge, { backgroundColor: colors.accent1 + '18' }]}>
                  <Ionicons name="add" size={14} color={colors.accent1} />
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: colors.accent1 }}>Add</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Coach Assigned Programs ───────────────────────────── */}
      {coachAssigned.length > 0 && (
        <View style={styles.group}>
          <Pressable onPress={() => setCoachGroupExpanded((prev) => !prev)} style={styles.groupHeaderTappable}>
            <Ionicons
              name={coachGroupExpanded ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textMuted}
            />
            <View style={[styles.priorityDot, { backgroundColor: colors.info }]} />
            <Text style={[styles.groupLabel, { color: colors.textOnDark }]}>🏋️ Coach Assigned</Text>
            <View style={[styles.countBadge, { backgroundColor: `${colors.info}22` }]}>
              <Text style={[styles.countBadgeText, { color: colors.info }]}>{coachAssigned.length}</Text>
            </View>
          </Pressable>
          {coachGroupExpanded && (
            <>
              <Text style={[styles.groupDesc, { color: colors.textMuted }]}>
                Programs assigned to you by your coach
              </Text>
              {coachAssigned.map((p: any) => (
                <ProgramCard key={p.programId} program={p} colors={colors} onAddToCalendar={setCalendarSheetProgram} />
              ))}
            </>
          )}
        </View>
      )}

      {/* ── Player Assigned Programs (My Picks) — from local state, not snapshot ── */}
      {playerSelectedIds.length > 0 && (
        <View style={styles.group}>
          <Pressable onPress={() => setMyPicksExpanded((prev) => !prev)} style={styles.groupHeaderTappable}>
            <Ionicons
              name={myPicksExpanded ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={colors.textMuted}
            />
            <View style={[styles.priorityDot, { backgroundColor: colors.accent2 }]} />
            <Text style={[styles.groupLabel, { color: colors.textOnDark }]}>🎯 My Picks</Text>
            <View style={[styles.countBadge, { backgroundColor: colors.accent2 + '22' }]}>
              <Text style={[styles.countBadgeText, { color: colors.accent2 }]}>
                {playerSelectedIds.length}
              </Text>
            </View>
          </Pressable>
          {myPicksExpanded && (
            <>
              <Text style={[styles.groupDesc, { color: colors.textMuted }]}>
                Programs you added from the catalog
              </Text>
              {playerSelectedIds.map((psId) => {
                // Use snapshot data if available (has full prescription), else catalog data
                const fromSnapshot = recommendations.find(r => r.programId === psId);
                const fromCatalog = playerSelectedPrograms.find(p => p.id === psId);

                // Build the best available program card data
                const programData: any = fromSnapshot || (fromCatalog ? {
                  programId: fromCatalog.id,
                  name: fromCatalog.name,
                  category: fromCatalog.category,
                  type: fromCatalog.type,
                  priority: 'player_selected',
                  durationMin: fromCatalog.duration_minutes,
                  description: fromCatalog.description,
                  impact: 'Added by you from the program catalog',
                  frequency: '',
                  difficulty: fromCatalog.difficulty,
                  tags: fromCatalog.tags || [],
                  positionNote: '',
                  reason: 'You selected this program',
                  prescription: { sets: 0, reps: '', intensity: '', rpe: '', rest: '', frequency: '', coachingCues: [] },
                  phvWarnings: [],
                } : null);

                if (programData) {
                  return <ProgramCard key={psId} program={programData} colors={colors} onDone={() => onPlayerDeselect?.(psId)} onDismiss={() => onPlayerDeselect?.(psId)} isActive={activeIds.includes(psId)} onToggleActive={onToggleActive} onAddToCalendar={setCalendarSheetProgram} />;
                }
                return null; // Skip if no data available (shouldn't happen)
              })}
            </>
          )}
        </View>
      )}

      {/* ── Active Programs ────────────────────────────────────── */}
      {activePrograms.length > 0 && (
        <ActiveGroup programs={activePrograms} colors={colors} onDone={onProgramDone} onToggleActive={onToggleActive} onAddToCalendar={setCalendarSheetProgram} />
      )}

      {/* ── Priority Groups ────────────────────────────────────── */}
      {high.length > 0 && (
        <PriorityGroup label="high" programs={high} colors={colors} onDone={onProgramDone} onDismiss={onProgramDismiss} activeIds={activeIds} onToggleActive={onToggleActive} onAddToCalendar={setCalendarSheetProgram} />
      )}
      {mandatory.length > 0 && (
        <PriorityGroup label="mandatory" programs={mandatory} colors={colors} onDone={onProgramDone} onDismiss={onProgramDismiss} activeIds={activeIds} onToggleActive={onToggleActive} onAddToCalendar={setCalendarSheetProgram} />
      )}
      {medium.length > 0 && (
        <PriorityGroup label="medium" programs={medium} colors={colors} onDone={onProgramDone} onDismiss={onProgramDismiss} activeIds={activeIds} onToggleActive={onToggleActive} onAddToCalendar={setCalendarSheetProgram} />
      )}

      <AttachToTrainingSheet
        visible={!!calendarSheetProgram}
        onClose={() => setCalendarSheetProgram(null)}
        program={calendarSheetProgram}
      />
    </View>
  );
}

// ── Priority Group ──────────────────────────────────────────────────────

function PriorityGroup({ label, programs, colors, onDone, onDismiss, activeIds = [], onToggleActive, onAddToCalendar }: {
  label: string;
  programs: OutputSnapshot['programs']['recommendations'];
  colors: any;
  onDone?: (programId: string) => void;
  onDismiss?: (programId: string) => void;
  activeIds?: string[];
  onToggleActive?: (programId: string) => void;
  onAddToCalendar?: (program: any) => void;
}) {
  const priorityColor = PRIORITY_COLORS[label] || '#666';
  const displayLabel = PRIORITY_LABELS[label] || label;
  const description = PRIORITY_DESCRIPTIONS[label] || '';

  // Collapse/expand state — default expanded
  const [expanded, setExpanded] = useState(true);

  // Show first 5 collapsed, rest behind "show more"
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? programs : programs.slice(0, 5);
  const hasMore = programs.length > 5;

  return (
    <View style={styles.group}>
      <Pressable onPress={() => setExpanded((prev) => !prev)} style={styles.groupHeaderTappable}>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textMuted}
        />
        <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
        <Text style={[styles.groupLabel, { color: colors.textOnDark }]}>{displayLabel}</Text>
        <View style={[styles.countBadge, { backgroundColor: priorityColor + '22' }]}>
          <Text style={[styles.countBadgeText, { color: priorityColor }]}>{programs.length}</Text>
        </View>
      </Pressable>

      {expanded && (
        <>
          <Text style={[styles.groupDesc, { color: colors.textMuted }]}>{description}</Text>

          {visible.map((p) => (
            <ProgramCard key={p.programId} program={p} colors={colors} onDone={onDone} onDismiss={onDismiss} isActive={activeIds.includes(p.programId)} onToggleActive={onToggleActive} onAddToCalendar={onAddToCalendar} />
          ))}

          {hasMore && !showAll && (
            <Pressable onPress={() => setShowAll(true)}>
              <View style={[styles.showMoreBtn, { backgroundColor: colors.glass }]}>
                <Text style={[styles.showMoreText, { color: colors.accent1 }]}>
                  Show {programs.length - 5} more
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.accent1} />
              </View>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

// ── Active Programs Group ────────────────────────────────────────────────

function ActiveGroup({ programs, colors, onDone, onToggleActive, onAddToCalendar }: {
  programs: OutputSnapshot['programs']['recommendations'];
  colors: any;
  onDone?: (programId: string) => void;
  onToggleActive?: (programId: string) => void;
  onAddToCalendar?: (program: any) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.group}>
      <Pressable onPress={() => setExpanded((prev) => !prev)} style={styles.groupHeaderTappable}>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textMuted}
        />
        <View style={[styles.priorityDot, { backgroundColor: colors.accent }]} />
        <Text style={[styles.groupLabel, { color: colors.textOnDark }]}>{'🔥 Active Programs'}</Text>
        <View style={[styles.countBadge, { backgroundColor: `${colors.success}22` }]}>
          <Text style={[styles.countBadgeText, { color: colors.accent }]}>{programs.length}</Text>
        </View>
      </Pressable>

      {expanded && (
        <>
          <Text style={[styles.groupDesc, { color: colors.textMuted }]}>
            Programs you're currently working on
          </Text>
          {programs.map((p) => (
            <ProgramCard key={p.programId} program={p} colors={colors} onDone={onDone} isActive={true} onToggleActive={onToggleActive} hideNotForMe onAddToCalendar={onAddToCalendar} />
          ))}
        </>
      )}
    </View>
  );
}

// ── Program Card ────────────────────────────────────────────────────────

function ProgramCard({ program, colors, onDone, onDismiss, isActive, onToggleActive, hideNotForMe, onAddToCalendar }: {
  program: OutputSnapshot['programs']['recommendations'][0];
  colors: any;
  onDone?: (programId: string) => void;
  onDismiss?: (programId: string) => void;
  isActive?: boolean;
  onToggleActive?: (programId: string) => void;
  hideNotForMe?: boolean;
  onAddToCalendar?: (program: any) => void;
}) {
  const navigation = useNavigation<any>();
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'done' | 'dismissed' | null>(null);
  const priorityColor = PRIORITY_COLORS[program.priority] || '#666';
  const emoji = CATEGORY_EMOJI[program.category] || '📋';
  const diffColor = DIFFICULTY_COLORS[program.difficulty] || '#666';

  const isCoachAssigned = (program as any).coachName || (program as any).coachId;

  return (
    <Pressable onPress={() => !confirmAction && setExpanded(!expanded)}>
      <GlassCard>
        {/* Collapsed: single row — emoji + name + freq/duration + chevron */}
        <View style={styles.cardHeader}>
          <Text style={styles.cardEmoji}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.programName, { color: colors.textOnDark }]} numberOfLines={1}>{program.name}</Text>
            <Text style={[styles.programMeta, { color: colors.textMuted }]}>
              {program.frequency} · {program.durationMin} min · {(program as any).durationWeeks || 4}wks
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textMuted}
          />
        </View>

        {/* Action buttons — Active / Done / Not for me (always visible below title) */}
        {!isCoachAssigned && (onDone || onDismiss || onToggleActive) && (
          <View
            style={[styles.cardActions, { marginTop: spacing.sm }]}
            onStartShouldSetResponder={() => true}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {onToggleActive && (
              <Pressable
                style={({ pressed }) => [
                  styles.cardActionBtn,
                  { backgroundColor: (isActive ? colors.accent : colors.textMuted) + '18', opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  onToggleActive(program.programId);
                }}
              >
                <Ionicons name={isActive ? 'flame' : 'flame-outline'} size={16} color={isActive ? colors.accent : colors.textMuted} />
                <Text style={[styles.cardActionText, { color: isActive ? colors.accent : colors.textMuted }]}>Active</Text>
              </Pressable>
            )}
            {onDone && (
              <Pressable
                style={({ pressed }) => [
                  styles.cardActionBtn,
                  { backgroundColor: colors.accent + '18', opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  setConfirmAction('done');
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
                <Text style={[styles.cardActionText, { color: colors.accent }]}>Done</Text>
              </Pressable>
            )}
            {onDismiss && !hideNotForMe && (
              <Pressable
                style={({ pressed }) => [
                  styles.cardActionBtn,
                  { backgroundColor: colors.textMuted + '12', opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={(e) => {
                  e.stopPropagation();
                  setConfirmAction('dismissed');
                }}
              >
                <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.cardActionText, { color: colors.textMuted }]}>Not for me</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Confirmation bar — right below action buttons */}
        {confirmAction && (() => {
          const isDone = confirmAction === 'done';
          return (
            <View style={[styles.confirmRow, { backgroundColor: isDone ? '#2ECC7110' : colors.accent1 + '10', borderRadius: borderRadius.sm, marginTop: spacing.sm }]}>
              <Ionicons
                name={isDone ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={isDone ? colors.accent : colors.accent1}
              />
              <Text style={[styles.confirmLabel, { color: colors.textOnDark }]} numberOfLines={1}>
                {isDone ? 'Mark as done?' : 'Remove this?'}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.confirmChip, { backgroundColor: colors.backgroundElevated, opacity: pressed ? 0.7 : 1 }]}
                onPress={(e) => { e.stopPropagation(); setConfirmAction(null); }}
              >
                <Text style={[styles.confirmChipText, { color: colors.textInactive }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmChip, { backgroundColor: isDone ? colors.accent : colors.accent1, opacity: pressed ? 0.8 : 1 }]}
                onPress={(e) => {
                  e.stopPropagation();
                  if (confirmAction === 'done' && onDone) onDone(program.programId);
                  if (confirmAction === 'dismissed' && onDismiss) onDismiss(program.programId);
                  setConfirmAction(null);
                }}
              >
                <Text style={[styles.confirmChipText, { color: colors.textOnDark }]}>
                  {isDone ? 'Done' : 'Remove'}
                </Text>
              </Pressable>
            </View>
          );
        })()}

        {/* ── Expanded content ────────────────────────────────── */}
        {expanded && (
          <View style={styles.expandedContent}>
            {/* Coach badge */}
            {isCoachAssigned && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="person-circle-outline" size={14} color={colors.info} />
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.info }}>
                  Assigned by Coach {(program as any).coachName || ''}
                </Text>
              </View>
            )}

            {/* Difficulty + type badges */}
            <View style={styles.metaRow}>
              <View style={[styles.diffBadge, { backgroundColor: diffColor + '22' }]}>
                <Text style={[styles.diffText, { color: diffColor }]}>{program.difficulty}</Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: program.type === 'physical' ? '#2ECC7118' : '#5E5CE618' }]}>
                <Text style={[styles.typeText, { color: program.type === 'physical' ? colors.accent : colors.info }]}>
                  {program.type === 'physical' ? '⚡' : '⚽'} {program.type}
                </Text>
              </View>
            </View>

            {/* Impact statement */}
            <View style={[styles.impactBanner, { backgroundColor: priorityColor + '10' }]}>
              <Ionicons name="flash" size={14} color={priorityColor} />
              <Text style={[styles.impactText, { color: priorityColor }]}>
                {program.impact}
              </Text>
            </View>

            {/* Position note */}
            {program.positionNote ? (
              <View style={[styles.positionBadge, { backgroundColor: colors.accent1 + '12' }]}>
                <Ionicons name="football-outline" size={12} color={colors.accent1} />
                <Text style={[styles.positionBadgeText, { color: colors.accent1 }]}>{program.positionNote}</Text>
              </View>
            ) : null}

            {/* PHV Warnings */}
            {program.phvWarnings.length > 0 && (
              <View style={[styles.warningBadge, { backgroundColor: '#FF453A15' }]}>
                <Ionicons name="warning-outline" size={12} color={colors.error} />
                <Text style={styles.warningText}>{program.phvWarnings[0]}</Text>
              </View>
            )}

            {/* Description */}
            <Text style={[styles.descriptionText, { color: colors.textMuted }]}>
              {program.description}
            </Text>

            {/* Prescription details */}
            <View style={styles.prescriptionRow}>
              <RxChip label="Sets" value={String(program.prescription.sets)} colors={colors} />
              <RxChip label="Reps" value={program.prescription.reps} colors={colors} />
              <RxChip label="RPE" value={program.prescription.rpe} colors={colors} />
              <RxChip label="Rest" value={program.prescription.rest} colors={colors} />
              <RxChip label="Intensity" value={program.prescription.intensity} colors={colors} />
            </View>

            {/* Why this program */}
            {program.reason && (
              <View style={[styles.reasonBlock, { backgroundColor: colors.glass }]}>
                <View style={styles.reasonHeader}>
                  <Ionicons name="bulb-outline" size={14} color={colors.accent1} />
                  <Text style={[styles.reasonLabel, { color: colors.accent1 }]}>Why this program</Text>
                </View>
                <Text style={[styles.reasonText, { color: colors.textOnDark }]}>{program.reason}</Text>
              </View>
            )}

            {/* Position note expanded */}
            {program.positionNote ? (
              <View style={styles.positionExpandedRow}>
                <Ionicons name="football-outline" size={14} color={colors.accent1} />
                <Text style={[styles.positionExpandedText, { color: colors.textMuted }]}>{program.positionNote}</Text>
              </View>
            ) : null}

            {/* Tags */}
            {program.tags && program.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {program.tags.slice(0, 4).map((tag) => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: colors.glassBorder + '40' }]}>
                    <Text style={[styles.tagText, { color: colors.textMuted }]}>#{tag.replace(/_/g, '')}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Coaching cues */}
            {program.prescription.coachingCues.length > 0 && (
              <View style={styles.cuesBlock}>
                <Text style={[styles.cuesTitle, { color: colors.textMuted }]}>💬 Coaching cues</Text>
                {program.prescription.coachingCues.map((c, i) => (
                  <Text key={i} style={[styles.cueText, { color: colors.textOnDark }]}>
                    {'\u2022'} {c}
                  </Text>
                ))}
              </View>
            )}

            {/* All PHV warnings in expanded */}
            {program.phvWarnings.length > 1 && (
              <View style={[styles.phvExpandedBlock, { backgroundColor: '#FF453A10' }]}>
                <Text style={[styles.phvExpandedTitle, { color: colors.error }]}>⚠️ Growth considerations</Text>
                {program.phvWarnings.map((w, i) => (
                  <Text key={i} style={[styles.phvExpandedText, { color: colors.error }]}>• {w}</Text>
                ))}
              </View>
            )}

            {/* Add to Calendar */}
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
                style={[styles.askTomoButton, { backgroundColor: 'rgba(0, 217, 255, 0.12)', borderColor: 'rgba(0, 217, 255, 0.3)', borderWidth: 1 }]}
              >
                <Ionicons name="barbell-outline" size={16} color={colors.info} />
                <Text style={[styles.askTomoText, { color: colors.info }]}>Add to Training</Text>
              </Pressable>
            )}

            {/* Ask Tomo about this program */}
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                const prompt = `Explain my ${program.name} program drills`;
                navigation.navigate('Main', {
                  screen: 'MainTabs',
                  params: {
                    screen: 'Chat',
                    params: { prefillMessage: prompt, newSession: true },
                  },
                });
              }}
              style={[styles.askTomoButton, { backgroundColor: 'rgba(0, 217, 255, 0.12)', borderColor: 'rgba(0, 217, 255, 0.3)', borderWidth: 1 }]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.info} />
              <Text style={[styles.askTomoText, { color: colors.info }]}>Ask Tomo about this program</Text>
            </Pressable>

            {/* Action buttons moved above expanded content */}
          </View>
        )}

        {/* Confirmation bar moved above expanded content */}
      </GlassCard>
    </Pressable>
  );
}

function RxChip({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.rxChip, { backgroundColor: colors.glass }]}>
      <Text style={[styles.rxLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rxValue, { color: colors.textOnDark }]}>{value}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { gap: spacing.sm },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    padding: 0,
  },
  searchDropdown: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.compact,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  searchResultName: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  searchResultMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 1,
  },
  addBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },

  // Deep refresh
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

  // Hero
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  heroTitle: { fontFamily: fontFamily.bold, fontSize: 18, flex: 1 },
  aiBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  aiBadgeText: { fontFamily: fontFamily.semiBold, fontSize: 11, color: colors.info },
  heroSubtitle: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  statChip: { flex: 1, borderRadius: borderRadius.sm, paddingVertical: 8, alignItems: 'center' },
  statValue: { fontFamily: fontFamily.bold, fontSize: 14 },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 9, marginTop: 2 },

  // Weekly plan
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  dayCol: { alignItems: 'center', gap: 4 },
  dayDot: { width: 10, height: 10, borderRadius: 5 },
  dayLabel: { fontFamily: fontFamily.regular, fontSize: 10 },
  expandHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  expandHintText: { fontFamily: fontFamily.medium, fontSize: 12 },
  weekSuggestion: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  structureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  structureChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  structureText: { fontFamily: fontFamily.medium, fontSize: 10 },

  // Gap connection
  gapHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  gapTitle: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  gapSubtitle: { fontFamily: fontFamily.regular, fontSize: 12, marginBottom: spacing.sm },
  gapChips: { gap: 6 },
  gapChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gapChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  gapChipText: { fontFamily: fontFamily.medium, fontSize: 12 },
  gapArrowText: { fontFamily: fontFamily.medium, fontSize: 11 },

  // Priority groups
  group: { gap: spacing.xs },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  groupHeaderTappable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontFamily: fontFamily.bold, fontSize: 15 },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { fontFamily: fontFamily.bold, fontSize: 12 },
  groupDesc: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
  },
  showMoreText: { fontFamily: fontFamily.medium, fontSize: 13 },

  // Program card
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardEmoji: { fontSize: 24, marginTop: 2 },
  programName: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  programMeta: { fontFamily: fontFamily.regular, fontSize: 11 },
  diffBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  diffText: { fontFamily: fontFamily.medium, fontSize: 9, textTransform: 'capitalize' as const },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  typeText: { fontFamily: fontFamily.medium, fontSize: 9 },

  // Impact
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

  // Position badge
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

  // Warning
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
  warningText: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.error },

  // Expanded
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
  positionExpandedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  positionExpandedText: { fontFamily: fontFamily.regular, fontSize: 12, fontStyle: 'italic' as const },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontFamily: fontFamily.regular, fontSize: 10 },
  cuesBlock: { gap: 4 },
  cuesTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  cueText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18 },
  phvExpandedBlock: { borderRadius: borderRadius.sm, padding: spacing.sm, gap: 4 },
  phvExpandedTitle: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  phvExpandedText: { fontFamily: fontFamily.regular, fontSize: 11 },

  // Compact inline confirmation
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  confirmLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    flex: 1,
  },
  confirmChip: {
    paddingHorizontal: spacing.compact,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  confirmChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },

  // Ask Tomo
  askTomoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  askTomoText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.compact,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  cardActionText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.lg, lineHeight: 19 },
  checklistContainer: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  checklistHeader: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checklistText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    flex: 1,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  ctaButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
});
