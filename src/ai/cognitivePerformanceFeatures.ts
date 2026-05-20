import type { MetricsSnapshot } from "@/metrics/metricsCollector";

export const COGNITIVE_PERFORMANCE_MODEL_FEATURES = [
  "reactionTimeProxyMs",
  "memoryTestProxyScore"
] as const;

export type CognitivePerformanceModelFeatureName = (typeof COGNITIVE_PERFORMANCE_MODEL_FEATURES)[number];

export interface CognitivePerformanceFeatureNormalization {
  feature: CognitivePerformanceModelFeatureName;
  mean: number;
  std: number;
}

export interface CognitivePerformanceModelTrainingMetrics {
  loss: number | null;
  mae: number | null;
  valLoss: number | null;
  valMae: number | null;
}

export interface CognitivePerformanceModelMetadata {
  features: CognitivePerformanceModelFeatureName[];
  normalization: CognitivePerformanceFeatureNormalization[];
  sourceDataset: string;
  targetColumn: string;
  rowCount: number;
  trainRowCount: number;
  validationRowCount: number;
  proxyDefinitionVersion: "v1";
  trainingMetrics: CognitivePerformanceModelTrainingMetrics;
  trainedAt: string;
}

export type CognitivePerformanceFeatureValueMap = Record<CognitivePerformanceModelFeatureName, number>;

export interface CognitivePerformanceProxySnapshot {
  primaryResponseTimeMs: number;
  interClickTimeMs: number;
  averageSpeedMs: number;
  errorCount: number;
  maxSequenceReached: number;
  impulsivityCount: number;
  reactionTimeProxyMs: number;
  memoryTestProxyScore: number;
}

const DEFAULT_REACTION_TIME_MS = 400;
const MIN_REACTION_TIME_MS = 200;
const MAX_REACTION_TIME_MS = 600;
const MIN_MEMORY_TEST_SCORE = 40;
const MAX_MEMORY_TEST_SCORE = 99;
const DEFAULT_MAX_SEQUENCE = 2;
const PERFORMANCE_SCORE_INTERCEPT = 89.89455;
const PERFORMANCE_SCORE_REACTION_WEIGHT = -0.162672;
const PERFORMANCE_SCORE_MEMORY_WEIGHT = 0.479023;

function sanitizeMetric(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(sanitizeMetric(value) * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + sanitizeMetric(value), 0) / values.length;
}

function sanitizePositiveValues(values: number[]) {
  return values.map(sanitizeMetric).filter((value) => value > 0);
}

function averageOrFallback(primary: number[], fallback: number[], defaultValue: number) {
  const primaryValues = sanitizePositiveValues(primary);

  if (primaryValues.length > 0) {
    return average(primaryValues);
  }

  const fallbackValues = sanitizePositiveValues(fallback);

  if (fallbackValues.length > 0) {
    return average(fallbackValues);
  }

  return sanitizeMetric(defaultValue);
}

function hasCognitiveSamples(metrics: MetricsSnapshot) {
  return (
    metrics.cognitiveMetrics.responseTimesMs.length > 0 ||
    metrics.cognitiveMetrics.interClickTimesMs.length > 0 ||
    metrics.cognitiveMetrics.maxSequenceReached > 0 ||
    metrics.cognitiveMetrics.errorCount > 0 ||
    metrics.cognitiveMetrics.impulsivityCount > 0 ||
    metrics.cognitiveMetrics.averageSpeedMs > 0
  );
}

export function toCognitivePerformanceFeatureValueMap(featureVector: number[]): CognitivePerformanceFeatureValueMap {
  return COGNITIVE_PERFORMANCE_MODEL_FEATURES.reduce(
    (map, feature, index) => {
      map[feature] = featureVector[index] ?? 0;
      return map;
    },
    {} as CognitivePerformanceFeatureValueMap
  );
}

export function buildCognitivePerformanceFeatureValuesFromDatasetRow(input: {
  reactionTimeMs: number;
  memoryTestScore: number;
}): CognitivePerformanceFeatureValueMap {
  return {
    reactionTimeProxyMs: roundMetric(clamp(input.reactionTimeMs, MIN_REACTION_TIME_MS, MAX_REACTION_TIME_MS)),
    memoryTestProxyScore: roundMetric(clamp(input.memoryTestScore, MIN_MEMORY_TEST_SCORE, MAX_MEMORY_TEST_SCORE))
  };
}

export function buildCognitivePerformanceFeatureVectorFromValues(values: CognitivePerformanceFeatureValueMap) {
  return COGNITIVE_PERFORMANCE_MODEL_FEATURES.map((feature) => values[feature]);
}

