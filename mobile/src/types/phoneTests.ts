/**
 * Phone Test Types & Definitions
 * 5 phone-based athletic tests using screen + sensors
 */

export type PhoneTestId =
  | 'reaction-tap'
  | 'jump-height'
  | 'sprint-speed'
  | 'agility-shuffle'
  | 'balance-stability';

export type PhoneTestCategory = 'reaction' | 'explosive' | 'speed' | 'agility' | 'balance';

export interface PhoneTestDef {
  id: PhoneTestId;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  category: PhoneTestCategory;
  description: string;
  durationSeconds: number;
  instructions: string[];
  unit: string;
}

export interface PhoneTestSessionInput {
  testId: string;
  testName: string;
  category: string;
  primaryScore: number;
  unit: string;
  metrics: Record<string, number>;
  durationSeconds: number;
  rpe: number;
  notes?: string;
}

export interface PhoneTestSession extends PhoneTestSessionInput {
  id: string;
  userId: string;
  createdAt: string;
}

export interface PhoneTestHistoryResponse {
  sessions: PhoneTestSession[];
  count: number;
}

export const PHONE_TESTS: PhoneTestDef[] = [
  {
    id: 'reaction-tap',
    name: 'Reaction Speed',
    shortName: 'Reaction',
    icon: 'hand-left-outline',
    color: '#2ECC71',
    category: 'reaction',
    description: 'Tap colored targets as fast as you can. Measures pure reaction time.',
    durationSeconds: 30,
    instructions: [
      'Hold your phone in portrait mode',
      'Colored circles will appear at random positions',
      'Tap each circle as fast as possible',
      'Complete 15 targets to finish the test',
    ],
    unit: 'ms',
  },
  {
    id: 'jump-height',
    name: 'Vertical Jump',
    shortName: 'Jump',
    icon: 'arrow-up-outline',
    color: '#7B61FF',
    category: 'explosive',
    description: 'Hold phone and jump. Accelerometer measures hang time to estimate jump height.',
    durationSeconds: 20,
    instructions: [
      'Hold your phone firmly against your chest with both hands',
      'Stand still for calibration (3 seconds)',
      'Jump as high as you can when prompted',
      'Land softly and hold still',
    ],
    unit: 'cm',
  },
  {
    id: 'sprint-speed',
    name: 'Sprint Speed',
    shortName: 'Sprint',
    icon: 'speedometer-outline',
    color: '#3498DB',
    category: 'speed',
    description: 'Hold phone and sprint. Detects start and stop from accelerometer data.',
    durationSeconds: 15,
    instructions: [
      'Hold your phone in your non-dominant hand',
      'Stand still at your starting line',
      'Sprint forward on the GO signal',
      'Press STOP when you finish your sprint',
    ],
    unit: 's',
  },
  {
    id: 'agility-shuffle',
    name: 'Agility Shuffle',
    shortName: 'Agility',
    icon: 'swap-horizontal-outline',
    color: '#2ECC71',
    category: 'agility',
    description: 'Shuffle left and right following cues. Measures reaction and lateral speed.',
    durationSeconds: 30,
    instructions: [
      'Hold phone in front of you at chest height',
      'Stand in athletic stance, feet shoulder-width apart',
      'Shuffle in the direction shown on screen',
      'Return to center before the next cue',
    ],
    unit: 'ms',
  },
  {
    id: 'balance-stability',
    name: 'Balance Test',
    shortName: 'Balance',
    icon: 'body-outline',
    color: '#FFD60A',
    category: 'balance',
    description: 'Stand on one leg holding phone. Gyroscope measures how stable you remain.',
    durationSeconds: 30,
    instructions: [
      'Hold phone at chest level with both hands',
      'Stand on your dominant leg',
      'Hold as still as possible for 30 seconds',
      'The less you wobble, the higher your score',
    ],
    unit: 'score',
  },
];
