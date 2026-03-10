/**
 * Tomo Padel Type Definitions
 * DNA Card, Shot Mastery, Padel Rating Pathway
 */

// ═══ DNA CARD ═══

export type DNAAttribute = 'power' | 'reflexes' | 'control' | 'stamina' | 'agility' | 'tactics';
export type DNATier = 'bronze' | 'silver' | 'gold' | 'diamond';

export const DNA_ATTRIBUTE_ORDER: DNAAttribute[] = [
  'power', 'reflexes', 'control', 'stamina', 'agility', 'tactics',
];

export const DNA_ATTRIBUTE_LABELS: Record<DNAAttribute, string> = {
  power: 'POW',
  reflexes: 'REF',
  control: 'CON',
  stamina: 'STA',
  agility: 'AGI',
  tactics: 'TAC',
};

export const DNA_ATTRIBUTE_FULL_NAMES: Record<DNAAttribute, string> = {
  power: 'Power',
  reflexes: 'Reflexes',
  control: 'Control',
  stamina: 'Stamina',
  agility: 'Agility',
  tactics: 'Tactics',
};

export interface DNAAttributeData {
  score: number;            // 0-99
  trend: number;            // change from last week (e.g., +3, -1)
  sources: string[];        // e.g. ["jumpTest", "sprintTest"]
  sourcesAvailable: number; // how many sources have data
  sourcesTotal: number;     // total possible sources
}

export interface DNACardData {
  userId: string;
  overallRating: number;      // 0-99
  tier: DNATier;
  attributes: Record<DNAAttribute, DNAAttributeData>;
  padelRating: number;        // 0-1000
  padelLevel: string;
  nextMilestone: { name: string; rating: number; pointsNeeded: number } | null;
  updatedAt: string;
  history: Array<{ date: string; overall: number; rating: number }>;
}

// ═══ SHOT MASTERY ═══

export type ShotType =
  | 'bandeja'
  | 'vibora'
  | 'smash'
  | 'chiquita'
  | 'lob'
  | 'bajada'
  | 'volley'
  | 'serve';

export const SHOT_ORDER: ShotType[] = [
  'bandeja', 'vibora', 'smash', 'chiquita', 'lob', 'bajada', 'volley', 'serve',
];

export interface ShotSubMetricDef {
  key: string;
  label: string;
  description: string;
}

export interface ShotDefinition {
  type: ShotType;
  name: string;
  category: string;
  description: string;
  subMetrics: [ShotSubMetricDef, ShotSubMetricDef, ShotSubMetricDef];
  icon: string; // Ionicon name
}

export interface ShotData {
  rating: number;             // 0-100
  subMetrics: Record<string, number>; // key → value (1-10 scale)
  trend: number;              // change from last month
  sessionsLogged: number;
  lastUpdated: string;
  history: Array<{ date: string; rating: number }>;
}

export interface ShotRatingsData {
  userId: string;
  overallShotMastery: number; // average of all 8 shots
  shots: Record<ShotType, ShotData>;
  shotVarietyIndex: number;   // % of shots rated > 50
  strongestShot: ShotType;
  weakestShot: ShotType;
}

export interface ShotSessionInput {
  sessionType: 'training' | 'match';
  shotsWorked: ShotType[];
  ratings: Record<ShotType, Record<string, number>>; // shot → sub-metric → value (1-10)
  notes?: string;
}

// ═══ PADEL RATING PATHWAY ═══

export interface PadelRatingLevel {
  range: [number, number];
  name: string;
  description: string;
}

export interface ProPlayerMilestone {
  rating: number;
  name: string;
  reason: string;
  gender: 'men' | 'women';
}

// ═══ SPORT SELECTION ═══

export interface SportOption {
  value: string;
  label: string;
  icon: string;          // Ionicon name
  color: string;         // accent color
  available: boolean;    // true for padel, false = "Coming Soon"
}

// ═══ METRIC DATA ═══

export interface PhysicalMetric {
  name: string;
  unit: string;
  dna: DNAAttribute;
  rawValue: number;
  rating: number;         // 0-1000
  direction: 'higher' | 'lower';
  collectionMethod: string;
}
