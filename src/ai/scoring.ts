import type { MetricsSnapshot } from "@/metrics/metricsCollector";
import { calculateCognitivePerformanceFallbackRisk } from "@/ai/cognitivePerformanceFeatures";
import { buildReactionTimeProxySnapshot } from "@/ai/reactionTimeFeatures";

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
  cognitivePerformanceRisk: RiskScore;
  overallScore: number;
}

const SCORE_KEYS = [
  "dyslexiaRisk",
  "colorVisionRisk",
  "attentionRisk",
  "memoryReactionRisk",
  "cognitivePerformanceRisk"
] as const;

type ScoreKey = (typeof SCORE_KEYS)[number];
const MEMORY_REACTION_TARGET_SEQUENCE = 6;

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

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
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

function hasAttentionPhase(metrics: MetricsSnapshot) {
  return metrics.attentionPhase.targetSpawns > 0 || metrics.attentionPhase.ruleSummaries.length > 0;
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

export function overrideAttentionRisk(scores: KogniffyScores, value: number): KogniffyScores {
  return overrideRiskScore(scores, "attentionRisk", value);
}

export function overrideMemoryReactionRisk(scores: KogniffyScores, value: number): KogniffyScores {
  return overrideRiskScore(scores, "memoryReactionRisk", value);
}

export function overrideCognitivePerformanceRisk(scores: KogniffyScores, value: number): KogniffyScores {
  return overrideRiskScore(scores, "cognitivePerformanceRisk", value);
}

export function calculateMemoryReactionHeuristicRisk(metrics: MetricsSnapshot) {
  const snapshot = buildReactionTimeProxySnapshot(metrics);
  const sequenceSpanPenalty = clampUnit(
    Math.max(0, MEMORY_REACTION_TARGET_SEQUENCE - snapshot.maxSequenceReached) / MEMORY_REACTION_TARGET_SEQUENCE
  );
  const errorRate = clampUnit(snapshot.errorCount / Math.max(1, snapshot.roundsPlayed));
  const impulsivityPenalty = clampUnit(snapshot.impulsivityCount / Math.max(1, snapshot.roundsPlayed));
  const consistencyPenalty = clampUnit(snapshot.reactionStdMs / 220);
  const fatiguePenalty = clampUnit(Math.max(0, snapshot.fatigueDeltaMs) / 180);

  return clampScore(
    100 *
      (0.4 * sequenceSpanPenalty +
        0.3 * errorRate +
        0.1 * impulsivityPenalty +
        0.1 * consistencyPenalty +
        0.1 * fatiguePenalty)
  );
}

export function calculateMemoryReactionCompositeRisk(reactionRiskScore: number, memoryHeuristicRisk: number) {
  return clampScore(0.5 * clampScore(reactionRiskScore) + 0.5 * clampScore(memoryHeuristicRisk));
}

export function calculateScores(metrics: MetricsSnapshot): KogniffyScores {
  const avgResponse = average(metrics.responseTimes);
  const avgHesitation = average(metrics.hesitationTimes);
  const avgFirstClick = average(metrics.firstClickTimes);
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
  const attentionUsesPhase = hasAttentionPhase(metrics);
  const attentionReactionTimes = attentionUsesPhase ? metrics.attentionPhase.reactionTimes : metrics.reactionTimes;
  const attentionReactionDeviation = Math.sqrt(variance(attentionReactionTimes));
  const attentionAvgReaction = average(attentionReactionTimes);
  const attentionStartSegment = metrics.attentionPhase.segmentSummaries[0];
  const attentionEndSegment = metrics.attentionPhase.segmentSummaries[2];
  const attentionSegmentHitRates = metrics.attentionPhase.segmentSummaries.map((segment) =>
    rate(segment.hits, segment.targetSpawns)
  );
  const attentionOmissionRate = rate(metrics.attentionPhase.omissions, metrics.attentionPhase.targetSpawns);
  const attentionImpulsiveRate = rate(
    metrics.attentionPhase.impulsiveErrors,
    metrics.attentionPhase.correctHits + metrics.attentionPhase.impulsiveErrors
  );
  const attentionDistractionRate = rate(
    metrics.attentionPhase.distractionsCollected,
    metrics.attentionPhase.distractionSpawns
  );
  const attentionSwitchLatencies = metrics.attentionPhase.ruleSummaries
    .map((summary) => summary.switchFirstHitLatencyMs)
    .filter((value): value is number => value !== null);
  const attentionAvgSwitchLatency = average(attentionSwitchLatencies);
  const attentionPostSwitchErrorRate = average(
    metrics.attentionPhase.ruleSummaries.map((summary) =>
      rate(summary.postSwitchErrors, summary.postSwitchErrors + summary.postSwitchHits)
    )
  );
  const earlyMissRate = attentionStartSegment ? rate(attentionStartSegment.omissions, attentionStartSegment.targetSpawns) : 0;
  const lateMissRate = attentionEndSegment ? rate(attentionEndSegment.omissions, attentionEndSegment.targetSpawns) : 0;

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
    attentionUsesPhase
      ? attentionOmissionRate * 26 +
        attentionImpulsiveRate * 18 +
        attentionDistractionRate * 12 +
        attentionAvgReaction / 260 +
        attentionReactionDeviation / 65 +
        attentionAvgSwitchLatency / 220 +
        attentionPostSwitchErrorRate * 16 +
        Math.max(0, lateMissRate - earlyMissRate) * 12 +
        Math.sqrt(variance(attentionSegmentHitRates)) * 16
      : metrics.impulsiveClicks * 12 +
        metrics.missedTargets * 14 +
        Math.sqrt(variance(metrics.reactionTimes)) / 45 +
        average(metrics.reactionTimes) / 220 +
        metrics.repeatedErrors * 3;

  const dyslexiaRisk = createScore(dyslexiaValue);
  const colorVisionRisk = createScore(colorVisionValue);
  const attentionRisk = createScore(attentionValue);
  const memoryReactionRisk = createScore(calculateMemoryReactionHeuristicRisk(metrics));
  const cognitivePerformanceRisk = createScore(calculateCognitivePerformanceFallbackRisk(metrics));
  const overallScore = calculateOverallScore([
    dyslexiaRisk.value,
    colorVisionRisk.value,
    attentionRisk.value,
    memoryReactionRisk.value,
    cognitivePerformanceRisk.value
  ]);

  return {
    dyslexiaRisk,
    colorVisionRisk,
    attentionRisk,
    memoryReactionRisk,
    cognitivePerformanceRisk,
    overallScore
  };
}
