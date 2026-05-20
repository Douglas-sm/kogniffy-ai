import type { LayersModel, Tensor } from "@tensorflow/tfjs";
import {
  ADHD_MODEL_FEATURES,
  ATTENTION_FEATURE_LABELS,
  buildAttentionFeatureValuesFromPhase,
  buildAttentionFeatureVectorFromPhase,
  normalizeAttentionFeatureVector,
  toAttentionFeatureValueMap,
  type AttentionFeatureValueMap,
  type AttentionModelMetadata
} from "@/ai/adhdFeatures";
import { clampScore } from "@/ai/scoring";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";

const MODEL_BASE_URL = "/api/models/adhd";

export interface AttentionFeatureContribution {
  feature: keyof AttentionFeatureValueMap;
  label: string;
  rawValue: number;
  normalizedValue: number;
  weight: number;
  contribution: number;
}

export interface AttentionPrediction {
  score: number;
  featureVector: AttentionFeatureValueMap;
  normalizedFeatures: AttentionFeatureValueMap;
  contributions: AttentionFeatureContribution[];
  metadataSummary: Pick<
    AttentionModelMetadata,
    | "sourceDataset"
    | "inferenceMode"
    | "modelType"
    | "rawRowCount"
    | "windowCount"
    | "subjectCount"
    | "classDistribution"
    | "trainedAt"
  >;
}

let attentionModelPromise: Promise<LayersModel | null> | null = null;
let attentionMetadataPromise: Promise<AttentionModelMetadata | null> | null = null;
let attentionWeightsPromise: Promise<number[] | null> | null = null;

function isMetadata(value: unknown): value is AttentionModelMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const metadata = value as Partial<AttentionModelMetadata>;
  return (
    Array.isArray(metadata.features) &&
    Array.isArray(metadata.normalization) &&
    typeof metadata.sourceDataset === "string" &&
    typeof metadata.inferenceMode === "string" &&
    typeof metadata.modelType === "string"
  );
}

async function loadAttentionModel(): Promise<LayersModel | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!attentionModelPromise) {
    attentionModelPromise = (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        return await tf.loadLayersModel(`${MODEL_BASE_URL}/model.json`);
      } catch {
        return null;
      }
    })();
  }

  return attentionModelPromise;
}

async function loadAttentionMetadata(): Promise<AttentionModelMetadata | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!attentionMetadataPromise) {
    attentionMetadataPromise = (async () => {
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

  return attentionMetadataPromise;
}

async function loadAttentionWeights(model: LayersModel) {
  if (!attentionWeightsPromise) {
    attentionWeightsPromise = (async () => {
      const layer = model.layers[0];

      if (!layer) {
        return null;
      }

      const tensors = layer.getWeights();
      const kernel = tensors[0];

      if (!kernel) {
        tensors.forEach((tensor) => tensor.dispose());
        return null;
      }

      const values = Array.from(await kernel.data()).slice(0, ADHD_MODEL_FEATURES.length);
      tensors.forEach((tensor) => tensor.dispose());
      return values;
    })();
  }

  return attentionWeightsPromise;
}

function getModelInputSize(model: LayersModel) {
  const [input] = model.inputs;
  const shape = input?.shape;

  if (!shape || shape.length === 0) {
    return null;
  }

  const lastDimension = shape[shape.length - 1];
  return typeof lastDimension === "number" ? lastDimension : null;
}

function isTensorOutput(value: unknown): value is Tensor {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof (value as Tensor).data === "function" &&
    "dispose" in value &&
    typeof (value as Tensor).dispose === "function"
  );
}

function disposePredictionOutput(output: unknown) {
  if (Array.isArray(output)) {
    output.forEach((tensor) => tensor.dispose());
    return;
  }

  if (output && typeof output === "object") {
    Object.values(output).forEach((value) => {
      if (isTensorOutput(value)) {
        value.dispose();
      }
    });
  }
}

export async function warmAttentionModel() {
  await Promise.all([loadAttentionModel(), loadAttentionMetadata()]);
}

export async function predictAttentionRisk(metrics: MetricsSnapshot): Promise<AttentionPrediction | null> {
  const featureVector = buildAttentionFeatureVectorFromPhase(metrics.attentionPhase);
  const featureValues = buildAttentionFeatureValuesFromPhase(metrics.attentionPhase);

  if (!featureVector || !featureValues) {
    return null;
  }

  const [model, metadata] = await Promise.all([loadAttentionModel(), loadAttentionMetadata()]);
  const modelInputSize = model ? getModelInputSize(model) : null;

  if (
    !model ||
    !metadata ||
    metadata.normalization.length !== featureVector.length ||
    (modelInputSize !== null && modelInputSize !== featureVector.length)
  ) {
    return null;
  }

  const tf = await import("@tensorflow/tfjs");
  const normalizedFeatureVector = normalizeAttentionFeatureVector(featureVector, metadata.normalization);
  const input = tf.tensor2d([normalizedFeatureVector]);
  let prediction: Tensor | null = null;
  let scores: number[] = [];
  let weights: number[] | null = null;
  const normalizedFeatures = toAttentionFeatureValueMap(normalizedFeatureVector);

  try {
    const output = model.predict(input);

    if (!isTensorOutput(output)) {
      disposePredictionOutput(output);
      return null;
    }

    prediction = output;
    [scores, weights] = await Promise.all([prediction.data().then((values) => Array.from(values)), loadAttentionWeights(model)]);
  } catch {
    return null;
  } finally {
    input.dispose();
    prediction?.dispose();
  }

  if (scores.length === 0) {
    return null;
  }

  const contributions = ADHD_MODEL_FEATURES.map((feature, index) => ({
    feature,
    label: ATTENTION_FEATURE_LABELS[feature],
    rawValue: featureValues[feature],
    normalizedValue: normalizedFeatures[feature],
    weight: weights?.[index] ?? 0,
    contribution: (weights?.[index] ?? 0) * normalizedFeatures[feature]
  })).sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution));

  return {
    score: clampScore(scores[0] * 100),
    featureVector: featureValues,
    normalizedFeatures,
    contributions,
    metadataSummary: {
      sourceDataset: metadata.sourceDataset,
      inferenceMode: metadata.inferenceMode,
      modelType: metadata.modelType,
      rawRowCount: metadata.rawRowCount,
      windowCount: metadata.windowCount,
      subjectCount: metadata.subjectCount,
      classDistribution: metadata.classDistribution,
      trainedAt: metadata.trainedAt
    }
  };
}
