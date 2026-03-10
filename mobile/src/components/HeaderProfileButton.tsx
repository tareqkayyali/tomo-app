/**
 * HeaderProfileButton — Profile icon in top-right of every screen
 * Shows user initial or photo. Navigates to Profile screen.
 */

import React from 'react';
import { Pressable, View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { fontFamily } from '../theme';
import { useTheme } from '../hooks/useTheme';

interface HeaderProfileButtonProps {
  photoUrl?: string | null;
  initial?: string;
}

export function HeaderProfileButton({ photoUrl, initial }: HeaderProfileButtonProps) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => navigation.navigate('Profile')}
      accessibilityRole="button"
      accessibilityLabel="View profile"
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.accent1 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.avatar} />
      ) : initial ? (
        <View style={[styles.initialCircle, { backgroundColor: colors.glass }]}>
          <Text style={[styles.initialText, { color: colors.textOnDark }]}>{initial}</Text>
        </View>
      ) : (
        <View style={[styles.iconCircle, { backgroundColor: colors.glass }]}>
          <Ionicons name="person-outline" size={18} color={colors.textOnDark} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  initialCircle: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  iconCircle: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
