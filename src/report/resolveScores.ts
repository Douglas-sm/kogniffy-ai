import type { AttentionPrediction } from "@/ai/adhdModel";
import type { CognitivePerformancePrediction } from "@/ai/cognitivePerformanceModel";
import type { DyslexiaPrediction } from "@/ai/dyslexiaModel";
import type { ReactionTimePrediction } from "@/ai/reactionTimeModel";
import {
  calculateOverallScore,
  createScore,
  type KogniffyScores,
  type RiskScore
} from "@/ai/scoring";

const SCORE_KEYS = [
  "dyslexiaRisk",
  "colorVisionRisk",
  "attentionRisk",
  "memoryReactionRisk",
  "cognitivePerformanceRisk"
] as const;

export type ScoreKey = (typeof SCORE_KEYS)[number];
export type ScoreSource = "heuristic" | "model" | "blended" | "fallback";
export type ModelValidationStatus = "accepted" | "rejected" | "notAvailable";

export interface ScoreResolution {
  key: ScoreKey;
  heuristicRisk: number;
  modelRisk: number | null;
  resolvedRisk: number;
  scoreSource: ScoreSource;
  modelStatus: ModelValidationStatus;
  rationale: string;
}

export type ScoreResolutionMap = Record<ScoreKey, ScoreResolution>;

interface ResolveScoresOptions {
  heuristicScores: KogniffyScores;
  dyslexiaPrediction?: DyslexiaPrediction | null;
  colorVisionRisk?: number | null;
  attentionPrediction?: AttentionPrediction | null;
  reactionTimePrediction?: ReactionTimePrediction | null;
  cognitivePerformancePrediction?: CognitivePerformancePrediction | null;
}

function blendRisk(heuristicRisk: number, modelRisk: number, modelWeight: number) {
  const safeWeight = Math.max(0, Math.min(1, modelWeight));
  return Math.round(heuristicRisk * (1 - safeWeight) + modelRisk * safeWeight);
}

function withHeuristic(key: ScoreKey, heuristicRisk: number, rationale: string): ScoreResolution {
  return {
    key,
    heuristicRisk,
    modelRisk: null,
    resolvedRisk: heuristicRisk,
    scoreSource: "heuristic",
    modelStatus: "notAvailable",
    rationale
  };
}

function acceptResolution(
  key: ScoreKey,
  heuristicRisk: number,
  modelRisk: number,
  resolvedRisk: number,
  scoreSource: ScoreSource,
  rationale: string
): ScoreResolution {
  return {
    key,
    heuristicRisk,
    modelRisk,
    resolvedRisk,
    scoreSource,
    modelStatus: "accepted",
    rationale
  };
}

function rejectResolution(key: ScoreKey, heuristicRisk: number, modelRisk: number, rationale: string): ScoreResolution {
  return {
    key,
    heuristicRisk,
    modelRisk,
    resolvedRisk: heuristicRisk,
    scoreSource: "heuristic",
    modelStatus: "rejected",
    rationale
  };
}

function resolveDyslexiaScore(
  heuristicScore: RiskScore,
  prediction: DyslexiaPrediction | null | undefined
): ScoreResolution {
  if (!prediction) {
    return withHeuristic("dyslexiaRisk", heuristicScore.value, "Modelo indisponível; usando apenas a leitura observada.");
  }

  return rejectResolution(
    "dyslexiaRisk",
    heuristicScore.value,
    prediction.riskScore,
    "O modelo de leitura foi descartado no relatório final porque a atividade atual não replica integralmente o protocolo de treino; prevalece a heurística observada na sessão."
  );
}

function resolveColorVisionScore(
  heuristicScore: RiskScore,
  predictedRisk: number | null | undefined
): ScoreResolution {
  if (predictedRisk === null || predictedRisk === undefined) {
    return withHeuristic(
      "colorVisionRisk",
      heuristicScore.value,
      "Modelo cromático indisponível; usando apenas a leitura observada."
    );
  }

  return rejectResolution(
    "colorVisionRisk",
    heuristicScore.value,
    predictedRisk,
    "O modelo cromático foi descartado no relatório final porque a atividade desta sessão já fornece sinais diretos suficientes; prevalece a heurística observada."
  );
}

function resolveAttentionScore(heuristicScore: RiskScore, prediction: AttentionPrediction | null | undefined): ScoreResolution {
  if (!prediction) {
    return withHeuristic("attentionRisk", heuristicScore.value, "Modelo de atenção indisponível; usando a heurística.");
  }

  return acceptResolution(
    "attentionRisk",
    heuristicScore.value,
    prediction.score,
    prediction.score,
    "model",
    "Mantendo a leitura calibrada pelo modelo de atenção."
  );
}

