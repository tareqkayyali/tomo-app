/**
 * Auth Context and Hook for Tomo
 * Manages authentication state across the app
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Constants from 'expo-constants';
import { onAuthChange, signIn, signUp, signOut, AuthUser } from '../services/auth';
import { getUser, registerUser } from '../services/api';
import { initAnalytics, identify, setAnalyticsEnabled, resetAnalytics, track } from '../services/analytics';
import type { User, Sport } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  profile: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsRegistration: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, profileData: {
    name: string;
    age: number;
    sport: Sport;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsRegistration, setNeedsRegistration] = useState(false);

  // Initialize Mixpanel once
  useEffect(() => {
    const token = Constants.expoConfig?.extra?.mixpanelToken;
    if (token) initAnalytics(token);
  }, []);

  // Load user profile from backend
  const loadProfile = async (): Promise<boolean> => {
    try {
      const response = await getUser();
      setProfile(response.user);
      setNeedsRegistration(false);
      // COPPA: enable analytics only for eligible users
      const canTrack = response.user.age >= 13 && (response.user.age >= 18 || !!response.user.parentalConsent);
      setAnalyticsEnabled(canTrack);
      if (canTrack) {
        const bracket = response.user.age < 16 ? '13-15' : response.user.age < 18 ? '16-18' : '18+';
        identify(response.user.uid, {
          sport: response.user.sport, age_bracket: bracket,
          archetype: response.user.archetype || null, region: response.user.region || null,
        });
        track('app_open', { platform: 'mobile' });
      }
      return true;
    } catch (error) {
      // Profile API failed - but don't block the user
      // They can still use the app, just without backend features
      setProfile(null);
      setNeedsRegistration(false); // Don't block - let them in
      return false;
    }
  };

  // Listen to auth state changes
  useEffect(() => {
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

  // Login
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await signIn(email, password);
      // Auth state listener will handle the rest
    } finally {
      setIsLoading(false);
    }
  };

  // Register (create account + profile)
  const register = async (
    email: string,
    password: string,
    profileData: { name: string; age: number; sport: Sport }
  ) => {
    setIsLoading(true);
    try {
      // Create Supabase account
      await signUp(email, password);

      // Try to create profile on backend
      try {
        const response = await registerUser({
          name: profileData.name,
          displayName: profileData.name,
          age: profileData.age,
          sport: profileData.sport,
        });
        setProfile(response.user);
      } catch (apiError) {
        // Create a local profile object so user can proceed
        setProfile({
          id: '',
          uid: '',
          email: email,
          name: profileData.name,
          displayName: profileData.name,
          age: profileData.age,
          sport: profileData.sport,
          totalPoints: 0,
          currentStreak: 0,
          longestStreak: 0,
          streakMultiplier: 1,
          streakFreezeTokens: 0,
          milestonesUnlocked: [],
        });
      }
      setNeedsRegistration(false);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticated: !!user,
        needsRegistration,
        login,
        register,
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
