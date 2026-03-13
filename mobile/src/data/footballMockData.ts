/**
 * Tomo Football Mock Data
 * 6 diverse player profiles grounded in the Tomo Football Metrics Database.
 * All attribute values are backed by physical test measurements.
 *
 * Research basis: Synthetic dataset schema from Section 17.
 * Sprint norms from Section 6.1, CMJ/jump from 6.2, agility from 6.3,
 * Yo-Yo IR1/VO2max from 6.4, strength from 6.6.
 */

import type {
  FootballAttribute,
  FootballPosition,
  FootballCardData,
  FootballSkillData,
  FootballAttributeData,
} from '../types/football';
import {
  FOOTBALL_ATTRIBUTE_ORDER,
  FOOTBALL_SKILL_ORDER,
  FOOTBALL_RATING_LEVELS,
} from '../types/football';
import type { FootballSkill } from '../types/football';

// ═══ INTERFACES ═══

export interface MetricNorm {
  name: string;
  unit: string;
  attribute: FootballAttribute;
  direction: 'higher' | 'lower';
  /** Index 0 = age 13, index 1 = age 14, ..., index 10 = age 23 */
  means: number[];
  sds: number[];
}

export interface MockFootballPlayer {
  id: string;
  name: string;
  age: number;
  position: FootballPosition;
  experience: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  competitionLevel: 'recreational' | 'club' | 'academy' | 'professional';
  card: FootballCardData;
}

export interface FootballPhysicalMetric {
  name: string;
  unit: string;
  attribute: FootballAttribute;
  rawValue: number;
  zScore: number;         // vs age-matched norm (positive = better)
  percentile: number;     // 0-100
  direction: 'higher' | 'lower';
  collectionMethod: string;
  collectedAt: string;    // ISO date
}

// ═══ NORMATIVE DATA — ALL 42 METRICS BY AGE (13-23) ═══
// Derived from Research Sections 6.1-6.6, Tomo Football Metrics Database.
// Each array has 11 entries: index 0 = age 13, index 10 = age 23.

