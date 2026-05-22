import type { LayersModel, Tensor } from "@tensorflow/tfjs";
import { clampScore } from "@/ai/scoring";
import {
  REACTION_TIME_AVERAGE_THRESHOLD_MS,
  REACTION_TIME_DATASET_MAX_MS,
  REACTION_TIME_DATASET_MIN_MS,
  REACTION_TIME_GOOD_THRESHOLD_MS,
  buildReactionTimeFeatureValuesFromMetrics,
  buildReactionTimeFeatureVectorFromMetrics,
  buildReactionTimeProxySnapshot,
  normalizeReactionTimeFeatureVector,
  toReactionTimeFeatureValueMap,
  type ReactionTimeCategory,
  type ReactionTimeFeatureValueMap,
  type ReactionTimeModelMetadata,
  type ReactionTimeProxySnapshot
} from "@/ai/reactionTimeFeatures";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";

const MODEL_BASE_URL = "/api/models/reactiontime";

export interface ReactionTimePrediction {
  performanceScore: number;
  riskScore: number;
  dominantCategory: ReactionTimeCategory;
  classProbabilities: Record<ReactionTimeCategory, number>;
  featureVector: ReactionTimeFeatureValueMap;
  normalizedFeatures: ReactionTimeFeatureValueMap;
  proxyMetrics: ReactionTimeProxySnapshot;
  source: "model" | "fallback";
  metadataSummary: Pick<
    ReactionTimeModelMetadata,
    | "sourceDataset"
    | "targetColumn"
    | "rowCount"
    | "trainRowCount"
    | "validationRowCount"
    | "classDistribution"
    | "featureColumnsUsed"
    | "proxyDefinitionVersion"
    | "trainedAt"
  > | null;
}

let reactionTimeModelPromise: Promise<LayersModel | null> | null = null;
let reactionTimeMetadataPromise: Promise<ReactionTimeModelMetadata | null> | null = null;

function isMetadata(value: unknown): value is ReactionTimeModelMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const metadata = value as Partial<ReactionTimeModelMetadata>;
  return (
    Array.isArray(metadata.features) &&
    Array.isArray(metadata.normalization) &&
    typeof metadata.sourceDataset === "string" &&
    typeof metadata.targetColumn === "string"
  );
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function buildMetadataSummary(metadata: ReactionTimeModelMetadata | null) {
  if (!metadata) {
    return null;
  }

  return {
    sourceDataset: metadata.sourceDataset,
    targetColumn: metadata.targetColumn,
    rowCount: metadata.rowCount,
    trainRowCount: metadata.trainRowCount,
    validationRowCount: metadata.validationRowCount,
    classDistribution: metadata.classDistribution,
    featureColumnsUsed: metadata.featureColumnsUsed,
    proxyDefinitionVersion: metadata.proxyDefinitionVersion,
    trainedAt: metadata.trainedAt
  };
}

function dominantCategoryFromProbabilities(probabilities: Record<ReactionTimeCategory, number>): ReactionTimeCategory {
  let dominant: ReactionTimeCategory = "average";
  let dominantValue = -1;

  for (const category of ["good", "average", "bad"] as const) {
    if (probabilities[category] > dominantValue) {
      dominant = category;
      dominantValue = probabilities[category];
    }
  }

  return dominant;
}

function toPerformanceScore(probabilities: Record<ReactionTimeCategory, number>) {
  return clampScore(probabilities.good * 100 + probabilities.average * 50);
}

function buildFallbackProbabilities(reactionTimeProxyMs: number): Record<ReactionTimeCategory, number> {
  if (reactionTimeProxyMs <= REACTION_TIME_GOOD_THRESHOLD_MS) {
    const progress = clampUnit(
      (reactionTimeProxyMs - REACTION_TIME_DATASET_MIN_MS) /
        Math.max(1, REACTION_TIME_GOOD_THRESHOLD_MS - REACTION_TIME_DATASET_MIN_MS)
    );

    return {
      good: 1 - progress,
      average: progress,
      bad: 0
    };
  }

  if (reactionTimeProxyMs <= REACTION_TIME_AVERAGE_THRESHOLD_MS) {
    const progress = clampUnit(
      (reactionTimeProxyMs - REACTION_TIME_GOOD_THRESHOLD_MS) /
        Math.max(1, REACTION_TIME_AVERAGE_THRESHOLD_MS - REACTION_TIME_GOOD_THRESHOLD_MS)
    );

    return {
      good: 0,
      average: 1 - 0.8 * progress,
      bad: 0.8 * progress
    };
  }

  const tailProgress = clampUnit(
    (reactionTimeProxyMs - REACTION_TIME_AVERAGE_THRESHOLD_MS) /
      Math.max(1, REACTION_TIME_DATASET_MAX_MS - REACTION_TIME_AVERAGE_THRESHOLD_MS)
  );

  return {
    good: 0,
    average: Math.max(0, 0.2 * (1 - tailProgress)),
    bad: 1 - Math.max(0, 0.2 * (1 - tailProgress))
  };
}

