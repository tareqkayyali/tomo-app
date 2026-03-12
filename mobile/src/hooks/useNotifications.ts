/**
 * useNotifications — fetch notifications + subscribe to Supabase Realtime
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getNotifications } from '../services/api';
import type { AppNotification } from '../types';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const mounted = useRef(true);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getNotifications(50);
      if (mounted.current) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch {
      // Silently fail — notifications are secondary
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchNotifications();
    return () => {
      mounted.current = false;
    };
  }, [fetchNotifications]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    refresh: fetchNotifications,
    markRead,
    markAllRead,
  };
}
