"use client";

import type { Chart as ChartInstance } from "chart.js";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { predictAttentionRisk } from "@/ai/adhdModel";
import { predictColorVisionRisk } from "@/ai/colorblindModel";
import { predictCognitivePerformance } from "@/ai/cognitivePerformanceModel";
import { predictDyslexiaRisk } from "@/ai/dyslexiaModel";
import { predictReactionTimeRisk } from "@/ai/reactionTimeModel";
import {
  calculateMemoryReactionCompositeRisk,
  calculateScores,
  overrideAttentionRisk,
  overrideCognitivePerformanceRisk,
  overrideColorVisionRisk,
  overrideDyslexiaRisk,
  overrideMemoryReactionRisk
} from "@/ai/scoring";
import { loadMetricsSnapshot } from "@/metrics/metricsCollector";
import { generateReport, type KogniffyReport } from "@/report/generateReport";
import styles from "./report.module.css";

type ReportState = {
  report: KogniffyReport;
  values: number[];
  labels: string[];
};

const HIDDEN_DETAIL_LABELS = new Set([
  "Modo de inferência",
  "Fonte de treino",
  "Base usada",
  "Treinado em",
  "Distribuição da base",
  "Feature de treino"
]);

function colorForValue(value: number) {
  if (value <= 35) {
    return "#5fcf78";
  }

  if (value <= 65) {
    return "#f3c94e";
  }

  return "#f06f59";
}

function buildReportState(report: KogniffyReport, values: number[]): ReportState {
  return {
    report,
    labels: ["Leitura", "Cores", "Atenção", "Memória", "Cognitivo"],
    values
  };
}

export default function ReportPage() {
  const [state, setState] = useState<ReportState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  useEffect(() => {
    let active = true;

    async function buildState() {
      const metrics = loadMetricsSnapshot();

      if (!metrics) {
        return;
      }

      const heuristicScores = calculateScores(metrics);
      const heuristicReport = generateReport(metrics, heuristicScores, {
        attentionHeuristicScore: heuristicScores.attentionRisk.value,
        memoryReactionHeuristicScore: heuristicScores.memoryReactionRisk.value
      });

      setState(
        buildReportState(heuristicReport, [
          heuristicScores.dyslexiaRisk.value,
          heuristicScores.colorVisionRisk.value,
          heuristicScores.attentionRisk.value,
          heuristicScores.memoryReactionRisk.value,
          heuristicScores.cognitivePerformanceRisk.value
        ])
      );

      const [
        predictedDyslexiaRisk,
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

      let modelScores = heuristicScores;

      if (predictedDyslexiaRisk !== null) {
        modelScores = overrideDyslexiaRisk(modelScores, predictedDyslexiaRisk);
      }

      if (predictedColorVisionRisk !== null) {
        modelScores = overrideColorVisionRisk(modelScores, predictedColorVisionRisk);
      }

      if (attentionPrediction !== null) {
        modelScores = overrideAttentionRisk(modelScores, attentionPrediction.score);
      }

      if (reactionTimePrediction !== null) {
        modelScores = overrideMemoryReactionRisk(
          modelScores,
          calculateMemoryReactionCompositeRisk(
            reactionTimePrediction.riskScore,
            heuristicScores.memoryReactionRisk.value
          )
        );
      }

      if (cognitivePerformancePrediction !== null) {
        modelScores = overrideCognitivePerformanceRisk(modelScores, cognitivePerformancePrediction.riskScore);
      }

      const report = generateReport(metrics, modelScores, {
        attentionPrediction,
        attentionHeuristicScore: heuristicScores.attentionRisk.value,
        cognitivePerformancePrediction,
        reactionTimePrediction,
        memoryReactionHeuristicScore: heuristicScores.memoryReactionRisk.value
      });

      setState(
        buildReportState(report, [
          modelScores.dyslexiaRisk.value,
          modelScores.colorVisionRisk.value,
          modelScores.attentionRisk.value,
          modelScores.memoryReactionRisk.value,
          modelScores.cognitivePerformanceRisk.value
        ])
      );
    }

    buildState();

    return () => {
      active = false;
    };
  }, []);

  const chartColors = useMemo(() => state?.values.map(colorForValue) ?? [], [state]);

  useEffect(() => {
    if (!state || !canvasRef.current) {
      return;
    }

    let active = true;
    const reportState = state;

    async function renderChart() {
      const { default: Chart } = await import("chart.js/auto");

      if (!active || !canvasRef.current) {
        return;
      }

      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels: reportState.labels,
          datasets: [
            {
              label: "Pontuação indicativa",
              data: reportState.values,
              backgroundColor: chartColors,
              borderColor: "#173b4f",
              borderWidth: 2,
              borderRadius: 8
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
              }
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: (item) => `${item.parsed.y}/100`
              }
            }
          }
        }
      });
    }

    renderChart();

    return () => {
      active = false;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartColors, state]);

  if (!state) {
    return (
      <main className={styles.page}>
        <section className={styles.empty}>
          <h1>Relatório não encontrado</h1>
          <p>
            Nenhuma sessão local foi encontrada neste navegador. Jogue a aventura para gerar um relatório indicativo.
          </p>
          <Link className={styles.button} href="/game">
            Jogar
          </Link>
        </section>
      </main>
    );
  }

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

        <header>
          <h1 className={styles.title}>Relatório indicativo</h1>
          <p className={styles.subtitle}>
            Este resumo apresenta possíveis indícios e sinais observados durante a experiência. Ele não deve ser usado para diagnosticar, rotular ou concluir condições clínicas.
          </p>
        </header>

        <div className={styles.notice}>
          Esta experiência possui caráter apenas educativo e indicativo.
          <br />
          Os resultados não representam diagnóstico clínico.
        </div>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <h2>Resumo geral</h2>
            <p>{state.report.summary}</p>
            <div className={styles.metricRow}>
              <div className={styles.metric}>
                <span>Tempo total</span>
                <strong>{state.report.totalTimeLabel}</strong>
              </div>
              <div className={styles.metric}>
                <span>Pontuação geral</span>
                <strong>{state.report.overallScore}/100</strong>
              </div>
            </div>
            <div className={styles.chartWrap}>
              <canvas ref={canvasRef} aria-label="Gráfico de pontuações indicativas por categoria" role="img" />
            </div>
          </article>

          <article className={styles.panel}>
            <h2>Recomendações</h2>
            <ul className={styles.recommendations}>
              {state.report.recommendations.map((recommendation) => (
                <li key={recommendation}>{recommendation}</li>
              ))}
            </ul>
          </article>
        </section>

        <section className={styles.categories} aria-label="Análise por categoria">
          {state.report.categories.map((category) => {
            const visibleDetails =
              category.details?.filter((detail) => !HIDDEN_DETAIL_LABELS.has(detail.label)) ?? [];

            return (
              <article className={styles.category} key={category.id}>
                <div className={styles.categoryHeader}>
                  <h2>{category.label}</h2>
                  <span className={`${styles.score} ${styles[category.score.band]}`}>
                    {category.score.value}/100
                  </span>
                </div>
                <p>{category.summary}</p>
                <ul className={styles.evidenceList}>
                  {category.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {visibleDetails.length > 0 ? (
                  <dl className={styles.detailList}>
                    {visibleDetails.map((detail) => (
                      <div className={styles.detailRow} key={`${category.id}-${detail.label}`}>
                        <dt>{detail.label}</dt>
                        <dd>{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <p>{category.recommendation}</p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
