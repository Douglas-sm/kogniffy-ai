import type { LayersModel, Tensor } from "@tensorflow/tfjs";
import {
  buildColorblindFeatureVectorFromPhase,
  normalizeColorblindFeatureVector,
  type ColorblindModelMetadata
} from "@/ai/colorblindFeatures";
import { clampScore } from "@/ai/scoring";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";

const MODEL_BASE_URL = "/api/models/colorblind";

let colorblindModelPromise: Promise<LayersModel | null> | null = null;
let colorblindMetadataPromise: Promise<ColorblindModelMetadata | null> | null = null;

function isMetadata(value: unknown): value is ColorblindModelMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const metadata = value as Partial<ColorblindModelMetadata>;
  return Array.isArray(metadata.features) && Array.isArray(metadata.normalization);
}

async function loadColorblindModel(): Promise<LayersModel | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!colorblindModelPromise) {
    colorblindModelPromise = (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        return await tf.loadLayersModel(`${MODEL_BASE_URL}/model.json`);
      } catch {
        return null;
      }
    })();
  }

  return colorblindModelPromise;
}

async function loadColorblindMetadata(): Promise<ColorblindModelMetadata | null> {
  if (typeof window === "undefined") {
    return null;
  }

  if (!colorblindMetadataPromise) {
    colorblindMetadataPromise = (async () => {
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

  return colorblindMetadataPromise;
}

export async function predictColorVisionRisk(metrics: MetricsSnapshot): Promise<number | null> {
  const featureVector = buildColorblindFeatureVectorFromPhase(metrics.colorPhase);

  if (!featureVector) {
    return null;
  }

  const [model, metadata] = await Promise.all([loadColorblindModel(), loadColorblindMetadata()]);

  if (!model || !metadata || metadata.normalization.length !== featureVector.length) {
    return null;
  }

  const tf = await import("@tensorflow/tfjs");
  const normalizedFeatures = normalizeColorblindFeatureVector(featureVector, metadata.normalization);
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

  return clampScore(values[0] * 100);
}
