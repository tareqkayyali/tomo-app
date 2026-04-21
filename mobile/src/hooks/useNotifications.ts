/**
 * useNotifications — Context-based notification state with push token registration.
 *
 * NotificationsProvider wraps the navigation tree.
 * useNotifications() returns centerUnreadCount + hasCriticalUnread from the
 * new notification center (athlete_notifications). Drill assignments, wellness
 * critical, coach assessments, recommendations — all flow through the same
 * system now. The legacy `notifications` table is no longer read.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from './useAuth';
import {
  registerPushToken,
  apiRequest,
} from '../services/api';
import { supabase } from '../services/supabase';
import { onRefresh } from '../utils/refreshBus';
import type { PlayerNotification } from '../types/programme';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationsContextValue {
  /** Deprecated: always empty. Kept for backward-compat of consumers. */
  notifications: PlayerNotification[];
  /** Deprecated: always 0. Use centerUnreadCount. */
  unreadCount: number;
  /** Unread count from the notification center (athlete_notifications) */
  centerUnreadCount: number;
  /** Has any P1 critical notification unread */
  hasCriticalUnread: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => Promise<void>;
  /** Deprecated: always empty. Drill assignments now flow through the new engine. */
  pendingDrillNotifs: PlayerNotification[];
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<PlayerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [centerUnreadCount, setCenterUnreadCount] = useState(0);
  const [hasCriticalUnread, setHasCriticalUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const centerRes = await apiRequest<{ total: number; by_category: Record<string, number> }>(
        '/api/v1/notifications/unread-count',
      ).catch(() => ({ total: 0, by_category: {} }));
      if (mounted.current) {
        setCenterUnreadCount(centerRes.total);
        const byCat = centerRes.by_category as Record<string, number> | undefined;
        setHasCriticalUnread((byCat?.critical ?? 0) > 0);
      }
    } catch (err) {
      console.warn('[useNotifications] Fetch failed:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [profile]);

  // Legacy ops kept as no-ops so existing consumers keep compiling.
  // Center read/markAll flows through NotificationCenterScreen's own handlers.
  const markRead = useCallback((_id: string) => {}, []);

  const markAllRead = useCallback(async () => {
    try {
      await apiRequest('/api/v1/notifications/read-all', { method: 'POST' });
      setCenterUnreadCount(0);
      setHasCriticalUnread(false);
    } catch (err) {
      console.warn('[useNotifications] Mark all read failed:', err);
    }
  }, []);

  // Register push token on mount (players only)
  useEffect(() => {
    if (!profile || profile.role === 'coach') return;

    const registerToken = async () => {
      try {
        // Push tokens only work on native devices, not web
        if (Platform.OS === 'web') return;

        const Device = await import('expo-device');
        if (!Device.isDevice) return;

        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: '7cd0fd4e-b7fa-4bd0-8eb5-b15808e224cc',
        });
        if (tokenData.data) {
          await registerPushToken(tokenData.data, Platform.OS);
        }
      } catch (err) {
        // AbortError is expected on web/simulator — silently ignore
        if (err instanceof Error && err.name === 'AbortError') return;
        console.warn('[push] registration failed:', err);
      }
    };

    registerToken();
  }, [profile]);

  // Load on mount
  useEffect(() => {
    mounted.current = true;
    if (profile) refresh();
    return () => {
      mounted.current = false;
    };
  }, [profile, refresh]);

  // Subscribe to refreshBus 'notifications' target
  useEffect(() => {
    const unsub = onRefresh('notifications', () => {
      if (profile) refresh();
    });
    return unsub;
  }, [profile, refresh]);

  // Supabase Realtime: instant badge updates on new athlete_notifications
  const channelRef = useRef<RealtimeChannel | null>(null);
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notif-center:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'athlete_notifications',
          filter: `athlete_id=eq.${profile.id}`,
        },
        () => {
          // New notification arrived — refresh counts
          if (mounted.current) refresh();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [profile?.id, refresh]);

  // Refresh on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile) refresh();
    });
    return () => sub.remove();
  }, [profile, refresh]);

  // Listen for incoming push notifications while app is open
  useEffect(() => {
    let sub: any;
    const setup = async () => {
      try {
        const Notifications = await import('expo-notifications');
        sub = Notifications.addNotificationReceivedListener(() => {
          refresh();
        });
      } catch (err) {
        console.warn('[useNotifications] expo-notifications not available:', err);
      }
    };
    setup();
    return () => sub?.remove?.();
  }, [refresh]);

  // Handle notification taps — navigate to the relevant screen
  const navigation = useNavigation<any>();
  useEffect(() => {
    let sub: any;
    const setup = async () => {
      try {
        const Notifications = await import('expo-notifications');
        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as
            | { screen?: string; url?: string; [key: string]: any }
            | undefined;
          if (!data) return;

          if (data.screen) {
            navigation.navigate(data.screen, data.params ?? undefined);
          } else if (data.url) {
            Linking.openURL(data.url);
          }

          refresh();
        });
      } catch (err) {
        console.warn('[useNotifications] expo-notifications tap handler not available:', err);
      }
    };
    setup();
    return () => sub?.remove?.();
  }, [navigation, refresh]);

  return React.createElement(
    NotificationsContext.Provider,
    {
      value: {
        notifications,
        unreadCount,
        centerUnreadCount,
        hasCriticalUnread,
        loading,
        refresh,
        markRead,
        markAllRead,
        pendingDrillNotifs: [] as PlayerNotification[],
      },
    },
    children
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    // Fallback for usage outside provider (e.g., coach screens)
    return {
      notifications: [] as PlayerNotification[],
      unreadCount: 0,
      centerUnreadCount: 0,
      hasCriticalUnread: false,
      loading: false,
      refresh: async () => {},
      markRead: (_id: string) => {},
      markAllRead: async () => {},
      pendingDrillNotifs: [] as PlayerNotification[],
    };
  }
  return ctx;
}
