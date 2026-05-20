import type { MetricsSnapshot } from "@/metrics/metricsCollector";

export const REACTION_TIME_MODEL_FEATURES = ["reactionTimeProxyMs"] as const;

export type ReactionTimeModelFeatureName = (typeof REACTION_TIME_MODEL_FEATURES)[number];
export type ReactionTimeCategory = "good" | "average" | "bad";

export interface ReactionTimeFeatureNormalization {
  feature: ReactionTimeModelFeatureName;
  mean: number;
  std: number;
}

export interface ReactionTimeModelTrainingMetrics {
  loss: number | null;
  accuracy: number | null;
  valLoss: number | null;
  valAccuracy: number | null;
}

export interface ReactionTimeModelMetadata {
  features: ReactionTimeModelFeatureName[];
  normalization: ReactionTimeFeatureNormalization[];
  sourceDataset: string;
  targetColumn: string;
  rowCount: number;
  trainRowCount: number;
  validationRowCount: number;
  classDistribution: Record<ReactionTimeCategory, number>;
  featureColumnsUsed: string[];
  proxyDefinitionVersion: "v1";
  trainingMetrics: ReactionTimeModelTrainingMetrics;
  trainedAt: string;
}

export type ReactionTimeFeatureValueMap = Record<ReactionTimeModelFeatureName, number>;

export interface ReactionTimeProxySnapshot {
  primaryResponseTimeMs: number;
  interClickTimeMs: number;
  reactionStdMs: number;
  fatigueDeltaMs: number;
  errorCount: number;
  maxSequenceReached: number;
  impulsivityCount: number;
  roundsPlayed: number;
  reactionTimeProxyMs: number;
}

export const REACTION_TIME_DATASET_MIN_MS = 238.57;
export const REACTION_TIME_DATASET_MAX_MS = 850;
export const REACTION_TIME_GOOD_THRESHOLD_MS = 340.75;
export const REACTION_TIME_AVERAGE_THRESHOLD_MS = 513.17;
const DEFAULT_REACTION_TIME_MS = 496.37;

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

