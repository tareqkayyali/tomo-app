/**
 * Navigation Types for Tomo v2
 *
 * 5-tab layout:
 * Plan | Test | Chat (center, raised, tomo logo) | Progress | For You
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
  Test: { initialTab?: 'vitals' | 'metrics' | 'programs' } | undefined;
  Chat: undefined;
  Progress: undefined;
  ForYou: undefined;
};

export type MainStackParamList = {
  MainTabs: undefined;
  Profile: undefined;
  Checkin: undefined;
  Settings: undefined;
  NotificationSettings: undefined;
  History: undefined;
  WorkoutFeedback: undefined;
  AddEvent: { initialType?: string; date?: string; startTime?: string } | undefined;
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
  // Rules screen
  MyRules: undefined;
  // Study plan screens
  StudyPlanPreview: { blocks: string; warnings?: string; planType?: 'study' | 'training'; exams?: string; config?: string; savedPlanId?: string; viewOnly?: string }; // JSON-stringified
  // Multi-role screens
  Notifications: undefined;
  LinkAccount: undefined;
};

// ── Coach Navigation ─────────────────────────────────────────────────────

export type CoachTabParamList = {
  Players: undefined;
  Programmes: undefined;
  Settings: undefined;
};

export type CoachStackParamList = {
  CoachTabs: undefined;
  CoachPlayerDetail: { playerId: string; playerName: string };
  CoachPlayerPlan: { playerId: string; playerName: string };
  CoachTestInput: { playerId: string; playerName: string };
  CoachInvite: undefined;
  RecommendEvent: { playerId: string; playerName: string; allowedTypes: string[] };
  Profile: undefined;
};

// ── Parent Navigation ────────────────────────────────────────────────────

export type ParentTabParamList = {
  Timeline: undefined;
  Exams: undefined;
  Mastery: undefined;
  Settings: undefined;
};

export type ParentStackParamList = {
  ParentTabs: undefined;
  ParentDailyView: { childId: string; childName: string; date: string };
  ParentAddStudy: { childId: string; childName: string };
  ParentAddExam: { childId: string; childName: string };
  ParentInvite: undefined;
  RecommendEvent: { playerId: string; playerName: string; allowedTypes: string[] };
  Profile: undefined;
};

// ── Root ─────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Main: undefined;
  CoachMain: undefined;
  ParentMain: undefined;
  Auth: undefined;
  Onboarding: undefined;
  ParentOnboarding: undefined;
  CoachOnboarding: undefined;
};
