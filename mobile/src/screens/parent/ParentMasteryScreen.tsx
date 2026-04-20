/**
 * Parent Mastery Screen — thin wrapper
 *
 * Child selector chips at top + ProgressScreen with targetPlayerId context.
 * Read-only view of selected child's progress/mastery data.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SmartIcon } from '../../components/SmartIcon';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ProgressScreen } from '../ProgressScreen';
import { PlayerScreen } from '../../components/tomo-ui/playerDesign';
import { useTheme } from '../../hooks/useTheme';
import { getParentChildren } from '../../services/api';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';
import type { ParentTabParamList, ParentStackParamList } from '../../navigation/types';
import type { PlayerSummary } from '../../types';

// @ts-ignore — Legacy tab name, now embedded in ParentChildDetailScreen
type Props = CompositeScreenProps<
  BottomTabScreenProps<ParentTabParamList, 'Children'>,
  NativeStackScreenProps<ParentStackParamList>
>;

export function ParentMasteryScreen({ navigation }: Props) {
  const { colors } = useTheme();

  const [children, setChildren] = useState<PlayerSummary[]>([]);
  const [selectedChild, setSelectedChild] = useState<PlayerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getParentChildren();
        setChildren(res.children);
        if (res.children.length > 0) setSelectedChild(res.children[0]);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const masteryTitle = selectedChild?.name ?? 'Progress';

  if (loading) {
    return (
      <PlayerScreen label="MASTERY" title={masteryTitle} onBack={() => navigation.goBack()} scroll={false}>
        <ActivityIndicator size="large" color={colors.accent1} style={{ marginTop: 60 }} />
      </PlayerScreen>
    );
  }

  if (children.length === 0) {
    return (
      <PlayerScreen label="MASTERY" title={masteryTitle} onBack={() => navigation.goBack()} scroll={false}>
        <View style={styles.emptyContainer}>
          <SmartIcon name="lock-closed-outline" size={40} color={colors.textInactive} />
          <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>
            Waiting for confirmation
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Your child hasn't confirmed the link yet.
          </Text>
        </View>
      </PlayerScreen>
    );
  }

  return (
    <PlayerScreen label="MASTERY" title={masteryTitle} onBack={() => navigation.goBack()} scroll={false}>
      {/* Child selector */}
      {children.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.childSelector}
          contentContainerStyle={styles.childSelectorContent}
        >
          {children.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={[
                styles.childChip,
                {
                  backgroundColor: selectedChild?.id === child.id ? colors.accent1 : colors.surface,
                  borderColor: selectedChild?.id === child.id ? colors.accent1 : colors.border,
                },
              ]}
              onPress={() => setSelectedChild(child)}
            >
              <Text
                style={[
                  styles.childChipText,
                  { color: selectedChild?.id === child.id ? colors.textOnDark : colors.textOnDark },
                ]}
              >
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ProgressScreen — read-only for selected child */}
      {selectedChild && (
        <ProgressScreen
          navigation={navigation as any}
          targetPlayerId={selectedChild.id}
          targetPlayerName={selectedChild.name}
        />
      )}
    </PlayerScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerArea: {
    paddingHorizontal: layout.screenMargin,
    paddingVertical: spacing.sm,
  },
  screenTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
  },
  childSelector: {
    maxHeight: 44,
    marginBottom: spacing.xs,
  },
  childSelectorContent: {
    paddingHorizontal: layout.screenMargin,
    gap: spacing.sm,
  },
  childChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  childChipText: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
