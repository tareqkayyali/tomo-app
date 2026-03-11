/**
 * Tomo Padel Mock Data Service
 * Demo data for "Osama Kayyali" (based on Khalid Nasser 19yo profile).
 * Serves as the data layer until real API endpoints are wired in.
 */

import type {
  DNACardData,
  ShotRatingsData,
  ShotDefinition,
  ShotType,
  ProPlayerMilestone,
  SportOption,
  PhysicalMetric,
} from '../types/padel';

// ═══ SPORT OPTIONS ═══

export const SPORT_OPTIONS: SportOption[] = [
  { value: 'padel', label: 'Padel', icon: 'tennisball', color: '#2ECC71', available: true },
  { value: 'football', label: 'Football', icon: 'football', color: '#2ECC71', available: false },
  { value: 'basketball', label: 'Basketball', icon: 'basketball', color: '#FF9500', available: false },
  { value: 'tennis', label: 'Tennis', icon: 'tennisball-outline', color: '#3498DB', available: false },
];

// ═══ SHOT DEFINITIONS ═══

export const SHOT_DEFINITIONS: Record<ShotType, ShotDefinition> = {
  bandeja: {
    type: 'bandeja',
    name: 'Bandeja',
    category: 'Overhead',
    description: 'Flat overhead slice — most-used overhead in padel',
    subMetrics: [
      { key: 'consistency', label: 'Consistency', description: 'How often do you execute it cleanly?' },
      { key: 'depth', label: 'Depth', description: 'Does it land deep in the opponent court?' },
      { key: 'placement', label: 'Placement', description: 'Can you direct it to specific zones?' },
    ],
    icon: 'arrow-down-circle',
  },
  vibora: {
    type: 'vibora',
    name: 'V\u00edbora',
    category: 'Overhead',
    description: 'Topspin/sidespin overhead — aggressive but controlled',
    subMetrics: [
      { key: 'spinQuality', label: 'Spin Quality', description: 'How much effective spin do you generate?' },
      { key: 'angleControl', label: 'Angle Control', description: 'Can you vary the angle consistently?' },
      { key: 'aggression', label: 'Aggression', description: 'How much pressure does it create?' },
    ],
    icon: 'flash',
  },
  smash: {
    type: 'smash',
    name: 'Smash',
    category: 'Power',
    description: 'Full power overhead (por 3 or por 4)',
    subMetrics: [
      { key: 'power', label: 'Power', description: 'How hard is your smash?' },
      { key: 'accuracy', label: 'Accuracy', description: 'Does it go where you aim?' },
      { key: 'timing', label: 'Timing', description: 'Do you hit it at the right moment?' },
    ],
    icon: 'flame',
  },
  chiquita: {
    type: 'chiquita',
    name: 'Chiquita',
    category: 'Net Approach',
    description: 'Soft dipping shot to opponents\' feet at the net',
    subMetrics: [
      { key: 'touch', label: 'Touch', description: 'How delicate is your ball control?' },
      { key: 'disguise', label: 'Disguise', description: 'Can opponents read your intention?' },
      { key: 'placement', label: 'Placement', description: 'Does it land at their feet?' },
    ],
    icon: 'water',
  },
  lob: {
    type: 'lob',
    name: 'Lob',
    category: 'Defensive',
    description: 'High deep ball to push opponents back',
    subMetrics: [
      { key: 'heightControl', label: 'Height Control', description: 'Is the trajectory optimal?' },
      { key: 'depth', label: 'Depth', description: 'Does it reach the back glass?' },
      { key: 'pressureHandling', label: 'Under Pressure', description: 'Can you lob well when pressured?' },
    ],
    icon: 'arrow-up-circle',
  },
  bajada: {
    type: 'bajada',
    name: 'Bajada',
    category: 'Off the Wall',
    description: 'Attacking shot off the back glass',
    subMetrics: [
      { key: 'timing', label: 'Timing', description: 'Do you read the glass bounce correctly?' },
      { key: 'powerTransfer', label: 'Power Transfer', description: 'How much pace do you generate?' },
      { key: 'decisionMaking', label: 'Decision', description: 'Do you pick the right moment to attack?' },
    ],
    icon: 'return-down-back',
  },
  volley: {
    type: 'volley',
    name: 'Volley',
    category: 'Net Play',
    description: 'Punch volleys and drop volleys at the net',
    subMetrics: [
      { key: 'reflexes', label: 'Reflexes', description: 'How fast do you react at the net?' },
      { key: 'placement', label: 'Placement', description: 'Can you direct volleys precisely?' },
      { key: 'softHands', label: 'Soft Hands', description: 'Can you absorb pace and play touch volleys?' },
    ],
    icon: 'hand-left',
  },
  serve: {
    type: 'serve',
    name: 'Serve',
    category: 'Serve',
    description: 'Consistency, placement, and spin variation',
    subMetrics: [
      { key: 'firstServePercent', label: 'First Serve %', description: 'How often does your first serve go in?' },
      { key: 'placementAccuracy', label: 'Placement', description: 'Can you hit specific targets?' },
      { key: 'variation', label: 'Variation', description: 'Do you mix speed, spin, and direction?' },
    ],
    icon: 'send',
  },
};

