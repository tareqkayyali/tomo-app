/**
 * Signal Dashboard — spec-mandated accent colors.
 *
 * The Signal Dashboard intentionally differentiates calendar kinds (training =
 * muted blue, match = sage, exam = warm tan) to make the "What's Coming"
 * timeline scannable at a glance. These hues live only in Signal surfaces
 * and deliberately don't feed back into the app's global theme.
 */

export const SIGNAL_TRAINING = '#8AA6BF'; // muted blue
export const SIGNAL_MATCH = '#7A9B76'; // sage (brand accent)
export const SIGNAL_EXAM = '#C8A27A'; // warm tan

export function signalColorForKind(kind: string): string {
  switch (kind) {
    case 'match':
      return SIGNAL_MATCH;
    case 'exam':
      return SIGNAL_EXAM;
    case 'training':
    case 'gym':
    case 'club':
    case 'recovery':
    default:
      return SIGNAL_TRAINING;
  }
}

export function signalLabelForKind(kind: string): string {
  switch (kind) {
    case 'training':
      return 'TRAINING';
    case 'match':
      return 'MATCH';
    case 'exam':
      return 'EXAM';
    case 'gym':
      return 'GYM';
    case 'club':
      return 'CLUB';
    case 'recovery':
      return 'RECOVERY';
    default:
      return kind.toUpperCase();
  }
}
