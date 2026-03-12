/**
 * NotificationBell — Header icon with unread count badge
 * Shows in the header of player screens.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../hooks/useTheme';
import { getNotifications } from '../services/api';

export function NotificationBell() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getNotifications(1)
      .then((res) => setUnreadCount(res.unreadCount || 0))
      .catch(() => {});
  }, []);

  return (
    <Pressable
      onPress={() => {
        // Navigate to notifications screen if it exists, otherwise no-op
        try {
          navigation.navigate('Notifications');
        } catch {
          // Screen not registered yet — that's fine
        }
      }}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name="notifications-outline" size={22} color={colors.textOnDark} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 9 ? '9+' : String(unreadCount)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#E74C3C',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
