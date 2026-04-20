/**
 * ShotSessionScreen — Post-session shot rating flow.
 * Step 1: Pick shots worked (chip selector)
 * Step 2: For each shot, 3 sliders (1-10) — ~5 seconds per shot
 * Step 3: Optional notes → submit → success
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SmartIcon } from '../components/SmartIcon';
import { useSpringEntrance } from '../hooks/useAnimations';
import { ShotSelector } from '../components/ShotSelector';
import { SubMetricSlider } from '../components/SubMetricSlider';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';
import { calculateShotRating } from '../services/padelCalculations';
import { savePadelShotSession } from '../services/api';
import { useSportContext } from '../hooks/useSportContext';
import { colors, fontFamily, borderRadius, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { ShotType, ShotDefinition } from '../types/padel';

type Props = NativeStackScreenProps<MainStackParamList, 'ShotSession'>;

type Step = 'select' | 'rate' | 'notes' | 'success';

export function ShotSessionScreen({ navigation }: Props) {
  const { sportConfig } = useSportContext();
  const [step, setStep] = useState<Step>('select');
  const [selectedShots, setSelectedShots] = useState<ShotType[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<ShotType, Record<string, number>>>({} as any);
  const [notes, setNotes] = useState('');
  const [sessionType, setSessionType] = useState<'training' | 'match'>('training');

  const entrance = useSpringEntrance(0);

  // Build shot definitions lookup from sportConfig
  const shotDefs = useMemo(() => {
    const lookup: Record<string, ShotDefinition> = {};
    for (const skill of sportConfig.fullSkills) {
      lookup[skill.key] = {
        type: skill.key as ShotType,
        name: skill.name,
        category: skill.category ?? '',
        description: skill.description ?? '',
        icon: skill.icon ?? 'help-outline',
        subMetrics: (skill.subMetrics ?? []).slice(0, 3).map(sm => ({
          key: sm.key,
          label: sm.label,
          description: sm.description ?? '',
        })) as [any, any, any],
      };
    }
    return lookup;
  }, [sportConfig.fullSkills]);

  const toggleShot = useCallback((shot: ShotType) => {
    setSelectedShots((prev) =>
      prev.includes(shot)
        ? prev.filter((s) => s !== shot)
        : [...prev, shot],
    );
  }, []);

  const currentShot = selectedShots[currentShotIndex];
  const currentDef = currentShot ? shotDefs[currentShot] : null;
  const currentRatings = currentShot ? (ratings[currentShot] || {}) : {};

  const setSubMetric = useCallback(
    (key: string, val: number) => {
      if (!currentShot) return;
      setRatings((prev) => ({
        ...prev,
        [currentShot]: { ...(prev[currentShot] || {}), [key]: val },
      }));
    },
    [currentShot],
  );

  const hasAllRatings = currentDef
    ? currentDef.subMetrics.every((sm) => currentRatings[sm.key] > 0)
    : false;

  const handleNextShot = () => {
    if (currentShotIndex < selectedShots.length - 1) {
      setCurrentShotIndex((i) => i + 1);
    } else {
      setStep('notes');
    }
  };

  const handleSubmit = () => {
    // Fire-and-forget persist to Supabase
    const shots = selectedShots.map((shot) => {
      const r = ratings[shot] || {};
      const def = shotDefs[shot];
      const vals = def.subMetrics.map((sm: any) => r[sm.key] || 0);
      return {
        shotType: shot,
        subMetrics: r,
        overall: calculateShotRating(vals[0], vals[1], vals[2]),
      };
    });
    savePadelShotSession({ shots, sessionType, notes }).catch((err) =>
      console.warn('[savePadelShotSession] fire-and-forget failed:', err),
    );
    setStep('success');
  };

  // ─── Step: Select Shots ─────────────────────────────────────────
  if (step === 'select') {
    return (
      <PlayerScreen
        label="SESSION"
        title="Rate shots"
        onBack={() => navigation.goBack()}
        contentStyle={styles.content}
      >
        <Animated.View style={entrance}>
          <Text style={styles.pageTitle}>Log Shot Session</Text>
          <Text style={styles.subtitle}>What shots did you work on?</Text>

          {/* Session type toggle */}
          <View style={styles.typeRow}>
            <TypeChip
              label="Training"
              icon="barbell"
              active={sessionType === 'training'}
              onPress={() => setSessionType('training')}
            />
            <TypeChip
              label="Match"
              icon="trophy"
              active={sessionType === 'match'}
              onPress={() => setSessionType('match')}
            />
          </View>

          <View style={styles.selectorWrap}>
            <ShotSelector selected={selectedShots} onToggle={toggleShot} />
          </View>

          {selectedShots.length > 0 && (
            <GradientButton
              title={`Rate ${selectedShots.length} Shot${selectedShots.length > 1 ? 's' : ''}`}
              onPress={() => {
                setCurrentShotIndex(0);
                setStep('rate');
              }}
              icon="arrow-forward"
              style={styles.continueBtn}
            />
          )}
        </Animated.View>
      </PlayerScreen>
    );
  }

  // ─── Step: Rate Each Shot ───────────────────────────────────────
  if (step === 'rate' && currentDef) {
    const computed = hasAllRatings
      ? calculateShotRating(
          currentRatings[currentDef.subMetrics[0].key] || 0,
          currentRatings[currentDef.subMetrics[1].key] || 0,
          currentRatings[currentDef.subMetrics[2].key] || 0,
        )
      : null;

    return (
      <PlayerScreen
        label="SESSION"
        title="Rate shots"
        onBack={() => navigation.goBack()}
        contentStyle={styles.content}
      >
        {/* Progress indicator */}
        <View style={styles.progressRow}>
          {selectedShots.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i <= currentShotIndex && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        <GlassCard>
          <View style={styles.shotHeader}>
            <View>
              <Text style={styles.shotName}>{currentDef.name}</Text>
              <Text style={styles.shotCategory}>{currentDef.category}</Text>
            </View>
            <Text style={styles.shotCounter}>
              {currentShotIndex + 1}/{selectedShots.length}
            </Text>
          </View>

          {/* 3 sub-metric sliders */}
          {currentDef.subMetrics.map((sm) => (
            <SubMetricSlider
              key={sm.key}
              label={sm.label}
              description={sm.description}
              value={currentRatings[sm.key] || 0}
              onChange={(val) => setSubMetric(sm.key, val)}
            />
          ))}

          {/* Computed rating preview */}
          {computed !== null && (
            <View style={styles.computedRow}>
              <Text style={styles.computedLabel}>Shot Rating</Text>
              <Text style={styles.computedValue}>{computed}</Text>
            </View>
          )}
        </GlassCard>

        {hasAllRatings && (
          <GradientButton
            title={
              currentShotIndex < selectedShots.length - 1
                ? 'Next Shot'
                : 'Add Notes'
            }
            onPress={handleNextShot}
            icon="arrow-forward"
            style={styles.continueBtn}
          />
        )}
      </PlayerScreen>
    );
  }

  // ─── Step: Notes ────────────────────────────────────────────────
  if (step === 'notes') {
    return (
      <PlayerScreen
        label="SESSION"
        title="Rate shots"
        onBack={() => navigation.goBack()}
        contentStyle={styles.content}
      >
        <Text style={styles.pageTitle}>Session Notes</Text>
        <Text style={styles.subtitle}>Anything you want to remember?</Text>

        <GlassCard>
          <TextInput
            style={styles.notesInput}
            placeholder="Optional notes..."
            placeholderTextColor={colors.textInactive}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </GlassCard>

        <GradientButton
          title="Submit Session"
          onPress={handleSubmit}
          icon="checkmark-circle"
          style={styles.continueBtn}
        />
      </PlayerScreen>
    );
  }

  // ─── Step: Success ──────────────────────────────────────────────
  return (
    <PlayerScreen
      label="SESSION"
      title="Rate shots"
      onBack={() => navigation.goBack()}
      contentStyle={{ ...styles.content, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={[entrance, styles.successContent]}>
        <View style={styles.successIcon}>
          <SmartIcon name="checkmark-circle" size={64} color={colors.accent} />
        </View>
        <Text style={styles.successTitle}>Session Logged!</Text>
        <Text style={styles.successSubtitle}>
          {selectedShots.length} shot{selectedShots.length > 1 ? 's' : ''} rated
        </Text>

        {/* Summary */}
        <GlassCard style={styles.summaryCard}>
          {selectedShots.map((shot) => {
            const def = shotDefs[shot];
            const r = ratings[shot] || {};
            const vals = def.subMetrics.map((sm) => r[sm.key] || 0);
            const computed = calculateShotRating(vals[0], vals[1], vals[2]);
            return (
              <View key={shot} style={styles.summaryRow}>
                <Text style={styles.summaryName}>{def.name}</Text>
                <Text style={styles.summaryRating}>{computed}</Text>
              </View>
            );
          })}
        </GlassCard>

        <GradientButton
          title="Done"
          onPress={() => navigation.goBack()}
          style={styles.continueBtn}
        />
      </Animated.View>
    </PlayerScreen>
  );
}

function TypeChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View>
      <View
        style={[styles.typeChip, active && styles.typeChipActive]}
      >
        <SmartIcon
          name={icon as any}
          size={16}
          color={active ? colors.textPrimary : colors.textInactive}
        />
        <Text
          style={[styles.typeChipText, active && styles.typeChipTextActive]}
          onPress={onPress}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  pageTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.textOnDark,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    marginBottom: spacing.lg,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  typeChipActive: {
    backgroundColor: colors.accent1,
    borderColor: colors.accent1,
  },
  typeChipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textInactive,
  },
  typeChipTextActive: {
    color: colors.textPrimary,
  },
  selectorWrap: {
    marginBottom: spacing.xl,
  },
  continueBtn: {
    marginTop: spacing.xl,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.glass,
  },
  progressDotActive: {
    backgroundColor: colors.accent1,
  },
  shotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  shotName: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.textOnDark,
  },
  shotCategory: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textInactive,
  },
  shotCounter: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.accent1,
  },
  computedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  computedLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.textOnDark,
  },
  computedValue: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.accent1,
  },
  notesInput: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textOnDark,
    minHeight: 100,
  },
  successContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  successContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  successIcon: {
    marginBottom: spacing.md,
  },
  successTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.textOnDark,
  },
  successSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textInactive,
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  summaryCard: {
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryName: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textOnDark,
  },
  summaryRating: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.accent1,
  },
});
