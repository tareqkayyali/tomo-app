/**
 * Padel Shot & Sport Definitions
 * Core configuration data for padel shot types and sport options.
 * This is schema/config data, not user-specific or demo data.
 */

import type {
  ShotDefinition,
  ShotType,
  SportOption,
} from '../types/padel';
import { colors } from '../theme/colors';

// ═══ SPORT OPTIONS ═══

export const SPORT_OPTIONS: SportOption[] = [
  { value: 'padel', label: 'Padel', icon: 'tennisball', color: colors.accent, available: true },
  { value: 'football', label: 'Football', icon: 'football', color: colors.accent, available: false },
  { value: 'basketball', label: 'Basketball', icon: 'basketball', color: colors.warning, available: false },
  { value: 'tennis', label: 'Tennis', icon: 'tennisball-outline', color: colors.info, available: false },
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

// ═══ LOOKUP FUNCTIONS ═══

export function getShotDefinition(shot: ShotType): ShotDefinition {
  return SHOT_DEFINITIONS[shot];
}
