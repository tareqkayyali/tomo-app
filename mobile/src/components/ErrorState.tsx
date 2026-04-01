/**
 * ErrorState Component
 * Reusable error display with retry button
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SmartIcon } from './SmartIcon';
import { Button } from './Button';
import { spacing, borderRadius } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ThemeColors } from '../theme/colors';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
  compact = false,
}: ErrorStateProps) {
  const { colors, typography } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, typography), [colors, typography]);
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <SmartIcon name="alert-circle" size={20} color={colors.warning} />
        <Text style={styles.compactMessage}>{message}</Text>
        {onRetry && (
          <Button title="Retry" onPress={onRetry} variant="ghost" size="small" />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SmartIcon name="cloud-offline-outline" size={48} color={colors.textMuted} />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button
          title="Try Again"
          onPress={onRetry}
          variant="outline"
          size="medium"
          style={styles.retryButton}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, typography: Record<string, any>) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
    },
    message: {
      ...typography.body,
      color: colors.textInactive,
      textAlign: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    retryButton: {
      minWidth: 140,
    },
    compactContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.readinessYellowBg,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    compactMessage: {
      ...typography.bodySmall,
      color: colors.readinessYellow,
      flex: 1,
      marginLeft: spacing.sm,
    },
  });
}
