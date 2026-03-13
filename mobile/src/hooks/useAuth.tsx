/**
 * Auth Context and Hook for Tomo
 * Manages authentication state across the app
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Constants from 'expo-constants';
import { onAuthChange, signIn, signUp, signOut, signInWithProvider, AuthUser } from '../services/auth';
import { getUser, registerUser } from '../services/api';
import { initAnalytics, identify, setAnalyticsEnabled, resetAnalytics, track } from '../services/analytics';
import type { User, Sport, UserRole } from '../types';

// ── Dev bypass — skip login for rapid testing ──────────────────────
// Set to true to bypass Supabase auth and use mock user data.
// Only works in __DEV__ builds. Set to false before deploying.
const DEV_BYPASS = false;

const DEV_USER: AuthUser = {
  uid: '8c15ffce-6416-4735-beb5-a144cd0ea2b2', // tareq.kayyali@gmail.com in Supabase auth
  email: 'tareq.kayyali@gmail.com',
};

const DEV_PROFILE: User = {
  id: DEV_USER.uid,
  uid: DEV_USER.uid,
  email: 'tareq.kayyali@gmail.com',
  name: 'Tareq',
  displayName: 'Tareq',
  sport: 'football' as Sport,
  age: 17,
  role: 'player' as UserRole,
  archetype: 'phoenix',
  totalPoints: 2450,
  currentStreak: 12,
  longestStreak: 18,
  streakMultiplier: 1.5,
  streakFreezeTokens: 2,
  milestonesUnlocked: ['first_checkin', '7_day_streak', 'bronze_sprinter'],
  onboardingComplete: true,
};

interface AuthContextType {
  user: AuthUser | null;
  profile: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsRegistration: boolean;
  /** Current user role — defaults to 'player' for backward compat */
  role: UserRole;
  /** Dev-only: override role for testing role switching */
  devRoleOverride: UserRole | null;
  /** Dev-only: set role override (triggers navigation fork change) */
  setDevRole: (role: UserRole) => void;
  login: (email: string, password: string) => Promise<void>;
  socialLogin: (provider: 'google' | 'apple') => Promise<void>;
  register: (email: string, password: string, profileData: {
    name: string;
    age?: number;
    sport?: Sport;
    role?: UserRole;
    displayRole?: string;
  }) => Promise<void>;
  completeRegistration: (profileData: {
    name: string;
    age?: number;
    sport?: Sport;
    role?: UserRole;
    displayRole?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(DEV_BYPASS ? DEV_USER : null);
  const [profile, setProfile] = useState<User | null>(DEV_BYPASS ? DEV_PROFILE : null);
  const [isLoading, setIsLoading] = useState(DEV_BYPASS ? false : true);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [devRoleOverride, setDevRoleOverride] = useState<UserRole | null>(null);

  // Initialize Mixpanel once
  useEffect(() => {
    const token = Constants.expoConfig?.extra?.mixpanelToken;
    if (token) initAnalytics(token);
  }, []);

  // Load user profile from backend.
  // Returns true if profile loaded, false if user needs registration (404).
  const loadProfile = async (): Promise<boolean> => {
    try {
      const response = await getUser();
      setProfile(response.user);
      setNeedsRegistration(false);
      // COPPA: enable analytics only for eligible users
      const age = response.user.age || 0;
      const canTrack = age >= 13 && (age >= 18 || !!response.user.parentalConsent);
      setAnalyticsEnabled(canTrack);
      if (canTrack) {
        const bracket = age < 16 ? '13-15' : age < 18 ? '16-18' : '18+';
        identify(response.user.uid, {
          sport: response.user.sport, age_bracket: bracket,
          archetype: response.user.archetype || null, region: response.user.region || null,
          role: response.user.role || 'player',
        });
        track('app_open', { platform: 'mobile', role: response.user.role || 'player' });
      }
      return true;
    } catch (error) {
      setProfile(null);
      // If the error is "User not found" (404), the user signed in via OAuth
      // but hasn't created a backend profile yet → send them to registration.
      const msg = (error as Error).message || '';
      if (msg.includes('not found') || msg.includes('Not found') || msg.includes('User not found')) {
        setNeedsRegistration(true);
      } else {
        // Other API errors (network, server down) — don't block, let them retry
        setNeedsRegistration(false);
      }
      return false;
    }
  };

  // Listen to auth state changes (skipped in DEV_BYPASS mode)
  useEffect(() => {
    if (DEV_BYPASS) {
      console.log('[useAuth] DEV_BYPASS active — skipping auth listener');
      return;
    }

    let didFire = false;

    // Safety timeout: if onAuthStateChange never fires (web edge case),
    // stop loading after 4 seconds so the user sees the login screen.
    const timeout = setTimeout(() => {
      if (!didFire) {
        console.warn('[useAuth] Auth state timeout – falling back to unauthenticated');
        setIsLoading(false);
      }
    }, 4000);

    const unsubscribe = onAuthChange(async (authUser) => {
      didFire = true;
      clearTimeout(timeout);
      setUser(authUser);
      if (authUser) {
        // Try to load profile but don't block if it fails
        await loadProfile();
      } else {
        setProfile(null);
        setNeedsRegistration(false);
      }
      setIsLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // Login — load profile directly to avoid race with onAuthChange
  const login = async (email: string, password: string) => {
    console.log('[useAuth] login called');
    setIsLoading(true);
    try {
      const authUser = await signIn(email, password);
      console.log('[useAuth] signIn succeeded, uid:', authUser.uid);
      setUser(authUser);
      // Load profile but don't let it block login forever — 10s timeout
      try {
        await Promise.race([
          loadProfile(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile load timed out')), 10000)
          ),
        ]);
        console.log('[useAuth] profile loaded');
      } catch (profileErr) {
        console.warn('[useAuth] profile load failed:', (profileErr as Error).message);
        // Auth succeeded even if profile load fails — user is still authenticated
      }
    } catch (error) {
      console.error('[useAuth] login failed:', (error as Error).message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Social login (Google / Apple) via OAuth
  const socialLogin = async (provider: 'google' | 'apple') => {
    setIsLoading(true);
    try {
      const authUser = await signInWithProvider(provider);
      setUser(authUser);
      // Try to load existing profile; if 404, loadProfile sets needsRegistration
      await loadProfile();
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Register (create Supabase account + backend profile)
  const register = async (
    email: string,
    password: string,
    profileData: { name: string; age?: number; sport?: Sport; role?: UserRole; displayRole?: string }
  ) => {
    setIsLoading(true);
    try {
      // 1. Create Supabase account (also signs in if email confirmation is disabled)
      const authUser = await signUp(email, password);
      setUser(authUser);

      // 2. Create profile on backend (requires valid Bearer token from step 1)
      const response = await registerUser({
        name: profileData.name,
        displayName: profileData.name,
        age: profileData.age,
        sport: profileData.sport,
        role: profileData.role,
        displayRole: profileData.displayRole,
      });
      setProfile(response.user);
      setNeedsRegistration(false);
    } catch (error) {
      // Surface the actual error so the UI can show it
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Complete registration for OAuth users (already authenticated, just need backend profile)
  const completeRegistration = async (
    profileData: { name: string; age?: number; sport?: Sport; role?: UserRole; displayRole?: string }
  ) => {
    setIsLoading(true);
    try {
      const response = await registerUser({
        name: profileData.name,
        displayName: profileData.name,
        age: profileData.age,
        sport: profileData.sport,
        role: profileData.role,
        displayRole: profileData.displayRole,
      });
      setProfile(response.user);
      setNeedsRegistration(false);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    resetAnalytics();
    await signOut();
    setProfile(null);
  };

  // Refresh profile
  const refreshProfile = async () => {
    if (user) {
      await loadProfile();
    }
  };

  // Derive role from profile, default to 'player'. Dev override takes precedence.
  const role: UserRole = devRoleOverride || profile?.role || 'player';

  // Dev-only: set role override for testing
  const setDevRole = (newRole: UserRole) => {
    setDevRoleOverride(newRole);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticated: !!user,
        needsRegistration,
        role,
        devRoleOverride,
        setDevRole,
        login,
        socialLogin,
        register,
        completeRegistration,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
