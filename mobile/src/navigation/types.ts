/**
 * Navigation Types for Tomo v2
 *
 * 5-tab layout:
 * Plan | Progress | Chat (center, raised, tomo logo) | Tests | Social
 *
 * Profile removed from tabs → accessible via header icon on every screen.
 */

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Plan: undefined;
  Progress: undefined;
  Chat: undefined;
  Tests: undefined;
  Social: undefined;
};

export type MainStackParamList = {
  MainTabs: undefined;
  Profile: undefined;
  Checkin: undefined;
  EditProfile: undefined;
  NotificationSettings: undefined;
  History: undefined;
  WorkoutFeedback: undefined;
  AddEvent: undefined;
  PrivacySettings: undefined;
  Diagnostics: undefined;
  DrillDetail: { drillId: string };
  DrillCamera: { drillId: string; drillName: string };
  SessionComplete: {
    drillId: string;
    drillName: string;
    sets: number;
    durationSeconds: number;
  };
  FullChat: undefined;
  PhoneTestsList: undefined;
  ReactionTest: undefined;
  JumpTest: undefined;
  SprintTest: undefined;
  AgilityTest: undefined;
  BalanceTest: undefined;
  PhoneTestComplete: {
    testId: string;
    testName: string;
    category: string;
    primaryScore: number;
    unit: string;
    metrics: Record<string, number>;
    durationSeconds: number;
  };
  // Padel-specific screens
  ShotDetail: { shotType: string };
  ShotSession: undefined;
  PadelRating: undefined;
  // Football-specific screens
  FootballSkillDetail: { skill: string };
  FootballRating: undefined;
  FootballTestInput: { testId: string };
};

export type RootStackParamList = {
  Main: undefined;
  Auth: undefined;
  Onboarding: undefined;
};
