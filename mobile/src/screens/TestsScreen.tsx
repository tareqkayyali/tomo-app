/**
 * Tests Screen — Center Tab Destination
 * Hero "Start New Test" tile + drill list with dark glass cards.
 *
 * Matches TARGET UI: gradient hero, segmented tabs, drill cards.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { GlassCard, GradientButton, HeaderProfileButton } from '../components';
import { ScrollFadeOverlay } from '../components/ScrollFadeOverlay';
import {
  spacing,
  fontFamily,
  layout,
  borderRadius,
  shadows,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useBlazePodDrills, type BlazePodDrill } from '../hooks/useContentHelpers';
import { getBlazePodHistory } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useFadeIn } from '../hooks/useFadeIn';
import { useSportContext, getSportConfig } from '../hooks/useSportContext';
import type { ActiveSport } from '../hooks/useSportContext';
import { FootballTestsContent } from './football';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

type TestsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Test'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

type SegmentTab = 'tests' | 'history' | 'schedule';

export function TestsScreen({ navigation }: TestsScreenProps) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const isFocused = useIsFocused();
  const { activeSport, setActiveSport, hasMultipleSports, sportConfig, userSports } = useSportContext();
  const drills = useBlazePodDrills();
  const [activeTab, setActiveTab] = useState<SegmentTab>('tests');
  const [showSportMenu, setShowSportMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastResults, setLastResults] = useState<Record<string, string>>({});

  const styles = useMemo(() => createStyles(colors), [colors]);

  const fadeIn0 = useFadeIn(0, { trigger: isFocused });
  const fadeIn1 = useFadeIn(1, { trigger: isFocused });
  const fadeIn2 = useFadeIn(2, { trigger: isFocused });

  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';

  const loadHistory = useCallback(async () => {
    try {
      const data = await getBlazePodHistory(10);
      const results: Record<string, string> = {};
      for (const session of data.sessions || []) {
        if (!results[session.drillId]) {
          results[session.drillId] = `${session.totalTouches} Touches`;
        }
      }
      setLastResults(results);
    } catch {
      // Graceful
    } finally {
      setRefreshing(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  React.useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleStartDrill = useCallback(
    (drillId: string) => {
      navigation.navigate('DrillDetail', { drillId });
    },
    [navigation],
  );

  const segmentTabs: { key: SegmentTab; label: string }[] = [
    { key: 'history', label: 'History' },
    { key: 'tests', label: 'Tests' },
    { key: 'schedule', label: 'Schedule' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header — sport name + dropdown trigger + profile */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.sportToggle, pressed && hasMultipleSports && { opacity: 0.7 }]}
          onPress={() => {
            if (hasMultipleSports) {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSportMenu(true);
            }
          }}
        >
          <Ionicons
            name={sportConfig.icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color={sportConfig.color}
          />
          <Text style={styles.screenHeaderTitle}>{sportConfig.label}</Text>
          {hasMultipleSports && (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </Pressable>
        <HeaderProfileButton initial={initial} photoUrl={profile?.photoUrl} />
      </View>

      {/* Sport picker dropdown */}
      {hasMultipleSports && (
        <Modal
          visible={showSportMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSportMenu(false)}
        >
          <Pressable style={styles.dropdownOverlay} onPress={() => setShowSportMenu(false)}>
            <View style={styles.dropdownContainer}>
              {userSports.map((sport: ActiveSport) => {
                const cfg = getSportConfig(sport);
                const isActive = sport === activeSport;
                return (
                  <Pressable
                    key={sport}
                    style={[
                      styles.dropdownItem,
                      isActive && { backgroundColor: cfg.color + '20' },
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveSport(sport);
                      setShowSportMenu(false);
                    }}
                  >
                    <Ionicons
                      name={cfg.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={isActive ? cfg.color : colors.textMuted}
                    />
                    <Text style={[
                      styles.dropdownLabel,
                      isActive && { color: cfg.color, fontFamily: fontFamily.semiBold },
                    ]}>
                      {cfg.label}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark" size={20} color={cfg.color} style={{ marginLeft: 'auto' }} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Segment Tabs */}
      <Animated.View style={[styles.segmentRow, fadeIn0]}>
        {segmentTabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.segment, activeTab === tab.key && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeTab === tab.key && styles.segmentTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      <View style={{ flex: 1 }}>
        <ScrollFadeOverlay />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent1} />
          }
        >
        {activeTab === 'tests' && (
          <>
            {activeSport === 'football' ? (
              <FootballTestsContent navigation={navigation} />
            ) : (
              <>
                {/* ═══════ Padel DNA Context Labels ═══════ */}
                {profile?.sport === 'padel' && (
                  <Animated.View style={fadeIn1}>
                    <GlassCard style={styles.padelContextCard}>
                      <View style={styles.padelContextHeader}>
                        <Ionicons name="tennisball" size={18} color={colors.accent1} />
                        <Text style={styles.padelContextTitle}>Padel Performance Tests</Text>
                      </View>
                      <Text style={styles.padelContextDesc}>
                        Phone tests feed your DNA attributes. BlazePod drills train reflexes and agility.
                      </Text>
                    </GlassCard>
                  </Animated.View>
                )}

                {/* ═══════ Phone Only Mode Card ═══════ */}
                <Animated.View style={fadeIn1}>
                  <Pressable
                    onPress={() => navigation.navigate('PhoneTestsList')}
                    style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                  >
                    <LinearGradient
                      colors={['rgba(255,107,53,0.20)', 'rgba(0,217,255,0.15)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.modeCard}
                    >
                      <View style={styles.modeIconWrap}>
                        <LinearGradient
                          colors={colors.gradientOrangeCyan}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBox}
                        >
                          <Ionicons name="phone-portrait-outline" size={32} color="#FFFFFF" />
                        </LinearGradient>
                      </View>
                      <View style={styles.modeInfo}>
                        <Text style={styles.modeTitle}>Phone Only</Text>
                        <Text style={styles.modeDesc}>
                          Reaction, jump, sprint, agility & balance tests using your phone sensors
                        </Text>
                        {profile?.sport === 'padel' && (
                          <View style={styles.feedsRow}>
                            <Text style={styles.feedsLabel}>Feeds: Reflexes, Power, Agility, Stamina</Text>
                          </View>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textInactive} />
                    </LinearGradient>
                  </Pressable>
                </Animated.View>

                {/* ═══════ BlazePod Mode Card ═══════ */}
                <Animated.View style={fadeIn1}>
                  <GlassCard style={styles.modeCardGlass}>
                    <View style={styles.modeIconWrap}>
                      <View style={[styles.modeIconBox, { backgroundColor: 'rgba(123,97,255,0.15)' }]}>
                        <Ionicons name="flash" size={32} color="#7B61FF" />
                      </View>
                    </View>
                    <View style={styles.modeInfo}>
                      <Text style={styles.modeTitle}>With BlazePods</Text>
                      <Text style={styles.modeDesc}>
                        Advanced reaction drills with BlazePod light pods
                      </Text>
                      {profile?.sport === 'padel' && (
                        <View style={styles.feedsRow}>
                          <Text style={styles.feedsLabel}>Feeds: Reflexes, Agility</Text>
                        </View>
                      )}
                    </View>
                  </GlassCard>
                </Animated.View>

                {/* ═══════ Padel-Specific Tests (Coming Soon) ═══════ */}
                {profile?.sport === 'padel' && (
                  <Animated.View style={fadeIn2}>
                    <Text style={styles.padelSectionTitle}>Padel-Specific Tests</Text>
                    {[
                      { name: 'Smash Velocity', icon: 'arrow-down-circle' as const, feeds: 'Power', desc: 'Measure overhead speed with phone accelerometer' },
                      { name: 'Volley Reaction', icon: 'flash-outline' as const, feeds: 'Reflexes', desc: 'Net volley response time drill' },
                      { name: 'Court Coverage', icon: 'walk-outline' as const, feeds: 'Agility, Stamina', desc: 'Movement efficiency across the court' },
                    ].map((test) => (
                      <GlassCard key={test.name} style={styles.comingSoonCard}>
                        <View style={styles.comingSoonRow}>
                          <View style={styles.comingSoonIcon}>
                            <Ionicons name={test.icon} size={22} color={colors.textInactive} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.comingSoonName}>{test.name}</Text>
                            <Text style={styles.comingSoonDesc}>{test.desc}</Text>
                            <Text style={styles.feedsLabel}>Feeds: {test.feeds}</Text>
                          </View>
                          <View style={styles.comingSoonBadge}>
                            <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
                          </View>
                        </View>
                      </GlassCard>
                    ))}
                  </Animated.View>
                )}

                {/* ═══════ BlazePod Drill List ═══════ */}
                <Animated.View style={[fadeIn2, { gap: spacing.md }]}>
                  {drills.map((drill) => (
                    <DrillCard
                      key={drill.id}
                      drill={drill}
                      lastResult={lastResults[drill.id]}
                      onPress={() => handleStartDrill(drill.id)}
                      onRecord={() =>
                        navigation.navigate('DrillCamera', {
                          drillId: drill.id,
                          drillName: drill.name,
                        })
                      }
                    />
                  ))}
                </Animated.View>
              </>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <View style={styles.emptySection}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="trending-up-outline" size={48} color={colors.accent2} />
            </View>
            <Text style={styles.emptyTitle}>Your Test Timeline</Text>
            <Text style={styles.emptySubtitle}>
              After completing tests, your results will appear here with trends over time.
              Track your sprints, jumps, and agility as you improve.
            </Text>
          </View>
        )}

        {activeTab === 'schedule' && (
          <View style={styles.emptySection}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="calendar-outline" size={48} color={colors.accent2} />
            </View>
            <Text style={styles.emptyTitle}>Test Schedule</Text>
            <Text style={styles.emptySubtitle}>
              Your recommended test schedule will appear here based on your training activity.
            </Text>
          </View>
        )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ── Drill Card ──────────────────────────────────────────────────────

function DrillCard({
  drill,
  lastResult,
  onPress,
  onRecord,
}: {
  drill: BlazePodDrill;
  lastResult?: string;
  onPress: () => void;
  onRecord: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable onPress={onPress}>
      <GlassCard style={styles.drillCard}>
        <View style={styles.drillTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.drillName}>{drill.name}</Text>
            <Text style={styles.drillMeta}>
              {drill.sets} sets x {drill.setDurationSec}s | {drill.restBetweenSetsSec}s rest
            </Text>
            <Text style={styles.drillDesc} numberOfLines={2} ellipsizeMode="tail">
              {drill.description}
            </Text>
          </View>
          <View style={[styles.drillIcon, { backgroundColor: drill.color + '18' }]}>
            <Ionicons name={drill.icon as any} size={24} color={drill.color} />
          </View>
        </View>

        <View style={styles.drillBottom}>
          {lastResult ? (
            <Text style={styles.drillResult}>Last: {lastResult}</Text>
          ) : (
            <Text style={styles.drillResult}>No results yet</Text>
          )}
          <GradientButton title="Test Now" onPress={onPress} small />
        </View>
      </GlassCard>
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    sportToggle: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    screenHeaderTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.textOnDark,
    },

    // ── Sport Dropdown ──
    dropdownOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-start' as const,
      paddingTop: Platform.OS === 'ios' ? 100 : 60,
      paddingHorizontal: layout.screenMargin,
    },
    dropdownContainer: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: 14,
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
        android: { elevation: 8 },
      }),
    },
    dropdownItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    dropdownLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 17,
      color: colors.textOnDark,
    },

    // ── Segment Tabs ──────────────────────────────────────────────────
    segmentRow: {
      flexDirection: 'row',
      paddingHorizontal: layout.screenMargin,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    segment: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: 'transparent',
    },
    segmentActive: {
      backgroundColor: colors.accent1,
    },
    segmentText: {
      fontFamily: fontFamily.medium,
      fontSize: 14,
      color: colors.textInactive,
    },
    segmentTextActive: {
      color: '#FFFFFF',
    },

    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: layout.navHeight + spacing.xl,
      gap: spacing.md,
    },

    // ── Mode Cards ──────────────────────────────────────────────────
    modeCard: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      overflow: 'hidden',
    },
    modeCardGlass: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    modeIconWrap: {},
    modeIconBox: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeInfo: {
      flex: 1,
    },
    modeTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 17,
      color: colors.textOnDark,
      marginBottom: 2,
    },
    modeDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      lineHeight: 18,
    },

    // ── Drill Cards ───────────────────────────────────────────────────
    drillCard: {
      gap: spacing.md,
    },
    drillTop: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    drillName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 16,
      color: colors.textOnDark,
    },
    drillMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      marginTop: 2,
    },
    drillDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 4,
    },
    drillIcon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    drillBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    drillResult: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
    },

    // ── Empty States ──────────────────────────────────────────────────
    emptySection: {
      alignItems: 'center',
      paddingVertical: spacing.huge,
      gap: spacing.md,
    },
    emptyIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: `${colors.accent2}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontFamily: fontFamily.semiBold,
      fontSize: 18,
      color: colors.textOnDark,
    },
    emptySubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textInactive,
      textAlign: 'center',
    },

    // ── Padel Context ─────────────────────────────────────────────────
    padelContextCard: {
      borderColor: 'rgba(255, 107, 53, 0.15)',
    },
    padelContextHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.xs,
    },
    padelContextTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    padelContextDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textInactive,
      lineHeight: 18,
    },
    feedsRow: {
      marginTop: 4,
    },
    feedsLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 11,
      color: colors.accent1,
      letterSpacing: 0.3,
    },
    padelSectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.textOnDark,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    comingSoonCard: {
      marginBottom: spacing.sm,
      opacity: 0.6,
    },
    comingSoonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    comingSoonIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.glass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    comingSoonName: {
      fontFamily: fontFamily.semiBold,
      fontSize: 15,
      color: colors.textOnDark,
    },
    comingSoonDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textInactive,
      marginTop: 2,
    },
    comingSoonBadge: {
      backgroundColor: 'rgba(255,255,255,0.08)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    comingSoonBadgeText: {
      fontFamily: fontFamily.medium,
      fontSize: 10,
      color: colors.textInactive,
    },
  });
}