// ═══ DEMO DNA CARD (Osama Kayyali profile) ═══

export const DEMO_DNA_CARD: DNACardData = {
  userId: 'osama-kayyali',
  overallRating: 67,
  tier: 'gold',
  attributes: {
    power: {
      score: 68,
      trend: 3,
      sources: ['jumpTest', 'sprintTest', 'smashRating', 'gripStrength'],
      sourcesAvailable: 4,
      sourcesTotal: 5,
    },
    reflexes: {
      score: 74,
      trend: 1,
      sources: ['reactionTest', 'blazePodAvg', 'volleyRating'],
      sourcesAvailable: 3,
      sourcesTotal: 4,
    },
    control: {
      score: 61,
      trend: 5,
      sources: ['bandeja', 'vibora', 'chiquita', 'lob', 'bajada'],
      sourcesAvailable: 5,
      sourcesTotal: 8,
    },
    stamina: {
      score: 72,
      trend: 2,
      sources: ['hrv', 'sleepDuration', 'restingHR', 'greenDays'],
      sourcesAvailable: 4,
      sourcesTotal: 7,
    },
    agility: {
      score: 70,
      trend: 4,
      sources: ['agilityTest', 'balanceTest', 'sideShuffleDrill'],
      sourcesAvailable: 3,
      sourcesTotal: 5,
    },
    tactics: {
      score: 55,
      trend: 2,
      sources: ['shotVariety', 'matchSelfAssessment', 'planAdherence'],
      sourcesAvailable: 3,
      sourcesTotal: 6,
    },
  },
  padelRating: 612,
  padelLevel: 'Semi-Pro',
  nextMilestone: { name: 'FIP Satellite', rating: 650, pointsNeeded: 38 },
  updatedAt: '2026-02-24T00:00:00Z',
  history: [
    { date: '2026-02-24', overall: 67, rating: 612 },
    { date: '2026-02-17', overall: 66, rating: 604 },
    { date: '2026-02-10', overall: 65, rating: 598 },
    { date: '2026-02-03', overall: 64, rating: 585 },
    { date: '2026-01-27', overall: 62, rating: 570 },
  ],
};

// ═══ DEMO SHOT RATINGS ═══

export const DEMO_SHOT_RATINGS: ShotRatingsData = {
  userId: 'osama-kayyali',
  overallShotMastery: 60,
  shots: {
    bandeja: {
      rating: 63,
      subMetrics: { consistency: 6.3, depth: 6.5, placement: 6.5 },
      trend: 4,
      sessionsLogged: 13,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-20', rating: 54 },
        { date: '2026-01-27', rating: 56 },
        { date: '2026-02-03', rating: 58 },
        { date: '2026-02-10', rating: 60 },
        { date: '2026-02-17', rating: 62 },
        { date: '2026-02-24', rating: 63 },
      ],
    },
    vibora: {
      rating: 49,
      subMetrics: { spinQuality: 5.2, angleControl: 4.5, aggression: 4.7 },
      trend: 6,
      sessionsLogged: 9,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-20', rating: 38 },
        { date: '2026-02-03', rating: 42 },
        { date: '2026-02-17', rating: 48 },
        { date: '2026-02-24', rating: 49 },
      ],
    },
    smash: {
      rating: 72,
      subMetrics: { power: 7.8, accuracy: 6.5, timing: 7.0 },
      trend: 2,
      sessionsLogged: 16,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-20', rating: 66 },
        { date: '2026-01-27', rating: 67 },
        { date: '2026-02-03', rating: 69 },
        { date: '2026-02-10', rating: 70 },
        { date: '2026-02-17', rating: 71 },
        { date: '2026-02-24', rating: 72 },
      ],
    },
    chiquita: {
      rating: 46,
      subMetrics: { touch: 4.0, disguise: 4.8, placement: 4.7 },
      trend: 7,
      sessionsLogged: 7,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-27', rating: 35 },
        { date: '2026-02-10', rating: 40 },
        { date: '2026-02-17', rating: 45 },
        { date: '2026-02-24', rating: 46 },
      ],
    },
    lob: {
      rating: 59,
      subMetrics: { heightControl: 5.0, depth: 6.2, pressureHandling: 6.2 },
      trend: 5,
      sessionsLogged: 11,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-20', rating: 50 },
        { date: '2026-02-03', rating: 53 },
        { date: '2026-02-17', rating: 58 },
        { date: '2026-02-24', rating: 59 },
      ],
    },
    bajada: {
      rating: 53,
      subMetrics: { timing: 5.8, powerTransfer: 4.8, decisionMaking: 5.0 },
      trend: 3,
      sessionsLogged: 10,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-20', rating: 46 },
        { date: '2026-02-03', rating: 49 },
        { date: '2026-02-17', rating: 52 },
        { date: '2026-02-24', rating: 53 },
      ],
    },
    volley: {
      rating: 66,
      subMetrics: { reflexes: 6.0, placement: 6.8, softHands: 6.7 },
      trend: 3,
      sessionsLogged: 19,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-20', rating: 59 },
        { date: '2026-01-27', rating: 61 },
        { date: '2026-02-03', rating: 62 },
        { date: '2026-02-10', rating: 64 },
        { date: '2026-02-17', rating: 65 },
        { date: '2026-02-24', rating: 66 },
      ],
    },
    serve: {
      rating: 70,
      subMetrics: { firstServePercent: 7.2, placementAccuracy: 6.6, variation: 6.9 },
      trend: 1,
      sessionsLogged: 21,
      lastUpdated: '2026-02-24',
      history: [
        { date: '2026-01-20', rating: 66 },
        { date: '2026-01-27', rating: 67 },
        { date: '2026-02-03', rating: 67 },
        { date: '2026-02-10', rating: 68 },
        { date: '2026-02-17', rating: 69 },
        { date: '2026-02-24', rating: 70 },
      ],
    },
  },
  shotVarietyIndex: 75, // 6 of 8 shots > 50 (bandeja, smash, lob, bajada, volley, serve)
  strongestShot: 'smash',
  weakestShot: 'chiquita',
};

