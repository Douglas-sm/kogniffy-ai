import type { ColorCharacterType, ColorDifficulty, ColorPlateType } from "@/colorblind/plates";

export const METRICS_SESSION_KEY = "kogniffy.metrics.v1";

export type ContrastErrorType = ColorPlateType;

export interface AutoHelpRecord {
  scene: string;
  atMs: number;
}

export interface DyslexiaPhaseSnapshot {
  startedWords: number;
  completedWords: number;
  attempts: number;
  hits: number;
  misses: number;
  corrections: number;
  inversionErrors: number;
  responseTimes: number[];
  firstClickTimes: number[];
  autoHelpCount: number;
}

export interface ColorResponseRecord {
  target: string;
  selected: string;
  correct: boolean;
  trialType: ColorPlateType;
  difficulty: ColorDifficulty;
  charType: ColorCharacterType;
  responseTimeMs: number;
  optionSet: string[];
  trialIndex: number;
  usedAutoHelp: boolean;
}

export interface ColorPhaseSnapshot {
  startedTrials: number;
  completedTrials: number;
  attempts: number;
  hits: number;
  misses: number;
  responseTimes: number[];
  autoHelpCount: number;
  firstChoiceMisses: number;
  letterTrials: number;
  numberTrials: number;
  redGreenTrials: number;
  blueYellowTrials: number;
  lowContrastTrials: number;
  responses: ColorResponseRecord[];
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
  lowContrastErrors: number;
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
  dyslexiaPhase: DyslexiaPhaseSnapshot;
  colorPhase: ColorPhaseSnapshot;
}

function createEmptyDyslexiaPhase(): DyslexiaPhaseSnapshot {
  return {
    startedWords: 0,
    completedWords: 0,
    attempts: 0,
    hits: 0,
    misses: 0,
    corrections: 0,
    inversionErrors: 0,
    responseTimes: [],
    firstClickTimes: [],
    autoHelpCount: 0
  };
}

function createEmptyColorPhase(): ColorPhaseSnapshot {
  return {
    startedTrials: 0,
    completedTrials: 0,
    attempts: 0,
    hits: 0,
    misses: 0,
    responseTimes: [],
    autoHelpCount: 0,
    firstChoiceMisses: 0,
    letterTrials: 0,
    numberTrials: 0,
    redGreenTrials: 0,
    blueYellowTrials: 0,
    lowContrastTrials: 0,
    responses: []
  };
}

function cloneDyslexiaPhase(snapshot: DyslexiaPhaseSnapshot): DyslexiaPhaseSnapshot {
  return {
    ...snapshot,
    responseTimes: [...snapshot.responseTimes],
    firstClickTimes: [...snapshot.firstClickTimes]
  };
}

function cloneColorResponseRecord(record: ColorResponseRecord): ColorResponseRecord {
  return {
    ...record,
    optionSet: [...record.optionSet]
  };
}

function cloneColorPhase(snapshot: ColorPhaseSnapshot): ColorPhaseSnapshot {
  return {
    ...snapshot,
    responseTimes: [...snapshot.responseTimes],
    responses: snapshot.responses.map(cloneColorResponseRecord)
  };
}

function toNonNegativeInteger(value: unknown, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

function toNullableTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

function toNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.max(0, Math.round(item)));
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toAutoHelpRecords(value: unknown): AutoHelpRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is AutoHelpRecord => typeof item === "object" && item !== null)
    .map((item) => ({
      scene: typeof item.scene === "string" ? item.scene : "",
      atMs: toNonNegativeInteger(item.atMs)
    }))
    .filter((item) => item.scene.length > 0);
}

function toDyslexiaPhaseSnapshot(value: unknown): DyslexiaPhaseSnapshot {
  if (typeof value !== "object" || value === null) {
    return createEmptyDyslexiaPhase();
  }

  const phase = value as Partial<DyslexiaPhaseSnapshot>;

  return {
    startedWords: toNonNegativeInteger(phase.startedWords),
    completedWords: toNonNegativeInteger(phase.completedWords),
    attempts: toNonNegativeInteger(phase.attempts),
    hits: toNonNegativeInteger(phase.hits),
    misses: toNonNegativeInteger(phase.misses),
    corrections: toNonNegativeInteger(phase.corrections),
    inversionErrors: toNonNegativeInteger(phase.inversionErrors),
    responseTimes: toNumberArray(phase.responseTimes),
    firstClickTimes: toNumberArray(phase.firstClickTimes),
    autoHelpCount: toNonNegativeInteger(phase.autoHelpCount)
  };
}

