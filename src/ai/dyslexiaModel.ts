import type { LayersModel, Tensor } from "@tensorflow/tfjs";
import {
  buildDyslexiaFeatureVectorFromPhase,
  normalizeDyslexiaFeatureVector,
  type DyslexiaRiskMapping,
  type DyslexiaModelMetadata
} from "@/ai/dyslexiaFeatures";
import { clampScore } from "@/ai/scoring";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";

const MODEL_BASE_URL = "/api/models/dyslexia";

let dyslexiaModelPromise: Promise<LayersModel | null> | null = null;
let dyslexiaMetadataPromise: Promise<DyslexiaModelMetadata | null> | null = null;

export interface DyslexiaPrediction {
  riskScore: number;
  rawProbability: number;
  outputMode: DyslexiaRiskMapping;
  featureVector: number[];
  normalizedFeatures: number[];
  metadataSummary: Pick<
    DyslexiaModelMetadata,
    "questionIds" | "rowCount" | "classDistribution" | "trainingMetrics" | "riskMapping" | "fixtureChecks" | "trainedAt"
  >;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toRiskScore(probability: number, outputMode: DyslexiaRiskMapping) {
  const mapped = outputMode === "oneMinusProbability" ? 1 - probability : probability;
  return clampScore(mapped * 100);
}

function isMetadata(value: unknown): value is DyslexiaModelMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const metadata = value as Partial<DyslexiaModelMetadata>;
  return Array.isArray(metadata.features) && Array.isArray(metadata.normalization);
}

async function loadDyslexiaModel(): Promise<LayersModel | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!dyslexiaModelPromise) {
    dyslexiaModelPromise = (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        return await tf.loadLayersModel(`${MODEL_BASE_URL}/model.json`);
      } catch {
        return null;
      }
    })();
  }

  return dyslexiaModelPromise;
}

async function loadDyslexiaMetadata(): Promise<DyslexiaModelMetadata | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!dyslexiaMetadataPromise) {
    dyslexiaMetadataPromise = (async () => {
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

  return dyslexiaMetadataPromise;
}

export async function predictDyslexiaRisk(metrics: MetricsSnapshot): Promise<DyslexiaPrediction | null> {
  const featureVector = buildDyslexiaFeatureVectorFromPhase(metrics.dyslexiaPhase);

  if (!featureVector) {
    return null;
  }

  const [model, metadata] = await Promise.all([loadDyslexiaModel(), loadDyslexiaMetadata()]);

  if (!model || !metadata || metadata.normalization.length !== featureVector.length) {
    return null;
  }

  const tf = await import("@tensorflow/tfjs");
  const normalizedFeatures = normalizeDyslexiaFeatureVector(featureVector, metadata.normalization);
  const input = tf.tensor2d([normalizedFeatures]);
  const output = model.predict(input);

  if (Array.isArray(output)) {
    input.dispose();
    output.forEach((tensor) => tensor.dispose());
    return null;
  }

  const prediction = output as Tensor;
  const values = Array.from(await prediction.data());

  input.dispose();
  prediction.dispose();

  if (values.length === 0) {
    return null;
  }

  const rawProbability = clampUnit(values[0] ?? 0);
  const outputMode = metadata.riskMapping ?? "probability";

  return {
    riskScore: toRiskScore(rawProbability, outputMode),
    rawProbability,
    outputMode,
    featureVector,
    normalizedFeatures,
    metadataSummary: {
      questionIds: metadata.questionIds,
      rowCount: metadata.rowCount,
      classDistribution: metadata.classDistribution,
      trainingMetrics: metadata.trainingMetrics,
      riskMapping: outputMode,
      fixtureChecks: metadata.fixtureChecks,
      trainedAt: metadata.trainedAt
    }
  };
}
