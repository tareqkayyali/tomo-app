/**
 * Authentication Service for Tomo (Supabase)
 * Supports email/password, Google, and Apple sign-in.
 */

import { Platform } from "react-native";
import { supabase } from "./supabase";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";

// Complete the auth session on native so the browser dismisses
if (Platform.OS !== "web") {
  WebBrowser.maybeCompleteAuthSession();
}

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
 * Sign up with email and password.
 * If the Supabase project requires email confirmation, `data.session` will be
 * null even on success. We detect this and throw a user-friendly message so
 * the UI can tell the user to check their inbox.
 */
export async function signUp(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) throw new Error(getAuthErrorMessage(error.message));
  if (!data.user) throw new Error("Sign up failed. Please try again.");

  // If no session was created, email confirmation is required
  if (!data.session) {
    throw new Error(
      "Account created! Please check your email to confirm your address, then sign in."
    );
  }

  return {
    uid: data.user.id,
    email: data.user.email ?? null,
  };
}

/**
 * Sign in with a social provider (Google or Apple).
 *
 * Native: Opens the system browser via expo-web-browser, waits for the
 *         redirect back to the app, then sets the Supabase session.
 * Web:    Redirects the browser to the Supabase OAuth URL; on return
 *         the Supabase client auto-detects the tokens in the URL hash.
 *
 * Returns the AuthUser on success, or throws on failure/cancellation.
 */
export async function signInWithProvider(
  provider: "google" | "apple"
): Promise<AuthUser> {
  if (Platform.OS === "web") {
    // Web: full redirect (Supabase handles the callback automatically)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw new Error(getAuthErrorMessage(error.message));

    // The page will redirect — this code won't be reached.
    // After redirect back, Supabase client detects tokens from the URL hash
    // and onAuthStateChange fires automatically.
    // Return a placeholder; the caller won't use it because the page reloads.
    return { uid: "", email: null };
  }

  // ── Native (iOS / Android) ──────────────────────────────────────────
  const redirectTo = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true, // We handle the browser ourselves
    },
  });

  if (error) throw new Error(getAuthErrorMessage(error.message));
  if (!data.url) throw new Error("Failed to start sign-in. Please try again.");

  // Open the OAuth URL in the system browser
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== "success" || !result.url) {
    throw new Error("Sign-in was cancelled.");
  }

  // Extract tokens from the redirect URL fragment (#access_token=...&refresh_token=...)
  const url = new URL(result.url);

  // Tokens can be in the hash fragment or query params depending on provider
  const params = new URLSearchParams(
    url.hash ? url.hash.substring(1) : url.search
  );
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (!access_token || !refresh_token) {
    throw new Error("Sign-in failed. Missing authentication tokens.");
  }

  // Set the session in Supabase
  const { data: sessionData, error: sessionError } =
    await supabase.auth.setSession({ access_token, refresh_token });

  if (sessionError) throw new Error(getAuthErrorMessage(sessionError.message));
  if (!sessionData.user) throw new Error("Sign-in failed. Please try again.");

  return {
    uid: sessionData.user.id,
    email: sessionData.user.email ?? null,
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
