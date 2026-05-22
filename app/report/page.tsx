"use client";

import type { Chart as ChartInstance } from "chart.js";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { predictAttentionRisk } from "@/ai/adhdModel";
import { predictColorVisionRisk } from "@/ai/colorblindModel";
import { predictCognitivePerformance } from "@/ai/cognitivePerformanceModel";
import { predictDyslexiaRisk } from "@/ai/dyslexiaModel";
import { predictReactionTimeRisk } from "@/ai/reactionTimeModel";
import { calculateScores } from "@/ai/scoring";
import { loadMetricsSnapshot, type MetricsSnapshot } from "@/metrics/metricsCollector";
import { generateReport, type KogniffyReport } from "@/report/generateReport";
import { resolveScores } from "@/report/resolveScores";
import {
  TRIAGE_BAND_DEFINITIONS,
  triageBandDefinitionForKey
} from "@/report/triagePresentation";
import styles from "./report.module.css";

type ReportCategoryView = KogniffyReport["categories"][number];
type ChartKey = "overview" | "overall" | "attention" | "color";
type ReportSeriesPoint = {
  label: string;
  value: number;
};
type LoadStatus = "loading" | "ready" | "missing" | "error";

type ReportState = {
  report: KogniffyReport;
  metrics: MetricsSnapshot;
  overviewSeries: ReportSeriesPoint[];
  attentionSeries: ReportSeriesPoint[];
  colorSeries: ReportSeriesPoint[];
  strongestCategory: ReportCategoryView;
  focusCategory: ReportCategoryView;
  positiveCount: number;
  watchCount: number;
};

const REPORT_ANALYSIS_STEPS = [
  "Lendo métricas da sessão",
  "Conferindo sinais comportamentais",
  "Calibrando modelos e proxies",
  "Montando relatório final"
] as const;
const MIN_LOADING_MS = 1_200;

const HIDDEN_DETAIL_LABELS = new Set([
  "Modo de inferência",
  "Fonte de treino",
  "Base usada",
  "Treinado em",
  "Distribuição da base",
  "Feature de treino",
  "Proxy",
  "Proxy comportamental"
]);

const SHORT_CATEGORY_LABELS: Record<ReportCategoryView["id"], string> = {
  dyslexiaRisk: "Leitura",
  colorVisionRisk: "Cores",
  attentionRisk: "Atenção",
  memoryReactionRisk: "Memória",
  cognitivePerformanceRisk: "Cognitivo"
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function accuracyPercent(correct: number, total: number) {
  return clampPercent((correct / Math.max(1, total)) * 100);
}

function buildAttentionSeries(metrics: MetricsSnapshot): ReportSeriesPoint[] {
  return metrics.attentionPhase.segmentSummaries
    .filter((segment) => segment.targetSpawns > 0)
    .map((segment) => ({
      label: segment.label[0]?.toUpperCase() + segment.label.slice(1),
      value: accuracyPercent(segment.hits, segment.targetSpawns)
    }));
}

function buildColorSeries(metrics: MetricsSnapshot): ReportSeriesPoint[] {
  const groups = [
    {
      label: "Vermelho/Verde",
      responses: metrics.colorPhase.responses.filter((response) => response.trialType === "redGreen")
    },
    {
      label: "Azul/Amarelo",
      responses: metrics.colorPhase.responses.filter((response) => response.trialType === "blueYellow")
    },
    {
      label: "Baixo contraste",
      responses: metrics.colorPhase.responses.filter((response) => response.trialType === "lowContrast")
    }
  ];

  return groups
    .filter((group) => group.responses.length > 0)
    .map((group) => ({
      label: group.label,
      value: accuracyPercent(
        group.responses.filter((response) => response.correct).length,
        group.responses.length
      )
    }));
}

function buildReportState(metrics: MetricsSnapshot, report: KogniffyReport): ReportState {
  const overviewSeries = report.categories.map((category) => ({
    label: SHORT_CATEGORY_LABELS[category.id],
    value: category.displayScore
  }));
  const strongestCategory = report.categories.reduce((best, category) =>
    category.displayScore > best.displayScore ? category : best
  );
  const focusCategory = report.categories.reduce((best, category) =>
    category.displayScore < best.displayScore ? category : best
  );

  return {
    report,
    metrics,
    overviewSeries,
    attentionSeries: buildAttentionSeries(metrics),
    colorSeries: buildColorSeries(metrics),
    strongestCategory,
    focusCategory,
    positiveCount: report.categories.filter((category) => category.displayScore >= 75).length,
    watchCount: report.categories.filter((category) => category.displayScore < 50).length
  };
}

function bandVars(bandKey: ReportCategoryView["displayBand"] | KogniffyReport["overallBand"]) {
  const band = triageBandDefinitionForKey(bandKey);

  return {
    "--accent-color": band.color,
    "--accent-ink": band.textColor,
    "--accent-soft": `${band.color}1f`
  } as CSSProperties;
}

function CategoryIcon({ id }: { id: ReportCategoryView["id"] }) {
  if (id === "dyslexiaRisk") {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <rect x="8" y="10" width="32" height="28" rx="8" fill="#fff9e9" />
        <path d="M15 18h11M15 24h18M15 30h13" stroke="#173b4f" strokeLinecap="round" strokeWidth="4" />
        <path d="M30 13l7 7" stroke="#49a85f" strokeLinecap="round" strokeWidth="4" />
      </svg>
    );
  }

  if (id === "colorVisionRisk") {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <circle cx="18" cy="20" r="9" fill="#f06f59" />
        <circle cx="30" cy="20" r="9" fill="#6fd6c5" fillOpacity="0.9" />
        <circle cx="24" cy="30" r="9" fill="#f6c55f" fillOpacity="0.95" />
      </svg>
    );
  }

  if (id === "attentionRisk") {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <path d="M24 8l4.6 10.4L40 20l-8 7.7 2 11.3L24 33l-10 6 2-11.3L8 20l11.4-1.6L24 8z" fill="#f6c55f" />
        <circle cx="24" cy="24" r="5" fill="#173b4f" />
      </svg>
    );
  }

  if (id === "memoryReactionRisk") {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48">
        <rect x="9" y="9" width="30" height="30" rx="10" fill="#173b4f" />
        <path d="M17 17h6v6h-6zm8 0h6v6h-6zm-8 8h6v6h-6zm8 8h6v6h-6z" fill="#fff9e9" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 48 48">
      <path d="M24 8c8.8 0 16 7.2 16 16S32.8 40 24 40 8 32.8 8 24 15.2 8 24 8z" fill="#6fd6c5" />
      <path d="M24 15l3 6.4 7 .8-5.2 4.8 1.4 6.8-6.2-3.6-6.2 3.6 1.4-6.8-5.2-4.8 7-.8L24 15z" fill="#173b4f" />
    </svg>
  );
}

