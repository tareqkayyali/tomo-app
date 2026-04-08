/**
 * Dashboard Placeholder Screen
 *
 * Mockup placeholder for the upcoming Dashboard tab.
 * Will eventually aggregate all athlete data: vitals, metrics,
 * programs, mastery, and recommendations.
 *
 * For now: clean "Coming Soon" UI matching ARC theme.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { fontFamily } from '../theme/typography';
import { spacing } from '../theme';
import { HeaderProfileButton } from '../components/HeaderProfileButton';
import { NotificationBell } from '../components/NotificationBell';
import { CheckinHeaderButton } from '../components/CheckinHeaderButton';
import { useAuth } from '../hooks/useAuth';
import { useCheckinStatus } from '../hooks/useCheckinStatus';
import { useNavigation } from '@react-navigation/native';
import { TomoIcon } from '../components/tomo-ui';

export function DashboardPlaceholderScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { needsCheckin } = useCheckinStatus();
  const navigation = useNavigation<any>();
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Dashboard</Text>
        <View style={styles.headerRight}>
          <CheckinHeaderButton
            needsCheckin={needsCheckin}
            onPress={() => navigation.navigate('Checkin')}
          />
          <NotificationBell />
          <HeaderProfileButton
            initial={initial}
            photoUrl={profile?.photoUrl}
          />
        </View>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.iconWrap}>
            <TomoIcon name="trend" size={48} color={colors.accent} weight="regular" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
            Your Dashboard
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Coming Soon
          </Text>
          <Text style={[styles.heroDescription, { color: colors.textMuted }]}>
            A single view of everything that matters — vitals, metrics, programs, mastery, and personalized recommendations. All powered by your Performance Director.
          </Text>
        </View>

        {/* Preview cards */}
        {[
          { icon: 'readiness', title: 'Vitals & Readiness', desc: 'Energy, sleep, soreness, HRV — at a glance' },
          { icon: 'train', title: 'Metrics & Benchmarks', desc: 'Test results, percentiles, progress tracking' },
          { icon: 'timeline', title: 'Programs & Training', desc: 'Active programs, compliance, next sessions' },
          { icon: 'trend', title: 'Mastery & Progress', desc: 'DNA card, pillar scores, streaks, milestones' },
        ].map((item, i) => (
          <View
            key={i}
            style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.previewIcon, { backgroundColor: `${colors.accent}15` }]}>
              <TomoIcon name={item.icon} size={22} color={colors.accent} weight="regular" />
            </View>
            <View style={styles.previewText}>
              <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.previewDesc, { color: colors.textMuted }]}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
    gap: 12,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    marginBottom: 16,
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    marginBottom: 12,
  },
  heroDescription: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    flex: 1,
  },
  previewTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    marginBottom: 2,
  },
  previewDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
});
