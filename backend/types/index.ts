// ---- Readiness & Intensity ----

export type ReadinessLevel = "Green" | "Yellow" | "Red";
export type IntensityLevel = "rest" | "light" | "moderate" | "hard";
export type WorkoutType = "rest" | "recovery" | "skill" | "cardio" | "strength";
export type Sport = "football" | "soccer" | "basketball" | "tennis" | "padel";

export const ALLOWED_SPORTS: Sport[] = [
  "football",
  "soccer",
  "basketball",
  "tennis",
  "padel",
];

// ---- Archetype ----

export type Archetype = "phoenix" | "titan" | "blade" | "surge";

export interface ArchetypeDetail {
  emoji: string;
  name: string;
  rarity: string;
  description: string;
  fatalFlaw: string;
  calmMessage: string;
}

export const ArchetypeInfo: Record<Archetype, ArchetypeDetail> = {
  phoenix: {
    emoji: "",
    name: "Phoenix",
    rarity: "uncommon",
    description:
      "Fast recovery, fast fatigue. Thrives on high intensity blocks.",
    fatalFlaw: "Mistakes fast recovery for invincibility",
    calmMessage: "Resist your fire today. Smart rest keeps you explosive.",
  },
  titan: {
    emoji: "",
    name: "Titan",
    rarity: "common",
    description:
      "Slow recovery, high volume tolerance. Thrives on steady accumulation.",
    fatalFlaw: "Chronic stress until sudden burnout",
    calmMessage: "Trust the accumulation. Don't max too often.",
  },
  blade: {
    emoji: "",
    name: "Blade",
    rarity: "rare",
    description:
      "Very slow recovery, extremely high quality when fresh.",
    fatalFlaw: "Overtrains easily; must stop at quality failure",
    calmMessage: "End while sharp. Quality > fatigue.",
  },
  surge: {
    emoji: "🌊",
    name: "Surge",
    rarity: "common",
    description:
      "Variable recovery, thrives on variety and pressure.",
    fatalFlaw: "Boredom leads to slacking or overtraining",
    calmMessage: "Add novelty, not volume. Pressure sim > grind.",
  },
};

// ---- Check-in ----

export interface CheckinInput {
  energy: number;
  soreness: number;
  painFlag: boolean;
  painLocation?: string | null;
  sleepHours: number;
  effortYesterday: number;
  mood: number;
  academicStress?: number | null;
}

export interface Alert {
  type: string;
  message: string;
}

export interface ReadinessResult {
  readiness: ReadinessLevel;
  alerts: Alert[];
  recommendations: string[];
  metrics: CheckinInput;
}

// ---- Plan ----

export interface Exercise {
  exercise: string;
  duration?: string;
  reps?: string;
  sets?: number;
  notes?: string;
}

export interface WorkoutBlock {
  duration: number;
  exercises: Exercise[];
}

export interface DecisionExplanation {
  summary: string;
  factors: string[];
  readinessLevel: ReadinessLevel;
  intensityLevel: IntensityLevel;
}

export interface ArchetypeMessage {
  hasArchetype: boolean;
  archetype?: Archetype;
  emoji?: string;
  name?: string;
  rarity?: string;
  message: string;
  fatalFlaw?: string;
}

export interface GeneratedPlan {
  date: string;
  readiness: ReadinessLevel;
  intensity: IntensityLevel;
  sport: string;
  workoutType: WorkoutType;
  duration: number;
  warmup: Exercise[];
  mainWorkout: Exercise[];
  cooldown: Exercise[];
  focusAreas: string[];
  alerts: Alert[];
  modifications: string[];
  recoveryTips: string[];
  decisionExplanation: DecisionExplanation;
  archetypeMessage: ArchetypeMessage | null;
  disclaimer: string;
}

// ---- Compliance ----

export interface ComplianceEvaluation {
  compliant: boolean;
  points: number;
  reasons: string[];
}

export interface StreakResult {
  streak: number;
  freezeTokens: number;
  usedFreeze: boolean;
  earnedFreeze: boolean;
  lastCompliantDate: string;
}

// ---- User ----

export type UserRole = "player" | "coach" | "parent";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  sport: Sport;
  age?: number;
  role: UserRole;
  displayRole?: string | null;
  archetype?: Archetype | null;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  freezeTokens: number;
  lastCompliantDate?: string | null;
  daysSinceRest: number;
  schoolHours?: number | null;
  examPeriods?: object[] | null;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Relationships ----

export type RelationshipType = "coach" | "parent";
export type RelationshipStatus = "pending" | "accepted" | "declined" | "revoked";

export interface Relationship {
  id: string;
  guardianId: string;
  playerId: string;
  relationshipType: RelationshipType;
  status: RelationshipStatus;
  inviteCode?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  // Populated fields (joined)
  guardianName?: string;
  guardianEmail?: string;
  playerName?: string;
  playerEmail?: string;
  playerSport?: Sport;
  playerAge?: number;
}

export interface PlayerSummary {
  id: string;
  name: string;
  email: string;
  sport: Sport;
  age?: number;
  currentStreak: number;
  totalPoints: number;
  // Snapshot-powered fields (role-filtered via Data Fabric Layer 2)
  readinessRag: string | null;        // GREEN | AMBER | RED
  acwr: number | null;
  dualLoadIndex: number | null;
  wellnessTrend: string | null;       // IMPROVING | STABLE | DECLINING
  lastSessionAt: string | null;
  sessionsTotal: number | null;
  // Legacy fields (backward compat)
  readiness?: ReadinessLevel | null;
  lastCheckinDate?: string | null;
}

// ---- Suggestions ----

export type SuggestionType = "study_block" | "exam_date" | "test_result" | "calendar_event";
export type SuggestionStatus = "pending" | "accepted" | "edited" | "declined" | "expired";

export interface Suggestion {
  id: string;
  playerId: string;
  authorId: string;
  authorRole: UserRole;
  suggestionType: SuggestionType;
  title: string;
  payload: Record<string, unknown>;
  status: SuggestionStatus;
  playerNotes?: string | null;
  resolvedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  // Populated
  authorName?: string;
}

export interface StudyBlockPayload {
  subject: string;
  startAt: string;   // ISO datetime
  endAt: string;     // ISO datetime
  priority?: "high" | "medium" | "low";
  notes?: string;
}

export interface ExamDatePayload {
  subject: string;
  examType: string;  // "mid-term" | "quiz" | "final" | "essay" | "presentation"
  examDate: string;  // ISO date
  notes?: string;
}

export interface TestResultPayload {
  testType: string;
  sport: Sport;
  values: {
    primaryValue: number;
    unit: string;
    label?: string;
  };
  rawInputs?: Record<string, unknown>;
}

// ---- Notifications ----

export type NotificationType =
  | "suggestion_received"
  | "suggestion_resolved"
  | "relationship_accepted"
  | "relationship_declined"
  | "test_result_added"
  | "parent_link_request"
  | "coach_link_request"
  | "study_info_request";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

// ---- Invite Codes ----

export interface InviteCode {
  code: string;
  creatorId: string;
  targetRole: RelationshipType;
  usedBy?: string | null;
  expiresAt: string;
  createdAt: string;
}