// ═══ PRO PLAYER MILESTONES ═══

export const PRO_MILESTONES_MEN: ProPlayerMilestone[] = [
  { rating: 1000, name: 'Agust\u00edn Tapia', reason: '#1 in the world', gender: 'men' },
  { rating: 985, name: 'Arturo Coello', reason: '#2, explosive power', gender: 'men' },
  { rating: 970, name: 'Ale Gal\u00e1n', reason: '#3, supreme consistency', gender: 'men' },
  { rating: 955, name: 'Federico Chingotto', reason: 'Top 5, creativity', gender: 'men' },
  { rating: 940, name: 'Franco Stupaczuk', reason: 'Top 8, power baseline', gender: 'men' },
  { rating: 920, name: 'Juan Lebr\u00f3n', reason: 'Top 10, legendary lefty', gender: 'men' },
  { rating: 900, name: 'Mart\u00edn Di Nenno', reason: 'Top 10, defensive wall', gender: 'men' },
  { rating: 850, name: 'WPT Main Draw Avg', reason: 'Touring professional', gender: 'men' },
  { rating: 800, name: 'WPT Challenger', reason: 'Full-time professional', gender: 'men' },
  { rating: 750, name: 'FIP Rise Winner', reason: 'Breaking into pro tier', gender: 'men' },
  { rating: 700, name: 'Top National Junior', reason: 'Best U18 in country', gender: 'men' },
  { rating: 650, name: 'FIP Satellite', reason: 'Lowest pro tier', gender: 'men' },
  { rating: 600, name: 'National U16 Champ', reason: 'Best junior nationally', gender: 'men' },
  { rating: 500, name: 'Regional Winner', reason: 'Top amateur in region', gender: 'men' },
  { rating: 400, name: 'Strong Club Player', reason: 'Best at typical club', gender: 'men' },
];

export const PRO_MILESTONES_WOMEN: ProPlayerMilestone[] = [
  { rating: 1000, name: 'Ari S\u00e1nchez', reason: '#1 women\'s 2024-25', gender: 'women' },
  { rating: 985, name: 'Paula Josemar\u00eda', reason: '#2, power game', gender: 'women' },
  { rating: 970, name: 'Gemma Triay', reason: '#3, supreme consistency', gender: 'women' },
  { rating: 955, name: 'Delfi Brea', reason: 'Top 5, rising star', gender: 'women' },
  { rating: 940, name: 'Tamara Icardo', reason: 'Top 8, all-around', gender: 'women' },
  { rating: 850, name: 'WPT Women Main Draw', reason: 'Touring professional', gender: 'women' },
  { rating: 700, name: 'Top National Junior Girl', reason: 'Best U18 nationally', gender: 'women' },
];

// ═══ GETTER FUNCTIONS ═══