async function loadReactionTimeModel(): Promise<LayersModel | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!reactionTimeModelPromise) {
    reactionTimeModelPromise = (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        return await tf.loadLayersModel(`${MODEL_BASE_URL}/model.json`);
      } catch {
        return null;
      }
    })();
  }

  return reactionTimeModelPromise;
}

async function loadReactionTimeMetadata(): Promise<ReactionTimeModelMetadata | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!reactionTimeMetadataPromise) {
    reactionTimeMetadataPromise = (async () => {
      try {
        const response = await fetch(`${MODEL_BASE_URL}/normalization.json`, { cache: "no-store" });

        if (!response.ok) {
          return null;
        }

        const parsed = (await response.json()) as unknown;
        return isMetadata(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })();
  }

  return reactionTimeMetadataPromise;
}

function buildFallbackPrediction(
  featureVector: ReactionTimeFeatureValueMap,
  proxyMetrics: ReactionTimeProxySnapshot,
  metadata: ReactionTimeModelMetadata | null
): ReactionTimePrediction {
  const classProbabilities = buildFallbackProbabilities(featureVector.reactionTimeProxyMs);
  const performanceScore = toPerformanceScore(classProbabilities);
  const normalizedValues =
    metadata && metadata.normalization.length === 1
      ? toReactionTimeFeatureValueMap(
          normalizeReactionTimeFeatureVector([featureVector.reactionTimeProxyMs], metadata.normalization)
        )
      : featureVector;

  return {
    performanceScore,
    riskScore: clampScore(100 - performanceScore),
    dominantCategory: dominantCategoryFromProbabilities(classProbabilities),
    classProbabilities,
    featureVector,
    normalizedFeatures: normalizedValues,
    proxyMetrics,
    source: "fallback",
    metadataSummary: buildMetadataSummary(metadata)
  };
}

export async function warmReactionTimeModel() {
  await Promise.all([loadReactionTimeModel(), loadReactionTimeMetadata()]);
}

export async function predictReactionTimeRisk(metrics: MetricsSnapshot): Promise<ReactionTimePrediction | null> {
  const featureVector = buildReactionTimeFeatureValuesFromMetrics(metrics);
  const featureArray = buildReactionTimeFeatureVectorFromMetrics(metrics);
  const proxyMetrics = buildReactionTimeProxySnapshot(metrics);
  const [model, metadata] = await Promise.all([loadReactionTimeModel(), loadReactionTimeMetadata()]);

  if (!model || !metadata || metadata.normalization.length !== featureArray.length) {
    return buildFallbackPrediction(featureVector, proxyMetrics, metadata);
  }

  const tf = await import("@tensorflow/tfjs");
  const normalizedFeatureArray = normalizeReactionTimeFeatureVector(featureArray, metadata.normalization);
  const input = tf.tensor2d([normalizedFeatureArray]);
  const output = model.predict(input);

  if (Array.isArray(output)) {
    input.dispose();
    output.forEach((tensor) => tensor.dispose());
    return buildFallbackPrediction(featureVector, proxyMetrics, metadata);
  }

  const prediction = output as Tensor;
  const values = Array.from(await prediction.data());

  input.dispose();
  prediction.dispose();

  if (values.length < 3) {
    return buildFallbackPrediction(featureVector, proxyMetrics, metadata);
  }

  const classProbabilities = {
    good: clampUnit(values[0] ?? 0),
    average: clampUnit(values[1] ?? 0),
    bad: clampUnit(values[2] ?? 0)
  };
  const total = Math.max(
    1e-6,
    classProbabilities.good + classProbabilities.average + classProbabilities.bad
  );
  const normalizedProbabilities = {
    good: classProbabilities.good / total,
    average: classProbabilities.average / total,
    bad: classProbabilities.bad / total
  };
  const performanceScore = toPerformanceScore(normalizedProbabilities);

  return {
    performanceScore,
    riskScore: clampScore(100 - performanceScore),
    dominantCategory: dominantCategoryFromProbabilities(normalizedProbabilities),
    classProbabilities: normalizedProbabilities,
    featureVector,
    normalizedFeatures: toReactionTimeFeatureValueMap(normalizedFeatureArray),
    proxyMetrics,
    source: "model",
    metadataSummary: buildMetadataSummary(metadata)
  };
}
