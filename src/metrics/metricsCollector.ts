import type { ColorCharacterType, ColorDifficulty, ColorPlateType } from "@/colorblind/plates";

export const METRICS_SESSION_KEY = "kogniffy.metrics.v1";

export type ContrastErrorType = ColorPlateType;
export type AttentionRuleId = "blue" | "small" | "red" | "bright";
export type AttentionSegmentId = "start" | "middle" | "end";

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

export interface AttentionRuleSummary {
  ruleId: AttentionRuleId;
  label: string;
  startedAtMs: number;
  endedAtMs: number;
  targetSpawns: number;
  hits: number;
  omissions: number;
  wrongCrystalHits: number;
  distractionsCollected: number;
  impulsiveErrors: number;
  reactionTimes: number[];
  switchFirstHitLatencyMs: number | null;
  postSwitchErrors: number;
  postSwitchHits: number;
}

export interface AttentionSegmentSummary {
  id: AttentionSegmentId;
  label: string;
  startedAtMs: number;
  endedAtMs: number;
  targetSpawns: number;
  hits: number;
  omissions: number;
  impulsiveErrors: number;
  distractionsCollected: number;
  reactionTimes: number[];
}

export interface AttentionPhaseSnapshot {
  targetSpawns: number;
  distractionSpawns: number;
  correctHits: number;
  wrongCrystalHits: number;
  impulsiveErrors: number;
  distractionsCollected: number;
  omissions: number;
  missedCorrectCrystals: number;
  reactionTimes: number[];
  autoHelpCount: number;
  ruleSummaries: AttentionRuleSummary[];
  segmentSummaries: AttentionSegmentSummary[];
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
  attentionPhase: AttentionPhaseSnapshot;
}

const ATTENTION_SEGMENT_DEFINITIONS: ReadonlyArray<{
  id: AttentionSegmentId;
  label: string;
  startedAtMs: number;
  endedAtMs: number;
}> = [
  { id: "start", label: "início", startedAtMs: 0, endedAtMs: 10_000 },
  { id: "middle", label: "meio", startedAtMs: 10_000, endedAtMs: 20_000 },
  { id: "end", label: "fim", startedAtMs: 20_000, endedAtMs: 30_000 }
];

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

function createEmptyAttentionSegment(definition: (typeof ATTENTION_SEGMENT_DEFINITIONS)[number]): AttentionSegmentSummary {
  return {
    ...definition,
    targetSpawns: 0,
    hits: 0,
    omissions: 0,
    impulsiveErrors: 0,
    distractionsCollected: 0,
    reactionTimes: []
  };
}

