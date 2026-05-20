export const COGNITIVE_METRICS_SESSION_KEY = "kogniffy.cognitive-metrics.v1";

export interface CognitiveMetrics {
  responseTimesMs: number[];
  interClickTimesMs: number[];
  errorCount: number;
  maxSequenceReached: number;
  averageSpeedMs: number;
  impulsivityCount: number;
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function averageSpeedFromInterClickTimes(interClickTimesMs: number[]) {
  if (interClickTimesMs.length === 0) {
    return 0;
  }

  const total = interClickTimesMs.reduce((sum, value) => sum + value, 0);
  return roundMetric(total / interClickTimesMs.length);
}

export function createEmptyCognitiveMetrics(): CognitiveMetrics {
  return {
    responseTimesMs: [],
    interClickTimesMs: [],
    errorCount: 0,
    maxSequenceReached: 0,
    averageSpeedMs: 0,
    impulsivityCount: 0
  };
}

export function cloneCognitiveMetrics(metrics: CognitiveMetrics): CognitiveMetrics {
  return {
    ...metrics,
    responseTimesMs: [...metrics.responseTimesMs],
    interClickTimesMs: [...metrics.interClickTimesMs]
  };
}

export function normalizeCognitiveMetrics(value: unknown): CognitiveMetrics {
  if (typeof value !== "object" || value === null) {
    return createEmptyCognitiveMetrics();
  }

  const metrics = value as Partial<CognitiveMetrics>;
  const responseTimesMs = Array.isArray(metrics.responseTimesMs)
    ? metrics.responseTimesMs
        .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
        .map(roundMetric)
    : [];
  const interClickTimesMs = Array.isArray(metrics.interClickTimesMs)
    ? metrics.interClickTimesMs
        .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
        .map(roundMetric)
    : [];

  return {
    responseTimesMs,
    interClickTimesMs,
    errorCount: roundMetric(typeof metrics.errorCount === "number" ? metrics.errorCount : 0),
    maxSequenceReached: roundMetric(typeof metrics.maxSequenceReached === "number" ? metrics.maxSequenceReached : 0),
    averageSpeedMs: roundMetric(
      typeof metrics.averageSpeedMs === "number"
        ? metrics.averageSpeedMs
        : averageSpeedFromInterClickTimes(interClickTimesMs)
    ),
    impulsivityCount: roundMetric(typeof metrics.impulsivityCount === "number" ? metrics.impulsivityCount : 0)
  };
}
