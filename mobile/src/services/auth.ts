/**
 * Authentication Service for Tomo (Supabase)
 * Replaces Firebase Auth with Supabase Auth.
 */

import { supabase } from "./supabase";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

export interface AuthUser {
  uid: string;
  email: string | null;
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw new Error(getAuthErrorMessage(error.message));

  return {
    uid: data.user.id,
    email: data.user.email ?? null,
  };
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) throw new Error(getAuthErrorMessage(error.message));
  if (!data.user) throw new Error("Sign up failed. Please try again.");

  return {
    uid: data.user.id,
    email: data.user.email ?? null,
  };
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/**
 * Get current user
 */
export function getCurrentUser(): AuthUser | null {
  // Note: This is synchronous but may not reflect the latest state.
  // Prefer using onAuthChange for reactive state.
  return null; // Use getSession() instead for async access
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw new Error(getAuthErrorMessage(error.message));
}

/**
 * Get current user's access token for API calls
 */
export async function getIdToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(
  callback: (user: AuthUser | null) => void
): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event: string, session: Session | null) => {
      if (session?.user) {
        callback({
          uid: session.user.id,
          email: session.user.email ?? null,
        });
      } else {
        callback(null);
      }
    }
  );

  return () => subscription.unsubscribe();
}

/**
 * Convert Supabase error messages to user-friendly messages
 */
function getAuthErrorMessage(message: string): string {
  const lc = message.toLowerCase();

  if (lc.includes("invalid login")) return "Invalid email or password.";
  if (lc.includes("email not confirmed")) return "Please confirm your email address.";
  if (lc.includes("user already registered")) return "An account with this email already exists.";
  if (lc.includes("password")) return "Password should be at least 6 characters.";
  if (lc.includes("rate limit")) return "Too many attempts. Please try again later.";
  if (lc.includes("network")) return "Network error. Please check your connection.";

  return message || "An error occurred. Please try again.";
}
