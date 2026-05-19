import type { KogniffyScores, RiskBand, RiskScore } from "@/ai/scoring";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";

export interface ReportCategory {
  id: keyof Pick<KogniffyScores, "dyslexiaRisk" | "colorVisionRisk" | "attentionRisk" | "memoryReactionRisk">;
  label: string;
  score: RiskScore;
  summary: string;
  recommendation: string;
  evidence: string[];
}

export interface KogniffyReport {
  totalTimeLabel: string;
  overallScore: number;
  summary: string;
  categories: ReportCategory[];
  recommendations: string[];
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

function formatDuration(totalMs: number) {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}min ${seconds.toString().padStart(2, "0")}s`;
}

function formatShortMs(value: number) {
  return `${(Math.max(0, value) / 1000).toFixed(1)}s`;
}

function bandText(band: RiskBand) {
  if (band === "baixo") {
    return "baixo";
  }

  if (band === "intermediario") {
    return "intermediário";
  }

  return "alto";
}

function categorySummary(label: string, score: RiskScore) {
  return `${label}: pontuação indicativa em nível ${bandText(score.band)}, calculada a partir dos sinais observados durante a experiência.`;
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

function buildAttentionEvidence(metrics: MetricsSnapshot) {
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

  return [
    `${phase.correctHits} acertos em ${phase.targetSpawns} cristais corretos gerados, com ${phase.omissions} omissões e ${phase.distractionsCollected} distrações coletadas.`,
    `${phase.impulsiveErrors} erro(s) por impulsividade foram registrados, sendo ${phase.wrongCrystalHits} em cristais errados.`,
    `Tempo médio de reação aos cristais corretos: ${formatShortMs(average(phase.reactionTimes))}, com variação de ${formatShortMs(Math.sqrt(variance(phase.reactionTimes)))}.`,
    `Após cada mudança de regra, o primeiro acerto levou em média ${formatShortMs(average(switchLatencies))} e a taxa média de erro nos 5s iniciais foi ${percent(postSwitchErrorRate)}.`,
    `Consistência da fase: início ${percent(rate(startSegment?.hits ?? 0, startSegment?.targetSpawns ?? 0))}, meio ${percent(rate(middleSegment?.hits ?? 0, middleSegment?.targetSpawns ?? 0))} e fim ${percent(rate(endSegment?.hits ?? 0, endSegment?.targetSpawns ?? 0))} de acerto sobre os alvos gerados.`
  ];
}

function buildMemoryEvidence(metrics: MetricsSnapshot) {
  return [
    `Maior sequência alcançada: ${metrics.maxSequenceLength}.`,
    `Pontuação de sequência registrada: ${metrics.sequenceScore}.`,
    `${metrics.sequenceErrors} erro(s) de sequência apareceram durante a fase de memória/reação.`
  ];
}

export function generateReport(metrics: MetricsSnapshot, scores: KogniffyScores): KogniffyReport {
  const categories: ReportCategory[] = [
    {
      id: "dyslexiaRisk",
      label: "Leitura e letras",
      score: scores.dyslexiaRisk,
      summary: categorySummary("Leitura e letras", scores.dyslexiaRisk),
      recommendation:
        "Observe se trocas entre letras parecidas também aparecem em atividades escolares e procure um profissional especializado se a dúvida persistir.",
      evidence: buildDyslexiaEvidence(metrics)
    },
    {
      id: "colorVisionRisk",
      label: "Cores e contraste",
      score: scores.colorVisionRisk,
      summary: categorySummary("Cores e contraste", scores.colorVisionRisk),
      recommendation:
        "Compare os sinais observados com situações reais de identificação de cores e considere avaliação especializada quando houver impacto na rotina.",
      evidence: buildColorEvidence(metrics)
    },
    {
      id: "attentionRisk",
      label: "Atenção",
      score: scores.attentionRisk,
      summary: categorySummary("Atenção", scores.attentionRisk),
      recommendation:
        "Registre se respostas impulsivas ou perda de estímulos aparecem em outros contextos, sempre evitando conclusões clínicas sem avaliação.",
      evidence: buildAttentionEvidence(metrics)
    },
    {
      id: "memoryReactionRisk",
      label: "Memória/Reação",
      score: scores.memoryReactionRisk,
      summary: categorySummary("Memória/Reação", scores.memoryReactionRisk),
      recommendation:
        "Repita atividades lúdicas de sequência e reação em momentos diferentes e procure orientação especializada para interpretar padrões consistentes.",
      evidence: buildMemoryEvidence(metrics)
    }
  ];

  const highCount = categories.filter((category) => category.score.band === "alto").length;
  const intermediateCount = categories.filter((category) => category.score.band === "intermediario").length;

  const summary =
    highCount > 0
      ? "A experiência encontrou possíveis indícios que merecem atenção em uma ou mais áreas. O resultado é apenas indicativo e não substitui avaliação profissional."
      : intermediateCount > 0
        ? "A experiência encontrou alguns sinais observados durante a experiência em nível intermediário. Use o resultado como apoio educativo, não como conclusão clínica."
        : "A experiência apresentou sinais observados em nível baixo nas categorias avaliadas. Ainda assim, este resultado possui caráter apenas educativo e indicativo.";

  return {
    totalTimeLabel: formatDuration(metrics.totalTimeMs),
    overallScore: scores.overallScore,
    summary,
    categories,
    recommendations: [
      "Use este relatório como ponto de conversa com responsáveis e educadores.",
      "Procure um profissional especializado para qualquer interpretação clínica.",
      "Não utilize esta experiência para rotular, diagnosticar ou excluir necessidades de acompanhamento."
    ]
  };
}
