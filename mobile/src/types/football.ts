import { colors } from '../theme/colors';
/**
 * Tomo Football Type Definitions
 * Player Card, Skill Mastery, Football Rating Pathway
 *
 * All sub-attributes are physical/time-based measurements from
 * the Tomo Football Metrics Database — no match statistics.
 */

// ═══ FOOTBALL ATTRIBUTES ═══

export type FootballAttribute =
  | 'pace'
  | 'shooting'
  | 'passing'
  | 'dribbling'
  | 'defending'
  | 'physicality';

export const FOOTBALL_ATTRIBUTE_ORDER: FootballAttribute[] = [
  'pace', 'shooting', 'passing', 'dribbling', 'defending', 'physicality',
];

export const FOOTBALL_ATTRIBUTE_LABELS: Record<FootballAttribute, string> = {
  pace: 'PAC',
  shooting: 'SHO',
  passing: 'PAS',
  dribbling: 'DRI',
  defending: 'DEF',
  physicality: 'PHY',
};

export const FOOTBALL_ATTRIBUTE_FULL_NAMES: Record<FootballAttribute, string> = {
  pace: 'Pace',
  shooting: 'Shooting',
  passing: 'Passing',
  dribbling: 'Dribbling',
  defending: 'Defending',
  physicality: 'Physicality',
};

// ═══ SUB-ATTRIBUTES ═══

export interface FootballSubAttribute {
  name: string;
  weight: number;      // 0-1, weights within an attribute sum to 1.0
  description: string;
  unit: string;
}

export interface FootballAttributeConfig {
  label: string;
  abbreviation: string;
  description: string;
  color: string;
  maxValue: number;    // always 99
  subAttributes: FootballSubAttribute[];
}