function destroyCharts(charts: Record<ChartKey, ChartInstance | null>) {
  (Object.keys(charts) as ChartKey[]).forEach((key) => {
    charts[key]?.destroy();
    charts[key] = null;
  });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function AnalysisOverlay({ stepIndex }: { stepIndex: number }) {
  const progress = ((stepIndex + 1) / REPORT_ANALYSIS_STEPS.length) * 100;

  return (
    <div className={styles.analysisOverlay} role="dialog" aria-modal="true" aria-labelledby="analysis-title">
      <div className={styles.analysisModal}>
        <div className={styles.analysisScreen}>
          <div className={styles.analysisScanline} />
          <div className={styles.analysisGrid} />
          <div className={styles.analysisHeaderRow}>
            <span className={styles.analysisLed} />
            <span>Kogniffy AI :: Session Analyzer</span>
          </div>
          <div className={styles.analysisBars} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className={styles.analysisCore}>
            <div className={styles.analysisOrbital}>
              <div className={styles.analysisCoreDot} />
            </div>
            <div>
              <p className={styles.analysisKicker}>Computador analisando comportamento</p>
              <h1 id="analysis-title" className={styles.analysisTitle}>
                Gerando relatório
              </h1>
              <p className={styles.analysisCopy}>
                A IA está consolidando as métricas da sessão, calibrando sinais e validando os índices finais.
              </p>
            </div>
          </div>
          <div className={styles.analysisProgressWrap} aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <ul className={styles.analysisSteps} aria-live="polite">
            {REPORT_ANALYSIS_STEPS.map((label, index) => (
              <li
                key={label}
                className={
                  index < stepIndex
                    ? styles.analysisStepDone
                    : index === stepIndex
                      ? styles.analysisStepActive
                      : styles.analysisStepIdle
                }
              >
                <span />
                <strong>{label}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [state, setState] = useState<ReportState | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [analysisStep, setAnalysisStep] = useState(0);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overallCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const attentionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRefs = useRef<Record<ChartKey, ChartInstance | null>>({
    overview: null,
    overall: null,
    attention: null,
    color: null
  });

  useEffect(() => {
    let active = true;

    async function buildState() {
      setLoadStatus("loading");
      setAnalysisStep(0);

      try {
        const startedAt = performance.now();
        const metrics = loadMetricsSnapshot();

        if (!metrics) {
          if (!active) {
            return;
          }

          setLoadStatus("missing");
          return;
        }

        await wait(160);

        if (!active) {
          return;
        }

        const heuristicScores = calculateScores(metrics);
        setAnalysisStep(1);

        await wait(180);

        if (!active) {
          return;
        }

        setAnalysisStep(2);
        const [
          dyslexiaPrediction,
          predictedColorVisionRisk,
          attentionPrediction,
          cognitivePerformancePrediction,
          reactionTimePrediction
        ] = await Promise.all([
          predictDyslexiaRisk(metrics),
          predictColorVisionRisk(metrics),
          predictAttentionRisk(metrics),
          predictCognitivePerformance(metrics),
          predictReactionTimeRisk(metrics)
        ]);

        if (!active) {
          return;
        }

        const resolved = resolveScores({
          heuristicScores,
          dyslexiaPhase: metrics.dyslexiaPhase,
          dyslexiaPrediction,
          colorVisionRisk: predictedColorVisionRisk,
          attentionPrediction,
          reactionTimePrediction,
          cognitivePerformancePrediction
        });

        setAnalysisStep(3);

        const report = generateReport(metrics, resolved.scores, {
          dyslexiaPrediction,
          attentionPrediction,
          attentionHeuristicScore: heuristicScores.attentionRisk.value,
          cognitivePerformancePrediction,
          reactionTimePrediction,
          memoryReactionHeuristicScore: heuristicScores.memoryReactionRisk.value,
          scoreResolutions: resolved.resolutions
        });

        const remainingMs = Math.max(0, MIN_LOADING_MS - (performance.now() - startedAt));

        if (remainingMs > 0) {
          await wait(remainingMs);
        }

        if (!active) {
          return;
        }

        setState(buildReportState(metrics, report));
        setLoadStatus("ready");
      } catch {
        if (!active) {
          return;
        }

        setLoadStatus("error");
      }
    }

    buildState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }

    let active = true;
    const reportState = state;

    async function renderCharts() {
      const { default: Chart } = await import("chart.js/auto");

      if (!active) {
        return;
      }

      destroyCharts(chartRefs.current);

      if (overviewCanvasRef.current) {
        chartRefs.current.overview = new Chart(overviewCanvasRef.current, {
          type: "bar",
          data: {
            labels: reportState.overviewSeries.map((item) => item.label),
            datasets: [
              {
                label: "Índice de triagem",
                data: reportState.overviewSeries.map((item) => item.value),
                backgroundColor: reportState.report.categories.map((category) =>
                  triageBandDefinitionForKey(category.displayBand).color
                ),
                borderRadius: 16,
                borderSkipped: false,
                maxBarThickness: 30
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            scales: {
              x: {
                beginAtZero: true,
                max: 100,
                grid: {
                  color: "rgba(23, 59, 79, 0.08)"
                },
                ticks: {
                  stepSize: 20
                }
              },
              y: {
                grid: {
                  display: false
                }
              }
            },
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: (item) => `${item.parsed.x}/100`
                }
              }
            }
          }
        });
      }

      if (overallCanvasRef.current) {
        const overallBand = triageBandDefinitionForKey(reportState.report.overallBand);

        chartRefs.current.overall = new Chart(overallCanvasRef.current, {
          type: "doughnut",
          data: {
            labels: ["Índice geral", "Faixa restante"],
            datasets: [
              {
                data: [reportState.report.overallDisplayScore, 100 - reportState.report.overallDisplayScore],
                backgroundColor: [overallBand.color, "rgba(23, 59, 79, 0.12)"],
                borderWidth: 0,
                hoverOffset: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "74%",
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: (item) => `${item.parsed}/100`
                }
              }
            }
          }
        });
      }

      if (attentionCanvasRef.current && reportState.attentionSeries.length > 0) {
        chartRefs.current.attention = new Chart(attentionCanvasRef.current, {
          type: "line",
          data: {
            labels: reportState.attentionSeries.map((item) => item.label),
            datasets: [
              {
                label: "Acerto por etapa",
                data: reportState.attentionSeries.map((item) => item.value),
                borderColor: "#173b4f",
                backgroundColor: "rgba(111, 214, 197, 0.28)",
                fill: true,
                pointBackgroundColor: "#f06f59",
                pointBorderColor: "#fff9e9",
                pointBorderWidth: 3,
                pointRadius: 5,
                tension: 0.34
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                  stepSize: 20
                },
                grid: {
                  color: "rgba(23, 59, 79, 0.08)"
                }
              },
              x: {
                grid: {
                  display: false
                }
              }
            },
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: (item) => `${item.parsed.y}% de acerto`
                }
              }
            }
          }
        });
      }

      if (colorCanvasRef.current && reportState.colorSeries.length > 0) {
        chartRefs.current.color = new Chart(colorCanvasRef.current, {
          type: "radar",
          data: {
            labels: reportState.colorSeries.map((item) => item.label),
            datasets: [
              {
                label: "Acerto visual",
                data: reportState.colorSeries.map((item) => item.value),
                borderColor: "#49a85f",
                backgroundColor: "rgba(73, 168, 95, 0.22)",
                pointBackgroundColor: "#173b4f",
                pointRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              r: {
                beginAtZero: true,
                max: 100,
                angleLines: {
                  color: "rgba(23, 59, 79, 0.12)"
                },
                grid: {
                  color: "rgba(23, 59, 79, 0.12)"
                },
                pointLabels: {
                  color: "#173b4f",
                  font: {
                    size: 12
                  }
                },
                ticks: {
                  backdropColor: "transparent",
                  stepSize: 20
                }
              }
            },
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: (item) => `${item.parsed.r}% de acerto`
                }
              }
            }
          }
        });
      }
    }

    const chartNodes = chartRefs.current;

    renderCharts();

    return () => {
      active = false;
      destroyCharts(chartNodes);
    };
  }, [state]);

  if (loadStatus === "missing" || loadStatus === "error") {
    return (
      <main className={styles.page}>
        <section className={styles.empty}>
          <h1>{loadStatus === "missing" ? "Relatório não encontrado" : "Não foi possível gerar o relatório"}</h1>
          <p>
            {loadStatus === "missing"
              ? "Nenhuma sessão local foi encontrada neste navegador. Jogue a aventura para gerar um painel de triagem."
              : "Houve um problema ao consolidar esta sessão. Execute a atividade novamente para gerar um novo painel."}
          </p>
          <Link className={styles.button} href="/game">
            Jogar
          </Link>
        </section>
      </main>
    );
  }

  if (!state) {
    return (
      <main className={styles.page}>
        <AnalysisOverlay stepIndex={analysisStep} />
      </main>
    );
  }

  const overallBand = triageBandDefinitionForKey(state.report.overallBand);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topbar} aria-label="Navegação do relatório">
          <Link className={styles.homeLink} href="/">
            Kogniffy AI
          </Link>
          <Link className={styles.homeLink} href="/game">
            Jogar novamente
          </Link>
        </nav>

        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Mapa geral da sessão</p>
            <h1 className={styles.title}>Relatório de triagem</h1>
            <p className={styles.subtitle}>
              Este painel organiza os sinais observados durante a experiência em uma leitura mais visual, comparativa
              e rápida de consultar.
            </p>
            <div className={styles.notice}>
              Esta experiência possui caráter de triagem lúdica e indicativa.
              <br />
              Os resultados não representam diagnóstico clínico.
            </div>
          </div>

          <aside className={styles.scoreSpotlight} style={bandVars(state.report.overallBand)}>
            <span className={styles.scoreLabel}>Índice geral de triagem</span>
            <strong>{state.report.overallDisplayScore}/100</strong>
            <span className={styles.statusPill}>{state.report.overallLabel}</span>
            <p>{state.report.summary}</p>
          </aside>
        </header>

        <section className={styles.legendPanel} aria-label="Legenda das faixas">
          {TRIAGE_BAND_DEFINITIONS.map((band) => (
            <div className={styles.legendItem} key={band.key} style={bandVars(band.key)}>
              <span className={styles.legendSwatch} />
              <strong>{band.label}</strong>
              <span>
                {band.min} a {band.max}
              </span>
            </div>
          ))}
        </section>

        <section className={styles.dashboardGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Panorama geral</p>
                <h2>Como cada área apareceu na triagem</h2>
              </div>
              <span className={styles.panelChip}>5 áreas comparadas</span>
            </div>
            <div className={styles.chartLarge}>
              <canvas ref={overviewCanvasRef} aria-label="Índice de triagem por categoria" role="img" />
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Leitura rápida</p>
                <h2>Centro da sessão</h2>
              </div>
              <span className={styles.panelChip} style={{ backgroundColor: `${overallBand.color}18`, color: "#173b4f" }}>
                {state.report.overallLabel}
              </span>
            </div>

            <div className={styles.gaugeWrap}>
              <canvas ref={overallCanvasRef} aria-label="Índice geral de triagem" role="img" />
              <div className={styles.gaugeCenter}>
                <strong>{state.report.overallDisplayScore}</strong>
                <span>/100</span>
              </div>
            </div>

            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <span>Tempo total</span>
                <strong>{state.report.totalTimeLabel}</strong>
              </div>
              <div className={styles.kpiCard}>
                <span>Área mais forte</span>
                <strong>{state.strongestCategory.label}</strong>
              </div>
              <div className={styles.kpiCard}>
                <span>Foco de atenção</span>
                <strong>{state.focusCategory.label}</strong>
              </div>
              <div className={styles.kpiCard}>
                <span>Áreas positivas</span>
                <strong>{state.positiveCount}/5</strong>
              </div>
            </div>
          </article>
        </section>

        <section className={styles.secondaryGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Atenção ao longo da fase</p>
                <h2>Ritmo por etapa</h2>
              </div>
              <span className={styles.panelChip}>
                {state.attentionSeries.length > 0 ? "Início, meio e fim" : "Sem amostra suficiente"}
              </span>
            </div>
            {state.attentionSeries.length > 0 ? (
              <div className={styles.chartMedium}>
                <canvas ref={attentionCanvasRef} aria-label="Acerto por etapa da fase de atenção" role="img" />
              </div>
            ) : (
              <p className={styles.fallbackCopy}>
                A fase de atenção não registrou dados suficientes por etapa para montar este gráfico nesta sessão.
              </p>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Leitura visual</p>
                <h2>Acerto por família de placas</h2>
              </div>
              <span className={styles.panelChip}>
                {state.colorSeries.length > 0 ? `${state.colorSeries.length} famílias` : "Sem amostra suficiente"}
              </span>
            </div>
            {state.colorSeries.length > 0 ? (
              <div className={styles.chartMedium}>
                <canvas ref={colorCanvasRef} aria-label="Acerto visual por família de placas" role="img" />
              </div>
            ) : (
              <p className={styles.fallbackCopy}>
                As tentativas de cores e contraste não foram suficientes para montar a comparação visual desta sessão.
              </p>
            )}
          </article>
        </section>

        <section className={`${styles.panel} ${styles.panelGuide}`}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Próximos passos</p>
              <h2>Como ler este painel</h2>
            </div>
            <span className={styles.panelChip}>{state.watchCount} área(s) abaixo de 50</span>
          </div>
          <ul className={styles.recommendations}>
            {state.report.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </section>

        <section className={styles.categories} aria-label="Análise por categoria">
          {state.report.categories.map((category) => {
            const visibleDetails =
              category.details?.filter((detail) => !HIDDEN_DETAIL_LABELS.has(detail.label)) ?? [];
            const band = triageBandDefinitionForKey(category.displayBand);

            return (
              <article className={styles.categoryCard} key={category.id} style={bandVars(category.displayBand)}>
                <div className={styles.categoryTop}>
                  <div className={styles.categoryIdentity}>
                    <div className={styles.iconShell}>
                      <CategoryIcon id={category.id} />
                    </div>
                    <div>
                      <p className={styles.panelEyebrow}>Área observada</p>
                      <h2>{category.label}</h2>
                    </div>
                  </div>

                  <div className={styles.categoryScoreBox}>
                    <span className={styles.statusPill}>{category.displayLabel}</span>
                    <strong>{category.displayScore}/100</strong>
                  </div>
                </div>

                <p className={styles.categorySummary}>{category.summary}</p>

                <div className={styles.meterTrack} aria-hidden="true">
                  <span style={{ width: `${category.displayScore}%`, backgroundColor: band.color }} />
                </div>

                {visibleDetails.length > 0 ? (
                  <dl className={styles.detailGrid}>
                    {visibleDetails.map((detail) => (
                      <div className={styles.detailCard} key={`${category.id}-${detail.label}`}>
                        <dt>{detail.label}</dt>
                        <dd>{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                <div className={styles.categoryColumns}>
                  <div>
                    <h3>Sinais observados</h3>
                    <ul className={styles.evidenceList}>
                      {category.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.recommendationBox}>
                    <h3>Leitura de triagem</h3>
                    <p>{category.recommendation}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
      {loadStatus === "loading" ? <AnalysisOverlay stepIndex={analysisStep} /> : null}
    </main>
  );
}
