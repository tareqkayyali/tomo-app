/**
 * Profile Screen
 * Tomo UI Aesthetic doc Section 9
 *
 * Layout on dark navy (#1A1D2E):
 *   - Avatar (120px, orange border, orange glow) + name + archetype subtitle
 *   - 2 horizontal stat cards (Level, Points) — pastel backgrounds
 *   - Menu stack: Fitness Tests, Settings, Notifications, Privacy
 *   - Logout (red text)
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import type { TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { GlowWrapper, SkeletonCard, SkeletonCircle, SkeletonLine } from '../components';
import { uploadProfilePhoto } from '../services/storage';
import { updateUser } from '../services/api';
import {
  spacing,
  borderRadius,
  shadows,
  layout,
  fontFamily,
} from '../theme';
import type { ThemeColors } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useSportContext } from '../hooks/useSportContext';
import { useFootballProgress } from '../hooks/useFootballProgress';
import { usePadelProgress } from '../hooks/usePadelProgress';
import { getArchetypeProfile } from '../services/archetypeProfile';
import { useFadeIn } from '../hooks/useFadeIn';
import { getPadelLevel } from '../services/padelCalculations';
import { getFootballRatingLevel } from '../services/footballCalculations';
import type { FootballPosition } from '../types/football';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileScreenProps = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Profile'>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLevel(totalPoints: number): number {
  if (totalPoints >= 5000) return 10;
  if (totalPoints >= 3000) return 9;
  if (totalPoints >= 2000) return 8;
  if (totalPoints >= 1500) return 7;
  if (totalPoints >= 1000) return 6;
  if (totalPoints >= 600) return 5;
  if (totalPoints >= 350) return 4;
  if (totalPoints >= 150) return 3;
  if (totalPoints >= 50) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MenuItem({
  icon,
  label,
  onPress,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const { colors, typography } = useTheme();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        !isLast && styles.menuItemBorder,
        pressed && styles.menuItemPressed,
      ]}
    >
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={20} color={colors.textOnDark} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textInactive} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { colors, typography } = useTheme();
  const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);

  const { profile, user, logout, isLoading } = useAuth();
  const { activeSport } = useSportContext();

  // ── Real data hooks (called unconditionally per rules of hooks) ──
  const userId = profile?.uid || profile?.id || '';
  const age = (profile as any)?.age ?? 16;
  const position: FootballPosition = (profile as any)?.position || 'CM';
  const { card: footballCard } = useFootballProgress(userId, age, position);
  const { shotRatings } = usePadelProgress();

  const archetypeProfile = useMemo(
    () => getArchetypeProfile(profile?.archetype),
    [profile?.archetype],
  );

  const totalPoints = profile?.totalPoints ?? 0;
  const level = getLevel(totalPoints);
  const initial = profile?.name?.charAt(0)?.toUpperCase() || '?';
  const [photoUri, setPhotoUri] = useState<string | null>(
    profile?.photoUrl || null,
  );
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePickPhoto = useCallback(async () => {
    Alert.alert('Profile Photo', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
          });
          if (!result.canceled && result.assets[0]) {
            await doUpload(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Photo library access is needed.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
          });
          if (!result.canceled && result.assets[0]) {
            await doUpload(result.assets[0].uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [profile?.uid]);

  const doUpload = useCallback(
    async (uri: string) => {
      if (!profile?.uid) return;
      setUploadingPhoto(true);
      try {
        const url = await uploadProfilePhoto(profile.uid, uri);
        setPhotoUri(url);
        await updateUser({ photoUrl: url } as any);
      } catch {
        Alert.alert('Error', 'Could not upload photo. Please try again.');
      } finally {
        setUploadingPhoto(false);
      }
    },
    [profile?.uid],
  );

  // Hidden diagnostics: tap version text 5 times
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleVersionTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      navigation.navigate('Diagnostics');
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      // Alert.alert doesn't work on web — use window.confirm
      if (window.confirm('Are you sure you want to sign out?')) {
        logout();
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
        ],
      );
    }
  };

  const handleComingSoon = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} will be available in a future update.`);
  };

  // Stagger
  const fadeIn0 = useFadeIn(0);
  const fadeIn1 = useFadeIn(1);
  const fadeIn2 = useFadeIn(2);
  const fadeIn3 = useFadeIn(3);

  // Loading skeleton
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerSection}>
            <SkeletonCircle size={120} />
            <SkeletonLine width="50%" height={20} style={{ marginTop: spacing.md }} />
            <SkeletonLine width="35%" height={14} style={{ marginTop: spacing.sm }} />
          </View>
          <View style={styles.statsRow}>
            <SkeletonCard style={{ flex: 1 }} />
            <SkeletonCard style={{ flex: 1 }} />
          </View>
          <SkeletonCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════════════════════
            Avatar + Name + Archetype
           ═══════════════════════════════════════════════════════════ */}
        <Animated.View style={[styles.headerSection, fadeIn0]}>
          <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto}>
            <GlowWrapper glow="ring">
              <View style={styles.avatarOuter}>
                {uploadingPhoto ? (
                  <View style={styles.avatarInner}>
                    <ActivityIndicator color={colors.accent1} size="large" />
                  </View>
                ) : photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarInner}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>
                )}
              </View>
            </GlowWrapper>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </Pressable>

          <Text style={styles.username} numberOfLines={1}>
            {profile?.displayName || profile?.name || 'Athlete'}
          </Text>
          <Text style={styles.archetype} numberOfLines={1}>
            {archetypeProfile.name} Archetype
          </Text>
          {user?.email && (
            <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
          )}
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════
            Stat Cards — Level + Points (side by side)
           ═══════════════════════════════════════════════════════════ */}
        <Animated.View style={[styles.statsRow, fadeIn1]}>
          <View style={styles.statCard}>
            <Ionicons name="shield-outline" size={22} color={colors.accent1} />
            <Text style={styles.statValue}>{level}</Text>
            <Text style={styles.statLabel}>Level</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="star-outline" size={22} color={colors.accent1} />
            <Text style={styles.statValue}>
              {totalPoints.toLocaleString('en-US')}
            </Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════
            Sport Rating Card — shows active sport's rating
           ═══════════════════════════════════════════════════════════ */}
        {activeSport === 'padel' && shotRatings && (() => {
          const mastery = shotRatings.overallShotMastery;
          const padelLevel = getPadelLevel(mastery);
          return (
            <Animated.View style={fadeIn1}>
              <Pressable
                onPress={() => navigation.navigate('PadelRating')}
                style={({ pressed }) => [
                  styles.padelCard,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.padelTierDot, { backgroundColor: colors.accent1 }]} />
                <View style={styles.padelCardInfo}>
                  <Text style={styles.padelRatingNum}>{mastery}</Text>
                  <Text style={styles.padelLevelText}>{padelLevel}</Text>
                </View>
                <View style={styles.padelTierBadge}>
                  <Text style={[styles.padelTierText, { color: colors.accent1 }]}>
                    Shot Mastery
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textInactive} />
              </Pressable>
            </Animated.View>
          );
        })()}
        {activeSport === 'football' && footballCard && (() => {
          const fbLevel = getFootballRatingLevel(footballCard.footballRating);
          return (
            <Animated.View style={fadeIn1}>
              <Pressable
                onPress={() => navigation.navigate('FootballRating')}
                style={({ pressed }) => [
                  styles.padelCard,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.padelTierDot, { backgroundColor: fbLevel.color }]} />
                <View style={styles.padelCardInfo}>
                  <Text style={styles.padelRatingNum}>{footballCard.overallRating}</Text>
                  <Text style={styles.padelLevelText}>{footballCard.footballLevel}</Text>
                </View>
                <View style={styles.padelTierBadge}>
                  <Text style={[styles.padelTierText, { color: fbLevel.color }]}>
                    {fbLevel.name} {footballCard.footballRating}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textInactive} />
              </Pressable>
            </Animated.View>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════
            Menu Items
           ═══════════════════════════════════════════════════════════ */}
        <Animated.View style={[styles.menuCard, fadeIn2]}>
          {activeSport === 'padel' && (
            <MenuItem
              icon="tennisball"
              label="My Padel Profile"
              onPress={() => navigation.navigate('PadelRating')}
            />
          )}
          {activeSport === 'football' && (
            <MenuItem
              icon="football"
              label="My Football Profile"
              onPress={() => navigation.navigate('FootballRating')}
            />
          )}
          <MenuItem
            icon="watch-outline"
            label="My Vitals"
            onPress={() => navigation.navigate('Settings')}
          />
          <MenuItem
            icon="school-outline"
            label="Study Settings"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <MenuItem
            icon="people-outline"
            label="Link Coach or Parent"
            onPress={() => navigation.navigate('LinkAccount')}
          />
          <MenuItem
            icon="lock-closed-outline"
            label="Privacy"
            onPress={() => navigation.navigate('PrivacySettings')}
            isLast
          />
        </Animated.View>

        {/* ═══════════════════════════════════════════════════════════
            Logout
           ═══════════════════════════════════════════════════════════ */}
        <Animated.View style={fadeIn3}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.logout} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </Animated.View>

        <Pressable onPress={handleVersionTap}>
          <Text style={styles.version}>TOMO v1.0.0</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const AVATAR_SIZE = layout.avatarLarge; // 120px

function createStyles(colors: ThemeColors, typography: Record<string, TextStyle>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: layout.screenMargin,
      paddingTop: spacing.xl,
      paddingBottom: layout.navHeight + spacing.lg,
    },

    // ── Header: Avatar + Name ───────────────────────────────────────
    headerSection: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    avatarOuter: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 4,
      borderColor: colors.accent1,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    avatarInner: {
      width: AVATAR_SIZE - 10,
      height: AVATAR_SIZE - 10,
      borderRadius: (AVATAR_SIZE - 10) / 2,
      backgroundColor: colors.backgroundElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarImage: {
      width: AVATAR_SIZE - 10,
      height: AVATAR_SIZE - 10,
      borderRadius: (AVATAR_SIZE - 10) / 2,
    },
    avatarText: {
      fontFamily: fontFamily.bold,
      fontSize: 44,
      color: colors.textOnDark,
    },
    cameraBadge: {
      position: 'absolute',
      bottom: spacing.md,
      right: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accent1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    username: {
      ...typography.h3,
      color: colors.textOnDark,
    },
    archetype: {
      ...typography.metadata,
      color: colors.accent1,
      marginTop: spacing.xs,
    },
    email: {
      ...typography.metadataSmall,
      color: colors.textInactive,
      marginTop: spacing.xs,
    },

    // ── Stat Cards ──────────────────────────────────────────────────
    statsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    statCard: {
      flex: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.cardLight,
      ...shadows.sm,
    },
    statValue: {
      fontFamily: fontFamily.bold,
      fontSize: 28,
      lineHeight: 34,
      color: colors.textOnLight,
    },
    statLabel: {
      ...typography.metadataSmall,
      color: colors.textMuted,
    },

    // ── Padel Rating Card ─────────────────────────────────────────
    padelCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardLight,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      marginBottom: spacing.xl,
      gap: spacing.md,
      ...shadows.sm,
    },
    padelTierDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    padelCardInfo: {
      flex: 1,
    },
    padelRatingNum: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.accent1,
    },
    padelLevelText: {
      fontFamily: fontFamily.medium,
      fontSize: 13,
      color: colors.textOnDark,
      marginTop: 1,
    },
    padelTierBadge: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    padelTierText: {
      fontFamily: fontFamily.semiBold,
      fontSize: 12,
    },

    // ── Menu ────────────────────────────────────────────────────────
    menuCard: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      marginBottom: spacing.xl,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    menuItemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    menuItemPressed: {
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    menuIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.06)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.md,
    },
    menuLabel: {
      ...typography.body,
      color: colors.textOnDark,
      flex: 1,
    },

    // ── Logout ──────────────────────────────────────────────────────
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    logoutText: {
      ...typography.button,
      color: colors.logout,
    },

    // ── Version ─────────────────────────────────────────────────────
    version: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
}