function toColorResponseRecords(value: unknown): ColorResponseRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Partial<ColorResponseRecord> => typeof item === "object" && item !== null)
    .map((record) => ({
      target: typeof record.target === "string" ? record.target : "",
      selected: typeof record.selected === "string" ? record.selected : "",
      correct: Boolean(record.correct),
      trialType:
        record.trialType === "redGreen" || record.trialType === "blueYellow" || record.trialType === "lowContrast"
          ? record.trialType
          : "lowContrast",
      difficulty:
        record.difficulty === "medium" || record.difficulty === "hard" || record.difficulty === "expert"
          ? record.difficulty
          : "medium",
      charType: record.charType === "digit" || record.charType === "letter" ? record.charType : "digit",
      responseTimeMs: toNonNegativeInteger(record.responseTimeMs),
      optionSet: toStringArray(record.optionSet),
      trialIndex: toNonNegativeInteger(record.trialIndex),
      usedAutoHelp: Boolean(record.usedAutoHelp)
    }))
    .filter((record) => record.target.length > 0 && record.selected.length > 0);
}

function toColorPhaseSnapshot(value: unknown): ColorPhaseSnapshot {
  if (typeof value !== "object" || value === null) {
    return createEmptyColorPhase();
  }

  const phase = value as Partial<ColorPhaseSnapshot>;

  return {
    startedTrials: toNonNegativeInteger(phase.startedTrials),
    completedTrials: toNonNegativeInteger(phase.completedTrials),
    attempts: toNonNegativeInteger(phase.attempts),
    hits: toNonNegativeInteger(phase.hits),
    misses: toNonNegativeInteger(phase.misses),
    responseTimes: toNumberArray(phase.responseTimes),
    autoHelpCount: toNonNegativeInteger(phase.autoHelpCount),
    firstChoiceMisses: toNonNegativeInteger(phase.firstChoiceMisses),
    letterTrials: toNonNegativeInteger(phase.letterTrials),
    numberTrials: toNonNegativeInteger(phase.numberTrials),
    redGreenTrials: toNonNegativeInteger(phase.redGreenTrials),
    blueYellowTrials: toNonNegativeInteger(phase.blueYellowTrials),
    lowContrastTrials: toNonNegativeInteger(phase.lowContrastTrials),
    responses: toColorResponseRecords(phase.responses)
  };
}

function toMetricsSnapshot(value: unknown): MetricsSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const snapshot = value as Partial<MetricsSnapshot>;

  return {
    startedAt: toNonNegativeInteger(snapshot.startedAt, Date.now()),
    completedAt: snapshot.completedAt === null ? null : toNullableTimestamp(snapshot.completedAt),
    totalTimeMs: toNonNegativeInteger(snapshot.totalTimeMs),
    responseTimes: toNumberArray(snapshot.responseTimes),
    hesitationTimes: toNumberArray(snapshot.hesitationTimes),
    impulsiveClicks: toNonNegativeInteger(snapshot.impulsiveClicks),
    repeatedErrors: toNonNegativeInteger(snapshot.repeatedErrors),
    sequenceScore: toNonNegativeInteger(snapshot.sequenceScore),
    contrastErrors: toNonNegativeInteger(snapshot.contrastErrors),
    redGreenErrors: toNonNegativeInteger(snapshot.redGreenErrors),
    blueYellowErrors: toNonNegativeInteger(snapshot.blueYellowErrors),
    lowContrastErrors: toNonNegativeInteger(snapshot.lowContrastErrors),
    inversionErrors: toNonNegativeInteger(snapshot.inversionErrors),
    missedTargets: toNonNegativeInteger(snapshot.missedTargets),
    autoHelpCount: toNonNegativeInteger(snapshot.autoHelpCount),
    autoHelps: toAutoHelpRecords(snapshot.autoHelps),
    attempts: toNonNegativeInteger(snapshot.attempts),
    corrections: toNonNegativeInteger(snapshot.corrections),
    firstClickTimes: toNumberArray(snapshot.firstClickTimes),
    reactionTimes: toNumberArray(snapshot.reactionTimes),
    sequenceErrors: toNonNegativeInteger(snapshot.sequenceErrors),
    maxSequenceLength: toNonNegativeInteger(snapshot.maxSequenceLength),
    dyslexiaPhase: toDyslexiaPhaseSnapshot(snapshot.dyslexiaPhase),
    colorPhase: toColorPhaseSnapshot(snapshot.colorPhase)
  };
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
    lowContrastErrors: 0,
    inversionErrors: 0,
    missedTargets: 0,
    autoHelpCount: 0,
    autoHelps: [],
    attempts: 0,
    corrections: 0,
    firstClickTimes: [],
    reactionTimes: [],
    sequenceErrors: 0,
    maxSequenceLength: 0,
    dyslexiaPhase: createEmptyDyslexiaPhase(),
    colorPhase: createEmptyColorPhase()
  };
}

