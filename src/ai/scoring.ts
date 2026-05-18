import type { MetricsSnapshot } from "@/metrics/metricsCollector";

export type RiskBand = "baixo" | "intermediario" | "alto";

export interface RiskScore {
  value: number;
  band: RiskBand;
}

export interface KogniffyScores {
  dyslexiaRisk: RiskScore;
  colorVisionRisk: RiskScore;
  attentionRisk: RiskScore;
  memoryReactionRisk: RiskScore;
  overallScore: number;
}

const SCORE_KEYS = ["dyslexiaRisk", "colorVisionRisk", "attentionRisk", "memoryReactionRisk"] as const;

type ScoreKey = (typeof SCORE_KEYS)[number];

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

function rate(numerator: number, denominator: number) {
  return Math.max(0, numerator) / Math.max(1, denominator);
}

function missRateFromResponses(
  metrics: MetricsSnapshot,
  predicate: (response: MetricsSnapshot["colorPhase"]["responses"][number]) => boolean
) {
  const responses = metrics.colorPhase.responses.filter(predicate);

  if (responses.length === 0) {
    return 0;
  }

  return rate(
    responses.filter((response) => !response.correct).length,
    responses.length
  );
}

export function bandForScore(score: number): RiskBand {
  if (score <= 35) {
    return "baixo";
  }

  if (score <= 65) {
    return "intermediario";
  }

  return "alto";
}

export function createScore(value: number): RiskScore {
  const normalized = clampScore(value);

  return {
    value: normalized,
    band: bandForScore(normalized)
  };
}

export function calculateOverallScore(values: number[]) {
  return clampScore(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
}

export function overrideRiskScore(scores: KogniffyScores, key: ScoreKey, value: number): KogniffyScores {
  const nextScores = {
    ...scores,
    [key]: createScore(value)
  } as KogniffyScores;

  return {
    ...nextScores,
    [key]: nextScores[key],
    overallScore: calculateOverallScore([
      ...SCORE_KEYS.map((scoreKey) => nextScores[scoreKey].value)
    ])
  };
}

export function overrideDyslexiaRisk(scores: KogniffyScores, value: number): KogniffyScores {
  return overrideRiskScore(scores, "dyslexiaRisk", value);
}

export function overrideColorVisionRisk(scores: KogniffyScores, value: number): KogniffyScores {
  return overrideRiskScore(scores, "colorVisionRisk", value);
}

export function calculateScores(metrics: MetricsSnapshot): KogniffyScores {
  const avgResponse = average(metrics.responseTimes);
  const avgHesitation = average(metrics.hesitationTimes);
  const avgFirstClick = average(metrics.firstClickTimes);
  const reactionVariance = Math.sqrt(variance(metrics.reactionTimes));
  const avgReaction = average(metrics.reactionTimes);
  const colorAvgResponse = average(metrics.colorPhase.responseTimes);
  const colorResponseDeviation = Math.sqrt(variance(metrics.colorPhase.responseTimes));
  const redGreenMissRate = missRateFromResponses(metrics, (response) => response.trialType === "redGreen");
  const blueYellowMissRate = missRateFromResponses(metrics, (response) => response.trialType === "blueYellow");
  const lowContrastMissRate = missRateFromResponses(metrics, (response) => response.trialType === "lowContrast");
  const letterMissRate = missRateFromResponses(metrics, (response) => response.charType === "letter");
  const digitMissRate = missRateFromResponses(metrics, (response) => response.charType === "digit");
  const firstChoiceMissRate = rate(metrics.colorPhase.firstChoiceMisses, metrics.colorPhase.startedTrials);
  const autoHelpRate = rate(metrics.colorPhase.autoHelpCount, metrics.colorPhase.startedTrials);
  const accuracyPenalty = 1 - rate(metrics.colorPhase.hits, metrics.colorPhase.attempts);

  const dyslexiaValue =
    metrics.inversionErrors * 17 +
    metrics.repeatedErrors * 5 +
    metrics.corrections * 4 +
    avgHesitation / 120 +
    avgFirstClick / 160 +
    avgResponse / 180;

  const colorVisionValue =
    metrics.colorPhase.startedTrials > 0
      ? accuracyPenalty * 28 +
        redGreenMissRate * 30 +
        blueYellowMissRate * 26 +
        lowContrastMissRate * 14 +
        firstChoiceMissRate * 18 +
        autoHelpRate * 20 +
        colorAvgResponse / 160 +
        colorResponseDeviation / 55 +
        Math.max(0, letterMissRate - digitMissRate) * 8
      : metrics.contrastErrors * 13 +
        metrics.redGreenErrors * 12 +
        metrics.blueYellowErrors * 12 +
        metrics.lowContrastErrors * 8;

  const attentionValue =
    metrics.impulsiveClicks * 12 +
    metrics.missedTargets * 14 +
    reactionVariance / 45 +
    avgReaction / 220 +
    metrics.repeatedErrors * 3;

  const rememberedBonus = Math.max(0, 6 - metrics.maxSequenceLength) * 9;
  const memoryValue =
    metrics.sequenceErrors * 14 +
    rememberedBonus +
    Math.max(0, 5 - metrics.sequenceScore) * 6 +
    avgReaction / 260;

  const dyslexiaRisk = createScore(dyslexiaValue);
  const colorVisionRisk = createScore(colorVisionValue);
  const attentionRisk = createScore(attentionValue);
  const memoryReactionRisk = createScore(memoryValue);
  const overallScore = calculateOverallScore([
    dyslexiaRisk.value,
    colorVisionRisk.value,
    attentionRisk.value,
    memoryReactionRisk.value
  ]);

  return {
    dyslexiaRisk,
    colorVisionRisk,
    attentionRisk,
    memoryReactionRisk,
    overallScore
  };
}
