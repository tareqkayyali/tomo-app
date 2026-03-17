/**
 * useNotifications — Context-based notification state with push token registration.
 *
 * NotificationsProvider wraps the navigation tree.
 * useNotifications() returns notifications, unreadCount, refresh, markAllRead.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from './useAuth';
import {
  getPlayerNotifications,
  markAllPlayerNotificationsRead,
  registerPushToken,
} from '../services/api';
import type { PlayerNotification } from '../types/programme';

interface NotificationsContextValue {
  notifications: PlayerNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => Promise<void>;
  /** Pending coach drill notifications (unacted) */
  pendingDrillNotifs: PlayerNotification[];
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<PlayerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const res = await getPlayerNotifications();
      if (mounted.current) {
        setNotifications(res.notifications ?? []);
        setUnreadCount(res.unreadCount ?? 0);
      }
    } catch (err) {
      console.error('[notifications] Fetch failed:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [profile]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await markAllPlayerNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error('[notifications] Mark all read failed:', err);
    }
  }, []);

  // Register push token on mount (players only)
  useEffect(() => {
    if (!profile || profile.role === 'coach') return;

    const registerToken = async () => {
      try {
        const Device = await import('expo-device');
        if (!Device.isDevice) return;

        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;

        const token = (await Notifications.getExpoPushTokenAsync()).data;
        if (token) {
          await registerPushToken(token, Platform.OS);
        }
      } catch {
        // Push token registration is best-effort
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
      } catch {
        // expo-notifications may not be available
      }
    };
    setup();
    return () => sub?.remove?.();
  }, [refresh]);

  const pendingDrillNotifs = notifications.filter(
    (n) => n.type === 'coach_drill_assigned' && !n.isActed
  );

  return React.createElement(
    NotificationsContext.Provider,
    {
      value: {
        notifications,
        unreadCount,
        loading,
        refresh,
        markRead,
        markAllRead,
        pendingDrillNotifs,
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
      loading: false,
      refresh: async () => {},
      markRead: (_id: string) => {},
      markAllRead: async () => {},
      pendingDrillNotifs: [] as PlayerNotification[],
    };
  }
  return ctx;
}
