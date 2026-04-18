/**
 * Navigation Types for Tomo v2
 *
 * 3-tab layout:
 * Timeline | Chat (center, raised, tomo logo) | Dashboard
 *
 * Profile removed from tabs → accessible via header icon on every screen.
 */

export type AuthStackParamList = {
  Login: undefined;
  AgeGate: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

// Phase 2 onboarding. Post-auth; player role only.
export type OnboardingStackParamList = {
  Sport: undefined;
  Position: { sport: 'football' | 'soccer' | 'basketball' | 'tennis' | 'padel' };
  HeightWeight: undefined;
  Goal: undefined;
};

export type MainTabParamList = {
  /**
   * Plan (Timeline) tab.
   * Optional `date` (YYYY-MM-DD) focuses the day view on that date on mount /
   * when the param changes — used by the Dashboard week-strip deep link.
   */
  Plan: { date?: string } | undefined;
  Chat: { prefillMessage?: string; autoSend?: boolean } | undefined;
  Dashboard: undefined;
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
    linkedPrograms?: Array<{ programId: string; name: string; category?: string }>;
  };
  PrivacySettings: undefined;
  VisibilityPreferences: undefined;
  ChangePassword: undefined;
  Diagnostics: undefined;
  DrillDetail: { drillId: string };
  DrillCamera: { drillId: string; drillName: string };
  SessionComplete: {
    drillId: string;
    drillName: string;
    sets: number;
    durationSeconds: number;
  };
  FullChat: { preloadMessage?: string } | undefined;
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
  BulkEditEvents: undefined;
  // Multi-role screens
  Notifications: undefined;
  LinkAccount: undefined;
  WhoopData: undefined;
  // GDPR Art. 17 deletion flow
  DeleteAccount: undefined;
};

// ── Coach Navigation ─────────────────────────────────────────────────────

export type CoachTabParamList = {
  CoachDashboard: undefined;
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
  Notifications: undefined;
  NotificationSettings: undefined;
};

// ── Parent Navigation ────────────────────────────────────────────────────

export type ParentTabParamList = {
  Children: undefined;
  ParentProfile: undefined;
};

export type ParentStackParamList = {
  ParentTabs: undefined;
  ParentChildDetail: { childId: string; childName: string; ageTier?: 'T1' | 'T2' | 'T3' | 'UNKNOWN' };
  ParentEducationProgress: { childId: string; childName: string };
  ParentDailyView: { childId: string; childName: string; date: string };
  ParentAddStudy: { childId: string; childName: string };
  ParentAddExam: { childId: string; childName: string };
  ParentInvite: undefined;
  RecommendEvent: { playerId: string; playerName: string; allowedTypes: string[] };
  Profile: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
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
  // Phase 3: child sandbox while parent consent is pending.
  AwaitingConsent: undefined;
};
