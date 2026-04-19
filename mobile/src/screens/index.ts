/**
 * Screen Exports for Tomo
 */

// ─── Athlete Tab Screens (3 tabs — default: Chat) ─────────────────
export { TrainingScreen } from './TrainingScreen';          // Plan tab
export { HomeScreen } from './HomeScreen';                  // Chat tab (default)
export { SignalDashboardScreen } from './SignalDashboardScreen'; // Dashboard tab

// ─── Stack Screens (pushed from tabs) ─────────────────────────────
export { ProfileScreen } from './ProfileScreen';
export { BlazePodDrillsScreen } from './BlazePodDrillsScreen';
// ProgressScreen kept for coach/parent navigators — not an athlete tab.
export { ProgressScreen } from './ProgressScreen';
export { LoginScreen } from './LoginScreen';
export { SignupScreen } from './SignupScreen';
export { AgeGateScreen } from './auth/AgeGateScreen';
export { AwaitingConsentScreen } from './consent/AwaitingConsentScreen';
export { ParentLinkByCodeScreen } from './parent/ParentLinkByCodeScreen';
export { ForgotPasswordScreen } from './ForgotPasswordScreen';
export { CheckinScreen } from './CheckinScreen';
export { NotificationSettingsScreen } from './NotificationSettingsScreen';
export { LeaderboardScreen } from './LeaderboardScreen';
export { HistoryScreen } from './HistoryScreen';
export { WorkoutFeedbackScreen } from './WorkoutFeedbackScreen';
export { AddEventScreen } from './AddEventScreen';
export { DrillDetailScreen } from './DrillDetailScreen';
export { SessionCompleteScreen } from './SessionCompleteScreen';
export { DiagnosticsScreen } from './DiagnosticsScreen';
export { OnboardingScreen } from './OnboardingScreen';
export { PrivacySettingsScreen } from './PrivacySettingsScreen';
