import type { LayersModel, Tensor } from "@tensorflow/tfjs";
import { clampScore } from "@/ai/scoring";
import {
  buildCognitivePerformanceFeatureValuesFromMetrics,
  buildCognitivePerformanceFeatureVectorFromMetrics,
  buildCognitivePerformanceProxySnapshot,
  calculateCognitivePerformanceFallbackPerformanceScoreFromValues,
  normalizeCognitivePerformanceFeatureVector,
  toCognitivePerformanceFeatureValueMap,
  type CognitivePerformanceFeatureValueMap,
  type CognitivePerformanceModelMetadata,
  type CognitivePerformanceProxySnapshot
} from "@/ai/cognitivePerformanceFeatures";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";

const MODEL_BASE_URL = "/api/models/cognitiveperformance";

export interface CognitivePerformancePrediction {
  performanceScore: number;
  riskScore: number;
  featureVector: CognitivePerformanceFeatureValueMap;
  normalizedFeatures: CognitivePerformanceFeatureValueMap;
  proxyMetrics: CognitivePerformanceProxySnapshot;
  source: "model" | "fallback";
  metadataSummary: Pick<
    CognitivePerformanceModelMetadata,
    | "sourceDataset"
    | "targetColumn"
    | "rowCount"
    | "trainRowCount"
    | "validationRowCount"
    | "proxyDefinitionVersion"
    | "trainedAt"
  > | null;
}

let cognitivePerformanceModelPromise: Promise<LayersModel | null> | null = null;
let cognitivePerformanceMetadataPromise: Promise<CognitivePerformanceModelMetadata | null> | null = null;

function isMetadata(value: unknown): value is CognitivePerformanceModelMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const metadata = value as Partial<CognitivePerformanceModelMetadata>;
  return (
    Array.isArray(metadata.features) &&
    Array.isArray(metadata.normalization) &&
    typeof metadata.sourceDataset === "string" &&
    typeof metadata.targetColumn === "string"
  );
}

async function loadCognitivePerformanceModel(): Promise<LayersModel | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!cognitivePerformanceModelPromise) {
    cognitivePerformanceModelPromise = (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        return await tf.loadLayersModel(`${MODEL_BASE_URL}/model.json`);
      } catch {
        return null;
      }
    })();
  }

  return cognitivePerformanceModelPromise;
}

async function loadCognitivePerformanceMetadata(): Promise<CognitivePerformanceModelMetadata | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!cognitivePerformanceMetadataPromise) {
    cognitivePerformanceMetadataPromise = (async () => {
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

  return cognitivePerformanceMetadataPromise;
}

function buildPredictionFromFallback(
  featureVector: CognitivePerformanceFeatureValueMap,
  proxyMetrics: CognitivePerformanceProxySnapshot,
  metadata: CognitivePerformanceModelMetadata | null
): CognitivePerformancePrediction {
  const performanceScore = clampScore(calculateCognitivePerformanceFallbackPerformanceScoreFromValues(featureVector));
  const normalizedValues =
    metadata && metadata.normalization.length === 2
      ? toCognitivePerformanceFeatureValueMap(
          normalizeCognitivePerformanceFeatureVector(
            [featureVector.reactionTimeProxyMs, featureVector.memoryTestProxyScore],
            metadata.normalization
          )
        )
      : featureVector;

  return {
    performanceScore,
    riskScore: clampScore(100 - performanceScore),
    featureVector,
    normalizedFeatures: normalizedValues,
    proxyMetrics,
    source: "fallback",
    metadataSummary: metadata
      ? {
          sourceDataset: metadata.sourceDataset,
          targetColumn: metadata.targetColumn,
          rowCount: metadata.rowCount,
          trainRowCount: metadata.trainRowCount,
          validationRowCount: metadata.validationRowCount,
          proxyDefinitionVersion: metadata.proxyDefinitionVersion,
          trainedAt: metadata.trainedAt
        }
      : null
  };
}

export async function warmCognitivePerformanceModel() {
  await Promise.all([loadCognitivePerformanceModel(), loadCognitivePerformanceMetadata()]);
}

export async function predictCognitivePerformance(
  metrics: MetricsSnapshot
): Promise<CognitivePerformancePrediction | null> {
  const featureVector = buildCognitivePerformanceFeatureValuesFromMetrics(metrics);
  const featureArray = buildCognitivePerformanceFeatureVectorFromMetrics(metrics);
  const proxyMetrics = buildCognitivePerformanceProxySnapshot(metrics);
  const [model, metadata] = await Promise.all([
    loadCognitivePerformanceModel(),
    loadCognitivePerformanceMetadata()
  ]);

  if (!model || !metadata || metadata.normalization.length !== featureArray.length) {
    return buildPredictionFromFallback(featureVector, proxyMetrics, metadata);
  }

  const tf = await import("@tensorflow/tfjs");
  const normalizedFeatureArray = normalizeCognitivePerformanceFeatureVector(featureArray, metadata.normalization);
  const input = tf.tensor2d([normalizedFeatureArray]);
  const output = model.predict(input);

  if (Array.isArray(output)) {
    input.dispose();
    output.forEach((tensor) => tensor.dispose());
    return buildPredictionFromFallback(featureVector, proxyMetrics, metadata);
  }

  const prediction = output as Tensor;
  const values = Array.from(await prediction.data());

  input.dispose();
  prediction.dispose();

  if (values.length === 0) {
    return buildPredictionFromFallback(featureVector, proxyMetrics, metadata);
  }

  const performanceScore = clampScore(values[0] * 100);

  return {
    performanceScore,
    riskScore: clampScore(100 - performanceScore),
    featureVector,
    normalizedFeatures: toCognitivePerformanceFeatureValueMap(normalizedFeatureArray),
    proxyMetrics,
    source: "model",
    metadataSummary: {
      sourceDataset: metadata.sourceDataset,
      targetColumn: metadata.targetColumn,
      rowCount: metadata.rowCount,
      trainRowCount: metadata.trainRowCount,
      validationRowCount: metadata.validationRowCount,
      proxyDefinitionVersion: metadata.proxyDefinitionVersion,
      trainedAt: metadata.trainedAt
    }
  };
}
