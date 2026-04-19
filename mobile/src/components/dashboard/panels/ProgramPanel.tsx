/**
 * ProgramPanel — Training Programs slide-up panel.
 *
 * Shows two sections:
 * 1. Active Programs — Coach-assigned or self-assigned programs in progress
 * 2. AI Recommended — Personalized program suggestions from deep program refresh
 *
 * Data sourced from boot data (activePrograms + recommendedPrograms).
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager, ScrollView } from 'react-native';
import Svg, { Path, Rect, Line, Circle, Polyline } from 'react-native-svg';
import { SlideUpPanel } from './SlideUpPanel';
import { DashboardCard } from './DashboardCard';
import { fontFamily } from '../../../theme/typography';
import { useTheme } from '../../../hooks/useTheme';
import type { DashboardLayoutSection } from '../../../services/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface RecommendedProgram {
  programId: string;
  name: string;
  category: string;
  type: string;
  priority: 'mandatory' | 'high' | 'medium';
  durationWeeks: number;
  durationMin: number;
  description: string;
  impact: string;
  frequency: string;
  difficulty: string;
  tags: string[];
  reason: string;
  positionNote: string;
}

interface CoachProgramme {
  id: string;
  name: string;
  description: string | null;
  seasonCycle: string;
  startDate: string;
  weeks: number;
  coachId: string;
}

interface ProgramPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  adaptedPlan: { sessionName: string; sessionMeta: string } | null;
  activePrograms?: { programId: string; startedAt: string; metadata: Record<string, unknown> }[];
  coachProgrammes?: CoachProgramme[];
  recommendedPrograms?: RecommendedProgram[];
  signalColor: string;
  freshness?: { label: string; onRefresh: () => void } | null;
  /**
   * Tapping a day in the "This Week" strip fires with that day's date
   * (YYYY-MM-DD). Caller is expected to close the panel and deep-link to the
   * Plan/Timeline tab for that date.
   */
  onDayPress?: (dateISO: string) => void;
  /**
   * CMS-managed sub-section ordering from `bootData.panelLayouts.program`.
   * When undefined/empty we fall back to the default hardcoded order below.
   */
  panelLayout?: DashboardLayoutSection[];
  /**
   * 'sheet' (default) renders inside a SlideUpPanel overlay.
   * 'inline' renders the body directly in a ScrollView for tab-based embedding.
   */
  variant?: 'sheet' | 'inline';
}

/** Default rendering order, used when CMS returns nothing. */
const DEFAULT_PROGRAM_ORDER = [
  'program_today_session',
  'program_my_programs',
  'program_ai_recs',
  'program_week_strip',
];

/**
 * Returns the ISO date (YYYY-MM-DD) for the given weekday index of the
 * current week, where 0 = Monday … 6 = Sunday.
 */
function weekdayDateISO(weekdayIndex: number): string {
  const now = new Date();
  const todayMondayIdx = (now.getDay() + 6) % 7; // JS: Sun=0 → shift so Mon=0
  const diff = weekdayIndex - todayMondayIdx;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  // Local-timezone YYYY-MM-DD (don't use toISOString — that shifts by UTC offset)
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const PRIORITY_COLORS: Record<string, string> = {
  mandatory: '#D45B4A',
  high: '#c49a3c',
  medium: '#5A8A9F',
};

const PRIORITY_LABELS: Record<string, string> = {
  mandatory: 'MANDATORY',
  high: 'HIGH PRIORITY',
  medium: 'RECOMMENDED',
};

const CATEGORY_COLORS: Record<string, string> = {
  speed: '#E8734A',
  strength: '#D45B4A',
  agility: '#c49a3c',
  endurance: '#5A8A9F',
  power: '#9B6FC3',
  mobility: '#7a9b76',
  'injury-prevention': '#D45B4A',
  technical: '#4A9BD9',
};

// Category-specific SVG icons
function CategoryIcon({ category, color, size = 14 }: { category: string; color: string; size?: number }) {
  switch (category) {
    case 'speed':
      return (
        <Svg viewBox="0 0 24 24" width={size} height={size}>
          <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={color} opacity={0.85} />
        </Svg>
      );
    case 'strength':
      return (
        <Svg viewBox="0 0 24 24" width={size} height={size}>
          <Rect x={3} y={10} width={4} height={4} rx={1} fill={color} opacity={0.85} />
          <Rect x={17} y={10} width={4} height={4} rx={1} fill={color} opacity={0.85} />
          <Line x1={7} y1={12} x2={17} y2={12} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </Svg>
      );
    case 'agility':
      return (
        <Svg viewBox="0 0 24 24" width={size} height={size}>
          <Polyline points="4,18 8,10 12,16 16,8 20,14" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'endurance':
      return (
        <Svg viewBox="0 0 24 24" width={size} height={size}>
          <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill={color} opacity={0.8} />
        </Svg>
      );
    case 'technical':
      return (
        <Svg viewBox="0 0 24 24" width={size} height={size}>
          <Circle cx={12} cy={12} r={7} stroke={color} strokeWidth={1.8} fill="none" />
          <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.5} fill="none" />
          <Circle cx={12} cy={12} r={1} fill={color} />
        </Svg>
      );
    default:
      return (
        <Svg viewBox="0 0 24 24" width={size} height={size}>
          <Polyline points="4,18 10,12 14,15 20,6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M17 6L20 6L20 9" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
  }
}

function DifficultyDots({ difficulty, color }: { difficulty: string; color: string }) {
  const level = difficulty === 'advanced' ? 3 : difficulty === 'intermediate' ? 2 : 1;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: i <= level ? color : 'rgba(245,243,237,0.10)',
          }}
        />
      ))}
    </View>
  );
}

