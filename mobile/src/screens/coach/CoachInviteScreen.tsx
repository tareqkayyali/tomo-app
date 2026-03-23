/**
 * Coach Invite Screen
 * Generate and share invite codes for linking players.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Share,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { generateInviteCode } from '../../services/api';
import { spacing, borderRadius, layout, fontFamily } from '../../theme';

export function CoachInviteScreen() {
  const { colors } = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await generateInviteCode('coach');
      setCode(res.code);
      setExpiresAt(res.expiresAt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    if (Platform.OS === 'web') {
      window.alert('Invite code copied to clipboard.');
    } else {
      Alert.alert('Copied', 'Invite code copied to clipboard.');
    }
  };

  const handleShare = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on Tomo! Use this invite code to link as my player: ${code}`,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.inner}>
        <Text style={[styles.title, { color: colors.textOnDark }]}>Invite a Player</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Generate a code and share it with your player so they can link their account.
        </Text>

        {!code ? (
          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            style={({ pressed }) => [
              styles.generateButton,
              { backgroundColor: colors.accent1, opacity: pressed || generating ? 0.7 : 1 },
            ]}
          >
            {generating ? (
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <>
                <Ionicons name="key-outline" size={20} color={colors.textOnDark} />
                <Text style={[styles.generateButtonText, { color: colors.textOnDark }]}>Generate Code</Text>
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.codeSection}>
            <View style={[styles.codeCard, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.codeText, { color: colors.accent1 }]}>{code}</Text>
              {expiresAt && (
                <Text style={[styles.expiryText, { color: colors.textInactive }]}>
                  Expires {new Date(expiresAt).toLocaleDateString()}
                </Text>
              )}
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.surfaceElevated, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Ionicons name="copy-outline" size={20} color={colors.accent1} />
                <Text style={[styles.actionButtonText, { color: colors.textOnDark }]}>Copy</Text>
              </Pressable>

              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.accent1, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Ionicons name="share-outline" size={20} color={colors.textOnDark} />
                <Text style={[styles.actionButtonText, { color: colors.textOnDark }]}>Share</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleGenerate}
              style={styles.regenerateLink}
            >
              <Text style={[styles.regenerateText, { color: colors.accent1 }]}>
                Generate New Code
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: layout.screenMargin,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignSelf: 'center',
    paddingHorizontal: spacing.xxl,
  },
  generateButtonText: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
  },
  codeSection: {
    alignItems: 'center',
  },
  codeCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.lg,
  },
  codeText: {
    fontSize: 36,
    fontFamily: fontFamily.bold,
    letterSpacing: 4,
    marginBottom: spacing.sm,
  },
  expiryText: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.compact,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
  regenerateLink: {
    padding: spacing.sm,
  },
  regenerateText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
});
