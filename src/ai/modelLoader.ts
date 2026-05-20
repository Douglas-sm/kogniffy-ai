import type { LayersModel, Tensor } from "@tensorflow/tfjs";

export interface ModelPrediction {
  dyslexiaRisk: number;
  colorVisionRisk: number;
  attentionRisk: number;
  memoryReactionRisk: number;
}

export async function loadKogniffyModel(): Promise<LayersModel | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const tf = await import("@tensorflow/tfjs");
    return await tf.loadLayersModel("/models/kogniffy/model.json");
  } catch {
    return null;
  }
}

export async function predictWithModel(features: number[]): Promise<ModelPrediction | null> {
  const model = await loadKogniffyModel();

  if (!model) {
    return null;
  }

  const tf = await import("@tensorflow/tfjs");
  const input = tf.tensor2d([features]);
  const output = model.predict(input) as Tensor;
  const values = Array.from(await output.data());

  input.dispose();
  output.dispose();

  if (values.length < 4) {
    return null;
  }

  return {
    dyslexiaRisk: Math.round(values[0] * 100),
    colorVisionRisk: Math.round(values[1] * 100),
    attentionRisk: Math.round(values[2] * 100),
    memoryReactionRisk: Math.round(values[3] * 100)
  };
}