function resolveMemoryReactionScore(
  heuristicScore: RiskScore,
  prediction: ReactionTimePrediction | null | undefined
): ScoreResolution {
  if (!prediction) {
    return withHeuristic(
      "memoryReactionRisk",
      heuristicScore.value,
      "Modelo de reação indisponível; usando apenas o comportamento observado."
    );
  }

  const snapshot = prediction.proxyMetrics;
  const heuristicRisk = heuristicScore.value;
  const modelRisk = prediction.riskScore;
  const strongSequence = snapshot.maxSequenceReached >= 6 && snapshot.errorCount === 0 && snapshot.impulsivityCount === 0;
  const steadyReaction = snapshot.interClickTimeMs <= 430 && snapshot.reactionStdMs <= 130;
  const strugglingSession =
    snapshot.maxSequenceReached <= 3 ||
    snapshot.errorCount >= 2 ||
    snapshot.impulsivityCount >= 2 ||
    snapshot.interClickTimeMs >= 520;

  if ((strongSequence && steadyReaction && modelRisk >= 60) || modelRisk > heuristicRisk + 45) {
    return rejectResolution(
      "memoryReactionRisk",
      heuristicRisk,
      modelRisk,
      "O modelo de reação penalizou demais uma execução estável do painel; mantendo a heurística observada."
    );
  }

  if (strugglingSession && modelRisk + 20 < heuristicRisk) {
    return rejectResolution(
      "memoryReactionRisk",
      heuristicRisk,
      modelRisk,
      "O modelo de reação suavizou demais uma sessão difícil; mantendo a heurística observada."
    );
  }

  const modelWeight = prediction.source === "fallback" ? 0.18 : 0.25;
  const resolvedRisk = blendRisk(heuristicRisk, modelRisk, modelWeight);
  return acceptResolution(
    "memoryReactionRisk",
    heuristicRisk,
    modelRisk,
    resolvedRisk,
    prediction.source === "fallback" ? "fallback" : "blended",
    "Leitura final priorizando a memória observada no jogo e usando o modelo de reação como calibrador complementar."
  );
}

function resolveCognitivePerformanceScore(
  heuristicScore: RiskScore,
  prediction: CognitivePerformancePrediction | null | undefined
): ScoreResolution {
  if (!prediction) {
    return withHeuristic(
      "cognitivePerformanceRisk",
      heuristicScore.value,
      "Modelo cognitivo indisponível; usando a composição heurística calibrada."
    );
  }

  const snapshot = prediction.proxyMetrics;
  const heuristicRisk = heuristicScore.value;
  const modelRisk = prediction.riskScore;
  const strongSession =
    snapshot.maxSequenceReached >= 6 &&
    snapshot.errorCount === 0 &&
    snapshot.impulsivityCount === 0 &&
    snapshot.memoryTestProxyScore >= 85 &&
    snapshot.reactionTimeProxyMs <= 420;
  const strugglingSession =
    snapshot.maxSequenceReached <= 3 ||
    snapshot.errorCount >= 2 ||
    snapshot.impulsivityCount >= 2 ||
    snapshot.memoryTestProxyScore <= 55;

  if (strongSession && modelRisk >= 45) {
    return rejectResolution(
      "cognitivePerformanceRisk",
      heuristicRisk,
      modelRisk,
      "O modelo cognitivo ficou pessimista demais para uma sessão forte; mantendo a composição calibrada da sessão."
    );
  }

  if (strugglingSession && modelRisk <= 35 && heuristicRisk >= 55) {
    return rejectResolution(
      "cognitivePerformanceRisk",
      heuristicRisk,
      modelRisk,
      "O modelo cognitivo ficou otimista demais para uma sessão difícil; mantendo a composição calibrada."
    );
  }

  if (Math.abs(modelRisk - heuristicRisk) > 30) {
    return rejectResolution(
      "cognitivePerformanceRisk",
      heuristicRisk,
      modelRisk,
      "A divergência do modelo cognitivo ficou alta demais; mantendo a composição heurística calibrada."
    );
  }

  const modelWeight = prediction.source === "fallback" ? 0.25 : 0.4;
  const resolvedRisk = blendRisk(heuristicRisk, modelRisk, modelWeight);
  return acceptResolution(
    "cognitivePerformanceRisk",
    heuristicRisk,
    modelRisk,
    resolvedRisk,
    prediction.source === "fallback" ? "fallback" : "blended",
    "Leitura final combinando o proxy cognitivo calibrado com o modelo de desempenho."
  );
}

function buildScoresFromResolutions(resolutions: ScoreResolutionMap): KogniffyScores {
  const dyslexiaRisk = createScore(resolutions.dyslexiaRisk.resolvedRisk);
  const colorVisionRisk = createScore(resolutions.colorVisionRisk.resolvedRisk);
  const attentionRisk = createScore(resolutions.attentionRisk.resolvedRisk);
  const memoryReactionRisk = createScore(resolutions.memoryReactionRisk.resolvedRisk);
  const cognitivePerformanceRisk = createScore(resolutions.cognitivePerformanceRisk.resolvedRisk);

  return {
    dyslexiaRisk,
    colorVisionRisk,
    attentionRisk,
    memoryReactionRisk,
    cognitivePerformanceRisk,
    overallScore: calculateOverallScore(
      SCORE_KEYS.map((key) => resolutions[key].resolvedRisk)
    )
  };
}

export function resolveScores(options: ResolveScoresOptions) {
  const resolutions: ScoreResolutionMap = {
    dyslexiaRisk: resolveDyslexiaScore(
      options.heuristicScores.dyslexiaRisk,
      options.dyslexiaPrediction
    ),
    colorVisionRisk: resolveColorVisionScore(
      options.heuristicScores.colorVisionRisk,
      options.colorVisionRisk
    ),
    attentionRisk: resolveAttentionScore(options.heuristicScores.attentionRisk, options.attentionPrediction),
    memoryReactionRisk: resolveMemoryReactionScore(
      options.heuristicScores.memoryReactionRisk,
      options.reactionTimePrediction
    ),
    cognitivePerformanceRisk: resolveCognitivePerformanceScore(
      options.heuristicScores.cognitivePerformanceRisk,
      options.cognitivePerformancePrediction
    )
  };

  return {
    scores: buildScoresFromResolutions(resolutions),
    resolutions
  };
}