export const FOOTBALL_ATTRIBUTE_CONFIG: Record<FootballAttribute, FootballAttributeConfig> = {
  pace: {
    label: 'PAC',
    abbreviation: 'PAC',
    description: 'Speed, acceleration, and sprint ability',
    color: colors.info,
    maxValue: 99,
    subAttributes: [
      { name: '5m Sprint', weight: 0.15, description: 'Explosive start over 5 meters', unit: 's' },
      { name: '10m Sprint', weight: 0.15, description: 'Short acceleration phase', unit: 's' },
      { name: '30m Sprint', weight: 0.20, description: 'Mid-range sprint speed', unit: 's' },
      { name: 'Max Sprint Speed', weight: 0.20, description: 'Peak velocity during sprint', unit: 'km/h' },
      { name: 'Flying 20m Sprint', weight: 0.10, description: 'Top speed over 20m with running start', unit: 's' },
      { name: '40m Sprint', weight: 0.10, description: 'Full sprint over 40 meters', unit: 's' },
      { name: 'Repeated Sprint Avg 6x30m', weight: 0.10, description: 'Average time across 6 repeated 30m sprints', unit: 's' },
    ],
  },
  shooting: {
    label: 'SHO',
    abbreviation: 'SHO',
    description: 'Shot power, accuracy, and finishing ability',
    color: colors.accent,
    maxValue: 99,
    subAttributes: [
      { name: 'Shot Power', weight: 0.25, description: 'Maximum ball speed on strike', unit: 'km/h' },
      { name: 'Max Kick Distance', weight: 0.20, description: 'Longest shot distance', unit: 'm' },
      { name: 'Non-Dominant Foot Speed', weight: 0.15, description: 'Ball speed on non-dominant foot', unit: 'km/h' },
      { name: 'Volley Kick Speed', weight: 0.10, description: 'Speed on volley strikes', unit: 'km/h' },
      { name: 'Shooting Drill Score', weight: 0.15, description: 'Accuracy in structured shooting drill', unit: 'pts/10' },
      { name: 'Free Kick Distance', weight: 0.05, description: 'Distance achieved on free kicks', unit: 'm' },
      { name: 'Shot Release Time', weight: 0.10, description: 'Time from ball receipt to shot', unit: 's' },
    ],
  },
  passing: {
    label: 'PAS',
    abbreviation: 'PAS',
    description: 'Passing range, accuracy, and distribution',
    color: colors.accent,
    maxValue: 99,
    subAttributes: [
      { name: 'Long Pass Distance', weight: 0.15, description: 'Maximum accurate long pass range', unit: 'm' },
      { name: 'Pass Speed', weight: 0.15, description: 'Velocity of ground passes', unit: 'km/h' },
      { name: 'Short Pass Drill Time', weight: 0.20, description: 'Time to complete 20-pass circuit', unit: 's' },
      { name: 'Passing Accuracy Drill', weight: 0.20, description: 'Score in structured passing accuracy test', unit: 'pts/20' },
      { name: 'Cross Delivery Distance', weight: 0.10, description: 'Range of crosses from wide positions', unit: 'm' },
      { name: 'Throw-In Distance', weight: 0.10, description: 'Maximum throw-in range', unit: 'm' },
      { name: 'Lofted Pass Hang Time', weight: 0.10, description: 'Air time on lofted through balls', unit: 's' },
    ],
  },
  dribbling: {
    label: 'DRI',
    abbreviation: 'DRI',
    description: 'Agility, ball control, and change of direction',
    color: colors.info,
    maxValue: 99,
    subAttributes: [
      { name: 'T-Test Agility', weight: 0.20, description: 'Time on standard T-test agility course', unit: 's' },
      { name: '5-0-5 COD', weight: 0.15, description: 'Change of direction speed test', unit: 's' },
      { name: 'Illinois Agility Run', weight: 0.15, description: 'Illinois agility test completion time', unit: 's' },
      { name: 'Slalom Dribble 10 Cones', weight: 0.15, description: 'Dribble time through 10-cone slalom', unit: 's' },
      { name: 'Ball Juggling Count', weight: 0.10, description: 'Maximum consecutive juggles', unit: 'reps' },
      { name: 'Reaction Time', weight: 0.15, description: 'Visual reaction speed', unit: 'ms' },
      { name: 'Arrowhead Agility', weight: 0.10, description: 'Arrowhead agility test time', unit: 's' },
    ],
  },
  defending: {
    label: 'DEF',
    abbreviation: 'DEF',
    description: 'Defensive ability, aerial strength, and recovery',
    color: colors.info,
    maxValue: 99,
    subAttributes: [
      { name: 'Standing Vertical Jump', weight: 0.20, description: 'Jump height from standing position', unit: 'cm' },
      { name: 'Header Distance', weight: 0.15, description: 'Distance achieved on headed clearance', unit: 'm' },
      { name: 'Lateral Shuffle 5mx4', weight: 0.15, description: 'Lateral defensive shuffle speed', unit: 's' },
      { name: 'Backward Sprint 10m', weight: 0.15, description: 'Backward sprint over 10 meters', unit: 's' },
      { name: 'Isometric Push Strength', weight: 0.15, description: 'Upper body push strength', unit: 'kg' },
      { name: 'Grip Strength', weight: 0.10, description: 'Hand grip force measurement', unit: 'kg' },
      { name: 'Recovery Run 40m', weight: 0.10, description: 'Recovery sprint back to defensive position', unit: 's' },
    ],
  },
  physicality: {
    label: 'PHY',
    abbreviation: 'PHY',
    description: 'Endurance, power, and physical resilience',
    color: colors.error,
    maxValue: 99,
    subAttributes: [
      { name: 'CMJ Jump Height', weight: 0.20, description: 'Countermovement jump height', unit: 'cm' },
      { name: 'Yo-Yo IR1 Distance', weight: 0.20, description: 'Distance in Yo-Yo Intermittent Recovery Level 1', unit: 'm' },
      { name: 'VO2max', weight: 0.15, description: 'Maximum oxygen consumption', unit: 'mL/kg/min' },
      { name: 'Total Match Distance', weight: 0.15, description: 'Total distance covered in a match', unit: 'm' },
      { name: 'HRV RMSSD', weight: 0.10, description: 'Heart rate variability recovery indicator', unit: 'ms' },
      { name: 'Sleep Duration', weight: 0.10, description: 'Average nightly sleep duration', unit: 'hours' },
      { name: 'Relative Squat Strength', weight: 0.10, description: 'Back squat 1RM relative to body weight', unit: 'xBW' },
    ],
  },
};

// ═══ FOOTBALL SKILLS ═══

export type FootballSkill =
  | 'free_kicks'
  | 'penalties'
  | 'crossing'
  | 'headers'
  | 'tackling'
  | 'long_balls'
  | 'dribble_moves'
  | 'first_touch';

export const FOOTBALL_SKILL_ORDER: FootballSkill[] = [
  'free_kicks', 'penalties', 'crossing', 'headers',
  'tackling', 'long_balls', 'dribble_moves', 'first_touch',
];

export interface FootballSkillSubMetricDef {
  key: string;
  label: string;
  unit: string;
  description: string;
}

export interface FootballSkillConfig {
  type: FootballSkill;
  name: string;
  category: string;
  description: string;
  subMetrics: [FootballSkillSubMetricDef, FootballSkillSubMetricDef, FootballSkillSubMetricDef];
  icon: string;
}

