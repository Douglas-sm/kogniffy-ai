export const DYSLEXIA_PHASE_DATASET_QUESTIONS = [
  1, 2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30, 31, 32
] as const;

export const DYSLEXIA_MODEL_FEATURES = [
  "hitRate",
  "missRate",
  "resolvedRate",
  "accuracyPerResolved",
  "missesPerHit"
] as const;

export type DyslexiaModelFeatureName = (typeof DYSLEXIA_MODEL_FEATURES)[number];

export interface DyslexiaPhaseMetricsLike {
  startedWords: number;
  completedWords: number;
  attempts: number;
  hits: number;
  misses: number;
  corrections: number;
  inversionErrors: number;
  responseTimes: number[];
  firstClickTimes: number[];
  autoHelpCount: number;
}

export interface QuestionPerformanceAggregate {
  questionCount: number;
  totalClicks: number;
  totalHits: number;
  totalMisses: number;
}

export interface DyslexiaFeatureNormalization {
  feature: DyslexiaModelFeatureName;
  mean: number;
  std: number;
}

export type DyslexiaRiskMapping = "probability" | "oneMinusProbability";

export interface DyslexiaModelTrainingMetrics {
  loss: number | null;
  accuracy: number | null;
  valLoss: number | null;
  valAccuracy: number | null;
}

export interface DyslexiaFixtureChecks {
  goodControlRisk: number;
  badControlRisk: number;
  gameGoodControlRisk: number;
  gameBadControlRisk: number;
  passed: boolean;
}

export interface DyslexiaModelMetadata {
  features: DyslexiaModelFeatureName[];
  normalization: DyslexiaFeatureNormalization[];
  questionIds: number[];
  rowCount: number;
  classDistribution: {
    noDyslexia: number;
    dyslexia: number;
  };
  trainingMetrics: DyslexiaModelTrainingMetrics;
  riskMapping: DyslexiaRiskMapping;
  fixtureChecks: DyslexiaFixtureChecks;
  trainedAt: string;
}

function sanitizeMetric(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function divideByAtLeastOne(numerator: number, denominator: number) {
  return sanitizeMetric(numerator) / Math.max(1, sanitizeMetric(denominator));
}

export function buildDyslexiaFeatureVectorFromAggregate(aggregate: QuestionPerformanceAggregate) {
  const totalClicks = sanitizeMetric(aggregate.totalClicks);
  const totalHits = sanitizeMetric(aggregate.totalHits);
  const totalMisses = sanitizeMetric(aggregate.totalMisses);
  const resolvedAttempts = totalHits + totalMisses;

  return [
    divideByAtLeastOne(totalHits, totalClicks),
    divideByAtLeastOne(totalMisses, totalClicks),
    divideByAtLeastOne(resolvedAttempts, totalClicks),
    divideByAtLeastOne(totalHits, resolvedAttempts),
    divideByAtLeastOne(totalMisses, totalHits)
  ];
}

export function buildDyslexiaFeatureVectorFromPhase(phase: DyslexiaPhaseMetricsLike | null | undefined) {
  if (!phase || phase.startedWords <= 0) {
    return null;
  }

  return buildDyslexiaFeatureVectorFromAggregate({
    questionCount: phase.startedWords,
    totalClicks: phase.attempts,
    totalHits: phase.hits,
    totalMisses: phase.misses
  });
}

export function normalizeDyslexiaFeatureVector(
  featureVector: number[],
  normalization: DyslexiaFeatureNormalization[]
) {
  return normalization.map(({ mean, std }, index) => (featureVector[index] - mean) / (std || 1));
}