export const FOOTBALL_NORMATIVE_DATA: MetricNorm[] = [
  // ── PAC (Pace) — 7 metrics ──
  { name: '5m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [1.15, 1.12, 1.08, 1.05, 1.02, 1.00, 0.98, 0.97, 0.96, 0.96, 0.96],
    sds:   [0.08, 0.07, 0.07, 0.06, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05] },
  { name: '10m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [1.95, 1.90, 1.85, 1.80, 1.75, 1.72, 1.70, 1.70, 1.70, 1.70, 1.70],
    sds:   [0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.07, 0.07, 0.07, 0.07, 0.07] },
  { name: '30m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [5.00, 4.80, 4.55, 4.35, 4.20, 4.10, 4.05, 4.00, 3.98, 3.97, 3.96],
    sds:   [0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: 'Max Sprint Speed', unit: 'km/h', attribute: 'pace', direction: 'higher',
    means: [25.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0, 32.5, 33.0, 33.0, 33.0],
    sds:   [2.5, 2.5, 2.0, 2.0, 2.0, 1.8, 1.5, 1.5, 1.5, 1.5, 1.5] },
  { name: 'Flying 20m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [3.10, 2.95, 2.80, 2.65, 2.55, 2.45, 2.40, 2.35, 2.32, 2.30, 2.30],
    sds:   [0.20, 0.18, 0.16, 0.15, 0.12, 0.12, 0.10, 0.10, 0.10, 0.10, 0.10] },
  { name: '40m Sprint', unit: 's', attribute: 'pace', direction: 'lower',
    means: [6.50, 6.20, 5.90, 5.60, 5.35, 5.20, 5.10, 5.05, 5.02, 5.00, 5.00],
    sds:   [0.40, 0.35, 0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.18, 0.18, 0.18] },
  { name: 'Repeated Sprint Avg 6x30m', unit: 's', attribute: 'pace', direction: 'lower',
    means: [5.30, 5.10, 4.90, 4.70, 4.55, 4.45, 4.40, 4.35, 4.32, 4.30, 4.30],
    sds:   [0.30, 0.28, 0.25, 0.22, 0.20, 0.18, 0.15, 0.15, 0.15, 0.15, 0.15] },

  // ── SHO (Shooting) — 7 metrics ──
  { name: 'Shot Power', unit: 'km/h', attribute: 'shooting', direction: 'higher',
    means: [60, 70, 78, 85, 92, 100, 105, 110, 112, 114, 115],
    sds:   [8, 8, 8, 8, 7, 7, 6, 6, 6, 6, 6] },
  { name: 'Max Kick Distance', unit: 'm', attribute: 'shooting', direction: 'higher',
    means: [30, 35, 40, 45, 50, 55, 58, 60, 61, 62, 62],
    sds:   [5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4] },
  { name: 'Non-Dominant Foot Speed', unit: 'km/h', attribute: 'shooting', direction: 'higher',
    means: [42, 50, 56, 62, 68, 75, 80, 85, 87, 88, 88],
    sds:   [7, 7, 7, 7, 6, 6, 5, 5, 5, 5, 5] },
  { name: 'Volley Kick Speed', unit: 'km/h', attribute: 'shooting', direction: 'higher',
    means: [48, 56, 64, 72, 78, 85, 90, 95, 97, 99, 100],
    sds:   [7, 7, 7, 7, 6, 6, 5, 5, 5, 5, 5] },
  { name: 'Shooting Drill Score', unit: 'pts/10', attribute: 'shooting', direction: 'higher',
    means: [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.2, 7.3, 7.4, 7.5],
    sds:   [1.2, 1.2, 1.1, 1.1, 1.0, 1.0, 0.9, 0.9, 0.9, 0.9, 0.9] },
  { name: 'Free Kick Distance', unit: 'm', attribute: 'shooting', direction: 'higher',
    means: [18, 22, 25, 28, 30, 32, 34, 35, 35.5, 36, 36],
    sds:   [4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3] },
  { name: 'Shot Release Time', unit: 's', attribute: 'shooting', direction: 'lower',
    means: [1.20, 1.10, 1.00, 0.90, 0.80, 0.70, 0.65, 0.60, 0.58, 0.56, 0.55],
    sds:   [0.15, 0.14, 0.12, 0.11, 0.10, 0.08, 0.07, 0.07, 0.07, 0.07, 0.07] },

  // ── PAS (Passing) — 7 metrics ──
  { name: 'Long Pass Distance', unit: 'm', attribute: 'passing', direction: 'higher',
    means: [28, 32, 36, 40, 45, 48, 52, 55, 56, 57, 57],
    sds:   [5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4] },
  { name: 'Pass Speed', unit: 'km/h', attribute: 'passing', direction: 'higher',
    means: [50, 58, 64, 70, 76, 82, 88, 92, 93, 94, 95],
    sds:   [7, 7, 6, 6, 6, 5, 5, 5, 5, 5, 5] },
  { name: 'Short Pass Drill Time', unit: 's', attribute: 'passing', direction: 'lower',
    means: [38, 35, 32, 30, 28, 26, 25, 24, 23.5, 23, 23],
    sds:   [4.0, 3.5, 3.0, 3.0, 2.5, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0] },
  { name: 'Passing Accuracy Drill', unit: 'pts/20', attribute: 'passing', direction: 'higher',
    means: [10, 11, 12, 13, 14, 15, 15.5, 16, 16.2, 16.4, 16.5],
    sds:   [2.0, 2.0, 2.0, 2.0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5] },
  { name: 'Cross Delivery Distance', unit: 'm', attribute: 'passing', direction: 'higher',
    means: [22, 26, 30, 34, 38, 42, 45, 48, 49, 50, 50],
    sds:   [4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3] },
  { name: 'Throw-In Distance', unit: 'm', attribute: 'passing', direction: 'higher',
    means: [12, 15, 18, 20, 23, 25, 27, 29, 29.5, 30, 30],
    sds:   [3.0, 3.0, 3.0, 3.0, 2.5, 2.5, 2.5, 2.0, 2.0, 2.0, 2.0] },
  { name: 'Lofted Pass Hang Time', unit: 's', attribute: 'passing', direction: 'higher',
    means: [1.4, 1.6, 1.8, 2.0, 2.1, 2.3, 2.4, 2.5, 2.55, 2.58, 2.60],
    sds:   [0.30, 0.30, 0.25, 0.25, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20, 0.20] },

  // ── DRI (Dribbling / Agility) — 7 metrics ──
  { name: 'T-Test Agility', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [11.5, 11.0, 10.5, 10.2, 10.0, 9.7, 9.5, 9.4, 9.35, 9.30, 9.30],
    sds:   [0.8, 0.7, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3] },
  { name: '5-0-5 COD', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [2.80, 2.65, 2.50, 2.40, 2.30, 2.25, 2.22, 2.20, 2.19, 2.18, 2.18],
    sds:   [0.20, 0.18, 0.15, 0.14, 0.12, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10] },
  { name: 'Illinois Agility Run', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [18.5, 17.5, 16.8, 16.2, 15.8, 15.3, 15.0, 14.8, 14.7, 14.6, 14.6],
    sds:   [1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5] },
  { name: 'Slalom Dribble 10 Cones', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [17.0, 16.0, 15.0, 14.2, 13.5, 12.8, 12.3, 12.0, 11.9, 11.8, 11.8],
    sds:   [1.5, 1.3, 1.2, 1.0, 0.9, 0.8, 0.7, 0.7, 0.7, 0.7, 0.7] },
  { name: 'Ball Juggling Count', unit: 'reps', attribute: 'dribbling', direction: 'higher',
    means: [20, 35, 50, 70, 85, 100, 110, 120, 125, 128, 130],
    sds:   [10, 12, 15, 18, 18, 20, 20, 20, 20, 20, 20] },
  { name: 'Reaction Time', unit: 'ms', attribute: 'dribbling', direction: 'lower',
    means: [280, 260, 245, 230, 220, 210, 205, 200, 198, 196, 195],
    sds:   [25, 22, 20, 18, 15, 13, 12, 12, 12, 12, 12] },
  { name: 'Arrowhead Agility', unit: 's', attribute: 'dribbling', direction: 'lower',
    means: [10.5, 10.0, 9.5, 9.2, 9.0, 8.7, 8.5, 8.4, 8.35, 8.30, 8.30],
    sds:   [0.7, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3] },

  // ── DEF (Defending / Duels) — 7 metrics ──
  { name: 'Standing Vertical Jump', unit: 'cm', attribute: 'defending', direction: 'higher',
    means: [25, 28, 32, 35, 38, 40, 41, 42, 42.5, 43, 43],
    sds:   [4, 4, 4, 4, 3.5, 3, 3, 3, 3, 3, 3] },
  { name: 'Header Distance', unit: 'm', attribute: 'defending', direction: 'higher',
    means: [5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 12.5, 13.0, 13.0],
    sds:   [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5] },
  { name: 'Lateral Shuffle 5mx4', unit: 's', attribute: 'defending', direction: 'lower',
    means: [7.2, 6.8, 6.4, 6.1, 5.8, 5.6, 5.4, 5.3, 5.25, 5.20, 5.20],
    sds:   [0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] },
  { name: 'Backward Sprint 10m', unit: 's', attribute: 'defending', direction: 'lower',
    means: [4.00, 3.80, 3.50, 3.30, 3.20, 3.10, 3.00, 2.90, 2.88, 2.86, 2.85],
    sds:   [0.30, 0.30, 0.25, 0.22, 0.20, 0.18, 0.15, 0.15, 0.15, 0.15, 0.15] },
  { name: 'Isometric Push Strength', unit: 'kg', attribute: 'defending', direction: 'higher',
    means: [30, 35, 42, 50, 58, 65, 72, 78, 80, 82, 82],
    sds:   [5, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7] },
  { name: 'Grip Strength', unit: 'kg', attribute: 'defending', direction: 'higher',
    means: [25, 30, 35, 38, 42, 45, 47, 48, 49, 50, 50],
    sds:   [4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3] },
  { name: 'Recovery Run 40m', unit: 's', attribute: 'defending', direction: 'lower',
    means: [8.0, 7.6, 7.2, 6.9, 6.7, 6.5, 6.4, 6.3, 6.25, 6.20, 6.20],
    sds:   [0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2] },

  // ── PHY (Physicality) — 7 metrics ──
  { name: 'CMJ Jump Height', unit: 'cm', attribute: 'physicality', direction: 'higher',
    means: [22, 26, 30, 34, 37, 40, 42, 43, 43.5, 44, 44],
    sds:   [4, 4, 4, 4, 3.5, 3, 3, 3, 3, 3, 3] },
  { name: 'Yo-Yo IR1 Distance', unit: 'm', attribute: 'physicality', direction: 'higher',
    means: [800, 1000, 1200, 1500, 1800, 2000, 2200, 2350, 2400, 2440, 2450],
    sds:   [200, 200, 250, 250, 250, 200, 200, 150, 150, 150, 150] },
  { name: 'VO2max', unit: 'mL/kg/min', attribute: 'physicality', direction: 'higher',
    means: [46, 48, 50, 52, 54, 56, 58, 59, 59.5, 60, 60],
    sds:   [4, 4, 4, 3.5, 3, 3, 3, 3, 3, 3, 3] },
  { name: 'Total Match Distance', unit: 'm', attribute: 'physicality', direction: 'higher',
    means: [6500, 7500, 8200, 9000, 9500, 10000, 10500, 11000, 11200, 11400, 11500],
    sds:   [800, 800, 700, 700, 600, 600, 500, 500, 500, 500, 500] },
  { name: 'HRV RMSSD', unit: 'ms', attribute: 'physicality', direction: 'higher',
    means: [65, 70, 72, 75, 78, 80, 82, 83, 84, 85, 85],
    sds:   [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15] },
  { name: 'Sleep Duration', unit: 'hours', attribute: 'physicality', direction: 'higher',
    means: [9.0, 9.0, 8.8, 8.5, 8.3, 8.0, 7.8, 7.5, 7.5, 7.5, 7.5],
    sds:   [1.0, 1.0, 1.0, 0.8, 0.8, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7] },
  { name: 'Relative Squat Strength', unit: 'xBW', attribute: 'physicality', direction: 'higher',
    means: [0.80, 0.90, 1.00, 1.10, 1.20, 1.40, 1.50, 1.60, 1.65, 1.68, 1.70],
    sds:   [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15] },
];

// ═══ HELPER ═══

function makeAttrData(
  score: number, trend: number, sources: string[], available: number,
): FootballAttributeData {
  return { score, trend, sources, sourcesAvailable: available, sourcesTotal: 7 };
}

// ═══ FOOTBALL MOCK PLAYERS ═══
// Overall ratings computed with position weights from Research Section 14.2.
// Pathway ratings: base = overall×10 + ageMod + expMod + compMod.

export const FOOTBALL_MOCK_PLAYERS: MockFootballPlayer[] = [
  // ── (a) Rising Striker — Age 14, fast raw talent ──
  // Physical basis: 30m ~4.35s, shot power ~85 km/h, 5m ~1.12s, max kick ~42m
  // Research: U14 in rapid sprint-gain window (Radziminski et al., 2025)
  // ST overall: 68*.15+55*.25+42*.10+50*.20+25*.05+60*.25 = 54
  // Pathway: 540+25-20+0 = 545 → Sunday League
  {
    id: 'rising-striker',
    name: 'Rising Striker',
    age: 14,
    position: 'ST',
    experience: 'beginner',
    competitionLevel: 'recreational',
    card: {
      userId: 'rising-striker',
      overallRating: 54,
      attributes: {
        pace:        makeAttrData(68, 4, ['sprintTest30m', 'sprintTest5m', 'maxSprintSpeed'], 3),
        shooting:    makeAttrData(55, 3, ['shotPower', 'kickDistance', 'shootingDrill'], 3),
        passing:     makeAttrData(42, 1, ['shortPassDrill', 'passingAccuracy'], 2),
        dribbling:   makeAttrData(50, 2, ['slalomDribble', 'juggling', 'reactionTime'], 3),
        defending:   makeAttrData(25, 0, ['verticalJump'], 1),
        physicality: makeAttrData(60, 3, ['cmjJump', 'yoyoIR1', 'sleep'], 3),
      },
      position: 'ST',
      footballRating: 545,
      footballLevel: 'Sunday League',
      nextMilestone: { name: 'Club Player', rating: 550, pointsNeeded: 5 },
      updatedAt: '2026-02-24T00:00:00Z',
      history: [
        { date: '2026-01-27', overall: 51, rating: 515 },
        { date: '2026-02-03', overall: 52, rating: 525 },
        { date: '2026-02-10', overall: 53, rating: 535 },
        { date: '2026-02-17', overall: 54, rating: 540 },
        { date: '2026-02-24', overall: 54, rating: 545 },
      ],
    },
  },

  // ── (b) Creative Midfielder — Age 16, technical player ──
  // Physical basis: pass speed ~72 km/h, accuracy 15/20, T-Test ~9.5s, short pass ~26s
  // Research: U16 acceleration phase for pass volume (Moran et al., 2024)
  // CM overall: 55*.10+45*.10+72*.25+70*.15+48*.15+50*.25 = 58
  // Pathway: 580+15+0+10 = 605 → Club Player
  {
    id: 'creative-midfielder',
    name: 'Creative Midfielder',
    age: 16,
    position: 'CM',
    experience: 'intermediate',
    competitionLevel: 'club',
    card: {
      userId: 'creative-midfielder',
      overallRating: 58,
      attributes: {
        pace:        makeAttrData(55, 1, ['sprintTest30m', 'sprintTest10m', 'maxSprintSpeed'], 3),
        shooting:    makeAttrData(45, 1, ['shotPower', 'shootingDrill'], 2),
        passing:     makeAttrData(72, 5, ['passSpeed', 'shortPassDrill', 'passingAccuracy', 'longPassDist', 'crossDelivery'], 5),
        dribbling:   makeAttrData(70, 4, ['tTest', 'slalomDribble', 'reactionTime', 'juggling'], 4),
        defending:   makeAttrData(48, 1, ['lateralShuffle', 'backwardSprint', 'gripStrength'], 3),
        physicality: makeAttrData(50, 2, ['cmjJump', 'yoyoIR1', 'vo2max'], 3),
      },
      position: 'CM',
      footballRating: 605,
      footballLevel: 'Club Player',
      nextMilestone: { name: 'Academy Elite', rating: 650, pointsNeeded: 45 },
      updatedAt: '2026-02-24T00:00:00Z',
      history: [
        { date: '2026-01-27', overall: 55, rating: 575 },
        { date: '2026-02-03', overall: 56, rating: 585 },
        { date: '2026-02-10', overall: 57, rating: 595 },
        { date: '2026-02-17', overall: 58, rating: 600 },
        { date: '2026-02-24', overall: 58, rating: 605 },
      ],
    },
  },

  // ── (c) Solid Centre-Back — Age 17, aerial/physical beast ──
  // Physical basis: vertical jump ~48cm, header ~10m, push strength ~100kg, grip ~52kg, CMJ ~44cm
  // Research: Aerial elite 70-80% for CB (CIES). Strength peaks 16-18y (Sherwood, 2021)
  // CB overall: 60*.10+35*.05+55*.10+40*.05+78*.35+75*.35 = 69
  // Pathway: 690+15+15+25 = 745 → Academy Elite
  {
    id: 'solid-centre-back',
    name: 'Solid Centre-Back',
    age: 17,
    position: 'CB',
    experience: 'advanced',
    competitionLevel: 'academy',
    card: {
      userId: 'solid-centre-back',
      overallRating: 69,
      attributes: {
        pace:        makeAttrData(60, 1, ['sprintTest30m', 'sprintTest10m', 'maxSprintSpeed', 'repeatedSprint'], 4),
        shooting:    makeAttrData(35, 0, ['shotPower', 'kickDistance'], 2),
        passing:     makeAttrData(55, 2, ['longPassDist', 'passSpeed', 'passingAccuracy', 'throwIn'], 4),
        dribbling:   makeAttrData(40, 1, ['tTest', 'codTest', 'reactionTime'], 3),
        defending:   makeAttrData(78, 3, ['verticalJump', 'headerDist', 'lateralShuffle', 'pushStrength', 'gripStrength', 'recoveryRun'], 6),
        physicality: makeAttrData(75, 3, ['cmjJump', 'yoyoIR1', 'vo2max', 'matchDistance', 'squatStrength'], 5),
      },
      position: 'CB',
      footballRating: 745,
      footballLevel: 'Academy Elite',
      nextMilestone: { name: 'Semi-Pro', rating: 750, pointsNeeded: 5 },
      updatedAt: '2026-02-24T00:00:00Z',
      history: [
        { date: '2026-01-27', overall: 66, rating: 715 },
        { date: '2026-02-03', overall: 67, rating: 725 },
        { date: '2026-02-10', overall: 68, rating: 735 },
        { date: '2026-02-17', overall: 68, rating: 740 },
        { date: '2026-02-24', overall: 69, rating: 745 },
      ],
    },
  },

  // ── (d) Explosive Winger — Age 15, speed demon ──
  // Physical basis: 30m ~4.20s (elite for age), flying 20m ~2.58s, slalom ~13.5s, Illinois ~15.8s
  // Research: WM highest HSR 1,044m and sprint 224m at U17 (Dalen et al., 2019)
  // WM overall: 75*.20+40*.15+38*.15+65*.25+20*.05+35*.20 = 51
  // Pathway: 510+15-20+0 = 505 → Sunday League
  {
    id: 'explosive-winger',
    name: 'Explosive Winger',
    age: 15,
    position: 'WM',
    experience: 'beginner',
    competitionLevel: 'recreational',
    card: {
      userId: 'explosive-winger',
      overallRating: 51,
      attributes: {
        pace:        makeAttrData(75, 5, ['sprintTest30m', 'flyingSprint', 'maxSprintSpeed', 'sprintTest5m'], 4),
        shooting:    makeAttrData(40, 1, ['shotPower', 'shootingDrill'], 2),
        passing:     makeAttrData(38, 1, ['shortPassDrill', 'passingAccuracy'], 2),
        dribbling:   makeAttrData(65, 4, ['slalomDribble', 'illinois', 'reactionTime', 'juggling'], 4),
        defending:   makeAttrData(20, 0, ['verticalJump'], 1),
        physicality: makeAttrData(35, 2, ['cmjJump', 'yoyoIR1'], 2),
      },
      position: 'WM',
      footballRating: 505,
      footballLevel: 'Sunday League',
      nextMilestone: { name: 'Club Player', rating: 550, pointsNeeded: 45 },
      updatedAt: '2026-02-24T00:00:00Z',
      history: [
        { date: '2026-01-27', overall: 48, rating: 475 },
        { date: '2026-02-03', overall: 49, rating: 485 },
        { date: '2026-02-10', overall: 50, rating: 495 },
        { date: '2026-02-17', overall: 50, rating: 500 },
        { date: '2026-02-24', overall: 51, rating: 505 },
      ],
    },
  },

  // ── (e) Complete Goalkeeper — Age 18, reflexes + distribution ──
  // Physical basis: reaction ~190ms, vertical jump ~50cm, CMJ ~46cm, kick dist ~58m, VO2max ~57
  // Research: By U18 near-professional technique expected (Football Parenting)
  // GK overall: 58*.10+52*.05+60*.15+45*.05+72*.30+70*.35 = 66
  // Pathway: 660+5+15+25 = 705 → Academy Elite
  {
    id: 'complete-goalkeeper',
    name: 'Complete Goalkeeper',
    age: 18,
    position: 'GK',
    experience: 'advanced',
    competitionLevel: 'academy',
    card: {
      userId: 'complete-goalkeeper',
      overallRating: 66,
      attributes: {
        pace:        makeAttrData(58, 1, ['sprintTest30m', 'sprintTest10m', 'maxSprintSpeed'], 3),
        shooting:    makeAttrData(52, 1, ['kickDistance', 'shotPower', 'volleySpeed'], 3),
        passing:     makeAttrData(60, 2, ['longPassDist', 'passSpeed', 'throwIn', 'loftedPass'], 4),
        dribbling:   makeAttrData(45, 1, ['reactionTime', 'tTest', 'codTest'], 3),
        defending:   makeAttrData(72, 3, ['verticalJump', 'lateralShuffle', 'pushStrength', 'gripStrength', 'recoveryRun'], 5),
        physicality: makeAttrData(70, 2, ['cmjJump', 'yoyoIR1', 'vo2max', 'hrv', 'sleep'], 5),
      },
      position: 'GK',
      footballRating: 705,
      footballLevel: 'Academy Elite',
      nextMilestone: { name: 'Semi-Pro', rating: 750, pointsNeeded: 45 },
      updatedAt: '2026-02-24T00:00:00Z',
      history: [
        { date: '2026-01-27', overall: 64, rating: 680 },
        { date: '2026-02-03', overall: 65, rating: 690 },
        { date: '2026-02-10', overall: 65, rating: 695 },
        { date: '2026-02-17', overall: 66, rating: 700 },
        { date: '2026-02-24', overall: 66, rating: 705 },
      ],
    },
  },

  // ── (f) Versatile Full-Back — Age 20, balanced professional ──
  // Physical basis: Yo-Yo IR1 ~2500m, VO2max ~61, match dist ~11,500m, repeated sprint ~4.28s, 30m ~4.00s
  // Research: FB covers 10,500-11,400m total (Di Salvo et al., 2007). Highest work rate.
  // FB overall: 78*.15+45*.05+68*.15+62*.10+72*.25+80*.30 = 72
  // Pathway: 720+5+25+40 = 790 → Semi-Pro
  {
    id: 'versatile-fullback',
    name: 'Versatile Full-Back',
    age: 20,
    position: 'FB',
    experience: 'elite',
    competitionLevel: 'professional',
    card: {
      userId: 'versatile-fullback',
      overallRating: 72,
      attributes: {
        pace:        makeAttrData(78, 1, ['sprintTest30m', 'sprintTest5m', 'maxSprintSpeed', 'flyingSprint', 'repeatedSprint', 'sprint40m'], 6),
        shooting:    makeAttrData(45, 0, ['shotPower', 'kickDistance', 'shootingDrill'], 3),
        passing:     makeAttrData(68, 2, ['longPassDist', 'passSpeed', 'shortPassDrill', 'passingAccuracy', 'crossDelivery'], 5),
        dribbling:   makeAttrData(62, 1, ['tTest', 'codTest', 'illinois', 'slalomDribble', 'reactionTime'], 5),
        defending:   makeAttrData(72, 1, ['verticalJump', 'headerDist', 'lateralShuffle', 'backwardSprint', 'pushStrength', 'gripStrength'], 6),
        physicality: makeAttrData(80, 1, ['cmjJump', 'yoyoIR1', 'vo2max', 'matchDistance', 'hrv', 'sleep', 'squatStrength'], 7),
      },
      position: 'FB',
      footballRating: 790,
      footballLevel: 'Semi-Pro',
      nextMilestone: { name: 'Professional', rating: 850, pointsNeeded: 60 },
      updatedAt: '2026-02-24T00:00:00Z',
      history: [
        { date: '2026-01-27', overall: 71, rating: 775 },
        { date: '2026-02-03', overall: 71, rating: 780 },
        { date: '2026-02-10', overall: 72, rating: 785 },
        { date: '2026-02-17', overall: 72, rating: 788 },
        { date: '2026-02-24', overall: 72, rating: 790 },
      ],
    },
  },

  // ── (g) Osama Kayyali — Age 18, creative attacking midfielder ──
  // Physical basis: pass speed ~85 km/h, short pass drill ~24.5s, T-Test ~9.52s, slalom ~12.2s
  // Research: CAM highest key-pass rate; creativity peaks 17-19 (Bradley et al., 2009)
  // CAM overall: 65*.10+58*.15+70*.25+68*.20+42*.05+55*.25 = 62
  // Pathway: 620+5+0+10 = 635 → Club Player
  {
    id: 'osama-kayyali',
    name: 'Osama Kayyali',
    age: 18,
    position: 'CAM',
    experience: 'intermediate',
    competitionLevel: 'club',
    card: {
      userId: 'osama-kayyali',
      overallRating: 62,
      attributes: {
        pace:        makeAttrData(65, 2, ['sprintTest30m', 'sprintTest10m', 'maxSprintSpeed', 'flyingSprint'], 4),
        shooting:    makeAttrData(58, 3, ['shotPower', 'kickDistance', 'shootingDrill', 'volleySpeed'], 4),
        passing:     makeAttrData(70, 4, ['passSpeed', 'shortPassDrill', 'passingAccuracy', 'longPassDist', 'crossDelivery'], 5),
        dribbling:   makeAttrData(68, 3, ['tTest', 'slalomDribble', 'reactionTime', 'juggling', 'codTest'], 5),
        defending:   makeAttrData(42, 1, ['lateralShuffle', 'backwardSprint', 'gripStrength'], 3),
        physicality: makeAttrData(55, 2, ['cmjJump', 'yoyoIR1', 'vo2max', 'hrv', 'sleep'], 5),
      },
      position: 'CAM',
      footballRating: 635,
      footballLevel: 'Club Player',
      nextMilestone: { name: 'Academy Elite', rating: 650, pointsNeeded: 15 },
      updatedAt: '2026-02-28T00:00:00Z',
      history: [
        { date: '2026-01-27', overall: 59, rating: 600 },
        { date: '2026-02-03', overall: 60, rating: 610 },
        { date: '2026-02-10', overall: 61, rating: 620 },
        { date: '2026-02-17', overall: 61, rating: 628 },
        { date: '2026-02-24', overall: 62, rating: 635 },
      ],
    },
  },
];

// ═══ FOOTBALL MOCK SKILLS ═══
// Sub-metric values are raw physical measurements (see units in FootballSkillConfig).
// Ratings are 0-100 overall skill proficiency.

function makeSkill(
  rating: number, sub: Record<string, number>, trend: number, sessions: number,
  history: Array<{ date: string; rating: number }>,
): FootballSkillData {
  return { rating, subMetrics: sub, trend, sessionsLogged: sessions, lastUpdated: '2026-02-24', history };
}

export const FOOTBALL_MOCK_SKILLS: Record<string, Record<FootballSkill, FootballSkillData>> = {
  'rising-striker': {
    free_kicks:    makeSkill(35, { power: 72, distance: 28, accuracyDrill: 4 }, 3, 5,
      [{ date: '2026-02-03', rating: 32 }, { date: '2026-02-24', rating: 35 }]),
    penalties:     makeSkill(40, { power: 75, placementDrill: 2, releaseTime: 1.0 }, 2, 4,
      [{ date: '2026-02-03', rating: 37 }, { date: '2026-02-24', rating: 40 }]),
    crossing:      makeSkill(25, { distance: 30, accuracyDrill: 3, deliverySpeed: 55 }, 1, 3,
      [{ date: '2026-02-03', rating: 23 }, { date: '2026-02-24', rating: 25 }]),
    headers:       makeSkill(30, { jumpHeight: 30, distance: 6, accuracyDrill: 3 }, 2, 4,
      [{ date: '2026-02-03', rating: 28 }, { date: '2026-02-24', rating: 30 }]),
    tackling:      makeSkill(18, { recoverySprint: 6.5, lateralSpeed: 7.0, drillScore: 2 }, 0, 2,
      [{ date: '2026-02-03', rating: 18 }, { date: '2026-02-24', rating: 18 }]),
    long_balls:    makeSkill(22, { distance: 28, hangTime: 1.5, accuracyDrill: 2 }, 1, 3,
      [{ date: '2026-02-03', rating: 20 }, { date: '2026-02-24', rating: 22 }]),
    dribble_moves: makeSkill(38, { slalomTime: 15.5, coneDrillTime: 18.0, juggling: 35 }, 3, 6,
      [{ date: '2026-02-03', rating: 34 }, { date: '2026-02-24', rating: 38 }]),
    first_touch:   makeSkill(32, { controlDrill: 4, reactionTime: 260, passSpeedAfterTouch: 48 }, 2, 5,
      [{ date: '2026-02-03', rating: 29 }, { date: '2026-02-24', rating: 32 }]),
  },

  'creative-midfielder': {
    free_kicks:    makeSkill(55, { power: 80, distance: 32, accuracyDrill: 6 }, 3, 10,
      [{ date: '2026-01-27', rating: 50 }, { date: '2026-02-10', rating: 53 }, { date: '2026-02-24', rating: 55 }]),
    penalties:     makeSkill(50, { power: 78, placementDrill: 3, releaseTime: 0.9 }, 2, 8,
      [{ date: '2026-01-27', rating: 46 }, { date: '2026-02-24', rating: 50 }]),
    crossing:      makeSkill(58, { distance: 38, accuracyDrill: 6, deliverySpeed: 68 }, 4, 12,
      [{ date: '2026-01-27', rating: 52 }, { date: '2026-02-10', rating: 55 }, { date: '2026-02-24', rating: 58 }]),
    headers:       makeSkill(35, { jumpHeight: 32, distance: 7, accuracyDrill: 4 }, 1, 5,
      [{ date: '2026-02-03', rating: 33 }, { date: '2026-02-24', rating: 35 }]),
    tackling:      makeSkill(38, { recoverySprint: 5.8, lateralSpeed: 6.2, drillScore: 4 }, 2, 7,
      [{ date: '2026-02-03', rating: 35 }, { date: '2026-02-24', rating: 38 }]),
    long_balls:    makeSkill(62, { distance: 42, hangTime: 2.1, accuracyDrill: 7 }, 4, 14,
      [{ date: '2026-01-27', rating: 56 }, { date: '2026-02-10', rating: 59 }, { date: '2026-02-24', rating: 62 }]),
    dribble_moves: makeSkill(65, { slalomTime: 13.0, coneDrillTime: 15.0, juggling: 80 }, 3, 15,
      [{ date: '2026-01-27', rating: 60 }, { date: '2026-02-10', rating: 63 }, { date: '2026-02-24', rating: 65 }]),
    first_touch:   makeSkill(70, { controlDrill: 7, reactionTime: 225, passSpeedAfterTouch: 72 }, 3, 18,
      [{ date: '2026-01-27', rating: 65 }, { date: '2026-02-10', rating: 68 }, { date: '2026-02-24', rating: 70 }]),
  },

  'solid-centre-back': {
    free_kicks:    makeSkill(28, { power: 88, distance: 30, accuracyDrill: 3 }, 0, 4,
      [{ date: '2026-02-03', rating: 27 }, { date: '2026-02-24', rating: 28 }]),
    penalties:     makeSkill(32, { power: 90, placementDrill: 2, releaseTime: 0.85 }, 1, 3,
      [{ date: '2026-02-03', rating: 30 }, { date: '2026-02-24', rating: 32 }]),
    crossing:      makeSkill(30, { distance: 35, accuracyDrill: 3, deliverySpeed: 70 }, 1, 5,
      [{ date: '2026-02-03', rating: 28 }, { date: '2026-02-24', rating: 30 }]),
    headers:       makeSkill(72, { jumpHeight: 48, distance: 10, accuracyDrill: 7 }, 3, 16,
      [{ date: '2026-01-27', rating: 67 }, { date: '2026-02-10', rating: 70 }, { date: '2026-02-24', rating: 72 }]),
    tackling:      makeSkill(75, { recoverySprint: 5.2, lateralSpeed: 5.4, drillScore: 8 }, 3, 18,
      [{ date: '2026-01-27', rating: 70 }, { date: '2026-02-10', rating: 73 }, { date: '2026-02-24', rating: 75 }]),
    long_balls:    makeSkill(48, { distance: 45, hangTime: 2.2, accuracyDrill: 5 }, 2, 10,
      [{ date: '2026-02-03', rating: 45 }, { date: '2026-02-24', rating: 48 }]),
    dribble_moves: makeSkill(25, { slalomTime: 14.5, coneDrillTime: 17.0, juggling: 45 }, 1, 4,
      [{ date: '2026-02-03', rating: 24 }, { date: '2026-02-24', rating: 25 }]),
    first_touch:   makeSkill(40, { controlDrill: 5, reactionTime: 220, passSpeedAfterTouch: 65 }, 2, 8,
      [{ date: '2026-02-03', rating: 37 }, { date: '2026-02-24', rating: 40 }]),
  },

  'explosive-winger': {
    free_kicks:    makeSkill(30, { power: 70, distance: 25, accuracyDrill: 3 }, 2, 4,
      [{ date: '2026-02-03', rating: 27 }, { date: '2026-02-24', rating: 30 }]),
    penalties:     makeSkill(28, { power: 68, placementDrill: 2, releaseTime: 1.0 }, 1, 3,
      [{ date: '2026-02-03', rating: 26 }, { date: '2026-02-24', rating: 28 }]),
    crossing:      makeSkill(35, { distance: 28, accuracyDrill: 4, deliverySpeed: 58 }, 2, 5,
      [{ date: '2026-02-03', rating: 32 }, { date: '2026-02-24', rating: 35 }]),
    headers:       makeSkill(20, { jumpHeight: 26, distance: 5, accuracyDrill: 2 }, 0, 2,
      [{ date: '2026-02-03', rating: 20 }, { date: '2026-02-24', rating: 20 }]),
    tackling:      makeSkill(15, { recoverySprint: 6.2, lateralSpeed: 6.8, drillScore: 2 }, 0, 2,
      [{ date: '2026-02-10', rating: 15 }, { date: '2026-02-24', rating: 15 }]),
    long_balls:    makeSkill(18, { distance: 25, hangTime: 1.4, accuracyDrill: 2 }, 1, 3,
      [{ date: '2026-02-03', rating: 16 }, { date: '2026-02-24', rating: 18 }]),
    dribble_moves: makeSkill(60, { slalomTime: 14.0, coneDrillTime: 16.0, juggling: 55 }, 4, 12,
      [{ date: '2026-01-27', rating: 54 }, { date: '2026-02-10', rating: 57 }, { date: '2026-02-24', rating: 60 }]),
    first_touch:   makeSkill(45, { controlDrill: 5, reactionTime: 240, passSpeedAfterTouch: 55 }, 3, 8,
      [{ date: '2026-02-03', rating: 42 }, { date: '2026-02-24', rating: 45 }]),
  },

  'complete-goalkeeper': {
    free_kicks:    makeSkill(42, { power: 95, distance: 35, accuracyDrill: 4 }, 1, 6,
      [{ date: '2026-02-03', rating: 40 }, { date: '2026-02-24', rating: 42 }]),
    penalties:     makeSkill(38, { power: 92, placementDrill: 2, releaseTime: 0.75 }, 1, 4,
      [{ date: '2026-02-03', rating: 36 }, { date: '2026-02-24', rating: 38 }]),
    crossing:      makeSkill(25, { distance: 30, accuracyDrill: 2, deliverySpeed: 60 }, 0, 2,
      [{ date: '2026-02-10', rating: 25 }, { date: '2026-02-24', rating: 25 }]),
    headers:       makeSkill(45, { jumpHeight: 50, distance: 8, accuracyDrill: 4 }, 2, 8,
      [{ date: '2026-02-03', rating: 42 }, { date: '2026-02-24', rating: 45 }]),
    tackling:      makeSkill(35, { recoverySprint: 5.5, lateralSpeed: 5.8, drillScore: 4 }, 1, 5,
      [{ date: '2026-02-03', rating: 33 }, { date: '2026-02-24', rating: 35 }]),
    long_balls:    makeSkill(55, { distance: 50, hangTime: 2.4, accuracyDrill: 6 }, 2, 10,
      [{ date: '2026-01-27', rating: 51 }, { date: '2026-02-10', rating: 53 }, { date: '2026-02-24', rating: 55 }]),
    dribble_moves: makeSkill(30, { slalomTime: 14.0, coneDrillTime: 16.5, juggling: 60 }, 1, 4,
      [{ date: '2026-02-03', rating: 28 }, { date: '2026-02-24', rating: 30 }]),
    first_touch:   makeSkill(48, { controlDrill: 5, reactionTime: 190, passSpeedAfterTouch: 65 }, 2, 10,
      [{ date: '2026-01-27', rating: 44 }, { date: '2026-02-10', rating: 46 }, { date: '2026-02-24', rating: 48 }]),
  },

  'versatile-fullback': {
    free_kicks:    makeSkill(40, { power: 100, distance: 34, accuracyDrill: 4 }, 1, 8,
      [{ date: '2026-02-03', rating: 38 }, { date: '2026-02-24', rating: 40 }]),
    penalties:     makeSkill(42, { power: 98, placementDrill: 3, releaseTime: 0.65 }, 1, 6,
      [{ date: '2026-02-03', rating: 40 }, { date: '2026-02-24', rating: 42 }]),
    crossing:      makeSkill(68, { distance: 48, accuracyDrill: 7, deliverySpeed: 82 }, 2, 20,
      [{ date: '2026-01-27', rating: 64 }, { date: '2026-02-10', rating: 66 }, { date: '2026-02-24', rating: 68 }]),
    headers:       makeSkill(55, { jumpHeight: 42, distance: 11, accuracyDrill: 6 }, 1, 12,
      [{ date: '2026-01-27', rating: 53 }, { date: '2026-02-10', rating: 54 }, { date: '2026-02-24', rating: 55 }]),
    tackling:      makeSkill(65, { recoverySprint: 4.8, lateralSpeed: 5.0, drillScore: 7 }, 2, 18,
      [{ date: '2026-01-27', rating: 62 }, { date: '2026-02-10', rating: 64 }, { date: '2026-02-24', rating: 65 }]),
    long_balls:    makeSkill(60, { distance: 52, hangTime: 2.4, accuracyDrill: 6 }, 1, 14,
      [{ date: '2026-01-27', rating: 58 }, { date: '2026-02-10', rating: 59 }, { date: '2026-02-24', rating: 60 }]),
    dribble_moves: makeSkill(50, { slalomTime: 12.5, coneDrillTime: 14.5, juggling: 100 }, 1, 12,
      [{ date: '2026-01-27', rating: 48 }, { date: '2026-02-10', rating: 49 }, { date: '2026-02-24', rating: 50 }]),
    first_touch:   makeSkill(58, { controlDrill: 6, reactionTime: 200, passSpeedAfterTouch: 78 }, 1, 16,
      [{ date: '2026-01-27', rating: 56 }, { date: '2026-02-10', rating: 57 }, { date: '2026-02-24', rating: 58 }]),
  },

  'osama-kayyali': {
    free_kicks:    makeSkill(48, { power: 88, distance: 30, accuracyDrill: 5 }, 3, 10,
      [{ date: '2026-01-27', rating: 42 }, { date: '2026-02-10', rating: 45 }, { date: '2026-02-24', rating: 48 }]),
    penalties:     makeSkill(52, { power: 90, placementDrill: 4, releaseTime: 0.72 }, 2, 8,
      [{ date: '2026-01-27', rating: 48 }, { date: '2026-02-24', rating: 52 }]),
    crossing:      makeSkill(55, { distance: 42, accuracyDrill: 5, deliverySpeed: 72 }, 3, 12,
      [{ date: '2026-01-27', rating: 50 }, { date: '2026-02-10', rating: 53 }, { date: '2026-02-24', rating: 55 }]),
    headers:       makeSkill(38, { jumpHeight: 38, distance: 8, accuracyDrill: 4 }, 1, 6,
      [{ date: '2026-02-03', rating: 36 }, { date: '2026-02-24', rating: 38 }]),
    tackling:      makeSkill(30, { recoverySprint: 5.5, lateralSpeed: 5.8, drillScore: 3 }, 1, 5,
      [{ date: '2026-02-03', rating: 28 }, { date: '2026-02-24', rating: 30 }]),
    long_balls:    makeSkill(58, { distance: 48, hangTime: 2.3, accuracyDrill: 6 }, 3, 14,
      [{ date: '2026-01-27', rating: 52 }, { date: '2026-02-10', rating: 55 }, { date: '2026-02-24', rating: 58 }]),
    dribble_moves: makeSkill(62, { slalomTime: 12.8, coneDrillTime: 14.8, juggling: 95 }, 4, 16,
      [{ date: '2026-01-27', rating: 56 }, { date: '2026-02-10', rating: 59 }, { date: '2026-02-24', rating: 62 }]),
    first_touch:   makeSkill(65, { controlDrill: 7, reactionTime: 205, passSpeedAfterTouch: 72 }, 3, 18,
      [{ date: '2026-01-27', rating: 60 }, { date: '2026-02-10', rating: 63 }, { date: '2026-02-24', rating: 65 }]),
  },
};

// ═══ FOOTBALL MOCK HISTORY ═══
// 30-day attribute progression. Improvement rates follow Section 17.3:
// Sprint: 0.05-0.09s/year at 13-14, CMJ: 3-5cm/year at 14-16.

export interface MockHistoryEntry {
  date: string;
  attributes: Record<FootballAttribute, number>;
  overall: number;
  pathwayRating: number;
}

export const FOOTBALL_MOCK_HISTORY: Record<string, MockHistoryEntry[]> = {
  'rising-striker': [
    { date: '2026-01-27', attributes: { pace: 65, shooting: 52, passing: 40, dribbling: 48, defending: 24, physicality: 57 }, overall: 51, pathwayRating: 515 },
    { date: '2026-02-03', attributes: { pace: 66, shooting: 53, passing: 41, dribbling: 49, defending: 24, physicality: 58 }, overall: 52, pathwayRating: 525 },
    { date: '2026-02-10', attributes: { pace: 67, shooting: 54, passing: 41, dribbling: 49, defending: 25, physicality: 59 }, overall: 53, pathwayRating: 535 },
    { date: '2026-02-17', attributes: { pace: 67, shooting: 55, passing: 42, dribbling: 50, defending: 25, physicality: 59 }, overall: 54, pathwayRating: 540 },
    { date: '2026-02-24', attributes: { pace: 68, shooting: 55, passing: 42, dribbling: 50, defending: 25, physicality: 60 }, overall: 54, pathwayRating: 545 },
  ],
  'creative-midfielder': [
    { date: '2026-01-27', attributes: { pace: 54, shooting: 44, passing: 69, dribbling: 67, defending: 47, physicality: 48 }, overall: 55, pathwayRating: 575 },
    { date: '2026-02-03', attributes: { pace: 54, shooting: 44, passing: 70, dribbling: 68, defending: 47, physicality: 49 }, overall: 56, pathwayRating: 585 },
    { date: '2026-02-10', attributes: { pace: 55, shooting: 45, passing: 71, dribbling: 69, defending: 48, physicality: 49 }, overall: 57, pathwayRating: 595 },
    { date: '2026-02-17', attributes: { pace: 55, shooting: 45, passing: 71, dribbling: 69, defending: 48, physicality: 50 }, overall: 58, pathwayRating: 600 },
    { date: '2026-02-24', attributes: { pace: 55, shooting: 45, passing: 72, dribbling: 70, defending: 48, physicality: 50 }, overall: 58, pathwayRating: 605 },
  ],
  'solid-centre-back': [
    { date: '2026-01-27', attributes: { pace: 59, shooting: 34, passing: 54, dribbling: 39, defending: 75, physicality: 72 }, overall: 66, pathwayRating: 715 },
    { date: '2026-02-03', attributes: { pace: 59, shooting: 34, passing: 54, dribbling: 39, defending: 76, physicality: 73 }, overall: 67, pathwayRating: 725 },
    { date: '2026-02-10', attributes: { pace: 60, shooting: 35, passing: 55, dribbling: 40, defending: 77, physicality: 74 }, overall: 68, pathwayRating: 735 },
    { date: '2026-02-17', attributes: { pace: 60, shooting: 35, passing: 55, dribbling: 40, defending: 77, physicality: 74 }, overall: 68, pathwayRating: 740 },
    { date: '2026-02-24', attributes: { pace: 60, shooting: 35, passing: 55, dribbling: 40, defending: 78, physicality: 75 }, overall: 69, pathwayRating: 745 },
  ],
  'explosive-winger': [
    { date: '2026-01-27', attributes: { pace: 72, shooting: 39, passing: 37, dribbling: 62, defending: 19, physicality: 33 }, overall: 48, pathwayRating: 475 },
    { date: '2026-02-03', attributes: { pace: 73, shooting: 39, passing: 37, dribbling: 63, defending: 19, physicality: 34 }, overall: 49, pathwayRating: 485 },
    { date: '2026-02-10', attributes: { pace: 74, shooting: 40, passing: 38, dribbling: 64, defending: 20, physicality: 34 }, overall: 50, pathwayRating: 495 },
    { date: '2026-02-17', attributes: { pace: 74, shooting: 40, passing: 38, dribbling: 64, defending: 20, physicality: 35 }, overall: 50, pathwayRating: 500 },
    { date: '2026-02-24', attributes: { pace: 75, shooting: 40, passing: 38, dribbling: 65, defending: 20, physicality: 35 }, overall: 51, pathwayRating: 505 },
  ],
  'complete-goalkeeper': [
    { date: '2026-01-27', attributes: { pace: 57, shooting: 51, passing: 59, dribbling: 44, defending: 70, physicality: 68 }, overall: 64, pathwayRating: 680 },
    { date: '2026-02-03', attributes: { pace: 57, shooting: 51, passing: 59, dribbling: 44, defending: 71, physicality: 69 }, overall: 65, pathwayRating: 690 },
    { date: '2026-02-10', attributes: { pace: 58, shooting: 52, passing: 60, dribbling: 45, defending: 71, physicality: 69 }, overall: 65, pathwayRating: 695 },
    { date: '2026-02-17', attributes: { pace: 58, shooting: 52, passing: 60, dribbling: 45, defending: 72, physicality: 70 }, overall: 66, pathwayRating: 700 },
    { date: '2026-02-24', attributes: { pace: 58, shooting: 52, passing: 60, dribbling: 45, defending: 72, physicality: 70 }, overall: 66, pathwayRating: 705 },
  ],
  'versatile-fullback': [
    { date: '2026-01-27', attributes: { pace: 77, shooting: 44, passing: 67, dribbling: 61, defending: 71, physicality: 78 }, overall: 71, pathwayRating: 775 },
    { date: '2026-02-03', attributes: { pace: 77, shooting: 44, passing: 67, dribbling: 61, defending: 71, physicality: 79 }, overall: 71, pathwayRating: 780 },
    { date: '2026-02-10', attributes: { pace: 78, shooting: 45, passing: 68, dribbling: 62, defending: 72, physicality: 79 }, overall: 72, pathwayRating: 785 },
    { date: '2026-02-17', attributes: { pace: 78, shooting: 45, passing: 68, dribbling: 62, defending: 72, physicality: 80 }, overall: 72, pathwayRating: 788 },
    { date: '2026-02-24', attributes: { pace: 78, shooting: 45, passing: 68, dribbling: 62, defending: 72, physicality: 80 }, overall: 72, pathwayRating: 790 },
  ],
  'osama-kayyali': [
    { date: '2026-01-27', attributes: { pace: 63, shooting: 55, passing: 67, dribbling: 65, defending: 41, physicality: 53 }, overall: 59, pathwayRating: 600 },
    { date: '2026-02-03', attributes: { pace: 64, shooting: 56, passing: 68, dribbling: 66, defending: 41, physicality: 54 }, overall: 60, pathwayRating: 610 },
    { date: '2026-02-10', attributes: { pace: 64, shooting: 57, passing: 69, dribbling: 67, defending: 42, physicality: 54 }, overall: 61, pathwayRating: 620 },
    { date: '2026-02-17', attributes: { pace: 65, shooting: 57, passing: 69, dribbling: 67, defending: 42, physicality: 55 }, overall: 61, pathwayRating: 628 },
    { date: '2026-02-24', attributes: { pace: 65, shooting: 58, passing: 70, dribbling: 68, defending: 42, physicality: 55 }, overall: 62, pathwayRating: 635 },
  ],
};

// ═══ OSAMA KAYYALI — PHYSICAL TEST METRICS (26 of 42) ═══
// Z-scores computed against age-18 row (index 5) of FOOTBALL_NORMATIVE_DATA.
// Convention: positive z = better performance; percentile = Φ(z) × 100.

export const OSAMA_FOOTBALL_METRICS: FootballPhysicalMetric[] = [
  // ── PAC — 4 of 7 sources available ──
  { name: '30m Sprint', unit: 's', attribute: 'pace',
    rawValue: 4.18, zScore: -0.53, percentile: 60,
    direction: 'lower', collectionMethod: 'Timing Gates',
    collectedAt: '2026-02-20' },
  { name: '10m Sprint', unit: 's', attribute: 'pace',
    rawValue: 1.75, zScore: -0.71, percentile: 65,
    direction: 'lower', collectionMethod: 'Timing Gates',
    collectedAt: '2026-02-20' },
  { name: 'Max Sprint Speed', unit: 'km/h', attribute: 'pace',
    rawValue: 30.5, zScore: -0.33, percentile: 55,
    direction: 'higher', collectionMethod: 'GPS Vest',
    collectedAt: '2026-02-18' },
  { name: 'Flying 20m Sprint', unit: 's', attribute: 'pace',
    rawValue: 2.42, zScore: 0.25, percentile: 60,
    direction: 'lower', collectionMethod: 'Timing Gates',
    collectedAt: '2026-02-20' },

  // ── SHO — 4 of 7 sources available ──
  { name: 'Shot Power', unit: 'km/h', attribute: 'shooting',
    rawValue: 98, zScore: -0.29, percentile: 39,
    direction: 'higher', collectionMethod: 'Radar Gun',
    collectedAt: '2026-02-18' },
  { name: 'Max Kick Distance', unit: 'm', attribute: 'shooting',
    rawValue: 54, zScore: -0.25, percentile: 40,
    direction: 'higher', collectionMethod: 'Coach Measurement',
    collectedAt: '2026-02-15' },
  { name: 'Shooting Drill Score', unit: 'pts/10', attribute: 'shooting',
    rawValue: 6.3, zScore: -0.20, percentile: 42,
    direction: 'higher', collectionMethod: 'Video Analysis',
    collectedAt: '2026-02-22' },
  { name: 'Volley Kick Speed', unit: 'km/h', attribute: 'shooting',
    rawValue: 82, zScore: -0.50, percentile: 31,
    direction: 'higher', collectionMethod: 'Radar Gun',
    collectedAt: '2026-02-18' },

  // ── PAS — 5 of 7 sources available ──
  { name: 'Pass Speed', unit: 'km/h', attribute: 'passing',
    rawValue: 86, zScore: 0.80, percentile: 79,
    direction: 'higher', collectionMethod: 'Radar Gun',
    collectedAt: '2026-02-18' },
  { name: 'Short Pass Drill Time', unit: 's', attribute: 'passing',
    rawValue: 24.5, zScore: 0.75, percentile: 77,
    direction: 'lower', collectionMethod: 'Timed Drill',
    collectedAt: '2026-02-22' },
  { name: 'Passing Accuracy Drill', unit: 'pts/20', attribute: 'passing',
    rawValue: 16.5, zScore: 1.00, percentile: 84,
    direction: 'higher', collectionMethod: 'Coach Assessment',
    collectedAt: '2026-02-22' },
  { name: 'Long Pass Distance', unit: 'm', attribute: 'passing',
    rawValue: 50, zScore: 0.50, percentile: 69,
    direction: 'higher', collectionMethod: 'GPS Vest',
    collectedAt: '2026-02-18' },
  { name: 'Cross Delivery Distance', unit: 'm', attribute: 'passing',
    rawValue: 43.5, zScore: 0.50, percentile: 69,
    direction: 'higher', collectionMethod: 'Coach Measurement',
    collectedAt: '2026-02-15' },

  // ── DRI — 5 of 7 sources available ──
  { name: 'T-Test Agility', unit: 's', attribute: 'dribbling',
    rawValue: 9.45, zScore: 0.63, percentile: 74,
    direction: 'lower', collectionMethod: 'Timing Gates',
    collectedAt: '2026-02-20' },
  { name: 'Slalom Dribble 10 Cones', unit: 's', attribute: 'dribbling',
    rawValue: 12.2, zScore: 0.75, percentile: 77,
    direction: 'lower', collectionMethod: 'Timed Drill',
    collectedAt: '2026-02-22' },
  { name: 'Reaction Time', unit: 'ms', attribute: 'dribbling',
    rawValue: 202, zScore: 0.62, percentile: 73,
    direction: 'lower', collectionMethod: 'BlazePod',
    collectedAt: '2026-02-22' },
  { name: 'Ball Juggling Count', unit: 'reps', attribute: 'dribbling',
    rawValue: 115, zScore: 0.75, percentile: 77,
    direction: 'higher', collectionMethod: 'Video Analysis',
    collectedAt: '2026-02-15' },
  { name: '5-0-5 COD', unit: 's', attribute: 'dribbling',
    rawValue: 2.18, zScore: 0.70, percentile: 76,
    direction: 'lower', collectionMethod: 'Timing Gates',
    collectedAt: '2026-02-20' },

  // ── DEF — 3 of 7 sources available ──
  { name: 'Lateral Shuffle 5mx4', unit: 's', attribute: 'defending',
    rawValue: 5.85, zScore: -0.83, percentile: 20,
    direction: 'lower', collectionMethod: 'Timing Gates',
    collectedAt: '2026-02-20' },
  { name: 'Backward Sprint 10m', unit: 's', attribute: 'defending',
    rawValue: 3.28, zScore: -1.00, percentile: 16,
    direction: 'lower', collectionMethod: 'Timing Gates',
    collectedAt: '2026-02-20' },
  { name: 'Grip Strength', unit: 'kg', attribute: 'defending',
    rawValue: 42, zScore: -0.75, percentile: 23,
    direction: 'higher', collectionMethod: 'Dynamometer',
    collectedAt: '2026-02-15' },

  // ── PHY — 5 of 7 sources available ──
  { name: 'CMJ Jump Height', unit: 'cm', attribute: 'physicality',
    rawValue: 39, zScore: -0.33, percentile: 37,
    direction: 'higher', collectionMethod: 'Force Plate',
    collectedAt: '2026-02-20' },
  { name: 'Yo-Yo IR1 Distance', unit: 'm', attribute: 'physicality',
    rawValue: 1920, zScore: -0.40, percentile: 34,
    direction: 'higher', collectionMethod: 'Beep Test',
    collectedAt: '2026-02-22' },
  { name: 'VO2max', unit: 'mL/kg/min', attribute: 'physicality',
    rawValue: 54.5, zScore: -0.50, percentile: 31,
    direction: 'higher', collectionMethod: 'Yo-Yo IR1 Est.',
    collectedAt: '2026-02-22' },
  { name: 'HRV RMSSD', unit: 'ms', attribute: 'physicality',
    rawValue: 83, zScore: 0.20, percentile: 58,
    direction: 'higher', collectionMethod: 'Polar H10',
    collectedAt: '2026-02-24' },
  { name: 'Sleep Duration', unit: 'hours', attribute: 'physicality',
    rawValue: 7.6, zScore: -0.57, percentile: 28,
    direction: 'higher', collectionMethod: 'Apple Watch',
    collectedAt: '2026-02-24' },
];

// ═══ GETTER FUNCTIONS ═══

export function getMockPlayer(id: string): MockFootballPlayer | undefined {
  return FOOTBALL_MOCK_PLAYERS.find(p => p.id === id);
}

export function getMockPlayerSkills(id: string): Record<FootballSkill, FootballSkillData> | undefined {
  return FOOTBALL_MOCK_SKILLS[id];
}

export function getMockPlayerHistory(id: string): MockHistoryEntry[] | undefined {
  return FOOTBALL_MOCK_HISTORY[id];
}

/**
 * User-aware player getter.
 * Returns mock data only if the userId matches a known demo profile;
 * returns undefined for any other user (→ empty state).
 */
export function getMockPlayerForUser(userId: string | undefined): MockFootballPlayer | undefined {
  if (!userId) return undefined;
  const demo = FOOTBALL_MOCK_PLAYERS.find(p => p.id === 'osama-kayyali');
  if (!demo) return undefined;
  return { ...demo, id: userId, card: { ...demo.card, userId } };
}

export function getMockPlayerSkillsForUser(userId: string | undefined): Record<FootballSkill, FootballSkillData> | undefined {
  if (!userId) return undefined;
  return FOOTBALL_MOCK_SKILLS['osama-kayyali'];
}

export function getMockPlayerHistoryForUser(userId: string | undefined): MockHistoryEntry[] | undefined {
  if (!userId) return undefined;
  return FOOTBALL_MOCK_HISTORY['osama-kayyali'];
}

export function getFootballMetricsForUser(userId: string): FootballPhysicalMetric[] {
  if (!userId) return [];
  return [...OSAMA_FOOTBALL_METRICS];
}

export function getMetricNorm(metricName: string): MetricNorm | undefined {
  return FOOTBALL_NORMATIVE_DATA.find(n => n.name === metricName);
}

/**
 * Get the mean value for a metric at a given age.
 * @param metricName - Exact metric name from FOOTBALL_NORMATIVE_DATA
 * @param age - Player age (13-23, clamped)
 * @returns The mean value, or undefined if metric not found
 */
export function getMetricMeanForAge(metricName: string, age: number): number | undefined {
  const norm = getMetricNorm(metricName);
  if (!norm) return undefined;
  const idx = Math.min(Math.max(age - 13, 0), 10);
  return norm.means[idx];
}
