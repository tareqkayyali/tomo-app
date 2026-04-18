/**
 * DailyRecommendations — RIE daily activity cards.
 *
 * Shows personalized recommendations from the Recommendation Intelligence Engine.
 * Cards are expandable — tap to reveal bodyLong AI-generated detail.
 * Content diversity: deduplicates by type, max 1 card per type, diverse categories.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { fontFamily } from '../../theme/typography';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DashboardRec {
  recId: string;
  type: string;
  priority: number;
  title: string;
  bodyShort: string | null;
  bodyLong: string | null;
  context: Record<string, unknown>;
  createdAt: string;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: '#D45B4A',
  2: '#c49a3c',
  3: '#7a9b76',
  4: '#5A8A9F',
};

const TYPE_LABELS: Record<string, string> = {
  READINESS: 'Readiness',
  LOAD_WARNING: 'Load Management',
  RECOVERY: 'Recovery',
  DEVELOPMENT: 'Development',
  ACADEMIC: 'Academic Balance',
  CV_OPPORTUNITY: 'Performance CV',
  TRIANGLE_ALERT: 'Alert',
  MOTIVATION: 'Motivation',
  JOURNAL_NUDGE: 'Reflection',
};

// Type-specific SVG icons for visual diversity
function RecIcon({ type, color }: { type: string; color: string }) {
  const s = 14;
  switch (type) {
    case 'READINESS':
      return (
        <Svg viewBox="0 0 24 24" width={s} height={s}>
          <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill={color} opacity={0.8} />
        </Svg>
      );
    case 'LOAD_WARNING':
      return (
        <Svg viewBox="0 0 24 24" width={s} height={s}>
          <Path d="M1 21h22L12 2 1 21z" stroke={color} strokeWidth={2} fill="none" />
          <Line x1={12} y1={9} x2={12} y2={15} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={12} cy={18} r={1} fill={color} />
        </Svg>
      );
    case 'RECOVERY':
      return (
        <Svg viewBox="0 0 24 24" width={s} height={s}>
          <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={color} opacity={0.8} />
        </Svg>
      );
    case 'DEVELOPMENT':
      return (
        <Svg viewBox="0 0 24 24" width={s} height={s}>
          <Polyline points="4,18 10,12 14,15 20,6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M17 6L20 6L20 9" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'ACADEMIC':
      return (
        <Svg viewBox="0 0 24 24" width={s} height={s}>
          <Rect x={4} y={4} width={16} height={16} rx={2} stroke={color} strokeWidth={1.8} fill="none" />
          <Line x1={8} y1={9} x2={16} y2={9} stroke={color} strokeWidth={1.5} />
          <Line x1={8} y1={13} x2={14} y2={13} stroke={color} strokeWidth={1.5} />
          <Line x1={8} y1={17} x2={12} y2={17} stroke={color} strokeWidth={1.5} />
        </Svg>
      );
    case 'MOTIVATION':
      return (
        <Svg viewBox="0 0 24 24" width={s} height={s}>
          <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={color} opacity={0.8} />
        </Svg>
      );
    default:
      return (
        <Svg viewBox="0 0 24 24" width={s} height={s}>
          <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={2} fill="none" />
          <Circle cx={12} cy={12} r={3} fill={color} opacity={0.6} />
        </Svg>
      );
  }
}

interface Props {
  recs: DashboardRec[];
  signalColor: string;
}

/** Deduplicate: max 1 rec per type, pick highest priority */
function diversifyRecs(recs: DashboardRec[]): DashboardRec[] {
  const seen = new Set<string>();
  const diverse: DashboardRec[] = [];
  // Sort by priority (1=highest), then by creation date
  const sorted = [...recs].sort((a, b) => a.priority - b.priority);
  for (const rec of sorted) {
    if (!seen.has(rec.type)) {
      seen.add(rec.type);
      diverse.push(rec);
    }
  }
  return diverse.slice(0, 4);
}

export function DailyRecommendations({ recs, signalColor }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!recs || recs.length === 0) return null;

  const displayed = diversifyRecs(recs);

  function toggleExpand(recId: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === recId ? null : recId);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>FOR YOU TODAY</Text>
      {displayed.map((rec) => {
        const barColor = PRIORITY_COLORS[rec.priority] ?? '#5A8A9F';
        const isExpanded = expandedId === rec.recId;

        return (
          <TouchableOpacity
            key={rec.recId}
            style={styles.card}
            onPress={() => toggleExpand(rec.recId)}
            activeOpacity={0.85}
          >
            <View style={[styles.priorityBar, { backgroundColor: barColor }]} />
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <RecIcon type={rec.type} color={barColor} />
                <Text style={[styles.typeLabel, { color: barColor }]}>
                  {TYPE_LABELS[rec.type] ?? rec.type}
                </Text>
                <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
              </View>
              <Text style={styles.title}>{rec.title}</Text>
              {rec.bodyShort && (
                <Text style={styles.body} numberOfLines={isExpanded ? undefined : 2}>
                  {rec.bodyShort}
                </Text>
              )}
              {/* Expanded: show bodyLong if available */}
              {isExpanded && rec.bodyLong && (
                <View style={styles.expandedContent}>
                  <View style={styles.expandedDivider} />
                  <Text style={styles.expandedText}>{rec.bodyLong}</Text>
                </View>
              )}
              {isExpanded && !rec.bodyLong && rec.bodyShort && (
                <View style={styles.expandedContent}>
                  <View style={styles.expandedDivider} />
                  <Text style={styles.expandedHint}>Tap "Ask Tomo" in Chat to get a personalised action plan for this recommendation.</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  sectionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(245,243,237,0.35)',
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  card: {
    backgroundColor: 'rgba(245,243,237,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,243,237,0.10)',
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 8,
  },
  priorityBar: {
    width: 3,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    paddingLeft: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  typeLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    flex: 1,
  },
  chevron: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: 'rgba(245,243,237,0.25)',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#F5F3ED',
    marginBottom: 3,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: 'rgba(245,243,237,0.55)',
    lineHeight: 18,
  },
  expandedContent: {
    marginTop: 8,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(245,243,237,0.06)',
    marginBottom: 8,
  },
  expandedText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: 'rgba(245,243,237,0.62)',
    lineHeight: 19,
  },
  expandedHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(245,243,237,0.30)',
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
