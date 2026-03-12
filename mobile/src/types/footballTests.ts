/**
 * Football Test Types
 * Supabase-persisted results for the 8 physical football tests.
 */

export interface FootballTestResultInput {
  testType: string;
  primaryValue: number;
  primaryUnit: string;
  primaryLabel: string;
  derivedMetrics: Array<{ label: string; value: number; unit: string }>;
  percentile: number | null;
  percentileLabel: string;
  ageMean: number | null;
  ageMeanUnit: string;
  isNewPB: boolean;
  previousBest: number | null;
  rawInputs: Record<string, string>;
}

export interface FootballTestResult extends FootballTestResultInput {
  id: string;
  userId: string;
  date: string;
  createdAt: string;
}

export interface FootballTestHistoryResponse {
  results: FootballTestResult[];
  count: number;
}
