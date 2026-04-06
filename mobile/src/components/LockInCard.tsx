/**
 * LockInCard — Compact "Lock In" pill button
 *
 * Small inline button shown in the "TODAY'S FLOW" section header.
 * Tap to lock in → shows checkmark + points.
 * Uses AsyncStorage to track daily state (resets each day).
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SmartIcon } from './SmartIcon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';
import { fontFamily, borderRadius } from '../theme';

const STORAGE_PREFIX = 'tomo_lockIn_';

function getTodayKey(): string {
  const d = new Date();
  return `${STORAGE_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function LockInCard() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(getTodayKey()).then((val) => {
      setLocked(val === 'true');
    });
  }, []);

  const handleLockIn = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await AsyncStorage.setItem(getTodayKey(), 'true');
    setLocked(true);
  }, []);

  if (locked === null) return null;

  if (locked) {
    return (
      <View style={[styles.pill, styles.lockedPill]}>
        <SmartIcon name="checkmark-circle" size={13} color={colors.readinessGreen} />
        <Text style={[styles.pillText, { color: colors.readinessGreen }]}>Locked In</Text>
      </View>
    );
  }

  return (
    <Pressable onPress={handleLockIn}>
      <LinearGradient
        colors={colors.gradientOrangeCyan}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.pill}
      >
        <SmartIcon name="lock-closed" size={11} color={colors.textOnAccent} />
        <Text style={[styles.pillText, { color: colors.textOnAccent }]}>Lock In</Text>
      </LinearGradient>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: borderRadius.full,
    },
    lockedPill: {
      backgroundColor: `${colors.readinessGreen}18`,
      borderWidth: 1,
      borderColor: `${colors.readinessGreen}33`,
    },
    pillText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 0.3,
    },
  });
}