export const FOOTBALL_SKILL_CONFIG: Record<FootballSkill, FootballSkillConfig> = {
  free_kicks: {
    type: 'free_kicks',
    name: 'Free Kicks',
    category: 'Set Piece',
    description: 'Dead ball delivery from free kick situations',
    subMetrics: [
      { key: 'power', label: 'Power', unit: 'km/h', description: 'Ball speed on free kick strike' },
      { key: 'distance', label: 'Distance', unit: 'm', description: 'Maximum effective free kick range' },
      { key: 'accuracyDrill', label: 'Accuracy Drill', unit: 'pts/10', description: 'Score in free kick target drill' },
    ],
    icon: 'football-outline',
  },
  penalties: {
    type: 'penalties',
    name: 'Penalties',
    category: 'Set Piece',
    description: 'Penalty kick execution under pressure',
    subMetrics: [
      { key: 'power', label: 'Power', unit: 'km/h', description: 'Ball speed on penalty strike' },
      { key: 'placementDrill', label: 'Placement Drill', unit: 'pts/5', description: 'Accuracy hitting corner targets' },
      { key: 'releaseTime', label: 'Release Time', unit: 's', description: 'Time from whistle to ball strike' },
    ],
    icon: 'flag-outline',
  },
  crossing: {
    type: 'crossing',
    name: 'Crossing',
    category: 'Wide Play',
    description: 'Delivery of crosses from wide positions',
    subMetrics: [
      { key: 'distance', label: 'Distance', unit: 'm', description: 'Maximum cross delivery range' },
      { key: 'accuracyDrill', label: 'Accuracy Drill', unit: 'pts/10', description: 'Score in crossing accuracy drill' },
      { key: 'deliverySpeed', label: 'Delivery Speed', unit: 'km/h', description: 'Ball speed on crosses' },
    ],
    icon: 'swap-horizontal-outline',
  },
  headers: {
    type: 'headers',
    name: 'Headers',
    category: 'Aerial',
    description: 'Heading ability in attack and defense',
    subMetrics: [
      { key: 'jumpHeight', label: 'Jump Height', unit: 'cm', description: 'Vertical leap height for headers' },
      { key: 'distance', label: 'Distance', unit: 'm', description: 'Distance on headed clearances' },
      { key: 'accuracyDrill', label: 'Accuracy Drill', unit: 'pts/10', description: 'Score in heading accuracy drill' },
    ],
    icon: 'arrow-up-outline',
  },
  tackling: {
    type: 'tackling',
    name: 'Tackling',
    category: 'Defensive',
    description: 'Winning the ball through tackles and interceptions',
    subMetrics: [
      { key: 'recoverySprint', label: 'Recovery Sprint', unit: 's', description: 'Time to recover defensive position' },
      { key: 'lateralSpeed', label: 'Lateral Speed', unit: 's', description: 'Lateral movement speed in 1v1' },
      { key: 'drillScore', label: '1v1 Drill Score', unit: 'pts/10', description: 'Score in 1v1 defensive drill' },
    ],
    icon: 'shield-outline',
  },
  long_balls: {
    type: 'long_balls',
    name: 'Long Balls',
    category: 'Distribution',
    description: 'Long-range passing and switching play',
    subMetrics: [
      { key: 'distance', label: 'Distance', unit: 'm', description: 'Maximum accurate long ball range' },
      { key: 'hangTime', label: 'Hang Time', unit: 's', description: 'Air time on lofted passes' },
      { key: 'accuracyDrill', label: 'Accuracy Drill', unit: 'pts/10', description: 'Score in long ball accuracy drill' },
    ],
    icon: 'navigate-outline',
  },
  dribble_moves: {
    type: 'dribble_moves',
    name: 'Dribble Moves',
    category: 'Ball Control',
    description: 'Skill moves and close ball control in tight spaces',
    subMetrics: [
      { key: 'slalomTime', label: 'Slalom Time', unit: 's', description: 'Dribble time through cone slalom' },
      { key: 'coneDrillTime', label: 'Cone Drill Time', unit: 's', description: 'Time on close-control cone drill' },
      { key: 'juggling', label: 'Juggling', unit: 'reps', description: 'Maximum consecutive ball juggles' },
    ],
    icon: 'git-branch-outline',
  },
  first_touch: {
    type: 'first_touch',
    name: 'First Touch',
    category: 'Ball Control',
    description: 'Receiving and controlling the ball cleanly',
    subMetrics: [
      { key: 'controlDrill', label: 'Control Drill', unit: 'pts/10', description: 'Score in first touch control drill' },
      { key: 'reactionTime', label: 'Reaction Time', unit: 'ms', description: 'Response time to incoming ball' },
      { key: 'passSpeedAfterTouch', label: 'Pass Speed After Touch', unit: 'km/h', description: 'Velocity of pass immediately after receiving' },
    ],
    icon: 'hand-left-outline',
  },
};

// ═══ FOOTBALL POSITIONS ═══

export type FootballPosition = 'GK' | 'CB' | 'FB' | 'CM' | 'CAM' | 'WM' | 'ST';

