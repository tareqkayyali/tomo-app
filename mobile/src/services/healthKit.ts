/**
 * HealthKit Service
 * Wraps @kingstinct/react-native-healthkit with graceful Expo Go degradation.
 *
 * If native module is unavailable (Expo Go), all methods return fallback values.
 * Real HealthKit queries only run in custom dev builds with the native module.
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Runtime availability detection
// ---------------------------------------------------------------------------

type HKModule = typeof import('@kingstinct/react-native-healthkit');

let HK: HKModule | null = null;
let isAvailable = false;

if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    HK = require('@kingstinct/react-native-healthkit') as HKModule;
    isAvailable = true;
  } catch {
    // Native module not linked — running in Expo Go
    isAvailable = false;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthKitSleepData {
  totalHours: number;
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  rawSamples: Array<{
    startDate: string;
    endDate: string;
    value: number;
  }>;
}

export interface HealthKitWorkout {
  type: string;
  duration: number;       // minutes
  energyBurned: number;   // kcal
  distance: number | null; // meters
  startDate: string;
  endDate: string;
}

export interface HealthKitHeartRate {
  avg: number;
  max: number;
  min: number;
  resting: number | null;
}

export interface HealthKitActivity {
  steps: number;
  activeCalories: number;
}

export type HealthKitStatus =
  | 'available'
  | 'unavailable'
  | 'not_determined'
  | 'denied'
  | 'authorized';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if HealthKit native module is linked (false in Expo Go / Android)
 */
export function isHealthKitModuleAvailable(): boolean {
  return isAvailable;
}

/**
 * Request HealthKit authorization for sleep data.
 */
export async function requestSleepAuthorization(): Promise<HealthKitStatus> {
  if (!isAvailable || !HK) return 'unavailable';

  try {
    await HK.requestAuthorization({
      toRead: ['HKCategoryTypeIdentifierSleepAnalysis'],
      toShare: [],
    });
    return 'authorized';
  } catch {
    return 'denied';
  }
}

/**
 * Request full HealthKit authorization for all data types.
 */
export async function requestFullAuthorization(): Promise<HealthKitStatus> {
  if (!isAvailable || !HK) return 'unavailable';

  try {
    await HK.requestAuthorization({
      toRead: [
        'HKCategoryTypeIdentifierSleepAnalysis',
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierRestingHeartRate',
        'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKWorkoutTypeIdentifier',
      ],
      toShare: [],
    });
    return 'authorized';
  } catch {
    return 'denied';
  }
}

/**
 * Query last night's sleep data from HealthKit.
 * "Last night" = samples between yesterday 6PM and today 12PM.
 * Returns null if no data or not authorized.
 */
export async function getLastNightSleep(): Promise<HealthKitSleepData | null> {
  if (!isAvailable || !HK) return null;

  try {
    const now = new Date();
    // Yesterday at 6 PM
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(18, 0, 0, 0);
    // Today at 12 PM
    const end = new Date(now);
    end.setHours(12, 0, 0, 0);

    const samples = await HK.queryCategorySamples(
      'HKCategoryTypeIdentifierSleepAnalysis',
      {
        limit: 0, // 0 = fetch all
        filter: {
          date: {
            startDate: start,
            endDate: end,
          },
        },
      },
    );

    if (!samples || samples.length === 0) return null;

    // Sleep value enum: 0=inBed, 1=asleepUnspecified, 2=awake, 3=asleepCore, 4=asleepDeep, 5=asleepREM
    const sleepValues = new Set([1, 3, 4, 5]);

    // Filter for actual sleep (not IN_BED or AWAKE)
    const sleepSamples = samples.filter((s) => sleepValues.has(s.value));

    // Calculate total sleep duration in hours
    let totalMs = 0;
    for (const sample of sleepSamples) {
      const sampleStart = new Date(sample.startDate).getTime();
      const sampleEnd = new Date(sample.endDate).getTime();
      totalMs += sampleEnd - sampleStart;
    }
    const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;

    // Derive quality
    let quality: HealthKitSleepData['quality'];
    if (totalHours >= 9) quality = 'excellent';
    else if (totalHours >= 8) quality = 'good';
    else if (totalHours >= 6) quality = 'fair';
    else quality = 'poor';

    // Map raw samples for backend storage
    const rawSamples = samples.map((s) => ({
      startDate: new Date(s.startDate).toISOString(),
      endDate: new Date(s.endDate).toISOString(),
      value: s.value,
    }));

    return { totalHours, quality, rawSamples };
  } catch {
    return null;
  }
}

