import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../../theme/typography';

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
  1: '#A05A4A',
  2: '#c49a3c',
  3: '#7a9b76',
  4: '#4A5E50',
};

const TYPE_LABELS: Record<string, string> = {
  READINESS: 'Readiness',
  LOAD_WARNING: 'Load Warning',
  RECOVERY: 'Recovery',
  DEVELOPMENT: 'Development',
  ACADEMIC: 'Academic',
  CV_OPPORTUNITY: 'CV Opportunity',
  TRIANGLE_ALERT: 'Alert',
  MOTIVATION: 'Motivation',
  JOURNAL_NUDGE: 'Journal',
};

interface Props {
  recs: DashboardRec[];
  signalColor: string;
}

export function DailyRecommendations({ recs, signalColor }: Props) {
  if (!recs || recs.length === 0) return null;

  const displayed = recs.slice(0, 4);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>FOR YOU TODAY</Text>
      {displayed.map((rec) => {
        const barColor = PRIORITY_COLORS[rec.priority] ?? '#4A5E50';
        return (
          <View key={rec.recId} style={styles.card}>
            <View style={[styles.priorityBar, { backgroundColor: barColor }]} />
            <View style={styles.cardContent}>
              <Text style={[styles.typeLabel, { color: signalColor }]}>
                {TYPE_LABELS[rec.type] ?? rec.type}
              </Text>
              <Text style={styles.title}>{rec.title}</Text>
              {rec.bodyShort && (
                <Text style={styles.body} numberOfLines={2}>{rec.bodyShort}</Text>
              )}
            </View>
          </View>
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
    color: 'rgba(255,255,255,0.18)',
    textTransform: 'uppercase',
    marginBottom: 7,
  },
  card: {
    backgroundColor: '#1B1F2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
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
  typeLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#E5EBE8',
    marginBottom: 3,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#7A8D7E',
    lineHeight: 16,
  },
});