export const FOOTBALL_POSITION_LABELS: Record<FootballPosition, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre Back',
  FB: 'Full Back',
  CM: 'Central Midfielder',
  CAM: 'Attacking Midfielder',
  WM: 'Wide Midfielder',
  ST: 'Striker',
};

export const FOOTBALL_POSITION_WEIGHTS: Record<FootballPosition, Record<FootballAttribute, number>> = {
  ST:  { pace: 0.15, shooting: 0.25, passing: 0.10, dribbling: 0.20, defending: 0.05, physicality: 0.25 },
  CAM: { pace: 0.10, shooting: 0.15, passing: 0.25, dribbling: 0.20, defending: 0.05, physicality: 0.25 },
  WM:  { pace: 0.20, shooting: 0.15, passing: 0.15, dribbling: 0.25, defending: 0.05, physicality: 0.20 },
  CM:  { pace: 0.10, shooting: 0.10, passing: 0.25, dribbling: 0.15, defending: 0.15, physicality: 0.25 },
  FB:  { pace: 0.15, shooting: 0.05, passing: 0.15, dribbling: 0.10, defending: 0.25, physicality: 0.30 },
  CB:  { pace: 0.10, shooting: 0.05, passing: 0.10, dribbling: 0.05, defending: 0.35, physicality: 0.35 },
  GK:  { pace: 0.10, shooting: 0.05, passing: 0.15, dribbling: 0.05, defending: 0.30, physicality: 0.35 },
};

// ═══ FOOTBALL RATING PATHWAY ═══

export interface FootballRatingLevel {
  name: string;
  minRating: number;
  maxRating: number;
  description: string;
  color: string;
}

export const FOOTBALL_RATING_LEVELS: FootballRatingLevel[] = [
  { name: 'Newcomer',      minRating: 0,   maxRating: 199,  description: 'Just starting your football journey',   color: colors.textSecondary },
  { name: 'Beginner',      minRating: 200, maxRating: 349,  description: 'Learning the fundamentals',             color: colors.warning },
  { name: 'Park Player',   minRating: 350, maxRating: 449,  description: 'Confident in casual play',              color: colors.tierSilver },
  { name: 'Sunday League', minRating: 450, maxRating: 549,  description: 'Competitive recreational player',       color: colors.accent },
  { name: 'Club Player',   minRating: 550, maxRating: 649,  description: 'Regular club-level competitor',         color: colors.info },
  { name: 'Academy Elite', minRating: 650, maxRating: 749,  description: 'Academy standard, scouted talent',      color: colors.info },
  { name: 'Semi-Pro',      minRating: 750, maxRating: 849,  description: 'Semi-professional standard',            color: colors.warning },
  { name: 'Professional',  minRating: 850, maxRating: 929,  description: 'Full professional footballer',          color: colors.accent },
  { name: 'World Class',   minRating: 930, maxRating: 979,  description: 'Among the best in the world',          color: colors.tierGold },
  { name: 'Legend',         minRating: 980, maxRating: 1000, description: 'All-time great, generational talent',  color: colors.error },
];

// ═══ FOOTBALL PLAYER CARD ═══

export interface FootballPlayerCard {
  attributes: Record<FootballAttribute, number>;  // 0-99 per attribute
  overallRating: number;                           // 0-99, weighted by position
  position: FootballPosition;
  skills: Record<FootballSkill, { overall: number; subMetrics: number[] }>;
  pathwayRating: number;                           // 0-1000
  level: FootballRatingLevel;
}

// ═══ FOOTBALL DATA INTERFACES ═══

export interface FootballAttributeData {
  score: number;            // 0-99
  trend: number;            // change from last week (e.g., +3, -1)
  sources: string[];        // e.g. ["sprintTest", "agilityTest"]
  sourcesAvailable: number; // how many sources have data
  sourcesTotal: number;     // total possible sources
}

export interface FootballCardData {
  userId: string;
  overallRating: number;      // 0-99
  attributes: Record<FootballAttribute, FootballAttributeData>;
  position: FootballPosition;
  footballRating: number;     // 0-1000
  footballLevel: string;
  nextMilestone: { name: string; rating: number; pointsNeeded: number } | null;
  updatedAt: string;
  history: Array<{ date: string; overall: number; rating: number }>;
}

export interface FootballHistoryEntry {
  date: string;
  attributes: Record<FootballAttribute, number>;
  overall: number;
  pathwayRating: number;
}

export interface FootballSkillData {
  rating: number;             // 0-100
  subMetrics: Record<string, number>;
  trend: number;
  sessionsLogged: number;
  lastUpdated: string;
  history: Array<{ date: string; rating: number }>;
}

export interface FootballPhysicalMetric {
  name: string;
  unit: string;
  attribute: FootballAttribute;
  rawValue: number;
  rating: number;              // 0-1000
  direction: 'higher' | 'lower';
  collectionMethod: string;
}
