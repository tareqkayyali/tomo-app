/**
 * BlazePod Drills Screen
 * Tab screen showing available reactive training drills.
 * Manual-only mode (no BLE hardware integration).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components';
import {
  colors,
  spacing,
  fontFamily,
  layout,
  borderRadius,
  typography,
} from '../theme';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, MainStackParamList } from '../navigation/types';

type BlazePodDrillsScreenProps = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, 'Tests'>,
    NativeStackNavigationProp<MainStackParamList>
  >;
};

// ── Drill definitions ──────────────────────────────────────────────

export interface DrillDef {
  id: string;
  name: string;
  shortName: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  sets: number;
  setDurationSec: number;
  restBetweenSetsSec: number;
  description: string;
  setup: string[];
  metrics: string[];
}

export const DRILLS: DrillDef[] = [
  {
    id: 'reaction-box',
    name: '30-Second Reaction Box',
    shortName: 'Reaction Box',
    icon: 'grid-outline',
    color: '#2ECC71',
    sets: 3,
    setDurationSec: 30,
    restBetweenSetsSec: 30,
    description:
      'Place 4 pods in a square. React and tap each pod as it lights up. Measures pure reaction speed.',
    setup: [
      'Place 4 BlazePod pods in a 2x2 square, about 1.5m apart',
      'Stand in the center of the square',
      'Set pods to random light mode',
      'Tap each pod as fast as possible when it lights up',
    ],
    metrics: ['Total Touches', 'Best Reaction Time', 'Avg Reaction Time'],
  },
  {
    id: 'side-shuffle',
    name: 'Side-to-Side Quick Shuffle',
    shortName: 'Quick Shuffle',
    icon: 'swap-horizontal-outline',
    color: '#7B61FF',
    sets: 4,
    setDurationSec: 20,
    restBetweenSetsSec: 40,
    description:
      'Two pods placed wide apart. Shuffle laterally and tap the lit pod. Tests lateral agility and footwork.',
    setup: [
      'Place 2 pods about 3m apart at hip height',
      'Stand centered between them in athletic stance',
      'Shuffle (not crossover) to each pod when it lights',
      'Return to center after each tap',
    ],
    metrics: ['Total Touches', 'Best Reaction Time', 'Avg Reaction Time'],
  },
  {
    id: 'explosive-step',
    name: 'Explosive First Step',
    shortName: 'First Step',
    icon: 'flash-outline',
    color: '#3498DB',
    sets: 5,
    setDurationSec: 10,
    restBetweenSetsSec: 30,
    description:
      'Single pod placed 3m away. Explode from a standing start and tap the pod. Measures first-step quickness.',
    setup: [
      'Place 1 pod on the ground 3m in front of you',
      'Start in a ready athletic stance',
      'Sprint and tap the pod the moment it lights up',
      'Walk back and reset for next rep',
    ],
    metrics: ['Total Touches', 'Best Reaction Time', 'Avg Reaction Time'],
  },
  {
    id: 'reaction-ball',
    name: 'Reaction + Ball Control',
    shortName: 'Ball Control',
    icon: 'football-outline',
    color: '#2ECC71',
    sets: 3,
    setDurationSec: 30,
    restBetweenSetsSec: 45,
    description:
      'Dribble a ball while reacting to pod lights around you. Combines ball control with cognitive load.',
    setup: [
      'Place 3 pods in a triangle, about 2m apart',
      'Stand in the center with a ball at your feet',
      'Dribble to each pod when it lights and tap it',
      'Keep the ball under control at all times',
    ],
    metrics: ['Total Touches', 'Best Reaction Time', 'Avg Reaction Time'],
  },
];

// ── Component ──────────────────────────────────────────────────────

export function BlazePodDrillsScreen({ navigation }: BlazePodDrillsScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Reactive Drills</Text>
        <Text style={styles.subtitle}>
          BlazePod training — manual mode
        </Text>

        {DRILLS.map((drill) => (
          <Pressable
            key={drill.id}
            onPress={() =>
              navigation.navigate('DrillDetail', { drillId: drill.id })
            }
          >
            <Card variant="rounded" style={styles.drillCard}>
              <View style={styles.drillRow}>
                <View style={[styles.iconCircle, { backgroundColor: drill.color + '18' }]}>
                  <Ionicons name={drill.icon} size={28} color={drill.color} />
                </View>
                <View style={styles.drillInfo}>
                  <Text style={styles.drillName}>{drill.name}</Text>
                  <Text style={styles.drillMeta}>
                    {drill.sets} sets x {drill.setDurationSec}s
                    {'  '}|{'  '}
                    {drill.restBetweenSetsSec}s rest
                  </Text>
                  <Text style={styles.drillDesc} numberOfLines={2}>
                    {drill.description}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textMuted}
                />
              </View>
            </Card>
          </Pressable>
        ))}

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textInactive} />
          <Text style={styles.infoText}>
            Set up your BlazePod pods as described, then use the built-in timers to track your session manually.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
  },
  header: {
    ...typography.pageHeader,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    marginBottom: spacing.xl,
  },
  drillCard: {
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  drillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drillInfo: {
    flex: 1,
  },
  drillName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.textOnLight,
    marginBottom: 2,
  },
  drillMeta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  drillDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundElevated,
  },
  infoText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textInactive,
    lineHeight: 18,
  },
});
