import type { AttentionPrediction } from "@/ai/adhdModel";
import { ATTENTION_RULE_LABELS } from "@/ai/adhdFeatures";
import type { CognitivePerformancePrediction } from "@/ai/cognitivePerformanceModel";
import { buildCognitivePerformanceProxySnapshot } from "@/ai/cognitivePerformanceFeatures";
import type { DyslexiaPrediction } from "@/ai/dyslexiaModel";
import type { ReactionTimePrediction } from "@/ai/reactionTimeModel";
import { buildReactionTimeProxySnapshot, type ReactionTimeCategory } from "@/ai/reactionTimeFeatures";
import { calculateMemoryReactionHeuristicRisk } from "@/ai/scoring";
import type { KogniffyScores, RiskScore } from "@/ai/scoring";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";
import type {
  ModelValidationStatus,
  ScoreResolution,
  ScoreResolutionMap,
  ScoreSource
} from "@/report/resolveScores";
import {
  triageBandForRisk,
  toTriageDisplayScore,
  type TriageBand,
  type TriageBandDefinition
} from "@/report/triagePresentation";

export interface ReportCategoryDetail {
  label: string;
  value: string;
}

export interface ReportCategory {
  id: keyof Pick<
    KogniffyScores,
    "dyslexiaRisk" | "colorVisionRisk" | "attentionRisk" | "memoryReactionRisk" | "cognitivePerformanceRisk"
  >;
  label: string;
  score: RiskScore;
  displayScore: number;
  displayBand: TriageBand;
  displayLabel: string;
  scoreSource: ScoreSource;
  modelStatus: ModelValidationStatus;
  summary: string;
  recommendation: string;
  evidence: string[];
  details?: ReportCategoryDetail[];
}

export interface KogniffyReport {
  totalTimeLabel: string;
  overallScore: number;
  overallDisplayScore: number;
  overallBand: TriageBand;
  overallLabel: string;
  summary: string;
  categories: ReportCategory[];
  recommendations: string[];
}

interface ReportCategoryDraft {
  id: ReportCategory["id"];
  label: string;
  score: RiskScore;
  scoreSource: ScoreSource;
  modelStatus: ModelValidationStatus;
  summary: string;
  recommendation: string;
  evidence: string[];
  details?: ReportCategoryDetail[];
}

interface GenerateReportOptions {
  dyslexiaPrediction?: DyslexiaPrediction | null;
  attentionPrediction?: AttentionPrediction | null;
  attentionHeuristicScore?: number;
  cognitivePerformancePrediction?: CognitivePerformancePrediction | null;
  reactionTimePrediction?: ReactionTimePrediction | null;
  memoryReactionHeuristicScore?: number;
  scoreResolutions?: Partial<ScoreResolutionMap>;
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
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
}

function rate(numerator: number, denominator: number) {
  return Math.max(0, numerator) / Math.max(1, denominator);
}

function percent(value: number) {
  return `${Math.round(Math.max(0, value) * 100)}%`;
}

function formatRawScore(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}/100`;
}

function formatDisplayScore(value: number) {
  return `${toTriageDisplayScore(value)}/100`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(value)));
}

function formatDuration(totalMs: number) {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}min ${seconds.toString().padStart(2, "0")}s`;
}

function formatShortMs(value: number) {
  return `${(Math.max(0, value) / 1000).toFixed(1)}s`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("pt-BR");
}

