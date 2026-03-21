/**
 * PHV (Peak Height Velocity) Calculator
 *
 * Implements the Mirwald et al. (2002) maturity offset equations.
 * Used to classify young athletes into LTAD stages for training personalization.
 */

export type Sex = 'male' | 'female';

export interface PHVInputs {
  sex: Sex;
  ageDecimal: number;
  standingHeightCm: number;
  sittingHeightCm: number;
  weightKg: number;
}

export type LTADStage =
  | 'FUNdamentals'      // pre-phv-early (focus: ABCs of movement)
  | 'Learn to Train'     // pre-phv-approaching (focus: sport skills)
  | 'Train to Train'     // at-phv (focus: aerobic base, flexibility)
  | 'Train to Compete'   // post-phv-recent (focus: sport-specific fitness)
  | 'Train to Win';      // post-phv-stable (focus: performance optimization)

export interface PHVResult {
  maturityOffset: number;
  legLengthCm: number;
  weightHeightRatio: number;
  maturityCategory: PHVCategory;
  ltadStage: LTADStage;
  trainabilityNote: string;
}

export type PHVCategory =
  | 'pre-phv-early'
  | 'pre-phv-approaching'
  | 'at-phv'
  | 'post-phv-recent'
  | 'post-phv-stable';

export function calculateAgeDecimal(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  const diffMs = now.getTime() - dob.getTime();
  return diffMs / (365.25 * 24 * 60 * 60 * 1000);
}

export function validatePHVInputs(inputs: PHVInputs): string[] {
  const errors: string[] = [];
  if (inputs.ageDecimal < 10 || inputs.ageDecimal > 20) errors.push('Age must be between 10 and 20');
  if (inputs.standingHeightCm < 120 || inputs.standingHeightCm > 220) errors.push('Standing height must be 120-220 cm');
  if (inputs.sittingHeightCm < 60 || inputs.sittingHeightCm > 120) errors.push('Sitting height must be 60-120 cm');
  if (inputs.sittingHeightCm >= inputs.standingHeightCm) errors.push('Sitting height must be less than standing height');
  if (inputs.weightKg < 20 || inputs.weightKg > 150) errors.push('Weight must be 20-150 kg');
  const legLength = inputs.standingHeightCm - inputs.sittingHeightCm;
  if (legLength <= 0) errors.push('Leg length must be positive');
  return errors;
}

const LTAD_MAP: Record<PHVCategory, LTADStage> = {
  'pre-phv-early': 'FUNdamentals',
  'pre-phv-approaching': 'Learn to Train',
  'at-phv': 'Train to Train',
  'post-phv-recent': 'Train to Compete',
  'post-phv-stable': 'Train to Win',
};

export function calculatePHV(inputs: PHVInputs): PHVResult {
  const { sex, ageDecimal: age, standingHeightCm: height, sittingHeightCm: sitting, weightKg: weight } = inputs;
  const legLength = height - sitting;
  const weightHeightRatio = (weight / height) * 100;

  let maturityOffset: number;

  if (sex === 'male') {
    maturityOffset =
      -9.236
      + (0.0002708 * legLength * sitting)
      + (-0.001663 * age * legLength)
      + (0.007216 * age * sitting)
      + (0.02292 * weightHeightRatio);
  } else {
    maturityOffset =
      -9.376
      + (0.0001882 * legLength * sitting)
      + (0.0022 * age * legLength)
      + (0.005841 * age * sitting)
      + (-0.002658 * age * weight)
      + (0.07693 * weightHeightRatio);
  }

  // Round to 2 decimal places
  maturityOffset = Math.round(maturityOffset * 100) / 100;

  let maturityCategory: PHVCategory;
  let trainabilityNote: string;

  if (maturityOffset < -1.0) {
    maturityCategory = 'pre-phv-early';
    trainabilityNote = "You're still in a big growth phase. Focus on skills and movement quality — your body is changing fast.";
  } else if (maturityOffset < 0) {
    maturityCategory = 'pre-phv-approaching';
    trainabilityNote = "You're approaching your peak growth. Great time to build coordination and aerobic base.";
  } else if (maturityOffset < 0.5) {
    maturityCategory = 'at-phv';
    trainabilityNote = "You're at peak growth right now. Be smart with load — this is the highest injury risk window.";
  } else if (maturityOffset < 1.5) {
    maturityCategory = 'post-phv-recent';
    trainabilityNote = "Growth is slowing down. Your body is ready to start responding well to strength work.";
  } else {
    maturityCategory = 'post-phv-stable';
    trainabilityNote = "You're past peak growth. This is your best window for building real strength and power.";
  }

  return {
    maturityOffset,
    legLengthCm: legLength,
    weightHeightRatio: Math.round(weightHeightRatio * 100) / 100,
    maturityCategory,
    ltadStage: LTAD_MAP[maturityCategory],
    trainabilityNote,
  };
}
