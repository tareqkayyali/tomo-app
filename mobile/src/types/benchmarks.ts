export type PercentileZone = "elite" | "good" | "average" | "developing" | "below";

export interface BenchmarkResult {
  metricKey: string;
  metricLabel: string;
  unit: string;
  direction: "lower_better" | "higher_better";
  value: number;
  percentile: number;
  zone: PercentileZone;
  ageBand: string;
  position: string;
  competitionLvl: string;
  norm: { p10: number; p25: number; p50: number; p75: number; p90: number };
  message: string;
}

export interface BenchmarkProfile {
  userId: string;
  ageBand: string;
  position: string;
  gender: string;
  results: BenchmarkResult[];
  overallPercentile: number;
  strengths: string[];
  gaps: string[];
  updatedAt: string;
}

export interface MetricTrajectory {
  date: string;
  value: number;
  percentile: number;
  zone: PercentileZone;
}

export interface NormRow {
  metricKey: string;
  metricLabel: string;
  unit: string;
  direction: "lower_better" | "higher_better";
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  sourceRef: string;
}