/**
 * Get today's date as YYYY-MM-DD for the sleep log
 */
export function getSleepDate(): string {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Workout queries
// ---------------------------------------------------------------------------

/**
 * Get recent workouts from HealthKit.
 * Returns null if not available.
 */
export async function getRecentWorkouts(days: number = 7): Promise<HealthKitWorkout[] | null> {
  if (!isAvailable || !HK) return null;

  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);

    const workouts = await HK.queryWorkoutSamples({
      limit: 20,
      filter: {
        date: { startDate: start, endDate: now },
      },
    });

    if (!workouts || workouts.length === 0) return null;

    return workouts.map((w: any) => ({
      type: w.workoutActivityType || 'Unknown',
      duration: Math.round((w.duration || 0) / 60),
      energyBurned: Math.round(w.totalEnergyBurned || 0),
      distance: w.totalDistance ? Math.round(w.totalDistance) : null,
      startDate: new Date(w.startDate).toISOString(),
      endDate: new Date(w.endDate).toISOString(),
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Heart rate queries
// ---------------------------------------------------------------------------

/**
 * Get today's heart rate statistics.
 * Returns null if not available.
 */
export async function getTodayHeartRate(): Promise<HealthKitHeartRate | null> {
  if (!isAvailable || !HK) return null;

  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const samples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierHeartRate',
      {
        limit: 0,
        filter: {
          date: { startDate: startOfDay, endDate: now },
        },
      },
    );

    if (!samples || samples.length === 0) return null;

    const values = samples.map((s: any) => s.quantity);
    const avg = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
    const max = Math.round(Math.max(...values));
    const min = Math.round(Math.min(...values));

    // Try to get resting HR
    let resting: number | null = null;
    try {
      const restingSamples = await HK.queryQuantitySamples(
        'HKQuantityTypeIdentifierRestingHeartRate',
        {
          limit: 1,
          filter: {
            date: { startDate: startOfDay, endDate: now },
          },
        },
      );
      if (restingSamples && restingSamples.length > 0) {
        resting = Math.round((restingSamples[0] as any).quantity);
      }
    } catch {
      // Resting HR may not be available
    }

    return { avg, max, min, resting };
  } catch {
    return null;
  }
}

/**
 * Get latest HRV (SDNN) value.
 * Returns null if not available.
 */
export async function getLatestHRV(): Promise<number | null> {
  if (!isAvailable || !HK) return null;

  try {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const samples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      {
        limit: 1,
        filter: {
          date: { startDate: weekAgo, endDate: now },
        },
      },
    );

    if (!samples || samples.length === 0) return null;
    return Math.round((samples[0] as any).quantity);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Activity queries
// ---------------------------------------------------------------------------

/**
 * Get today's steps and active calories.
 * Returns null if not available.
 */
export async function getTodayActivity(): Promise<HealthKitActivity | null> {
  if (!isAvailable || !HK) return null;

  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Steps
    const stepSamples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierStepCount',
      {
        limit: 0,
        filter: {
          date: { startDate: startOfDay, endDate: now },
        },
      },
    );

    const steps = stepSamples
      ? Math.round(stepSamples.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0))
      : 0;

    // Active calories
    const calSamples = await HK.queryQuantitySamples(
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      {
        limit: 0,
        filter: {
          date: { startDate: startOfDay, endDate: now },
        },
      },
    );

    const activeCalories = calSamples
      ? Math.round(calSamples.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0))
      : 0;

    return { steps, activeCalories };
  } catch {
    return null;
  }
}