export function getDNACard(): DNACardData {
  return { ...DEMO_DNA_CARD };
}

export function getShotRatings(): ShotRatingsData {
  return { ...DEMO_SHOT_RATINGS };
}

/**
 * User-aware DNA card getter.
 * Returns demo data only for 'osama-kayyali'; undefined for everyone else.
 */
export function getDNACardForUser(userId: string | undefined): DNACardData | undefined {
  if (!userId) return undefined;
  return { ...DEMO_DNA_CARD, userId };
}

/**
 * User-aware shot ratings getter.
 * Returns demo data only for 'osama-kayyali'; undefined for everyone else.
 */
export function getShotRatingsForUser(userId: string | undefined): ShotRatingsData | undefined {
  if (!userId) return undefined;
  return { ...DEMO_SHOT_RATINGS, userId };
}

export function getProMilestones(gender: 'men' | 'women' = 'men'): ProPlayerMilestone[] {
  return gender === 'men' ? PRO_MILESTONES_MEN : PRO_MILESTONES_WOMEN;
}

export function getShotDefinition(shot: ShotType): ShotDefinition {
  return SHOT_DEFINITIONS[shot];
}

// ═══ DEMO PHYSICAL METRICS ═══

export const DEMO_PHYSICAL_METRICS: PhysicalMetric[] = [
  // Power
  { name: 'CMJ Jump Height', unit: 'cm', dna: 'power', rawValue: 34.2, rating: 618, direction: 'higher', collectionMethod: 'Phone DeviceMotion' },
  { name: 'Smash Speed', unit: 'km/h', dna: 'power', rawValue: 108, rating: 580, direction: 'higher', collectionMethod: 'Radar Gun' },
  { name: '20m Sprint', unit: 's', dna: 'power', rawValue: 3.18, rating: 560, direction: 'lower', collectionMethod: 'Timing Gates' },
  // Reflexes
  { name: 'Simple Reaction', unit: 'ms', dna: 'reflexes', rawValue: 228, rating: 680, direction: 'lower', collectionMethod: 'Phone Tap Test' },
  { name: 'Choice Reaction', unit: 'ms', dna: 'reflexes', rawValue: 298, rating: 645, direction: 'lower', collectionMethod: 'BlazePod' },
  // Control (from shot ratings)
  { name: 'Bandeja Accuracy', unit: '%', dna: 'control', rawValue: 42, rating: 520, direction: 'higher', collectionMethod: 'Coach Rating' },
  { name: 'Volley Accuracy', unit: '%', dna: 'control', rawValue: 52, rating: 550, direction: 'higher', collectionMethod: 'BlazePod Drill' },
  // Stamina
  { name: 'VO2max', unit: 'mL/kg/min', dna: 'stamina', rawValue: 49.5, rating: 620, direction: 'higher', collectionMethod: 'Yo-Yo IR1 Est.' },
  { name: 'Resting HR', unit: 'bpm', dna: 'stamina', rawValue: 64, rating: 610, direction: 'lower', collectionMethod: 'Apple Watch' },
  { name: 'HRV RMSSD', unit: 'ms', dna: 'stamina', rawValue: 78, rating: 590, direction: 'higher', collectionMethod: 'Polar H10' },
  // Agility
  { name: 'Hexagon Test', unit: 's', dna: 'agility', rawValue: 12.1, rating: 590, direction: 'lower', collectionMethod: 'Timing Gates' },
  { name: 'Balance Stability', unit: 'deg', dna: 'agility', rawValue: 2.8, rating: 580, direction: 'lower', collectionMethod: 'Phone Gyroscope' },
  // Tactics
  { name: 'Winners/100pts', unit: 'count', dna: 'tactics', rawValue: 22, rating: 480, direction: 'higher', collectionMethod: 'Match Coding' },
  { name: 'UE/100pts', unit: 'count', dna: 'tactics', rawValue: 40, rating: 420, direction: 'lower', collectionMethod: 'Match Coding' },
];

// ═══ CROSS-TRAINING CONTEXT ═══

export const DEMO_CROSS_SPORT_CONTEXT = {
  userId: 'osama-kayyali',
  primarySport: 'padel',
  secondarySport: 'football',
  crossTrainingBenefits: [
    { from: 'padel.reflexes', to: 'football.dribbling', transferRate: 0.15, description: 'Net reactions improve first touch' },
    { from: 'padel.agility', to: 'football.dribbling', transferRate: 0.12, description: 'Court movement boosts agility' },
    { from: 'padel.power', to: 'football.shooting', transferRate: 0.10, description: 'Smash power transfers to shot power' },
    { from: 'padel.stamina', to: 'football.physicality', transferRate: 0.08, description: 'Cardio base carries over' },
  ],
};
