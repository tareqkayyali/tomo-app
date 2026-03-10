/**
 * useHealthKit Hook
 * Manages HealthKit connection state and sleep data syncing.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isHealthKitModuleAvailable,
  requestSleepAuthorization,
  requestFullAuthorization,
  getLastNightSleep,
  getSleepDate,
  getRecentWorkouts,
  getTodayHeartRate,
  getLatestHRV,
  getTodayActivity,
  type HealthKitStatus,
  type HealthKitWorkout,
  type HealthKitHeartRate,
  type HealthKitActivity,
} from '../services/healthKit';
import { syncSleep, getSleepHistory, updateUser } from '../services/api';
import { useAuth } from './useAuth';
import type { SleepLog, User } from '../types';

interface UseHealthKitReturn {
  /** Whether native HealthKit module is available (false in Expo Go / Android) */
  isModuleAvailable: boolean;
  /** Current authorization status */
  authStatus: HealthKitStatus;
  /** Whether HealthKit is connected and authorized */
  isConnected: boolean;
  /** Latest sleep data (from HealthKit or backend) */
  lastSleep: SleepLog | null;
  /** Recent workouts from HealthKit */
  recentWorkouts: HealthKitWorkout[] | null;
  /** Today's heart rate data */
  todayHeartRate: HealthKitHeartRate | null;
  /** Latest HRV (SDNN) value */
  latestHRV: number | null;
  /** Today's steps + active calories */
  todayActivity: HealthKitActivity | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Connect HealthKit (request authorization + sync) */
  connect: () => Promise<boolean>;
  /** Disconnect HealthKit (update user profile) */
  disconnect: () => Promise<void>;
  /** Manually trigger a sync of last night's sleep */
  syncNow: () => Promise<void>;
  /** Sync all health data (sleep, workouts, HR, HRV, activity) */
  syncAll: () => Promise<void>;
}

export function useHealthKit(): UseHealthKitReturn {
  const { profile, refreshProfile } = useAuth();
  const moduleAvailable = isHealthKitModuleAvailable();

  const [authStatus, setAuthStatus] = useState<HealthKitStatus>(
    moduleAvailable ? 'not_determined' : 'unavailable',
  );
  const [lastSleep, setLastSleep] = useState<SleepLog | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<HealthKitWorkout[] | null>(null);
  const [todayHeartRate, setTodayHeartRate] = useState<HealthKitHeartRate | null>(null);
  const [latestHRV, setLatestHRV] = useState<number | null>(null);
  const [todayActivity, setTodayActivity] = useState<HealthKitActivity | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasSyncedRef = useRef(false);

  const isConnected =
    authStatus === 'authorized' && (profile?.healthKitConnected ?? false);

  // Load latest sleep from backend on mount
  useEffect(() => {
    getSleepHistory(1)
      .then((res) => {
        if (res.sleepLogs.length > 0) {
          setLastSleep(res.sleepLogs[0]);
        }
      })
      .catch(() => {
        // Silently fail — backend may be unreachable
      });
  }, []);

  const syncLastNight = useCallback(async () => {
    if (!moduleAvailable) return;
    setIsLoading(true);
    setError(null);

    try {
      const sleepData = await getLastNightSleep();
      if (!sleepData) {
        // No HealthKit data available for last night
        setIsLoading(false);
        return;
      }

      const date = getSleepDate();
      const result = await syncSleep({
        date,
        totalHours: sleepData.totalHours,
        quality: sleepData.quality,
        source: 'healthkit',
        rawSamples: sleepData.rawSamples,
      });

      setLastSleep(result.sleepLog);
    } catch (err) {
      setError((err as Error).message || 'Failed to sync sleep data');
    } finally {
      setIsLoading(false);
    }
  }, [moduleAvailable]);

  // Fetch all health data from HealthKit
  const syncAllHealthData = useCallback(async () => {
    if (!moduleAvailable) return;

    const [workouts, hr, hrv, activity] = await Promise.allSettled([
      getRecentWorkouts(7),
      getTodayHeartRate(),
      getLatestHRV(),
      getTodayActivity(),
    ]);

    if (workouts.status === 'fulfilled' && workouts.value) {
      setRecentWorkouts(workouts.value);
    }
    if (hr.status === 'fulfilled' && hr.value) {
      setTodayHeartRate(hr.value);
    }
    if (hrv.status === 'fulfilled') {
      setLatestHRV(hrv.value);
    }
    if (activity.status === 'fulfilled' && activity.value) {
      setTodayActivity(activity.value);
    }
  }, [moduleAvailable]);

  // Sync sleep + all health data
  const syncAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.allSettled([syncLastNight(), syncAllHealthData()]);
    } catch (err) {
      setError((err as Error).message || 'Failed to sync health data');
    } finally {
      setIsLoading(false);
    }
  }, [syncLastNight, syncAllHealthData]);

  // Auto-sync on mount if already connected (once per session)
  useEffect(() => {
    if (isConnected && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      syncAll();
    }
  }, [isConnected, syncAll]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!moduleAvailable) {
      setError(
        'HealthKit requires a custom dev build. Not available in Expo Go.',
      );
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const status = await requestFullAuthorization();
      setAuthStatus(status);

      if (status === 'authorized') {
        await updateUser({ healthKitConnected: true } as Partial<User>);
        await refreshProfile();
        await syncAll();
        return true;
      } else {
        setError(
          'HealthKit authorization was denied. Enable in Settings > Privacy > Health.',
        );
        return false;
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to connect HealthKit');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [moduleAvailable, refreshProfile, syncAll]);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    try {
      await updateUser({ healthKitConnected: false } as Partial<User>);
      await refreshProfile();
      setAuthStatus('not_determined');
      setRecentWorkouts(null);
      setTodayHeartRate(null);
      setLatestHRV(null);
      setTodayActivity(null);
    } catch (err) {
      setError((err as Error).message || 'Failed to disconnect');
    } finally {
      setIsLoading(false);
    }
  }, [refreshProfile]);

  return {
    isModuleAvailable: moduleAvailable,
    authStatus,
    isConnected,
    lastSleep,
    recentWorkouts,
    todayHeartRate,
    latestHRV,
    todayActivity,
    isLoading,
    error,
    connect,
    disconnect,
    syncNow: syncLastNight,
    syncAll,
  };
}