function formatSigned(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

function formatSignedMs(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${(Math.abs(value) / 1000).toFixed(1)}s`;
}

function resolutionSourceLabel(source: ScoreSource) {
  if (source === "model") {
    return "Modelo calibrado";
  }

  if (source === "blended") {
    return "Sessão observada + modelo";
  }

  if (source === "fallback") {
    return "Sessão observada + fallback calibrado";
  }

  return "Sessão observada";
}

function buildResolutionDetails(resolution: ScoreResolution | undefined) {
  if (!resolution) {
    return [];
  }

  const details: ReportCategoryDetail[] = [
    {
      label: "Origem do índice",
      value: resolutionSourceLabel(resolution.scoreSource)
    }
  ];

  if (resolution.modelStatus === "accepted" && resolution.modelRisk !== null) {
    details.push({
      label: "Heurística vs modelo",
      value: `${formatDisplayScore(resolution.heuristicRisk)} heurística | ${formatDisplayScore(resolution.modelRisk)} modelo`
    });
  }

  details.push({
    label: "Decisão final",
    value: resolution.rationale
  });

  return details;
}

function shouldSurfaceAcceptedModel(resolution: ScoreResolution | undefined) {
  return resolution?.modelStatus === "accepted";
}

function categorySummary(label: string, score: RiskScore) {
  const band = triageBandForRisk(score.value);
  return `${label}: índice de triagem ${band.label.toLowerCase()}, calculado a partir dos sinais observados durante a experiência.`;
}

function buildCategoryPresentation(score: RiskScore) {
  const displayScore = toTriageDisplayScore(score.value);
  const displayBand = triageBandForRisk(score.value);

  return {
    displayScore,
    displayBand
  };
}

function recommendationFromBand(band: TriageBandDefinition) {
  if (band.key === "needsAttention" || band.key === "attention") {
    return "Inclua esta área como prioridade em uma triagem complementar e compare o padrão observado com situações do cotidiano.";
  }

  if (band.key === "regular") {
    return "Acompanhe esta área em novas sessões de triagem para verificar se o padrão se mantém em diferentes momentos.";
  }

  return "Use este resultado favorável como referência comparativa nas próximas triagens, sem tratá-lo como conclusão clínica.";
}

function composeRecommendation(baseText: string, score: RiskScore) {
  return `${baseText} ${recommendationFromBand(triageBandForRisk(score.value))}`;
}

function createReportCategory(category: ReportCategoryDraft): ReportCategory {
  const presentation = buildCategoryPresentation(category.score);

  return {
    ...category,
    displayScore: presentation.displayScore,
    displayBand: presentation.displayBand.key,
    displayLabel: presentation.displayBand.label
  };
}

function summarizeOverallTriage(categories: ReportCategory[]) {
  const needsAttentionCount = categories.filter((category) =>
    category.displayBand === "needsAttention" || category.displayBand === "attention"
  ).length;
  const regularCount = categories.filter((category) => category.displayBand === "regular").length;
  const positiveCount = categories.filter((category) =>
    category.displayBand === "extremelyPositive" ||
    category.displayBand === "positive" ||
    category.displayBand === "good"
  ).length;

  if (needsAttentionCount > 0) {
    return `A triagem destacou ${needsAttentionCount} área(s) que pedem atenção mais próxima. Use o resultado para priorizar o acompanhamento, sem tratar esta leitura como diagnóstico.`;
  }

  if (regularCount > 0) {
    return `A triagem mostrou um panorama favorável, com ${regularCount} área(s) que valem acompanhamento nas próximas sessões.`;
  }

  return positiveCount === categories.length
    ? "A triagem mostrou sinais amplamente positivos nas áreas avaliadas, com bom equilíbrio geral nesta sessão."
    : "A triagem mostrou um panorama estável e predominantemente positivo nesta sessão.";
}

function reactionCategoryLabel(category: ReactionTimeCategory) {
  if (category === "good") {
    return "rápida";
  }

  if (category === "average") {
    return "intermediária";
  }

  return "lenta";
}

function missRateForColorGroup(metrics: MetricsSnapshot, predicate: (trialType: string) => boolean) {
  const responses = metrics.colorPhase.responses.filter((response) => predicate(response.trialType));

  if (responses.length === 0) {
    return 0;
  }

  return rate(
    responses.filter((response) => !response.correct).length,
    responses.length
  );
}

function missRateForCharType(metrics: MetricsSnapshot, charType: "digit" | "letter") {
  const responses = metrics.colorPhase.responses.filter((response) => response.charType === charType);

  if (responses.length === 0) {
    return 0;
  }

  return rate(
    responses.filter((response) => !response.correct).length,
    responses.length
  );
}

function topColorConfusion(metrics: MetricsSnapshot) {
  const mistakes = metrics.colorPhase.responses.filter((response) => !response.correct);
  const counts = new Map<string, number>();

  for (const mistake of mistakes) {
    const key = `${mistake.target}->${mistake.selected}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: { key: string; count: number } | null = null;

  for (const [key, count] of counts) {
    if (!best || count > best.count) {
      best = { key, count };
    }
  }

  return best;
}

function hasAttentionPhase(metrics: MetricsSnapshot) {
  return metrics.attentionPhase.targetSpawns > 0 || metrics.attentionPhase.ruleSummaries.length > 0;
}

function summarizeLiveAttentionSamples(metrics: MetricsSnapshot) {
  const samples = metrics.attentionPhase.liveRiskSamples;

  if (samples.length === 0) {
    return null;
  }

  const scores = samples.map((sample) => sample.score);

  return {
    count: samples.length,
    average: average(scores),
    min: Math.min(...scores),
    max: Math.max(...scores)
  };
}

function mostCriticalAttentionRule(metrics: MetricsSnapshot) {
  const samples = metrics.attentionPhase.liveRiskSamples;

  if (samples.length === 0) {
    return null;
  }

  const byRule = new Map<string, { total: number; count: number }>();

  for (const sample of samples) {
    const bucket = byRule.get(sample.ruleId) ?? { total: 0, count: 0 };
    bucket.total += sample.score;
    bucket.count += 1;
    byRule.set(sample.ruleId, bucket);
  }

  let best: { ruleId: keyof typeof ATTENTION_RULE_LABELS; average: number } | null = null;

  for (const [ruleId, bucket] of byRule) {
    const ruleAverage = bucket.total / Math.max(1, bucket.count);

    if (!best || ruleAverage > best.average) {
      best = {
        ruleId: ruleId as keyof typeof ATTENTION_RULE_LABELS,
        average: ruleAverage
      };
    }
  }

  return best
    ? {
        ...best,
        label: ATTENTION_RULE_LABELS[best.ruleId]
      }
    : null;
}

function topAttentionSignals(prediction: AttentionPrediction | null | undefined) {
  if (!prediction) {
    return [];
  }

  const positiveContributions = prediction.contributions.filter((item) => item.contribution > 0);
  const source = positiveContributions.length > 0 ? positiveContributions : prediction.contributions;

  return source.slice(0, 3);
}

function buildDyslexiaEvidence(metrics: MetricsSnapshot) {
  const phase = metrics.dyslexiaPhase;

  if (phase.startedWords === 0) {
    return ["A fase de letras não registrou interações suficientes para detalhar comportamento."];
  }

  return [
    `${phase.completedWords} de ${phase.startedWords} palavras foram concluídas durante a fase.`,
    `${phase.inversionErrors} trocas entre letras parecidas foram registradas nas tentativas.`,
    `Tempo médio até o primeiro clique: ${formatShortMs(average(phase.firstClickTimes))}.`
  ];
}

function buildDyslexiaDetails(metrics: MetricsSnapshot, options: GenerateReportOptions): ReportCategoryDetail[] | undefined {
  const phase = metrics.dyslexiaPhase;
  const resolution = options.scoreResolutions?.dyslexiaRisk;
  const details = buildResolutionDetails(resolution);

  if (phase.startedWords > 0) {
    details.push(
      {
        label: "Palavras concluídas",
        value: `${formatCount(phase.completedWords)} / ${formatCount(phase.startedWords)}`
      },
      {
        label: "Acertos nas escolhas",
        value: `${formatCount(phase.hits)} / ${formatCount(phase.attempts)}`
      }
    );
  }

  return details.length > 0 ? details : undefined;
}

function buildColorEvidence(metrics: MetricsSnapshot) {
  const phase = metrics.colorPhase;

  if (phase.startedTrials === 0) {
    return ["A fase cromática não registrou respostas suficientes para detalhar comportamento."];
  }

  const groupRates = [
    { label: "vermelho/verde", value: missRateForColorGroup(metrics, (trialType) => trialType === "redGreen") },
    { label: "azul/amarelo", value: missRateForColorGroup(metrics, (trialType) => trialType === "blueYellow") },
    { label: "baixo contraste", value: missRateForColorGroup(metrics, (trialType) => trialType === "lowContrast") }
  ];
  const worstGroup = [...groupRates].sort((left, right) => right.value - left.value)[0];
  const letterMissRate = missRateForCharType(metrics, "letter");
  const digitMissRate = missRateForCharType(metrics, "digit");
  const confusion = topColorConfusion(metrics);
  const evidence = [
    `${phase.hits} acertos e ${phase.misses} erros em ${phase.attempts} escolhas ao longo de ${phase.completedTrials}/${phase.startedTrials} placas.`,
    `Tempo médio de resposta na fase: ${formatShortMs(average(phase.responseTimes))}.`,
    `Maior dificuldade nas placas ${worstGroup.label}, com ${percent(worstGroup.value)} de erro nas escolhas dessa família.`
  ];

  evidence.push(
    letterMissRate > digitMissRate
      ? `As letras geraram mais erro (${percent(letterMissRate)}) do que os números (${percent(digitMissRate)}).`
      : `Os números geraram erro semelhante ou maior (${percent(digitMissRate)}) do que as letras (${percent(letterMissRate)}).`
  );

  if (confusion) {
    const [target, selected] = confusion.key.split("->");
    evidence.push(`Confusão mais frequente: ${target} foi escolhido como ${selected} em ${confusion.count} resposta(s).`);
  }

  evidence.push(
    phase.autoHelpCount > 0
      ? `A ajuda automática precisou intervir ${phase.autoHelpCount} vez(es) nesta fase.`
      : "Não houve necessidade de ajuda automática nesta fase."
  );

  return evidence;
}

function buildColorPatternDetail(metrics: MetricsSnapshot) {
  const phase = metrics.colorPhase;

  if (phase.startedTrials === 0) {
    return "Sem respostas suficientes para destacar um padrão nesta fase.";
  }

  if (phase.misses > 0) {
    const groupRates = [
      { label: "Vermelho/verde", value: missRateForColorGroup(metrics, (trialType) => trialType === "redGreen") },
      { label: "Azul/amarelo", value: missRateForColorGroup(metrics, (trialType) => trialType === "blueYellow") },
      { label: "Baixo contraste", value: missRateForColorGroup(metrics, (trialType) => trialType === "lowContrast") }
    ];
    const worstGroup = groupRates.reduce((best, group) => (group.value > best.value ? group : best));

    return `${worstGroup.label} concentrou a maior taxa de erro da fase (${percent(worstGroup.value)}).`;
  }

  if (phase.autoHelpCount > 0) {
    return `A leitura ficou estável, mas houve ${formatCount(phase.autoHelpCount)} ${phase.autoHelpCount === 1 ? "intervenção" : "intervenções"} de ajuda automática.`;
  }

  return "Leitura estável nas famílias avaliadas, sem dificuldade dominante nesta sessão.";
}

function buildColorDetails(metrics: MetricsSnapshot, options: GenerateReportOptions): ReportCategoryDetail[] | undefined {
  const phase = metrics.colorPhase;
  const resolution = options.scoreResolutions?.colorVisionRisk;
  const details = buildResolutionDetails(resolution).filter((detail) => detail.label !== "Decisão final");

  details.push({
    label: "Padrão da fase",
    value: buildColorPatternDetail(metrics)
  });

  if (phase.startedTrials > 0) {
    details.push(
      {
        label: "Placas concluídas",
        value: `${formatCount(phase.completedTrials)} / ${formatCount(phase.startedTrials)}`
      },
      {
        label: "Acertos nas escolhas",
        value: `${formatCount(phase.hits)} / ${formatCount(phase.attempts)}`
      }
    );
  }

  return details.length > 0 ? details : undefined;
}

function buildAttentionEvidence(metrics: MetricsSnapshot, options: GenerateReportOptions) {
  if (!hasAttentionPhase(metrics)) {
    return [
      `${metrics.impulsiveClicks} cliques impulsivos e ${metrics.missedTargets} alvos perdidos foram registrados.`,
      `Tempo médio de reação: ${formatShortMs(average(metrics.reactionTimes))}.`,
      `Variação observada na reação: ${formatShortMs(Math.sqrt(variance(metrics.reactionTimes)))}.`
    ];
  }

  const phase = metrics.attentionPhase;
  const startSegment = phase.segmentSummaries[0];
  const middleSegment = phase.segmentSummaries[1];
  const endSegment = phase.segmentSummaries[2];
  const switchLatencies = phase.ruleSummaries
    .map((summary) => summary.switchFirstHitLatencyMs)
    .filter((value): value is number => value !== null);
  const postSwitchErrorRate = average(
    phase.ruleSummaries.map((summary) => rate(summary.postSwitchErrors, summary.postSwitchErrors + summary.postSwitchHits))
  );
  const evidence = [
    `${phase.correctHits} acertos em ${phase.targetSpawns} cristais corretos gerados, com ${phase.omissions} omissões e ${phase.distractionsCollected} distrações coletadas.`,
    `${phase.impulsiveErrors} erro(s) por impulsividade foram registrados, sendo ${phase.wrongCrystalHits} em cristais errados.`,
    `Tempo médio de reação aos cristais corretos: ${formatShortMs(average(phase.reactionTimes))}, com variação de ${formatShortMs(Math.sqrt(variance(phase.reactionTimes)))}.`,
    `Após cada mudança de regra, o primeiro acerto levou em média ${formatShortMs(average(switchLatencies))} e a taxa média de erro nos 5s iniciais foi ${percent(postSwitchErrorRate)}.`,
    `Consistência da fase: início ${percent(rate(startSegment?.hits ?? 0, startSegment?.targetSpawns ?? 0))}, meio ${percent(rate(middleSegment?.hits ?? 0, middleSegment?.targetSpawns ?? 0))} e fim ${percent(rate(endSegment?.hits ?? 0, endSegment?.targetSpawns ?? 0))} de acerto sobre os alvos gerados.`
  ];

  if (options.attentionPrediction) {
    evidence.push(
      `Índice heurístico final desta área: ${formatDisplayScore(options.attentionHeuristicScore ?? 0)}. Índice calibrado do modelo ADHD proxy: ${formatDisplayScore(options.attentionPrediction.score)}.`
    );
  }

  const liveSummary = summarizeLiveAttentionSamples(metrics);

  if (liveSummary) {
    evidence.push(
      `Durante a fase, ${liveSummary.count} amostras locais foram analisadas em tempo real, com média ${formatDisplayScore(liveSummary.average)} e faixa entre ${formatDisplayScore(liveSummary.min)} e ${formatDisplayScore(liveSummary.max)}.`
    );
  }

  const criticalRule = mostCriticalAttentionRule(metrics);

  if (criticalRule) {
    evidence.push(
      `Regra mais sensível nas amostras ao vivo: ${criticalRule.label}, com média ${formatDisplayScore(criticalRule.average)}.`
    );
  }

  const topSignals = topAttentionSignals(options.attentionPrediction);

  if (topSignals.length > 0) {
    evidence.push(
      `Sinais que mais elevaram a leitura do modelo: ${topSignals
        .map((signal) => `${signal.label} (${formatSigned(signal.contribution)})`)
        .join(", ")}.`
    );
  }

  return evidence;
}

function buildAttentionDetails(metrics: MetricsSnapshot, options: GenerateReportOptions): ReportCategoryDetail[] | undefined {
  const details: ReportCategoryDetail[] = [
    ...buildResolutionDetails(options.scoreResolutions?.attentionRisk)
  ];

  if (!options.attentionPrediction) {
    return details.length > 0 ? details : undefined;
  }

  details.push(
    {
      label: "Índice heurístico",
      value: formatDisplayScore(options.attentionHeuristicScore ?? 0)
    },
    {
      label: "Índice do modelo ADHD",
      value: formatDisplayScore(options.attentionPrediction.score)
    }
  );
  const liveSummary = summarizeLiveAttentionSamples(metrics);

  if (liveSummary) {
    details.push({
      label: "Amostras ao vivo",
      value: `${liveSummary.count} registros | média ${formatDisplayScore(liveSummary.average)} | faixa ${formatDisplayScore(liveSummary.min)} a ${formatDisplayScore(liveSummary.max)}`
    });
  }

  const criticalRule = mostCriticalAttentionRule(metrics);

  if (criticalRule) {
    details.push({
      label: "Regra mais crítica",
      value: `${criticalRule.label} (média ${formatDisplayScore(criticalRule.average)})`
    });
  }

  const topSignals = topAttentionSignals(options.attentionPrediction);

  if (topSignals.length > 0) {
    details.push({
      label: "Top sinais",
      value: topSignals.map((signal) => `${signal.label} (${formatSigned(signal.contribution)})`).join(", ")
    });
  }

  details.push(
    {
      label: "Fonte de treino",
      value: `${options.attentionPrediction.metadataSummary.sourceDataset} | ${formatCount(options.attentionPrediction.metadataSummary.rawRowCount)} linhas | ${formatCount(options.attentionPrediction.metadataSummary.windowCount)} janelas | ${formatCount(options.attentionPrediction.metadataSummary.subjectCount)} sujeitos`
    },
    {
      label: "Distribuição da base",
      value: `${formatCount(options.attentionPrediction.metadataSummary.classDistribution.adhd)} ADHD | ${formatCount(options.attentionPrediction.metadataSummary.classDistribution.control)} controle`
    },
    {
      label: "Modo de inferência",
      value: "Proxy comportamental calibrado por EEG, sem EEG ao vivo."
    },
    {
      label: "Treinado em",
      value: formatDateTime(options.attentionPrediction.metadataSummary.trainedAt)
    }
  );

  return details;
}

function buildMemoryEvidence(metrics: MetricsSnapshot, options: GenerateReportOptions) {
  const prediction = options.reactionTimePrediction;
  const resolution = options.scoreResolutions?.memoryReactionRisk;
  const snapshot = prediction?.proxyMetrics ?? buildReactionTimeProxySnapshot(metrics);
  const memoryHeuristicScore = options.memoryReactionHeuristicScore ?? calculateMemoryReactionHeuristicRisk(metrics);
  const evidence = [
    `Tempo médio para iniciar cada rodada do painel: ${formatShortMs(snapshot.primaryResponseTimeMs)}, com ${formatShortMs(snapshot.interClickTimeMs)} entre toques corretos consecutivos.`,
    `Consistência da reação nesta fase: variação de ${formatShortMs(snapshot.reactionStdMs)} entre respostas e deriva de ${formatSignedMs(snapshot.fatigueDeltaMs)} do início ao fim.`,
    `Maior sequência confirmada: ${formatCount(snapshot.maxSequenceReached)} em ${formatCount(snapshot.roundsPlayed)} rodada(s), com ${formatCount(snapshot.errorCount)} erro(s) de sequência e ${formatCount(snapshot.impulsivityCount)} clique(s) impulsivo(s).`,
    `Índice heurístico desta área no painel: ${formatDisplayScore(memoryHeuristicScore)}.`,
    "Somente sinais observados no próprio painel entram nesta leitura: início da rodada, ritmo entre toques, sequência, erros e impulsividade."
  ];

  if (prediction && shouldSurfaceAcceptedModel(resolution)) {
    evidence.push(
      `O calibrador complementar de reação apontou faixa ${reactionCategoryLabel(prediction.dominantCategory)}, com desempenho previsto de ${formatRawScore(prediction.performanceScore)}. Depois da validação com a sessão observada, o índice exibido no relatório ficou em ${formatDisplayScore(resolution?.resolvedRisk ?? prediction.riskScore)}.`
    );
  }

  return evidence;
}

function buildMemoryDetails(metrics: MetricsSnapshot, options: GenerateReportOptions): ReportCategoryDetail[] | undefined {
  const prediction = options.reactionTimePrediction;
  const resolution = options.scoreResolutions?.memoryReactionRisk;
  const snapshot = prediction?.proxyMetrics ?? buildReactionTimeProxySnapshot(metrics);
  const memoryHeuristicScore = options.memoryReactionHeuristicScore ?? calculateMemoryReactionHeuristicRisk(metrics);
  const details: ReportCategoryDetail[] = [
    ...buildResolutionDetails(resolution),
    {
      label: "Índice heurístico de memória",
      value: formatDisplayScore(memoryHeuristicScore)
    },
    {
      label: "Consistência da reação",
      value: `desvio ${formatShortMs(snapshot.reactionStdMs)} | deriva ${formatSignedMs(snapshot.fatigueDeltaMs)}`
    },
    {
      label: "Rodadas analisadas",
      value: `${formatCount(snapshot.roundsPlayed)} rodada(s)`
    },
    {
      label: "Entradas consideradas",
      value: "início da rodada, ritmo entre toques, sequência, erros e impulsividade observados no painel"
    }
  ];

  if (!prediction || !shouldSurfaceAcceptedModel(resolution)) {
    return details;
  }

  details.unshift(
    {
      label: "Desempenho previsto pelo calibrador",
      value: formatRawScore(prediction.performanceScore)
    },
    {
      label: "Faixa prevista",
      value: reactionCategoryLabel(prediction.dominantCategory)
    }
  );

  details.push({
    label: "Composição final",
    value:
      prediction.source === "fallback"
        ? "sessão observada com reforço complementar reduzido do fallback calibrado"
        : "sessão observada com reforço complementar reduzido do modelo de reação"
  });
  details.push({
    label: "Modo de inferência",
    value:
      prediction.source === "model"
        ? "Modelo treinado com a base Reaction Time Dataset."
        : "Fallback interpolado pelos limiares da base Reaction Time Dataset."
  });

  if (prediction.metadataSummary) {
    details.push(
      {
        label: "Fonte de treino",
        value: `${prediction.metadataSummary.sourceDataset} | alvo ${prediction.metadataSummary.targetColumn}`
      },
      {
        label: "Distribuição da base",
        value: `${formatCount(prediction.metadataSummary.classDistribution.good)} good | ${formatCount(prediction.metadataSummary.classDistribution.average)} average | ${formatCount(prediction.metadataSummary.classDistribution.bad)} bad`
      },
      {
        label: "Feature de treino",
        value: prediction.metadataSummary.featureColumnsUsed.join(", ")
      },
      {
        label: "Treinado em",
        value: formatDateTime(prediction.metadataSummary.trainedAt)
      }
    );
  }

  return details;
}

function buildCognitivePerformanceEvidence(
  metrics: MetricsSnapshot,
  prediction: CognitivePerformancePrediction | null | undefined,
  options: GenerateReportOptions
) {
  const snapshot = buildCognitivePerformanceProxySnapshot(metrics);
  const resolution = options.scoreResolutions?.cognitivePerformanceRisk;
  const evidence = [
    `O proxy global combinou reação ${formatShortMs(snapshot.reactionTimeProxyMs)} e memória ${Math.round(snapshot.memoryTestProxyScore)}/99.`,
    `Maior sequência confirmada: ${formatCount(snapshot.maxSequenceReached)}, com ${formatCount(snapshot.errorCount)} erro(s) de sequência e ${formatCount(snapshot.impulsivityCount)} clique(s) impulsivo(s).`,
    "Este bloco resume apenas velocidade, memória de trabalho e impulsividade observadas na sessão, sem inserir fatores externos não medidos."
  ];

  if (prediction && shouldSurfaceAcceptedModel(resolution)) {
    evidence.push(
      `O calibrador cognitivo estimou desempenho de ${formatRawScore(prediction.performanceScore)}. Depois da validação com a sessão observada, o índice exibido no relatório ficou em ${formatDisplayScore(resolution?.resolvedRisk ?? prediction.riskScore)}.`
    );
  }

  return evidence;
}

function buildCognitivePerformanceDetails(
  metrics: MetricsSnapshot,
  prediction: CognitivePerformancePrediction | null | undefined,
  options: GenerateReportOptions
): ReportCategoryDetail[] | undefined {
  const snapshot = buildCognitivePerformanceProxySnapshot(metrics);
  const resolution = options.scoreResolutions?.cognitivePerformanceRisk;
  const details: ReportCategoryDetail[] = [
    ...buildResolutionDetails(resolution),
    {
      label: "Proxy comportamental",
      value: `reação ${formatShortMs(snapshot.reactionTimeProxyMs)} | memória ${Math.round(snapshot.memoryTestProxyScore)}/99`
    },
    {
      label: "Maior sequência",
      value: formatCount(snapshot.maxSequenceReached)
    },
    {
      label: "Erros e impulsividade",
      value: `${formatCount(snapshot.errorCount)} erro(s) | ${formatCount(snapshot.impulsivityCount)} impulso(s)`
    },
    {
      label: "Entradas consideradas",
      value: "proxy de reação da sessão e proxy de memória observado no painel"
    }
  ];

  if (!prediction || !shouldSurfaceAcceptedModel(resolution)) {
    return details.length > 0 ? details : undefined;
  }

  details.push(
    {
      label: "Desempenho estimado",
      value: formatRawScore(prediction.performanceScore)
    },
    {
      label: "Índice refletido no relatório",
      value: formatDisplayScore(resolution?.resolvedRisk ?? prediction.riskScore)
    },
    {
      label: "Modo de inferência",
      value:
        prediction.source === "model"
          ? "Modelo treinado a partir da base Human Cognitive Performance Analysis."
          : "Fallback heurístico linear calibrado com a base Human Cognitive Performance Analysis."
    }
  );

  if (prediction.metadataSummary) {
    details.push(
      {
        label: "Fonte de treino",
        value: `${prediction.metadataSummary.sourceDataset} | alvo ${prediction.metadataSummary.targetColumn}`
      },
      {
        label: "Base usada",
        value: `${formatCount(prediction.metadataSummary.rowCount)} linhas | ${formatCount(prediction.metadataSummary.trainRowCount)} treino | ${formatCount(prediction.metadataSummary.validationRowCount)} validação`
      },
      {
        label: "Proxy",
        value: prediction.metadataSummary.proxyDefinitionVersion
      },
      {
        label: "Treinado em",
        value: formatDateTime(prediction.metadataSummary.trainedAt)
      }
    );
  }

  return details;
}

export function generateReport(
  metrics: MetricsSnapshot,
  scores: KogniffyScores,
  options: GenerateReportOptions = {}
): KogniffyReport {
  const categories: ReportCategory[] = [
    createReportCategory({
      id: "dyslexiaRisk",
      label: "Leitura e letras",
      score: scores.dyslexiaRisk,
      scoreSource: options.scoreResolutions?.dyslexiaRisk?.scoreSource ?? "heuristic",
      modelStatus: options.scoreResolutions?.dyslexiaRisk?.modelStatus ?? "notAvailable",
      summary: categorySummary("Leitura e letras", scores.dyslexiaRisk),
      recommendation: composeRecommendation(
        "Observe se trocas entre letras parecidas também aparecem em leituras rápidas, instruções visuais ou momentos de escrita do cotidiano.",
        scores.dyslexiaRisk
      ),
      evidence: buildDyslexiaEvidence(metrics),
      details: buildDyslexiaDetails(metrics, options)
    }),
    createReportCategory({
      id: "colorVisionRisk",
      label: "Cores e contraste",
      score: scores.colorVisionRisk,
      scoreSource: options.scoreResolutions?.colorVisionRisk?.scoreSource ?? "heuristic",
      modelStatus: options.scoreResolutions?.colorVisionRisk?.modelStatus ?? "notAvailable",
      summary: categorySummary("Cores e contraste", scores.colorVisionRisk),
      recommendation: composeRecommendation(
        "Compare os sinais observados com situações reais de identificação de cores, contraste e leitura de estímulos visuais.",
        scores.colorVisionRisk
      ),
      evidence: buildColorEvidence(metrics),
      details: buildColorDetails(metrics, options)
    }),
    createReportCategory({
      id: "attentionRisk",
      label: "Atenção",
      score: scores.attentionRisk,
      scoreSource: options.scoreResolutions?.attentionRisk?.scoreSource ?? "heuristic",
      modelStatus: options.scoreResolutions?.attentionRisk?.modelStatus ?? "notAvailable",
      summary: categorySummary("Atenção", scores.attentionRisk),
      recommendation: composeRecommendation(
        "Registre se respostas impulsivas, perda de estímulos ou demora para retomar a regra aparecem em outros contextos da rotina.",
        scores.attentionRisk
      ),
      evidence: buildAttentionEvidence(metrics, options),
      details: buildAttentionDetails(metrics, options)
    }),
    createReportCategory({
      id: "memoryReactionRisk",
      label: "Memória/Reação",
      score: scores.memoryReactionRisk,
      scoreSource: options.scoreResolutions?.memoryReactionRisk?.scoreSource ?? "heuristic",
      modelStatus: options.scoreResolutions?.memoryReactionRisk?.modelStatus ?? "notAvailable",
      summary: categorySummary("Memória/Reação", scores.memoryReactionRisk),
      recommendation: composeRecommendation(
        "Repita a fase em momentos diferentes para comparar se lentidão, quebra de sequência ou impulsividade continuam aparecendo.",
        scores.memoryReactionRisk
      ),
      evidence: buildMemoryEvidence(metrics, options),
      details: buildMemoryDetails(metrics, options)
    }),
    createReportCategory({
      id: "cognitivePerformanceRisk",
      label: "Desempenho cognitivo",
      score: scores.cognitivePerformanceRisk,
      scoreSource: options.scoreResolutions?.cognitivePerformanceRisk?.scoreSource ?? "heuristic",
      modelStatus: options.scoreResolutions?.cognitivePerformanceRisk?.modelStatus ?? "notAvailable",
      summary: categorySummary("Desempenho cognitivo", scores.cognitivePerformanceRisk),
      recommendation: composeRecommendation(
        "Observe se velocidade, memória de trabalho e impulsividade se repetem fora do jogo antes de interpretar este padrão de forma mais ampla.",
        scores.cognitivePerformanceRisk
      ),
      evidence: buildCognitivePerformanceEvidence(metrics, options.cognitivePerformancePrediction, options),
      details: buildCognitivePerformanceDetails(metrics, options.cognitivePerformancePrediction, options)
    })
  ];

  const overallBand = triageBandForRisk(scores.overallScore);
  const summary = summarizeOverallTriage(categories);

  return {
    totalTimeLabel: formatDuration(metrics.totalTimeMs),
    overallScore: scores.overallScore,
    overallDisplayScore: toTriageDisplayScore(scores.overallScore),
    overallBand: overallBand.key,
    overallLabel: overallBand.label,
    summary,
    categories,
    recommendations: [
      "Use este relatório como apoio para organizar uma triagem complementar, se necessário.",
      "Procure um profissional especializado para qualquer interpretação clínica.",
      "Não utilize esta experiência para rotular, diagnosticar ou excluir necessidades de acompanhamento."
    ]
  };
}
