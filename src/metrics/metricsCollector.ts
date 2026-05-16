export const METRICS_SESSION_KEY = "kogniffy.metrics.v1";

export type ContrastErrorType = "redGreen" | "blueYellow" | "lowContrast";

export interface AutoHelpRecord {
  scene: string;
  atMs: number;
}

export interface MetricsSnapshot {
  startedAt: number;
  completedAt: number | null;
  totalTimeMs: number;
  responseTimes: number[];
  hesitationTimes: number[];
  impulsiveClicks: number;
  repeatedErrors: number;
  sequenceScore: number;
  contrastErrors: number;
  redGreenErrors: number;
  blueYellowErrors: number;
  inversionErrors: number;
  missedTargets: number;
  autoHelpCount: number;
  autoHelps: AutoHelpRecord[];
  attempts: number;
  corrections: number;
  firstClickTimes: number[];
  reactionTimes: number[];
  sequenceErrors: number;
  maxSequenceLength: number;
}

function createEmptySnapshot(): MetricsSnapshot {
  return {
    startedAt: Date.now(),
    completedAt: null,
    totalTimeMs: 0,
    responseTimes: [],
    hesitationTimes: [],
    impulsiveClicks: 0,
    repeatedErrors: 0,
    sequenceScore: 0,
    contrastErrors: 0,
    redGreenErrors: 0,
    blueYellowErrors: 0,
    inversionErrors: 0,
    missedTargets: 0,
    autoHelpCount: 0,
    autoHelps: [],
    attempts: 0,
    corrections: 0,
    firstClickTimes: [],
    reactionTimes: [],
    sequenceErrors: 0,
    maxSequenceLength: 0
  };
}

function cloneSnapshot(snapshot: MetricsSnapshot): MetricsSnapshot {
  return {
    ...snapshot,
    responseTimes: [...snapshot.responseTimes],
    hesitationTimes: [...snapshot.hesitationTimes],
    autoHelps: snapshot.autoHelps.map((record) => ({ ...record })),
    firstClickTimes: [...snapshot.firstClickTimes],
    reactionTimes: [...snapshot.reactionTimes]
  };
}

export class MetricsCollector {
  private data: MetricsSnapshot = createEmptySnapshot();

  reset() {
    this.data = createEmptySnapshot();
  }

  get elapsedMs() {
    return Date.now() - this.data.startedAt;
  }

  recordResponseTime(ms: number) {
    this.data.responseTimes.push(Math.max(0, Math.round(ms)));
  }

  recordHesitationTime(ms: number) {
    this.data.hesitationTimes.push(Math.max(0, Math.round(ms)));
  }

  recordFirstClickTime(ms: number) {
    this.data.firstClickTimes.push(Math.max(0, Math.round(ms)));
  }

  recordImpulsiveClick() {
    this.data.impulsiveClicks += 1;
  }

  recordRepeatedError() {
    this.data.repeatedErrors += 1;
  }

  recordSequenceScore(score: number) {
    this.data.sequenceScore = Math.max(this.data.sequenceScore, Math.max(0, score));
  }

  recordContrastError(type: ContrastErrorType) {
    this.data.contrastErrors += 1;

    if (type === "redGreen") {
      this.data.redGreenErrors += 1;
    }

    if (type === "blueYellow") {
      this.data.blueYellowErrors += 1;
    }
  }

  recordInversionError() {
    this.data.inversionErrors += 1;
  }

  recordMissedTarget() {
    this.data.missedTargets += 1;
  }

  recordAutoHelp(scene: string) {
    this.data.autoHelpCount += 1;
    this.data.autoHelps.push({
      scene,
      atMs: this.elapsedMs
    });
  }

  recordAttempt() {
    this.data.attempts += 1;
  }

  recordCorrection() {
    this.data.corrections += 1;
  }

  recordReactionTime(ms: number) {
    this.data.reactionTimes.push(Math.max(0, Math.round(ms)));
  }

  recordSequenceError() {
    this.data.sequenceErrors += 1;
  }

  recordMaxSequenceLength(length: number) {
    this.data.maxSequenceLength = Math.max(this.data.maxSequenceLength, Math.max(0, length));
  }

  finalize() {
    this.data.completedAt = Date.now();
    this.data.totalTimeMs = this.data.completedAt - this.data.startedAt;
    return this.snapshot();
  }

  snapshot() {
    const snapshot = cloneSnapshot(this.data);
    snapshot.totalTimeMs = this.data.completedAt
      ? this.data.totalTimeMs
      : Date.now() - this.data.startedAt;
    return snapshot;
  }
}

export const metricsCollector = new MetricsCollector();

export function saveMetricsSnapshot(snapshot: MetricsSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(METRICS_SESSION_KEY, JSON.stringify(snapshot));
}

export function loadMetricsSnapshot(): MetricsSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(METRICS_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as MetricsSnapshot;
  } catch {
    window.sessionStorage.removeItem(METRICS_SESSION_KEY);
    return null;
  }
}