function variance(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  return values.reduce((sum, value) => sum + (sanitizeMetric(value) - mean) ** 2, 0) / Math.max(1, values.length - 1);
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

function fatigueDeltaFromRounds(responseTimesMs: number[]) {
  const samples = sanitizePositiveValues(responseTimesMs);

  if (samples.length < 3) {
    return 0;
  }

  const chunkSize = Math.max(1, Math.floor(samples.length / 3));
  const startWindow = samples.slice(0, chunkSize);
  const endWindow = samples.slice(samples.length - chunkSize);

  return average(endWindow) - average(startWindow);
}

function hasMemoryReactionSamples(metrics: MetricsSnapshot) {
  return (
    metrics.cognitiveMetrics.responseTimesMs.length > 0 ||
    metrics.cognitiveMetrics.interClickTimesMs.length > 0 ||
    metrics.cognitiveMetrics.errorCount > 0 ||
    metrics.cognitiveMetrics.maxSequenceReached > 0 ||
    metrics.cognitiveMetrics.impulsivityCount > 0 ||
    metrics.sequenceErrors > 0 ||
    metrics.maxSequenceLength > 0
  );
}

export function toReactionTimeFeatureValueMap(featureVector: number[]): ReactionTimeFeatureValueMap {
  return REACTION_TIME_MODEL_FEATURES.reduce(
    (map, feature, index) => {
      map[feature] = featureVector[index] ?? 0;
      return map;
    },
    {} as ReactionTimeFeatureValueMap
  );
}

export function buildReactionTimeFeatureValuesFromDatasetRow(input: {
  visualReactionTimeMs: number;
}): ReactionTimeFeatureValueMap {
  return {
    reactionTimeProxyMs: roundMetric(
      clamp(input.visualReactionTimeMs, REACTION_TIME_DATASET_MIN_MS, REACTION_TIME_DATASET_MAX_MS)
    )
  };
}

export function buildReactionTimeFeatureVectorFromValues(values: ReactionTimeFeatureValueMap) {
  return REACTION_TIME_MODEL_FEATURES.map((feature) => values[feature]);
}

export function buildReactionTimeProxySnapshot(metrics: MetricsSnapshot): ReactionTimeProxySnapshot {
  const memoryMetricsAvailable = hasMemoryReactionSamples(metrics);
  const primaryResponseTimeMs = averageOrFallback(
    metrics.cognitiveMetrics.responseTimesMs,
    [],
    DEFAULT_REACTION_TIME_MS
  );
  const interClickTimeMs = averageOrFallback(
    metrics.cognitiveMetrics.interClickTimesMs,
    [primaryResponseTimeMs],
    primaryResponseTimeMs || DEFAULT_REACTION_TIME_MS
  );
  const timingSamples = sanitizePositiveValues([
    ...metrics.cognitiveMetrics.responseTimesMs,
    ...metrics.cognitiveMetrics.interClickTimesMs
  ]);
  const reactionStdMs = Math.sqrt(variance(timingSamples));
  const fatigueDeltaMs = fatigueDeltaFromRounds(metrics.cognitiveMetrics.responseTimesMs);
  const errorCount = memoryMetricsAvailable
    ? Math.max(sanitizeMetric(metrics.cognitiveMetrics.errorCount), sanitizeMetric(metrics.sequenceErrors))
    : sanitizeMetric(metrics.sequenceErrors);
  const maxSequenceReached = memoryMetricsAvailable
    ? Math.max(
        sanitizeMetric(metrics.cognitiveMetrics.maxSequenceReached),
        sanitizeMetric(metrics.maxSequenceLength),
        sanitizeMetric(metrics.sequenceScore)
      )
    : Math.max(sanitizeMetric(metrics.maxSequenceLength), sanitizeMetric(metrics.sequenceScore));
  const impulsivityCount = sanitizeMetric(metrics.cognitiveMetrics.impulsivityCount);
  const roundsPlayed = Math.max(
    sanitizePositiveValues(metrics.cognitiveMetrics.responseTimesMs).length,
    maxSequenceReached > 0 || errorCount > 0 ? 1 : 0
  );
  const reactionTimeProxyMs = clamp(
    0.7 * primaryResponseTimeMs +
      0.3 * interClickTimeMs +
      0.15 * reactionStdMs +
      12 * errorCount +
      10 * impulsivityCount +
      0.25 * Math.max(0, fatigueDeltaMs),
    REACTION_TIME_DATASET_MIN_MS,
    REACTION_TIME_DATASET_MAX_MS
  );

  return {
    primaryResponseTimeMs: roundMetric(primaryResponseTimeMs),
    interClickTimeMs: roundMetric(interClickTimeMs),
    reactionStdMs: roundMetric(reactionStdMs),
    fatigueDeltaMs: roundMetric(fatigueDeltaMs),
    errorCount: roundMetric(errorCount),
    maxSequenceReached: roundMetric(maxSequenceReached),
    impulsivityCount: roundMetric(impulsivityCount),
    roundsPlayed: roundMetric(roundsPlayed),
    reactionTimeProxyMs: roundMetric(reactionTimeProxyMs)
  };
}

export function buildReactionTimeFeatureValuesFromMetrics(metrics: MetricsSnapshot) {
  const snapshot = buildReactionTimeProxySnapshot(metrics);

  return {
    reactionTimeProxyMs: snapshot.reactionTimeProxyMs
  };
}

export function buildReactionTimeFeatureVectorFromMetrics(metrics: MetricsSnapshot) {
  return buildReactionTimeFeatureVectorFromValues(buildReactionTimeFeatureValuesFromMetrics(metrics));
}

export function normalizeReactionTimeFeatureVector(
  featureVector: number[],
  normalization: ReactionTimeFeatureNormalization[]
) {
  return normalization.map(({ mean, std }, index) => ((featureVector[index] ?? 0) - mean) / (std || 1));
}