export function buildCognitivePerformanceProxySnapshot(metrics: MetricsSnapshot): CognitivePerformanceProxySnapshot {
  const cognitiveMetricsAvailable = hasCognitiveSamples(metrics);
  const primaryResponseTimeMs = averageOrFallback(
    metrics.cognitiveMetrics.responseTimesMs,
    metrics.reactionTimes,
    DEFAULT_REACTION_TIME_MS
  );
  const averageSpeedMs =
    metrics.cognitiveMetrics.averageSpeedMs > 0
      ? sanitizeMetric(metrics.cognitiveMetrics.averageSpeedMs)
      : averageOrFallback(
          metrics.cognitiveMetrics.interClickTimesMs,
          metrics.reactionTimes,
          primaryResponseTimeMs || DEFAULT_REACTION_TIME_MS
        );
  const interClickTimeMs = averageOrFallback(
    metrics.cognitiveMetrics.interClickTimesMs,
    [averageSpeedMs, ...metrics.reactionTimes, primaryResponseTimeMs],
    averageSpeedMs || primaryResponseTimeMs || DEFAULT_REACTION_TIME_MS
  );
  const errorCount = cognitiveMetricsAvailable
    ? Math.max(sanitizeMetric(metrics.cognitiveMetrics.errorCount), sanitizeMetric(metrics.sequenceErrors))
    : sanitizeMetric(metrics.sequenceErrors);
  const maxSequenceReached = cognitiveMetricsAvailable
    ? Math.max(
        DEFAULT_MAX_SEQUENCE,
        sanitizeMetric(metrics.cognitiveMetrics.maxSequenceReached),
        sanitizeMetric(metrics.maxSequenceLength),
        sanitizeMetric(metrics.sequenceScore)
      )
    : Math.max(
        DEFAULT_MAX_SEQUENCE,
        sanitizeMetric(metrics.maxSequenceLength),
        sanitizeMetric(metrics.sequenceScore)
      );
  const impulsivityCount = cognitiveMetricsAvailable
    ? Math.max(sanitizeMetric(metrics.cognitiveMetrics.impulsivityCount), sanitizeMetric(metrics.impulsiveClicks))
    : sanitizeMetric(metrics.impulsiveClicks);
  const reactionTimeProxyMs = clamp(
    0.65 * primaryResponseTimeMs + 0.35 * interClickTimeMs + 18 * errorCount + 12 * impulsivityCount,
    MIN_REACTION_TIME_MS,
    MAX_REACTION_TIME_MS
  );
  const memoryTestProxyScore = clamp(
    MIN_MEMORY_TEST_SCORE +
      59 * clamp((maxSequenceReached - DEFAULT_MAX_SEQUENCE) / 8, 0, 1) -
      2 * errorCount -
      1.5 * impulsivityCount -
      Math.max(0, (averageSpeedMs - 420) / 50),
    MIN_MEMORY_TEST_SCORE,
    MAX_MEMORY_TEST_SCORE
  );

  return {
    primaryResponseTimeMs: roundMetric(primaryResponseTimeMs),
    interClickTimeMs: roundMetric(interClickTimeMs),
    averageSpeedMs: roundMetric(averageSpeedMs),
    errorCount: roundMetric(errorCount),
    maxSequenceReached: roundMetric(maxSequenceReached),
    impulsivityCount: roundMetric(impulsivityCount),
    reactionTimeProxyMs: roundMetric(reactionTimeProxyMs),
    memoryTestProxyScore: roundMetric(memoryTestProxyScore)
  };
}

export function buildCognitivePerformanceFeatureValuesFromMetrics(metrics: MetricsSnapshot) {
  const snapshot = buildCognitivePerformanceProxySnapshot(metrics);

  return {
    reactionTimeProxyMs: snapshot.reactionTimeProxyMs,
    memoryTestProxyScore: snapshot.memoryTestProxyScore
  };
}

export function buildCognitivePerformanceFeatureVectorFromMetrics(metrics: MetricsSnapshot) {
  return buildCognitivePerformanceFeatureVectorFromValues(buildCognitivePerformanceFeatureValuesFromMetrics(metrics));
}

export function normalizeCognitivePerformanceFeatureVector(
  featureVector: number[],
  normalization: CognitivePerformanceFeatureNormalization[]
) {
  return normalization.map(({ mean, std }, index) => ((featureVector[index] ?? 0) - mean) / (std || 1));
}

export function calculateCognitivePerformanceFallbackPerformanceScoreFromValues(
  values: CognitivePerformanceFeatureValueMap
) {
  return clamp(
    PERFORMANCE_SCORE_INTERCEPT +
      PERFORMANCE_SCORE_REACTION_WEIGHT * values.reactionTimeProxyMs +
      PERFORMANCE_SCORE_MEMORY_WEIGHT * values.memoryTestProxyScore,
    0,
    100
  );
}

export function calculateCognitivePerformanceFallbackPerformanceScore(metrics: MetricsSnapshot) {
  return calculateCognitivePerformanceFallbackPerformanceScoreFromValues(
    buildCognitivePerformanceFeatureValuesFromMetrics(metrics)
  );
}

export function calculateCognitivePerformanceFallbackRiskFromValues(values: CognitivePerformanceFeatureValueMap) {
  return clamp(100 - calculateCognitivePerformanceFallbackPerformanceScoreFromValues(values), 0, 100);
}

export function calculateCognitivePerformanceFallbackRisk(metrics: MetricsSnapshot) {
  return calculateCognitivePerformanceFallbackRiskFromValues(buildCognitivePerformanceFeatureValuesFromMetrics(metrics));
}