function cloneSnapshot(snapshot: MetricsSnapshot): MetricsSnapshot {
  return {
    ...snapshot,
    responseTimes: [...snapshot.responseTimes],
    hesitationTimes: [...snapshot.hesitationTimes],
    autoHelps: snapshot.autoHelps.map((record) => ({ ...record })),
    firstClickTimes: [...snapshot.firstClickTimes],
    reactionTimes: [...snapshot.reactionTimes],
    dyslexiaPhase: cloneDyslexiaPhase(snapshot.dyslexiaPhase),
    colorPhase: cloneColorPhase(snapshot.colorPhase)
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

    if (type === "lowContrast") {
      this.data.lowContrastErrors += 1;
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

  recordDyslexiaWordStarted() {
    this.data.dyslexiaPhase.startedWords += 1;
  }

  recordDyslexiaWordCompleted() {
    this.data.dyslexiaPhase.completedWords += 1;
  }

  recordDyslexiaAttempt() {
    this.data.dyslexiaPhase.attempts += 1;
  }

  recordDyslexiaHit() {
    this.data.dyslexiaPhase.hits += 1;
  }

  recordDyslexiaMiss() {
    this.data.dyslexiaPhase.misses += 1;
  }

  recordDyslexiaCorrection() {
    this.data.dyslexiaPhase.corrections += 1;
  }

  recordDyslexiaInversionError() {
    this.data.dyslexiaPhase.inversionErrors += 1;
  }

  recordDyslexiaResponseTime(ms: number) {
    this.data.dyslexiaPhase.responseTimes.push(Math.max(0, Math.round(ms)));
  }

  recordDyslexiaFirstClickTime(ms: number) {
    this.data.dyslexiaPhase.firstClickTimes.push(Math.max(0, Math.round(ms)));
  }

  recordDyslexiaAutoHelp() {
    this.data.dyslexiaPhase.autoHelpCount += 1;
  }

  recordColorTrialStarted(trialType: ColorPlateType, charType: ColorCharacterType) {
    this.data.colorPhase.startedTrials += 1;

    if (trialType === "redGreen") {
      this.data.colorPhase.redGreenTrials += 1;
    }

    if (trialType === "blueYellow") {
      this.data.colorPhase.blueYellowTrials += 1;
    }

    if (trialType === "lowContrast") {
      this.data.colorPhase.lowContrastTrials += 1;
    }

    if (charType === "letter") {
      this.data.colorPhase.letterTrials += 1;
    } else {
      this.data.colorPhase.numberTrials += 1;
    }
  }

  recordColorTrialCompleted() {
    this.data.colorPhase.completedTrials += 1;
  }

  recordColorResponse(record: ColorResponseRecord, isFirstAttempt: boolean) {
    this.data.colorPhase.attempts += 1;
    this.data.colorPhase.responseTimes.push(Math.max(0, Math.round(record.responseTimeMs)));
    this.data.colorPhase.responses.push(cloneColorResponseRecord(record));

    if (record.correct) {
      this.data.colorPhase.hits += 1;
    } else {
      this.data.colorPhase.misses += 1;

      if (isFirstAttempt) {
        this.data.colorPhase.firstChoiceMisses += 1;
      }
    }
  }

  recordColorAutoHelp() {
    this.data.colorPhase.autoHelpCount += 1;
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
    return toMetricsSnapshot(JSON.parse(raw));
  } catch {
    window.sessionStorage.removeItem(METRICS_SESSION_KEY);
    return null;
  }
}
