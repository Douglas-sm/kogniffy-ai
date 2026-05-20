import type {
  AttentionPhaseSnapshot,
  AttentionRuleId,
  AttentionRuleSummary,
  AttentionSegmentSummary
} from "../metrics/metricsCollector";

export const ADHD_MODEL_FEATURES = [
  "sustainedAttentionPenalty",
  "impulsivityPenalty",
  "distractibilityPenalty",
  "adaptationPenalty"
] as const;

export type AttentionModelFeatureName = (typeof ADHD_MODEL_FEATURES)[number];

export interface AttentionFeatureNormalization {
  feature: AttentionModelFeatureName;
  mean: number;
  std: number;
}

export interface AttentionModelTrainingMetrics {
  loss: number | null;
  accuracy: number | null;
  valLoss: number | null;
  valAccuracy: number | null;
}

export interface AttentionModelMetadata {
  features: AttentionModelFeatureName[];
  normalization: AttentionFeatureNormalization[];
  sourceDataset: string;
  inferenceMode: string;
  modelType: string;
  windowSize: number;
  rawRowCount: number;
  rowCount: number;
  windowCount: number;
  subjectCount: number;
  validationSubjectCount: number;
  classDistribution: {
    control: number;
    adhd: number;
  };
  trainingMetrics: AttentionModelTrainingMetrics;
  trainedAt: string;
}

export type AttentionFeatureValueMap = Record<AttentionModelFeatureName, number>;

export interface AttentionPhaseMetricsLike {
  targetSpawns: number;
  distractionSpawns: number;
  correctHits: number;
  wrongCrystalHits: number;
  impulsiveErrors: number;
  distractionsCollected: number;
  omissions: number;
  reactionTimes: number[];
  autoHelpCount: number;
  ruleSummaries: Array<
    Pick<AttentionRuleSummary, "postSwitchErrors" | "postSwitchHits" | "switchFirstHitLatencyMs">
  >;
  segmentSummaries: Array<Pick<AttentionSegmentSummary, "omissions" | "targetSpawns">>;
}

export const ATTENTION_FEATURE_LABELS: Record<AttentionModelFeatureName, string> = {
  sustainedAttentionPenalty: "manutencao do foco",
  impulsivityPenalty: "impulsividade",
  distractibilityPenalty: "distratibilidade",
  adaptationPenalty: "adaptacao a mudancas de regra"
};

export const ATTENTION_RULE_LABELS: Record<AttentionRuleId, string> = {
  blue: "Azuis",
  small: "Pequenos",
  red: "Vermelhos",
  bright: "Brilhantes"
};

function sanitizeMetric(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, sanitizeMetric(value)));
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

function rate(numerator: number, denominator: number) {
  return sanitizeMetric(numerator) / Math.max(1, sanitizeMetric(denominator));
}

function segmentMissRate(summary: Pick<AttentionSegmentSummary, "omissions" | "targetSpawns"> | undefined) {
  if (!summary) {
    return 0;
  }

  return rate(summary.omissions, summary.targetSpawns);
}

export function toAttentionFeatureValueMap(featureVector: number[]): AttentionFeatureValueMap {
  return ADHD_MODEL_FEATURES.reduce(
    (map, feature, index) => {
      map[feature] = featureVector[index] ?? 0;
      return map;
    },
    {} as AttentionFeatureValueMap
  );
}

export function buildAttentionFeatureValuesFromPhase(
  phase: AttentionPhaseMetricsLike | AttentionPhaseSnapshot | null | undefined
): AttentionFeatureValueMap | null {
  if (!phase || phase.targetSpawns <= 0) {
    return null;
  }

  const hitRate = rate(phase.correctHits, phase.targetSpawns);
  const omissionRate = rate(phase.omissions, phase.targetSpawns);
  const autoHelpRate = rate(phase.autoHelpCount, phase.targetSpawns);
  const impulsiveRate = rate(phase.impulsiveErrors, phase.correctHits + phase.impulsiveErrors);
  const wrongCrystalShare = rate(phase.wrongCrystalHits, phase.impulsiveErrors);
  const distractionRate = rate(phase.distractionsCollected, phase.distractionSpawns);
  const reactionStdMs = Math.sqrt(variance(phase.reactionTimes));
  const switchLatencies = phase.ruleSummaries
    .map((summary) => summary.switchFirstHitLatencyMs)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const avgSwitchLatencyMs = average(switchLatencies);
  const postSwitchErrorRate = average(
    phase.ruleSummaries.map((summary) => rate(summary.postSwitchErrors, summary.postSwitchErrors + summary.postSwitchHits))
  );
  const earlyMissRate = segmentMissRate(phase.segmentSummaries[0]);
  const lateMissRate = segmentMissRate(phase.segmentSummaries[2]);

  return {
    sustainedAttentionPenalty: clampUnit(0.5 * omissionRate + 0.3 * (1 - hitRate) + 0.2 * autoHelpRate),
    impulsivityPenalty: clampUnit(0.55 * impulsiveRate + 0.25 * wrongCrystalShare + 0.2 * postSwitchErrorRate),
    distractibilityPenalty: clampUnit(0.6 * distractionRate + 0.4 * Math.min(1, reactionStdMs / 500)),
    adaptationPenalty: clampUnit(
      0.45 * Math.min(1, avgSwitchLatencyMs / 2500) +
        0.35 * postSwitchErrorRate +
        0.2 * Math.max(0, lateMissRate - earlyMissRate)
    )
  };
}

export function buildAttentionFeatureVectorFromPhase(
  phase: AttentionPhaseMetricsLike | AttentionPhaseSnapshot | null | undefined
) {
  const values = buildAttentionFeatureValuesFromPhase(phase);

  if (!values) {
    return null;
  }

  return ADHD_MODEL_FEATURES.map((feature) => values[feature]);
}

export function normalizeAttentionFeatureVector(
  featureVector: number[],
  normalization: AttentionFeatureNormalization[]
) {
  return normalization.map(({ mean, std }, index) => (featureVector[index] - mean) / (std || 1));
}
