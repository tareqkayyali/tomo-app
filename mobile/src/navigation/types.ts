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
  Chat: { prefillMessage?: string } | undefined;
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
  EventEdit: {
    eventId: string;
    name: string;
    type: string;
    date: string;
    startTime: string;
    endTime: string;
    notes?: string;
    intensity?: string;
  };
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
  // Padel-specific screens
  ShotDetail: { shotType: string };
  ShotSession: undefined;
  PadelRating: undefined;
  // Football-specific screens
  FootballSkillDetail: { skill: string };
  FootballRating: undefined;
  PlayerCV: undefined;
  FootballTestInput: { testId: string };
  // Rules screen
  MyRules: undefined;
  // Favorites screen
  Favorites: undefined;
  // Study plan screens
  StudyPlanPreview: { blocks: string; warnings?: string; planType?: 'study' | 'training'; exams?: string; config?: string; savedPlanId?: string; viewOnly?: string }; // JSON-stringified
  // Phone-based test screens
  AgilityTest: undefined;
  BalanceTest: undefined;
  JumpTest: undefined;
  ReactionTest: undefined;
  SprintTest: undefined;
  PhoneTestComplete: {
    testId: string;
    testName: string;
    category: string;
    primaryScore: number;
    unit: string;
    metrics: Record<string, number>;
    durationSeconds: number;
  };
  PhoneTestsList: undefined;
  // PHV
  PHVCalculator: { existingOffset?: number; existingStage?: string } | undefined;
  // Plan views (standalone screens)
  StudyPlanView: undefined;
  TrainingPlanView: undefined;
  // Multi-role screens
  Notifications: undefined;
  LinkAccount: undefined;
};

// ── Coach Navigation ─────────────────────────────────────────────────────

export type CoachTabParamList = {
  Players: undefined;
  CoachProfile: undefined;
};

export type CoachStackParamList = {
  CoachTabs: undefined;
  CoachPlayerDetail: { playerId: string; playerName: string };
  CoachPlayerPlan: { playerId: string; playerName: string };
  CoachTestInput: { playerId: string; playerName: string };
  CoachAddProgram: { playerId: string; playerName: string };
  CoachInvite: undefined;
  RecommendEvent: { playerId: string; playerName: string; allowedTypes: string[] };
  Profile: undefined;
};

// ── Parent Navigation ────────────────────────────────────────────────────

export type ParentTabParamList = {
  Children: undefined;
  ParentProfile: undefined;
};

export type ParentStackParamList = {
  ParentTabs: undefined;
  ParentChildDetail: { childId: string; childName: string };
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
