/**
 * Parent Invite Screen
 * Generate and share invite codes for linking parent accounts.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/useTheme';
import { generateInviteCode } from '../../services/api';
import { spacing, borderRadius, fontFamily } from '../../theme';
import type { ParentStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ParentStackParamList, 'ParentInvite'>;

export function ParentInviteScreen({ navigation }: Props) {
  const { colors } = useTheme();

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setCopied(false);
    try {
      const res = await generateInviteCode('parent');
      setCode(res.code);
      setExpiresAt(res.expiresAt);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate invite code.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleShare = useCallback(async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on Tomo! Use this invite code to link our accounts: ${code}`,
      });
    } catch {
      // user cancelled
    }
  }, [code]);

  const formatExpiry = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent1 + '22' }]}>
          <Ionicons name="mail-outline" size={48} color={colors.accent1} />
        </View>

        <Text style={[styles.title, { color: colors.textOnDark }]}>Invite Code</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Generate a code to link your child's account with yours.
        </Text>

        {!code ? (
          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: colors.accent1 }]}
            onPress={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textOnDark} />
            ) : (
              <>
                <Ionicons name="key-outline" size={20} color={colors.textOnDark} />
                <Text style={[styles.generateText, { color: colors.textOnDark }]}>Generate Code</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <>
            {/* Code display */}
            <View style={[styles.codeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.codeText, { color: colors.accent1 }]}>{code}</Text>
            </View>

            {expiresAt && (
              <Text style={[styles.expiryText, { color: colors.textSecondary }]}>
                Expires: {formatExpiry(expiresAt)}
              </Text>
            )}

            {/* Action buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={handleCopy}
              >
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={20}
                  color={copied ? colors.success : colors.textOnDark}
                />
                <Text style={[styles.actionText, { color: copied ? colors.success : colors.textOnDark }]}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.accent1 }]}
                onPress={handleShare}
              >
                <Ionicons name="share-outline" size={20} color={colors.textOnDark} />
                <Text style={[styles.actionText, { color: colors.textOnDark }]}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Regenerate */}
            <TouchableOpacity style={styles.regenerateLink} onPress={handleGenerate}>
              <Text style={[styles.regenerateText, { color: colors.textSecondary }]}>
                Generate a new code
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontFamily: fontFamily.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },

  // Generate button
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  generateText: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
  },

  // Code card
  codeCard: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  codeText: {
    fontSize: 32,
    fontFamily: fontFamily.bold,
    letterSpacing: 4,
    textAlign: 'center',
  },
  expiryText: {
    fontSize: 13,
    marginBottom: spacing.xl,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: spacing.sm,
  },
  actionText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },

  // Regenerate
  regenerateLink: {
    padding: spacing.sm,
  },
  regenerateText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
