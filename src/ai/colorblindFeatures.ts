import type { ColorCharacterType, ColorPlateType } from "../colorblind/plates";

export const COLORBLIND_MODEL_FEATURES = [
  "accuracy",
  "missRate",
  "avgResponseTime",
  "responseTimeDeviation",
  "redGreenMissRate",
  "blueYellowMissRate",
  "lowContrastMissRate",
  "letterMissRate",
  "digitMissRate",
  "firstChoiceMissRate",
  "autoHelpRate"
] as const;

export type ColorblindModelFeatureName = (typeof COLORBLIND_MODEL_FEATURES)[number];

export interface ColorResponseLike {
  correct: boolean;
  trialType: ColorPlateType;
  charType: ColorCharacterType;
  responseTimeMs: number;
}

export interface ColorblindPhaseMetricsLike {
  startedTrials: number;
  completedTrials: number;
  attempts: number;
  hits: number;
  misses: number;
  responseTimes: number[];
  autoHelpCount: number;
  firstChoiceMisses: number;
  responses: ColorResponseLike[];
}

export interface ColorblindFeatureNormalization {
  feature: ColorblindModelFeatureName;
  mean: number;
  std: number;
}

export interface ColorblindModelMetadata {
  features: ColorblindModelFeatureName[];
  normalization: ColorblindFeatureNormalization[];
  rowCount: number;
  classDistribution: {
    noColorBlind: number;
    colorBlind: number;
  };
  trainedAt: string;
}

function sanitizeMetric(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function divideByAtLeastOne(numerator: number, denominator: number) {
  return sanitizeMetric(numerator) / Math.max(1, sanitizeMetric(denominator));
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
  return (
    values.reduce((sum, value) => sum + (sanitizeMetric(value) - mean) ** 2, 0) / Math.max(1, values.length - 1)
  );
}

function missRateForResponses(
  responses: ColorResponseLike[],
  predicate: (response: ColorResponseLike) => boolean
) {
  const filtered = responses.filter(predicate);

  if (filtered.length === 0) {
    return 0;
  }

  const misses = filtered.filter((response) => !response.correct).length;
  return divideByAtLeastOne(misses, filtered.length);
}

export function buildColorblindFeatureVectorFromPhase(phase: ColorblindPhaseMetricsLike | null | undefined) {
  if (!phase || phase.startedTrials <= 0) {
    return null;
  }

  return [
    divideByAtLeastOne(phase.hits, phase.attempts),
    divideByAtLeastOne(phase.misses, phase.attempts),
    average(phase.responseTimes),
    Math.sqrt(variance(phase.responseTimes)),
    missRateForResponses(phase.responses, (response) => response.trialType === "redGreen"),
    missRateForResponses(phase.responses, (response) => response.trialType === "blueYellow"),
    missRateForResponses(phase.responses, (response) => response.trialType === "lowContrast"),
    missRateForResponses(phase.responses, (response) => response.charType === "letter"),
    missRateForResponses(phase.responses, (response) => response.charType === "digit"),
    divideByAtLeastOne(phase.firstChoiceMisses, phase.startedTrials),
    divideByAtLeastOne(phase.autoHelpCount, phase.startedTrials)
  ];
}

export function normalizeColorblindFeatureVector(
  featureVector: number[],
  normalization: ColorblindFeatureNormalization[]
) {
  return normalization.map(({ mean, std }, index) => (featureVector[index] - mean) / (std || 1));
}
