import type { KogniffyScores, RiskBand, RiskScore } from "@/ai/scoring";
import type { MetricsSnapshot } from "@/metrics/metricsCollector";

export interface ReportCategory {
  id: keyof Pick<KogniffyScores, "dyslexiaRisk" | "colorVisionRisk" | "attentionRisk" | "memoryReactionRisk">;
  label: string;
  score: RiskScore;
  summary: string;
  recommendation: string;
}

export interface KogniffyReport {
  totalTimeLabel: string;
  overallScore: number;
  summary: string;
  categories: ReportCategory[];
  recommendations: string[];
}

function formatDuration(totalMs: number) {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}min ${seconds.toString().padStart(2, "0")}s`;
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

export function generateReport(metrics: MetricsSnapshot, scores: KogniffyScores): KogniffyReport {
  const categories: ReportCategory[] = [
    {
      id: "dyslexiaRisk",
      label: "Leitura e letras",
      score: scores.dyslexiaRisk,
      summary: categorySummary("Leitura e letras", scores.dyslexiaRisk),
      recommendation:
        "Observe se trocas entre letras parecidas também aparecem em atividades escolares e procure um profissional especializado se a dúvida persistir."
    },
    {
      id: "colorVisionRisk",
      label: "Cores e contraste",
      score: scores.colorVisionRisk,
      summary: categorySummary("Cores e contraste", scores.colorVisionRisk),
      recommendation:
        "Compare os sinais observados com situações reais de identificação de cores e considere avaliação especializada quando houver impacto na rotina."
    },
    {
      id: "attentionRisk",
      label: "Atenção",
      score: scores.attentionRisk,
      summary: categorySummary("Atenção", scores.attentionRisk),
      recommendation:
        "Registre se respostas impulsivas ou perda de estímulos aparecem em outros contextos, sempre evitando conclusões clínicas sem avaliação."
    },
    {
      id: "memoryReactionRisk",
      label: "Memória/Reação",
      score: scores.memoryReactionRisk,
      summary: categorySummary("Memória/Reação", scores.memoryReactionRisk),
      recommendation:
        "Repita atividades lúdicas de sequência e reação em momentos diferentes e procure orientação especializada para interpretar padrões consistentes."
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
