/**
 * Auth Context and Hook for Tomo
 * Manages authentication state across the app
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Constants from 'expo-constants';
import { onAuthChange, signIn, signUp, signOut, signInWithProvider, AuthUser } from '../services/auth';
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
  socialLogin: (provider: 'google' | 'apple') => Promise<void>;
  register: (email: string, password: string, profileData: {
    name: string;
    age: number;
    sport: Sport;
  }) => Promise<void>;
  completeRegistration: (profileData: {
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

  // Load user profile from backend.
  // Returns true if profile loaded, false if user needs registration (404).
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

  // Login — load profile directly to avoid race with onAuthChange
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const authUser = await signIn(email, password);
      setUser(authUser);
      await loadProfile();
    } catch (error) {
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
    profileData: { name: string; age: number; sport: Sport }
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
    profileData: { name: string; age: number; sport: Sport }
  ) => {
    setIsLoading(true);
    try {
      const response = await registerUser({
        name: profileData.name,
        displayName: profileData.name,
        age: profileData.age,
        sport: profileData.sport,
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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticated: !!user,
        needsRegistration,
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
