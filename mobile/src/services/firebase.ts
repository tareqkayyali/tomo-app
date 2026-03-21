/**
 * Firebase Configuration for Tomo Mobile
 * Auth is handled by Supabase — this file only initializes the Firebase app
 * (used by Firebase Storage in storage.ts).
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';

// Firebase configuration — values from environment or build-time constants
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCLv_u5PCluDt3mMCv-eWrSfJFz71wBPl8",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "kyrai-e2c22.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "kyrai-e2c22",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "kyrai-e2c22.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "560600163065",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "1:560600163065:web:475673acc64031a185f828",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-3J1KZZWPMX",
};

// Initialize Firebase (check if already initialized)
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export default app;