export function ProgramPanel({
  isOpen = false,
  onClose = () => {},
  adaptedPlan,
  activePrograms,
  coachProgrammes,
  recommendedPrograms,
  signalColor,
  freshness,
  onDayPress,
  panelLayout,
  variant = 'sheet',
}: ProgramPanelProps) {
  const programs = activePrograms ?? [];
  const coachProgs = coachProgrammes ?? [];
  const recommended = recommendedPrograms ?? [];
  const hasPrograms = programs.length > 0;
  const hasCoachProgs = coachProgs.length > 0;
  const hasRecs = recommended.length > 0;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  }

  // Split recommended into mandatory/high and medium
  const priorityPrograms = recommended.filter(p => p.priority === 'mandatory' || p.priority === 'high');
  const suggestedPrograms = recommended.filter(p => p.priority === 'medium');

  const renderTodaySession = () =>
    adaptedPlan ? (
      <DashboardCard>
        <View style={styles.cardLabelRow}>
          <View style={[styles.liveIndicator, { backgroundColor: signalColor }]} />
          <Text style={[styles.cardLabel, { color: signalColor }]}>TODAY&apos;S SESSION</Text>
        </View>
        <Text style={styles.sessionName}>{adaptedPlan.sessionName}</Text>
        <Text style={styles.sessionMeta}>{adaptedPlan.sessionMeta}</Text>
      </DashboardCard>
    ) : null;

  const renderMyPrograms = () => (
    <>
      <Text style={styles.sectionTitle}>
        {hasPrograms ? 'MY PROGRAMS' : 'MY PROGRAMS'}
      </Text>

      {hasPrograms ? (
        programs.map((prog) => {
          const meta = prog.metadata as Record<string, any>;
          const programName = meta?.name ?? meta?.programName ?? 'Active Program';
          const category = meta?.category ?? meta?.trainingCategory ?? null;
          const weekNumber = meta?.currentWeek ?? meta?.weekNumber ?? null;
          const totalWeeks = meta?.totalWeeks ?? meta?.durationWeeks ?? null;
          const startDate = new Date(prog.startedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' });
          const catColor = (category && CATEGORY_COLORS[category.toLowerCase()]) ?? signalColor;

          return (
            <View key={prog.programId} style={styles.activeProgramCard}>
              <View style={[styles.activeProgramBar, { backgroundColor: catColor }]} />
              <View style={styles.activeProgramContent}>
                <View style={styles.activeProgramHeader}>
                  <CategoryIcon category={category?.toLowerCase() ?? ''} color={catColor} />
                  <Text style={styles.activeProgramName}>{programName}</Text>
                </View>
                <View style={styles.activeProgramMeta}>
                  {category && (
                    <View style={[styles.categoryBadge, { backgroundColor: `${catColor}18` }]}>
                      <Text style={[styles.categoryBadgeText, { color: catColor }]}>{category}</Text>
                    </View>
                  )}
                  <Text style={styles.startedText}>Started {startDate}</Text>
                </View>
                {weekNumber != null && totalWeeks != null && totalWeeks > 0 && (
                  <View style={styles.progressSection}>
                    <View style={styles.progressLabels}>
                      <Text style={styles.progressLabel}>Week {weekNumber} of {totalWeeks}</Text>
                      <Text style={[styles.progressPercent, { color: catColor }]}>
                        {Math.round((weekNumber / totalWeeks) * 100)}%
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min((weekNumber / totalWeeks) * 100, 100)}%`,
                            backgroundColor: catColor,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })
      ) : (
        <View style={styles.emptyCard}>
          <Svg viewBox="0 0 24 24" width={20} height={20}>
            <Rect x={5} y={3} width={14} height={18} rx={2} stroke="rgba(245,243,237,0.20)" strokeWidth={1.5} fill="none" />
            <Line x1={9} y1={8} x2={15} y2={8} stroke="rgba(245,243,237,0.15)" strokeWidth={1.2} />
            <Line x1={9} y1={12} x2={15} y2={12} stroke="rgba(245,243,237,0.15)" strokeWidth={1.2} />
            <Line x1={9} y1={16} x2={13} y2={16} stroke="rgba(245,243,237,0.15)" strokeWidth={1.2} />
          </Svg>
          <Text style={styles.emptyText}>
            No active programs yet. Check the AI recommendations below or browse all programs in Output.
          </Text>
        </View>
      )}

      {/* ── Coach-Assigned Programmes ── */}
      {hasCoachProgs && (
        <>
          <Text style={styles.sectionTitle}>COACH PROGRAMMES</Text>
          {coachProgs.map((prog) => {
            const startDate = new Date(prog.startDate);
            const weeksElapsed = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / (7 * 86400000)));
            const progress = Math.min(weeksElapsed / prog.weeks, 1);

            return (
              <View key={prog.id} style={styles.activeProgramCard}>
                <View style={[styles.activeProgramBar, { backgroundColor: '#9B6FC3' }]} />
                <View style={styles.activeProgramContent}>
                  <View style={styles.activeProgramHeader}>
                    <Svg viewBox="0 0 24 24" width={14} height={14}>
                      <Circle cx={12} cy={8} r={4} stroke="#9B6FC3" strokeWidth={1.5} fill="none" />
                      <Path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="#9B6FC3" strokeWidth={1.5} fill="none" strokeLinecap="round" />
                    </Svg>
                    <Text style={styles.activeProgramName}>{prog.name}</Text>
                  </View>
                  <View style={styles.activeProgramMeta}>
                    <View style={[styles.categoryBadge, { backgroundColor: 'rgba(155,111,195,0.15)' }]}>
                      <Text style={[styles.categoryBadgeText, { color: '#9B6FC3' }]}>
                        COACH ASSIGNED
                      </Text>
                    </View>
                    <View style={[styles.categoryBadge, { backgroundColor: 'rgba(155,111,195,0.10)' }]}>
                      <Text style={[styles.categoryBadgeText, { color: '#9B6FC3' }]}>
                        {prog.seasonCycle.replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                  {prog.description && (
                    <Text style={[styles.startedText, { marginTop: 4 }]} numberOfLines={2}>
                      {prog.description}
                    </Text>
                  )}
                  <View style={styles.progressSection}>
                    <View style={styles.progressLabels}>
                      <Text style={styles.progressLabel}>
                        Week {Math.min(weeksElapsed, prog.weeks)} of {prog.weeks}
                      </Text>
                      <Text style={[styles.progressPercent, { color: '#9B6FC3' }]}>
                        {Math.round(progress * 100)}%
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progress * 100}%`, backgroundColor: '#9B6FC3' },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </>
      )}

    </>
  );

  const renderAiRecs = () => (
    <>
      {!hasRecs && (
        <DashboardCard label="AI RECOMMENDATIONS" style={{ marginTop: 14 }}>
          <Text style={styles.emptyStateTitle}>Nothing priority-flagged right now.</Text>
          <Text style={styles.emptyStateBody}>
            Keep logging check-ins and tests — recommendations appear once Tomo has enough data to personalise them to your sport and position.
          </Text>
        </DashboardCard>
      )}

      {hasRecs && (
        <>
          {/* Priority Programs (Mandatory + High) */}
          {priorityPrograms.length > 0 && (
            <>
              <View style={styles.aiSectionHeader}>
                <Svg viewBox="0 0 24 24" width={12} height={12}>
                  <Circle cx={12} cy={12} r={8} stroke={signalColor} strokeWidth={1.5} fill="none" />
                  <Path d="M12 8v4l3 3" stroke={signalColor} strokeWidth={1.5} strokeLinecap="round" />
                </Svg>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>AI PRIORITY</Text>
                <View style={[styles.aiBadge, { backgroundColor: `${signalColor}18` }]}>
                  <Text style={[styles.aiBadgeText, { color: signalColor }]}>Personalised</Text>
                </View>
              </View>
              {priorityPrograms.map((prog) => (
                <RecommendedProgramCard
                  key={prog.programId}
                  program={prog}
                  isExpanded={expandedId === prog.programId}
                  onToggle={() => toggleExpand(prog.programId)}
                  signalColor={signalColor}
                />
              ))}
            </>
          )}

          {/* Suggested Programs (Medium) */}
          {suggestedPrograms.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: priorityPrograms.length > 0 ? 14 : 0 }]}>
                ALSO SUGGESTED
              </Text>
              {suggestedPrograms.map((prog) => (
                <RecommendedProgramCard
                  key={prog.programId}
                  program={prog}
                  isExpanded={expandedId === prog.programId}
                  onToggle={() => toggleExpand(prog.programId)}
                  signalColor={signalColor}
                />
              ))}
            </>
          )}
        </>
      )}

    </>
  );

  const renderWeekStrip = () => (
    <DashboardCard label="THIS WEEK" style={{ marginTop: 14 }}>
      <View style={styles.weekRow}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
            const isToday = i === (new Date().getDay() + 6) % 7; // Mon=0
            const dateISO = weekdayDateISO(i);
            return (
              <TouchableOpacity
                key={i}
                style={styles.dayCell}
                onPress={() => onDayPress?.(dateISO)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Open Timeline for ${dateISO}`}
              >
                <Text style={[styles.dayLabel, isToday && { color: signalColor }]}>{day}</Text>
                <View style={[
                  styles.dayCircle,
                  isToday && { borderColor: signalColor, borderWidth: 1.5 },
                ]}>
                  {isToday && (
                    <View style={[styles.todayDot, { backgroundColor: signalColor }]} />
                  )}
                </View>
                {isToday && (
                  <Text style={[styles.daySubLabel, { color: signalColor }]}>now</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </DashboardCard>
  );

  const renderers: Record<string, () => React.ReactNode> = {
    program_today_session: renderTodaySession,
    program_my_programs: renderMyPrograms,
    program_ai_recs: renderAiRecs,
    program_week_strip: renderWeekStrip,
  };

  const order = panelLayout && panelLayout.length > 0
    ? panelLayout.map((s) => s.component_type)
    : DEFAULT_PROGRAM_ORDER;

  const body = order.map((type) => {
    const render = renderers[type];
    if (!render) return null;
    return <React.Fragment key={type}>{render()}</React.Fragment>;
  });

  if (variant === 'inline') {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
    );
  }

  return (
    <SlideUpPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Training Programs"
      subtitle="Active programs & AI recommendations"
      freshness={freshness}
    >
      {body}
    </SlideUpPanel>
  );
}

/** Individual recommended program card — expandable */
function RecommendedProgramCard({
  program,
  isExpanded,
  onToggle,
  signalColor,
}: {
  program: RecommendedProgram;
  isExpanded: boolean;
  onToggle: () => void;
  signalColor: string;
}) {
  const priorityColor = PRIORITY_COLORS[program.priority] ?? '#5A8A9F';
  const catColor = CATEGORY_COLORS[program.category.toLowerCase()] ?? signalColor;

  return (
    <TouchableOpacity
      style={styles.recCard}
      onPress={onToggle}
      activeOpacity={0.85}
    >
      <View style={[styles.recPriorityBar, { backgroundColor: priorityColor }]} />
      <View style={styles.recContent}>
        {/* Header row: icon + name + chevron */}
        <View style={styles.recHeader}>
          <CategoryIcon category={program.category.toLowerCase()} color={catColor} size={13} />
          <Text style={styles.recName} numberOfLines={isExpanded ? undefined : 1}>
            {program.name}
          </Text>
          <Text style={styles.chevron}>{isExpanded ? '\u25BE' : '\u25B8'}</Text>
        </View>

        {/* Meta row: priority badge + category + duration + difficulty */}
        <View style={styles.recMetaRow}>
          <View style={[styles.priorityBadge, { backgroundColor: `${priorityColor}20` }]}>
            <Text style={[styles.priorityBadgeText, { color: priorityColor }]}>
              {PRIORITY_LABELS[program.priority] ?? program.priority}
            </Text>
          </View>
          <View style={[styles.metaPill, { backgroundColor: `${catColor}12` }]}>
            <Text style={[styles.metaPillText, { color: catColor }]}>{program.category}</Text>
          </View>
          <Text style={styles.recDuration}>{program.durationWeeks}w</Text>
          <DifficultyDots difficulty={program.difficulty} color={catColor} />
        </View>

        {/* Impact statement — always visible */}
        {program.impact && (
          <Text style={styles.recImpact} numberOfLines={isExpanded ? undefined : 2}>
            {program.impact}
          </Text>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedDivider} />

            {/* Why recommended */}
            {program.reason && (
              <View style={styles.expandedRow}>
                <Text style={styles.expandedLabel}>Why this program</Text>
                <Text style={styles.expandedText}>{program.reason}</Text>
              </View>
            )}

            {/* Position note */}
            {program.positionNote && (
              <View style={styles.expandedRow}>
                <Text style={styles.expandedLabel}>Position focus</Text>
                <Text style={styles.expandedText}>{program.positionNote}</Text>
              </View>
            )}

            {/* Details grid */}
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{program.durationWeeks} weeks</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Session</Text>
                <Text style={styles.detailValue}>{program.durationMin} min</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Frequency</Text>
                <Text style={styles.detailValue}>{program.frequency}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Type</Text>
                <Text style={styles.detailValue}>{program.type}</Text>
              </View>
            </View>

            {/* Tags */}
            {program.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {program.tags.slice(0, 4).map((tag, i) => (
                  <View key={i} style={[styles.tag, { backgroundColor: `${catColor}10` }]}>
                    <Text style={[styles.tagText, { color: catColor }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Description */}
            {program.description && (
              <Text style={styles.recDescription}>{program.description}</Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    backgroundColor: 'rgba(245,243,237,0.03)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.10)',
    marginBottom: 10,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  liveIndicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(245,243,237,0.35)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(245,243,237,0.35)',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 6,
  },
  sessionName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#F5F3ED',
    marginBottom: 3,
  },
  sessionMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(245,243,237,0.50)',
  },

  // Active program cards
  activeProgramCard: {
    backgroundColor: 'rgba(245,243,237,0.03)',
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.10)',
    marginBottom: 8,
  },
  activeProgramBar: {
    width: 3,
  },
  activeProgramContent: {
    flex: 1,
    padding: 12,
    paddingLeft: 10,
  },
  activeProgramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  activeProgramName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#F5F3ED',
    flex: 1,
  },
  activeProgramMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  categoryBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  startedText: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.40)',
  },
  progressSection: {
    marginTop: 10,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: 'rgba(245,243,237,0.45)',
  },
  progressPercent: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(245,243,237,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },

  // Empty state
  emptyCard: {
    backgroundColor: 'rgba(245,243,237,0.03)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.10)',
    marginBottom: 10,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(245,243,237,0.40)',
    lineHeight: 18,
    textAlign: 'center',
  },

  // AI section header
  aiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  aiBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 'auto',
  },
  aiBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 7,
    letterSpacing: 0.5,
  },

  // Recommended program card
  recCard: {
    backgroundColor: 'rgba(245,243,237,0.03)',
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.10)',
    marginBottom: 8,
  },
  recPriorityBar: {
    width: 3,
  },
  recContent: {
    flex: 1,
    padding: 12,
    paddingLeft: 10,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  recName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: '#F5F3ED',
    flex: 1,
  },
  chevron: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.25)',
  },
  recMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  priorityBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priorityBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 7,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaPill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metaPillText: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    textTransform: 'capitalize',
  },
  recDuration: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    color: 'rgba(245,243,237,0.35)',
  },
  recImpact: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(245,243,237,0.55)',
    lineHeight: 17,
  },

  // Expanded content
  expandedSection: {
    marginTop: 8,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(245,243,237,0.06)',
    marginBottom: 10,
  },
  expandedRow: {
    marginBottom: 10,
  },
  expandedLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: 'rgba(245,243,237,0.35)',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  expandedText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: 'rgba(245,243,237,0.62)',
    lineHeight: 18,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
    marginBottom: 10,
  },
  detailItem: {
    width: '50%',
    paddingVertical: 6,
  },
  detailLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1,
    color: 'rgba(245,243,237,0.28)',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: '#F5F3ED',
    textTransform: 'capitalize',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 10,
  },
  tag: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    textTransform: 'capitalize',
  },
  recDescription: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(245,243,237,0.40)',
    lineHeight: 17,
    fontStyle: 'italic',
  },

  // Week calendar
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    width: 36,
  },
  dayLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    color: 'rgba(245,243,237,0.35)',
    marginBottom: 4,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(245,243,237,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  daySubLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 7,
    marginTop: 2,
  },
  emptyStateTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#F5F3ED',
    marginBottom: 4,
  },
  emptyStateBody: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(245,243,237,0.5)',
    lineHeight: 16,
  },
});