function createEmptyAttentionPhase(): AttentionPhaseSnapshot {
  return {
    targetSpawns: 0,
    distractionSpawns: 0,
    correctHits: 0,
    wrongCrystalHits: 0,
    impulsiveErrors: 0,
    distractionsCollected: 0,
    omissions: 0,
    missedCorrectCrystals: 0,
    reactionTimes: [],
    autoHelpCount: 0,
    ruleSummaries: [],
    segmentSummaries: ATTENTION_SEGMENT_DEFINITIONS.map(createEmptyAttentionSegment)
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

function cloneAttentionRuleSummary(summary: AttentionRuleSummary): AttentionRuleSummary {
  return {
    ...summary,
    reactionTimes: [...summary.reactionTimes]
  };
}

function cloneAttentionSegmentSummary(summary: AttentionSegmentSummary): AttentionSegmentSummary {
  return {
    ...summary,
    reactionTimes: [...summary.reactionTimes]
  };
}

function cloneAttentionPhase(snapshot: AttentionPhaseSnapshot): AttentionPhaseSnapshot {
  return {
    ...snapshot,
    reactionTimes: [...snapshot.reactionTimes],
    ruleSummaries: snapshot.ruleSummaries.map(cloneAttentionRuleSummary),
    segmentSummaries: snapshot.segmentSummaries.map(cloneAttentionSegmentSummary)
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

function toAttentionRuleId(value: unknown): AttentionRuleId {
  if (value === "blue" || value === "small" || value === "red" || value === "bright") {
    return value;
  }

  return "blue";
}

function toAttentionSegmentId(value: unknown, fallback: AttentionSegmentId): AttentionSegmentId {
  if (value === "start" || value === "middle" || value === "end") {
    return value;
  }

  return fallback;
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

function toAttentionRuleSummary(value: unknown): AttentionRuleSummary | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const summary = value as Partial<AttentionRuleSummary>;

  return {
    ruleId: toAttentionRuleId(summary.ruleId),
    label: typeof summary.label === "string" ? summary.label : "",
    startedAtMs: toNonNegativeInteger(summary.startedAtMs),
    endedAtMs: toNonNegativeInteger(summary.endedAtMs),
    targetSpawns: toNonNegativeInteger(summary.targetSpawns),
    hits: toNonNegativeInteger(summary.hits),
    omissions: toNonNegativeInteger(summary.omissions),
    wrongCrystalHits: toNonNegativeInteger(summary.wrongCrystalHits),
    distractionsCollected: toNonNegativeInteger(summary.distractionsCollected),
    impulsiveErrors: toNonNegativeInteger(summary.impulsiveErrors),
    reactionTimes: toNumberArray(summary.reactionTimes),
    switchFirstHitLatencyMs:
      summary.switchFirstHitLatencyMs === null ? null : toNullableTimestamp(summary.switchFirstHitLatencyMs),
    postSwitchErrors: toNonNegativeInteger(summary.postSwitchErrors),
    postSwitchHits: toNonNegativeInteger(summary.postSwitchHits)
  };
}

function toAttentionSegmentSummary(value: unknown, index: number): AttentionSegmentSummary {
  const fallback = createEmptyAttentionSegment(
    ATTENTION_SEGMENT_DEFINITIONS[Math.min(index, ATTENTION_SEGMENT_DEFINITIONS.length - 1)]!
  );

  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const summary = value as Partial<AttentionSegmentSummary>;

  return {
    id: toAttentionSegmentId(summary.id, fallback.id),
    label: typeof summary.label === "string" ? summary.label : fallback.label,
    startedAtMs: toNonNegativeInteger(summary.startedAtMs, fallback.startedAtMs),
    endedAtMs: toNonNegativeInteger(summary.endedAtMs, fallback.endedAtMs),
    targetSpawns: toNonNegativeInteger(summary.targetSpawns),
    hits: toNonNegativeInteger(summary.hits),
    omissions: toNonNegativeInteger(summary.omissions),
    impulsiveErrors: toNonNegativeInteger(summary.impulsiveErrors),
    distractionsCollected: toNonNegativeInteger(summary.distractionsCollected),
    reactionTimes: toNumberArray(summary.reactionTimes)
  };
}

function toAttentionPhaseSnapshot(value: unknown): AttentionPhaseSnapshot {
  if (typeof value !== "object" || value === null) {
    return createEmptyAttentionPhase();
  }

  const phase = value as Partial<AttentionPhaseSnapshot>;
  const rawRuleSummaries = Array.isArray(phase.ruleSummaries) ? phase.ruleSummaries : [];
  const rawSegmentSummaries = Array.isArray(phase.segmentSummaries) ? phase.segmentSummaries : [];

  return {
    targetSpawns: toNonNegativeInteger(phase.targetSpawns),
    distractionSpawns: toNonNegativeInteger(phase.distractionSpawns),
    correctHits: toNonNegativeInteger(phase.correctHits),
    wrongCrystalHits: toNonNegativeInteger(phase.wrongCrystalHits),
    impulsiveErrors: toNonNegativeInteger(phase.impulsiveErrors),
    distractionsCollected: toNonNegativeInteger(phase.distractionsCollected),
    omissions: toNonNegativeInteger(phase.omissions),
    missedCorrectCrystals: toNonNegativeInteger(phase.missedCorrectCrystals),
    reactionTimes: toNumberArray(phase.reactionTimes),
    autoHelpCount: toNonNegativeInteger(phase.autoHelpCount),
    ruleSummaries: rawRuleSummaries
      .map((summary) => toAttentionRuleSummary(summary))
      .filter((summary): summary is AttentionRuleSummary => summary !== null),
    segmentSummaries: ATTENTION_SEGMENT_DEFINITIONS.map((_, index) =>
      toAttentionSegmentSummary(rawSegmentSummaries[index], index)
    )
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
    colorPhase: toColorPhaseSnapshot(snapshot.colorPhase),
    attentionPhase: toAttentionPhaseSnapshot(snapshot.attentionPhase)
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
    colorPhase: createEmptyColorPhase(),
    attentionPhase: createEmptyAttentionPhase()
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
    colorPhase: cloneColorPhase(snapshot.colorPhase),
    attentionPhase: cloneAttentionPhase(snapshot.attentionPhase)
  };
}

function roundMetric(value: number) {
  return Math.max(0, Math.round(value));
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
    this.data.responseTimes.push(roundMetric(ms));
  }

  recordHesitationTime(ms: number) {
    this.data.hesitationTimes.push(roundMetric(ms));
  }

  recordFirstClickTime(ms: number) {
    this.data.firstClickTimes.push(roundMetric(ms));
  }

  recordImpulsiveClick() {
    this.data.impulsiveClicks += 1;
  }

  recordRepeatedError() {
    this.data.repeatedErrors += 1;
  }

  recordSequenceScore(score: number) {
    this.data.sequenceScore = Math.max(this.data.sequenceScore, roundMetric(score));
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
    this.data.reactionTimes.push(roundMetric(ms));
  }

  recordSequenceError() {
    this.data.sequenceErrors += 1;
  }

  recordMaxSequenceLength(length: number) {
    this.data.maxSequenceLength = Math.max(this.data.maxSequenceLength, roundMetric(length));
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
    this.data.dyslexiaPhase.responseTimes.push(roundMetric(ms));
  }

  recordDyslexiaFirstClickTime(ms: number) {
    this.data.dyslexiaPhase.firstClickTimes.push(roundMetric(ms));
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
    this.data.colorPhase.responseTimes.push(roundMetric(record.responseTimeMs));
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

  startAttentionRule(ruleId: AttentionRuleId, label: string, startedAtMs: number) {
    const activeRule = this.currentAttentionRule();

    if (activeRule) {
      activeRule.endedAtMs = Math.max(activeRule.startedAtMs, roundMetric(startedAtMs));
    }

    this.data.attentionPhase.ruleSummaries.push({
      ruleId,
      label,
      startedAtMs: roundMetric(startedAtMs),
      endedAtMs: roundMetric(startedAtMs),
      targetSpawns: 0,
      hits: 0,
      omissions: 0,
      wrongCrystalHits: 0,
      distractionsCollected: 0,
      impulsiveErrors: 0,
      reactionTimes: [],
      switchFirstHitLatencyMs: null,
      postSwitchErrors: 0,
      postSwitchHits: 0
    });
  }

  completeAttentionRule(endedAtMs: number) {
    const activeRule = this.currentAttentionRule();

    if (!activeRule) {
      return;
    }

    activeRule.endedAtMs = Math.max(activeRule.startedAtMs, roundMetric(endedAtMs));
  }

  recordAttentionTargetSpawn(activeTimeMs: number) {
    this.data.attentionPhase.targetSpawns += 1;
    this.currentAttentionRule()!.targetSpawns += 1;
    this.segmentForAttentionTime(activeTimeMs).targetSpawns += 1;
  }

  recordAttentionDistractionSpawn() {
    this.data.attentionPhase.distractionSpawns += 1;
  }

  recordAttentionCorrectHit(activeTimeMs: number, reactionTimeMs: number) {
    const reactionTime = roundMetric(reactionTimeMs);
    const rule = this.currentAttentionRule();
    const segment = this.segmentForAttentionTime(activeTimeMs);

    this.recordReactionTime(reactionTime);
    this.data.attentionPhase.correctHits += 1;
    this.data.attentionPhase.reactionTimes.push(reactionTime);
    segment.hits += 1;
    segment.reactionTimes.push(reactionTime);

    if (!rule) {
      return;
    }

    rule.hits += 1;
    rule.reactionTimes.push(reactionTime);

    const isPostSwitchWindow = roundMetric(activeTimeMs) - rule.startedAtMs <= 5_000;

    if (rule.switchFirstHitLatencyMs === null) {
      rule.switchFirstHitLatencyMs = Math.max(0, roundMetric(activeTimeMs) - rule.startedAtMs);
    }

    if (isPostSwitchWindow) {
      rule.postSwitchHits += 1;
    }
  }

  recordAttentionWrongCrystalHit(activeTimeMs: number) {
    const rule = this.currentAttentionRule();
    const segment = this.segmentForAttentionTime(activeTimeMs);

    this.recordImpulsiveClick();
    this.data.attentionPhase.wrongCrystalHits += 1;
    this.data.attentionPhase.impulsiveErrors += 1;
    segment.impulsiveErrors += 1;

    if (!rule) {
      return;
    }

    rule.wrongCrystalHits += 1;
    rule.impulsiveErrors += 1;

    if (roundMetric(activeTimeMs) - rule.startedAtMs <= 5_000) {
      rule.postSwitchErrors += 1;
    }
  }

  recordAttentionDistractionCollected(activeTimeMs: number) {
    const rule = this.currentAttentionRule();
    const segment = this.segmentForAttentionTime(activeTimeMs);

    this.recordImpulsiveClick();
    this.data.attentionPhase.distractionsCollected += 1;
    this.data.attentionPhase.impulsiveErrors += 1;
    segment.impulsiveErrors += 1;
    segment.distractionsCollected += 1;

    if (!rule) {
      return;
    }

    rule.distractionsCollected += 1;
    rule.impulsiveErrors += 1;

    if (roundMetric(activeTimeMs) - rule.startedAtMs <= 5_000) {
      rule.postSwitchErrors += 1;
    }
  }

  recordAttentionOmission(activeTimeMs: number) {
    const rule = this.currentAttentionRule();
    const segment = this.segmentForAttentionTime(activeTimeMs);

    this.recordMissedTarget();
    this.data.attentionPhase.omissions += 1;
    this.data.attentionPhase.missedCorrectCrystals += 1;
    segment.omissions += 1;

    if (!rule) {
      return;
    }

    rule.omissions += 1;
  }

  recordAttentionAutoHelp() {
    this.data.attentionPhase.autoHelpCount += 1;
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

  private currentAttentionRule() {
    const rules = this.data.attentionPhase.ruleSummaries;
    return rules.length > 0 ? rules[rules.length - 1]! : null;
  }

  private segmentForAttentionTime(activeTimeMs: number) {
    const segmentIndex = this.attentionSegmentIndex(activeTimeMs);
    return this.data.attentionPhase.segmentSummaries[segmentIndex]!;
  }

  private attentionSegmentIndex(activeTimeMs: number) {
    const time = roundMetric(activeTimeMs);

    if (time >= 20_000) {
      return 2;
    }

    if (time >= 10_000) {
      return 1;
    }

    return 0;
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
