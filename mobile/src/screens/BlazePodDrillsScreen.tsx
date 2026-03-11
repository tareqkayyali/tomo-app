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
import { useBlazePodDrills, type BlazePodDrill } from '../hooks/useContentHelpers';
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

// ── Component ──────────────────────────────────────────────────────

export function BlazePodDrillsScreen({ navigation }: BlazePodDrillsScreenProps) {
  const drills = useBlazePodDrills();

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

        {drills.map((drill) => (
          <Pressable
            key={drill.id}
            onPress={() =>
              navigation.navigate('DrillDetail', { drillId: drill.id })
            }
          >
            <Card variant="rounded" style={styles.drillCard}>
              <View style={styles.drillRow}>
                <View style={[styles.iconCircle, { backgroundColor: drill.color + '18' }]}>
                  <Ionicons name={drill.icon as any} size={28} color={drill.color} />
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
