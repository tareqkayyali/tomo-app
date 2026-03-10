/**
 * Firebase Configuration for Tomo Mobile
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  Auth,
  // @ts-expect-error - getReactNativePersistence exists in React Native environment
  getReactNativePersistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCLv_u5PCluDt3mMCv-eWrSfJFz71wBPl8",
  authDomain: "kyrai-e2c22.firebaseapp.com",
  projectId: "kyrai-e2c22",
  storageBucket: "kyrai-e2c22.firebasestorage.app",
  messagingSenderId: "560600163065",
  appId: "1:560600163065:web:475673acc64031a185f828",
  measurementId: "G-3J1KZZWPMX"
};

// Initialize Firebase (check if already initialized)
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with AsyncStorage persistence for React Native
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Auth already initialized, use getAuth
  auth = getAuth(app);
}

export { auth };
export default app;
