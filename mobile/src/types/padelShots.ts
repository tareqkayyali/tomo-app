/**
 * Padel Shot Session types — mirrors the padel_shot_results DB table.
 */

export interface PadelShotResultInput {
  shotType: string;
  subMetrics: Record<string, number>;
  overall: number;
}

export interface PadelShotSessionInput {
  shots: PadelShotResultInput[];
  sessionType: 'training' | 'match';
  notes: string;
}

export interface PadelShotResult {
  id: string;
  userId: string;
  date: string;
  shotType: string;
  subMetrics: Record<string, number>;
  overall: number;
  sessionType: string;
  notes: string;
  createdAt: string;
}

export interface PadelShotHistoryResponse {
  results: PadelShotResult[];
  count: number;
}
