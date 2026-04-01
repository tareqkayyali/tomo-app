/**
 * FavoritesScreen — Pick up to 2 quick-access shortcuts.
 *
 * Simple checklist of available pages. Selected favorites appear
 * on the toolbar across all 5 main tabs. Gen Z minimal aesthetic.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SmartIcon } from '../components/SmartIcon';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { useFavorites, FAVORITE_OPTIONS } from '../hooks/useFavorites';
import { GradientButton } from '../components/GradientButton';
import {
  spacing,
  fontFamily,
  borderRadius,
  layout,
} from '../theme';

const MAX_FAVORITES = 2;

export function FavoritesScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { selectedKeys, setFavorites, isLoaded } = useFavorites();
  const [localKeys, setLocalKeys] = useState<string[]>([]);

  // Sync local state from persisted favorites on load
  useEffect(() => {
    if (isLoaded) setLocalKeys(selectedKeys);
  }, [isLoaded, selectedKeys]);

  const toggle = (key: string) => {
    if (localKeys.includes(key)) {
      // Deselect
      setLocalKeys((prev) => prev.filter((k) => k !== key));
    } else if (localKeys.length < MAX_FAVORITES) {
      // Select
      setLocalKeys((prev) => [...prev, key]);
    } else {
      // Already at max — haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleSave = async () => {
    await setFavorites(localKeys);
    navigation.goBack();
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <SmartIcon name="chevron-back" size={24} color={colors.textOnDark} />
        </Pressable>
        <Text style={styles.title}>Favorites</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.subtitle}>
        Pick up to {MAX_FAVORITES} shortcuts for your toolbar
      </Text>

      {/* Options List */}
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {FAVORITE_OPTIONS.map((option) => {
          const isSelected = localKeys.includes(option.key);
          const isDisabled = !isSelected && localKeys.length >= MAX_FAVORITES;

          return (
            <Pressable
              key={option.key}
              onPress={() => toggle(option.key)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: colors.backgroundElevated,
                  borderColor: isSelected ? colors.accent1 : colors.glassBorder,
                  borderWidth: isSelected ? 1.5 : 1,
                },
                pressed && { opacity: 0.7 },
                isDisabled && { opacity: 0.4 },
              ]}
            >
              {/* Icon Circle */}
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: colors.glass,
                    borderColor: colors.glassBorder,
                  },
                ]}
              >
                <SmartIcon
                  name={option.icon}
                  size={18}
                  color={isSelected ? colors.accent1 : colors.textOnDark}
                />
              </View>

              {/* Label */}
              <Text
                style={[
                  styles.label,
                  { color: isSelected ? colors.textOnDark : colors.textInactive },
                ]}
              >
                {option.label}
              </Text>

              {/* Checkbox */}
              <View
                style={[
                  styles.checkbox,
                  isSelected
                    ? { backgroundColor: colors.accent1, borderColor: colors.accent1 }
                    : { backgroundColor: 'transparent', borderColor: colors.glassBorder },
                ]}
              >
                {isSelected && (
                  <SmartIcon name="checkmark" size={14} color={colors.textPrimary} />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <GradientButton
          title="Save"
          onPress={handleSave}
          icon="checkmark-circle-outline"
        />
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: fontFamily.semiBold,
      fontSize: 20,
      color: colors.textOnDark,
    },
    subtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
      paddingHorizontal: layout.screenMargin,
      marginBottom: spacing.lg,
    },
    list: {
      paddingHorizontal: layout.screenMargin,
      gap: spacing.compact,
      paddingBottom: spacing.xxl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      flex: 1,
      fontFamily: fontFamily.medium,
      fontSize: 15,
      marginLeft: spacing.md,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      paddingHorizontal: layout.screenMargin,
      paddingBottom: spacing.xl,
      paddingTop: spacing.md,
    },
  });
}
