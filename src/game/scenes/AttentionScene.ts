import { predictAttentionRisk, warmAttentionModel } from "@/ai/adhdModel";
import type { GameEngine, GameScene, Platform, PointerPosition, Rect } from "@/game/engine/GameEngine";
import { drawCaveBackground, drawRoundedRect } from "@/game/scenes/sceneUtils";
import type { AttentionRuleId } from "@/metrics/metricsCollector";

type CrystalColor = "blue" | "red" | "green" | "gold";
type CrystalSize = "small" | "large";
type DistractionKind = "stone" | "leaf" | "bat" | "drop" | "dust";
type ScenePhase = "banner" | "playing" | "bridgeForming" | "portal";

interface BaseFallingObject {
  id: number;
  kind: "crystal" | "distraction";
  x: number;
  y: number;
  baseX: number;
  speed: number;
  createdAt: number;
  width: number;
  height: number;
  swayPhase: number;
  swayAmplitude: number;
  horizontalDrift: number;
  rotation: number;
  spin: number;
}

interface CrystalObject extends BaseFallingObject {
  kind: "crystal";
  color: CrystalColor;
  size: CrystalSize;
  bright: boolean;
  isTarget: boolean;
}

interface DistractionObject extends BaseFallingObject {
  kind: "distraction";
  distraction: DistractionKind;
}

interface ShatterPiece {
  angle: number;
  speed: number;
  width: number;
  height: number;
  rotation: number;
  spin: number;
}

interface ShatterEffect {
  x: number;
  y: number;
  color: string;
  outline: string;
  bright: boolean;
  ageMs: number;
  durationMs: number;
  pieces: ShatterPiece[];
}

type FallingObject = CrystalObject | DistractionObject;

interface AttentionRule {
  id: AttentionRuleId;
  label: string;
  shortLabel: string;
  accent: string;
}

const ACTIVE_DURATION_MS = 30_000;
const RULE_DURATION_MS = 7_500;
const RULE_BANNER_MS = 1_200;
const ASSIST_DURATION_MS = 6_000;
const RISK_SAMPLE_INTERVAL_MS = 1_500;
const MIN_TARGETS_FOR_RISK_SAMPLE = 3;
const MAX_SIMULTANEOUS_OBJECTS = 3;
const FLOOR_Y = 430;
const BRIDGE_FORMATION_MS = 1_300;
const SHATTER_DURATION_MS = 460;
const GAMEPLAY_BRIDGE_MAX_PROGRESS = 0.72;
const HITS_FOR_BRIDGE_PROGRESS = 8;
const LEFT_LEDGE: Platform = { x: 0, y: 454, width: 220, height: 86 };
const RIGHT_LEDGE: Platform = { x: 740, y: 454, width: 220, height: 86 };
const BRIDGE_PLATFORM: Platform = { x: 204, y: 454, width: 552, height: 86 };
const BRIDGE_SEGMENTS = Array.from({ length: 8 }, (_, index) => ({
  x: BRIDGE_PLATFORM.x + index * 70,
  y: BRIDGE_PLATFORM.y,
  width: 62,
  height: 86
}));
const PORTAL_ZONE: Rect = {
  x: 818,
  y: 326,
  width: 92,
  height: 128
};
const TARGET_CARD = {
  x: 738,
  y: 148,
  width: 192,
  height: 238
};
const RULES: AttentionRule[] = [
  {
    id: "blue",
    label: "Pegue apenas cristais azuis",
    shortLabel: "Azuis",
    accent: "#4aa8ff"
  },
  {
    id: "small",
    label: "Pegue apenas cristais pequenos",
    shortLabel: "Pequenos",
    accent: "#7ce0d6"
  },
  {
    id: "red",
    label: "Pegue apenas cristais vermelhos",
    shortLabel: "Vermelhos",
    accent: "#ff6f6b"
  },
  {
    id: "bright",
    label: "Pegue apenas cristais brilhantes",
    shortLabel: "Brilhantes",
    accent: "#ffd76a"
  }
];

function clonePlatform(platform: Platform): Platform {
  return { ...platform };
}

function initialPlatforms() {
  return [clonePlatform(LEFT_LEDGE), clonePlatform(RIGHT_LEDGE)];
}

function bridgePlatforms() {
  return [clonePlatform(LEFT_LEDGE), clonePlatform(BRIDGE_PLATFORM), clonePlatform(RIGHT_LEDGE)];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export class AttentionScene implements GameScene {
  id = "attention";
  title = "Caverna em tremor";
  objective = "Pegue os cristais para formar uma ponte até o outro lado";
  spawnSide = "left" as const;
  allowJump = false;
  exitMode = "portal" as const;
  platforms: Platform[] = initialPlatforms();

  private readonly lanes = [330, 430, 530, 630];
  private fallingObjects: FallingObject[] = [];
  private shatterEffects: ShatterEffect[] = [];
  private nextId = 1;
  private phase: ScenePhase = "banner";
  private bannerRemainingMs = RULE_BANNER_MS;
  private nextSpawnInMs = 560;
  private activeElapsedMs = 0;
  private currentRuleIndex = 0;
  private assistRemainingMs = 0;
  private correctHits = 0;
  private impulsiveErrors = 0;
  private omissions = 0;
  private distractionsCollected = 0;
  private bridgeProgress = 0;
  private bridgeFormationElapsedMs = 0;
  private bridgeFormationStartProgress = 0;
  private lastRiskSampleAtMs = -RISK_SAMPLE_INTERVAL_MS;
  private riskPredictionPending = false;

  enter(engine: GameEngine) {
    this.platforms = initialPlatforms();
    this.fallingObjects = [];
    this.shatterEffects = [];
    this.nextId = 1;
    this.phase = "banner";
    this.bannerRemainingMs = RULE_BANNER_MS;
    this.nextSpawnInMs = 560;
    this.activeElapsedMs = 0;
    this.currentRuleIndex = 0;
    this.assistRemainingMs = 0;
    this.correctHits = 0;
    this.impulsiveErrors = 0;
    this.omissions = 0;
    this.distractionsCollected = 0;
    this.bridgeProgress = 0;
    this.bridgeFormationElapsedMs = 0;
    this.bridgeFormationStartProgress = 0;
    this.lastRiskSampleAtMs = -RISK_SAMPLE_INTERVAL_MS;
    this.riskPredictionPending = false;
    this.positionRobotAtLedge(engine);
    void warmAttentionModel();
    engine.metrics.startAttentionRule(this.currentRule.id, this.currentRule.label, 0);
    engine.dialogBox.setLines([
      "O robô vai esperar ao lado do abismo enquanto os cristais caem no centro da caverna.",
      "Clique apenas nos cristais que combinam com o item mostrado no quadro da direita para formar a ponte.",
      "Ignore pedras, folhas, morcegos, gotas d'água e poeira."
    ]);
  }

  update(engine: GameEngine, dt: number) {
    this.assistRemainingMs = Math.max(0, this.assistRemainingMs - dt * 1000);
    this.updateShatterEffects(dt);

    if (engine.dialogBox.isActive) {
      return;
    }

    if (this.phase === "banner") {
      this.bannerRemainingMs = Math.max(0, this.bannerRemainingMs - dt * 1000);

      if (this.bannerRemainingMs <= 0) {
        this.phase = "playing";
        this.nextSpawnInMs = Math.min(this.nextSpawnInMs, 260);
      }

      return;
    }

    if (this.phase === "playing") {
      this.updatePlayingPhase(engine, dt);
      return;
    }

    if (this.phase === "bridgeForming") {
      this.updateBridgeFormation(engine, dt);
    }
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#365e6b");
    this.drawCaveShell(ctx, engine.timeMs);
    this.drawTargetCard(ctx, engine.timeMs);

    const shake = this.cameraOffset(engine.timeMs);

    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.drawAbyss(ctx, engine.timeMs);
    this.drawCliffLedges(ctx);
    this.drawBridge(ctx, engine.timeMs);
    this.drawCeiling(ctx, engine.timeMs);
    this.drawRobotPerchGlow(ctx, engine.player.x, engine.player.y);

    for (const fallingObject of this.fallingObjects) {
      this.drawFallingObject(ctx, fallingObject, engine.timeMs);
    }

    for (const effect of this.shatterEffects) {
      this.drawShatterEffect(ctx, effect);
    }

    ctx.restore();

    if (this.phase === "banner") {
      this.drawRuleBanner(ctx);
    }

    if (this.assistRemainingMs > 0 && this.phase === "playing") {
      this.drawAssistBanner(ctx);
    }
  }

  getHudMessage(engine: GameEngine) {
    return this.headerLine(engine);
  }

  shouldShowHudRightColumn() {
    return false;
  }

  getHudStats() {
    return [
      `Acertos: ${this.correctHits}`,
      `Erros impulsivos: ${this.impulsiveErrors}`,
      `Omissões: ${this.omissions}`,
      `Distrações: ${this.distractionsCollected}`
    ];
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.phase !== "playing") {
      return;
    }

    const clicked = this.findClickableObject(engine, pointer);

    if (!clicked) {
      return;
    }

    this.resolveClick(engine, clicked.id);
  }

  onAutoHelp(engine: GameEngine) {
    if (this.phase !== "playing" && this.phase !== "banner") {
      return;
    }

    this.assistRemainingMs = ASSIST_DURATION_MS;
    engine.metrics.recordAttentionAutoHelp();
  }

  shouldShowAutoHelpDialog() {
    return false;
  }

  getCameraOffset(engine: GameEngine) {
    return this.cameraOffset(engine.timeMs);
  }

  getPortalZone() {
    return PORTAL_ZONE;
  }

  isMovementEnabled(engine: GameEngine) {
    return this.phase === "portal" && engine.isSceneExitReady();
  }

  getCanvasCursor(engine: GameEngine) {
    if (engine.pointer.pointerType !== "mouse" || this.phase !== "playing") {
      return "default";
    }

    return this.findClickableObject(engine, engine.pointer) ? "pointer" : "default";
  }

  private positionRobotAtLedge(engine: GameEngine) {
    const x = LEFT_LEDGE.x + LEFT_LEDGE.width - engine.player.width - 24;
    const y = LEFT_LEDGE.y - engine.player.height;
    engine.player.setCheckpoint(x, y);
    engine.player.reset(x, y);
  }

  private updatePlayingPhase(engine: GameEngine, dt: number) {
    const nextRuleBoundary = (this.currentRuleIndex + 1) * RULE_DURATION_MS;
    const nextElapsed = Math.min(ACTIVE_DURATION_MS, this.activeElapsedMs + dt * 1000);

    if (this.currentRuleIndex < RULES.length - 1 && nextElapsed >= nextRuleBoundary) {
      this.activeElapsedMs = nextRuleBoundary;
      engine.metrics.completeAttentionRule(this.activeElapsedMs);
      this.fallingObjects = [];
      this.currentRuleIndex += 1;
      engine.metrics.startAttentionRule(this.currentRule.id, this.currentRule.label, this.activeElapsedMs);
      this.phase = "banner";
      this.bannerRemainingMs = RULE_BANNER_MS;
      this.nextSpawnInMs = 380;
      return;
    }

    this.activeElapsedMs = nextElapsed;

    if (this.activeElapsedMs >= ACTIVE_DURATION_MS) {
      this.startBridgeFormation(engine);
      return;
    }

    this.nextSpawnInMs -= dt * 1000;

    while (this.nextSpawnInMs <= 0 && this.fallingObjects.length < MAX_SIMULTANEOUS_OBJECTS) {
      this.spawnObject(engine);
      this.nextSpawnInMs += this.spawnIntervalMs();
    }

    this.updateFallingObjects(engine, dt);
    this.scheduleRiskSample(engine);
  }

  private updateBridgeFormation(engine: GameEngine, dt: number) {
    this.bridgeFormationElapsedMs += dt * 1000;
    const progress = clamp01(this.bridgeFormationElapsedMs / BRIDGE_FORMATION_MS);
    const eased = 1 - (1 - progress) ** 3;
    this.bridgeProgress = this.bridgeFormationStartProgress + (1 - this.bridgeFormationStartProgress) * eased;

    if (progress < 1) {
      return;
    }

    this.bridgeProgress = 1;
    this.platforms = bridgePlatforms();
    this.phase = "portal";
    engine.completeScene();
  }

  private startBridgeFormation(engine: GameEngine) {
    this.phase = "bridgeForming";
    this.activeElapsedMs = ACTIVE_DURATION_MS;
    this.assistRemainingMs = 0;
    this.fallingObjects = [];
    this.bridgeFormationElapsedMs = 0;
    this.bridgeFormationStartProgress = this.bridgeProgress;
    engine.metrics.completeAttentionRule(ACTIVE_DURATION_MS);
  }

  private spawnObject(engine: GameEngine) {
    const forceTarget = this.countVisibleTargets() === 0;
    const shouldSpawnCrystal = forceTarget || Math.random() < 0.62;
    const object = shouldSpawnCrystal ? this.createCrystal(forceTarget) : this.createDistraction();

    this.fallingObjects.push(object);

    if (object.kind === "crystal" && object.isTarget) {
      engine.metrics.recordAttentionTargetSpawn(this.activeElapsedMs);
    }

    if (object.kind === "distraction") {
      engine.metrics.recordAttentionDistractionSpawn();
    }
  }

  private updateFallingObjects(engine: GameEngine, dt: number) {
    const keptObjects: FallingObject[] = [];

    for (const fallingObject of this.fallingObjects) {
      fallingObject.y += fallingObject.speed * dt;
      fallingObject.baseX += fallingObject.horizontalDrift * dt;
      fallingObject.rotation += fallingObject.spin * dt;

      const flutter =
        fallingObject.kind === "distraction" && fallingObject.distraction === "bat"
          ? Math.sin(engine.timeMs / 70 + fallingObject.swayPhase) * 10
          : Math.sin(engine.timeMs / 210 + fallingObject.swayPhase) * fallingObject.swayAmplitude;
      fallingObject.x = fallingObject.baseX + flutter;

      if (fallingObject.y + fallingObject.height / 2 >= FLOOR_Y) {
        if (fallingObject.kind === "crystal" && fallingObject.isTarget) {
          this.omissions += 1;
          engine.metrics.recordAttentionOmission(this.activeElapsedMs);
          engine.registerError(this.id);
        }

        continue;
      }

      keptObjects.push(fallingObject);
    }

    this.fallingObjects = keptObjects;
  }

  private resolveClick(engine: GameEngine, objectId: number) {
    const clickedIndex = this.fallingObjects.findIndex((fallingObject) => fallingObject.id === objectId);

    if (clickedIndex < 0) {
      return;
    }

    const [fallingObject] = this.fallingObjects.splice(clickedIndex, 1);

    if (!fallingObject) {
      return;
    }

    this.spawnShatterEffect(fallingObject);

    if (fallingObject.kind === "crystal" && fallingObject.isTarget) {
      this.correctHits += 1;
      this.bridgeProgress = Math.max(
        this.bridgeProgress,
        Math.min(GAMEPLAY_BRIDGE_MAX_PROGRESS, (this.correctHits / HITS_FOR_BRIDGE_PROGRESS) * GAMEPLAY_BRIDGE_MAX_PROGRESS)
      );
      engine.clearErrorStreak(this.id);
      engine.metrics.recordAttentionCorrectHit(this.activeElapsedMs, performance.now() - fallingObject.createdAt);
      return;
    }

    this.impulsiveErrors += 1;

    if (fallingObject.kind === "crystal") {
      engine.metrics.recordAttentionWrongCrystalHit(this.activeElapsedMs);
    } else {
      this.distractionsCollected += 1;
      engine.metrics.recordAttentionDistractionCollected(this.activeElapsedMs);
    }

    engine.registerError(this.id);
  }

  private spawnShatterEffect(fallingObject: FallingObject) {
    const color = this.objectColor(fallingObject);
    const bright = fallingObject.kind === "crystal" ? fallingObject.bright : fallingObject.distraction === "drop";
    const pieceCount = fallingObject.kind === "crystal" ? 8 : 6;
    const pieces = Array.from({ length: pieceCount }, () => ({
      angle: Math.random() * Math.PI * 2,
      speed: 30 + Math.random() * 80,
      width: 6 + Math.random() * 8,
      height: 6 + Math.random() * 10,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.42
    }));

    this.shatterEffects.push({
      x: fallingObject.x,
      y: fallingObject.y,
      color,
      outline: "#173b4f",
      bright,
      ageMs: 0,
      durationMs: SHATTER_DURATION_MS,
      pieces
    });
  }

  private updateShatterEffects(dt: number) {
    const nextEffects: ShatterEffect[] = [];

    for (const effect of this.shatterEffects) {
      effect.ageMs += dt * 1000;

      if (effect.ageMs < effect.durationMs) {
        nextEffects.push(effect);
      }
    }

    this.shatterEffects = nextEffects;
  }

  private scheduleRiskSample(engine: GameEngine) {
    if (this.riskPredictionPending || this.phase !== "playing") {
      return;
    }

    if (this.activeElapsedMs - this.lastRiskSampleAtMs < RISK_SAMPLE_INTERVAL_MS) {
      return;
    }

    const snapshot = engine.metrics.snapshot();

    if (snapshot.attentionPhase.targetSpawns < MIN_TARGETS_FOR_RISK_SAMPLE) {
      return;
    }

    const sampledAtMs = Math.round(this.activeElapsedMs);
    const ruleId = this.currentRule.id;

    this.lastRiskSampleAtMs = sampledAtMs;
    this.riskPredictionPending = true;

    void predictAttentionRisk(snapshot)
      .then((prediction) => {
        if (!prediction) {
          return;
        }

        engine.metrics.recordAttentionLiveRiskSample({
          atMs: sampledAtMs,
          ruleId,
          score: prediction.score,
          sustainedAttentionPenalty: prediction.featureVector.sustainedAttentionPenalty,
          impulsivityPenalty: prediction.featureVector.impulsivityPenalty,
          distractibilityPenalty: prediction.featureVector.distractibilityPenalty,
          adaptationPenalty: prediction.featureVector.adaptationPenalty
        });
      })
      .finally(() => {
        this.riskPredictionPending = false;
      });
  }

  private currentRuleMatches(crystal: Pick<CrystalObject, "color" | "size" | "bright">) {
    if (this.currentRule.id === "blue") {
      return crystal.color === "blue";
    }

    if (this.currentRule.id === "small") {
      return crystal.size === "small";
    }

    if (this.currentRule.id === "red") {
      return crystal.color === "red";
    }

    return crystal.bright;
  }

  private createCrystal(forceTarget: boolean): CrystalObject {
    const shouldBeTarget = forceTarget || Math.random() < 0.46;
    const color = this.pickCrystalColor(shouldBeTarget);
    const size = this.pickCrystalSize(shouldBeTarget);
    const bright = this.pickCrystalBrightness(shouldBeTarget);
    const dimensions = size === "small" ? { width: 28, height: 34 } : { width: 40, height: 50 };

    return {
      ...this.createBaseObject(dimensions.width, dimensions.height),
      kind: "crystal",
      color,
      size,
      bright,
      isTarget: this.currentRuleMatches({ color, size, bright })
    };
  }

  private createDistraction(): DistractionObject {
    const distractionKinds: DistractionKind[] = ["stone", "leaf", "bat", "drop", "dust"];
    const distraction = distractionKinds[Math.floor(Math.random() * distractionKinds.length)]!;
    const dimensions =
      distraction === "dust"
        ? { width: 30, height: 22 }
        : distraction === "leaf"
          ? { width: 28, height: 22 }
          : distraction === "drop"
            ? { width: 18, height: 28 }
            : distraction === "bat"
              ? { width: 34, height: 18 }
              : { width: 34, height: 30 };
    const baseObject = this.createBaseObject(dimensions.width, dimensions.height);

    if (distraction === "leaf") {
      baseObject.horizontalDrift = (Math.random() - 0.5) * 26;
      baseObject.spin = (Math.random() - 0.5) * 1.4;
    }

    if (distraction === "bat") {
      baseObject.horizontalDrift = (Math.random() - 0.5) * 38;
      baseObject.swayAmplitude = 12;
    }

    if (distraction === "drop") {
      baseObject.swayAmplitude = 4;
    }

    return {
      ...baseObject,
      kind: "distraction",
      distraction
    };
  }

  private createBaseObject(width: number, height: number): BaseFallingObject {
    const progress = this.activeElapsedMs / ACTIVE_DURATION_MS;
    const lane = this.pickLane();
    const baseX = this.lanes[lane]!;
    const speed = Math.min(320, 180 + Math.random() * 110 + progress * 30);

    return {
      id: this.nextId++,
      kind: "crystal",
      x: baseX,
      y: -30 - Math.random() * 24,
      baseX,
      speed,
      createdAt: performance.now(),
      width,
      height,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmplitude: 4 + Math.random() * 7,
      horizontalDrift: (Math.random() - 0.5) * 12,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.9
    };
  }

  private pickLane() {
    const occupied = new Set(
      this.fallingObjects
        .filter((fallingObject) => fallingObject.y < 160)
        .map((fallingObject) => this.closestLaneIndex(fallingObject.baseX))
    );
    const freeLanes = this.lanes
      .map((_, index) => index)
      .filter((index) => !occupied.has(index));
    const candidates = freeLanes.length > 0 ? freeLanes : this.lanes.map((_, index) => index);

    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  private closestLaneIndex(x: number) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    this.lanes.forEach((lane, index) => {
      const distance = Math.abs(lane - x);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  private pickCrystalColor(shouldBeTarget: boolean): CrystalColor {
    const colors: CrystalColor[] = ["blue", "red", "green", "gold"];

    if (this.currentRule.id === "blue") {
      return shouldBeTarget ? "blue" : colors.filter((color) => color !== "blue")[Math.floor(Math.random() * 3)]!;
    }

    if (this.currentRule.id === "red") {
      return shouldBeTarget ? "red" : colors.filter((color) => color !== "red")[Math.floor(Math.random() * 3)]!;
    }

    return colors[Math.floor(Math.random() * colors.length)]!;
  }

  private pickCrystalSize(shouldBeTarget: boolean): CrystalSize {
    if (this.currentRule.id === "small") {
      return shouldBeTarget ? "small" : "large";
    }

    return Math.random() < 0.5 ? "small" : "large";
  }

  private pickCrystalBrightness(shouldBeTarget: boolean) {
    if (this.currentRule.id === "bright") {
      return shouldBeTarget;
    }

    return Math.random() < 0.42;
  }

  private countVisibleTargets() {
    return this.fallingObjects.filter(
      (fallingObject) => fallingObject.kind === "crystal" && fallingObject.isTarget
    ).length;
  }

  private spawnIntervalMs() {
    const progress = this.activeElapsedMs / ACTIVE_DURATION_MS;
    return 900 - progress * 250;
  }

  private remainingSeconds() {
    return Math.max(0, Math.ceil((ACTIVE_DURATION_MS - this.activeElapsedMs) / 1000));
  }

  private findClickableObject(engine: GameEngine, pointer: PointerPosition) {
    const scenePointer = this.pointerInScene(pointer, engine.timeMs);

    for (let index = this.fallingObjects.length - 1; index >= 0; index -= 1) {
      const fallingObject = this.fallingObjects[index]!;

      if (this.objectContainsPoint(fallingObject, scenePointer)) {
        return fallingObject;
      }
    }

    return null;
  }

  private pointerInScene(pointer: PointerPosition, timeMs: number) {
    const shake = this.cameraOffset(timeMs);
    return {
      x: pointer.x - shake.x,
      y: pointer.y - shake.y
    };
  }

  private objectContainsPoint(fallingObject: FallingObject, point: PointerPosition) {
    return (
      point.x >= fallingObject.x - fallingObject.width / 2 - 6 &&
      point.x <= fallingObject.x + fallingObject.width / 2 + 6 &&
      point.y >= fallingObject.y - fallingObject.height / 2 - 6 &&
      point.y <= fallingObject.y + fallingObject.height / 2 + 6
    );
  }

  private headerLine(engine: GameEngine) {
    if (this.phase === "bridgeForming") {
      return "Os cristais estão se encaixando. Aguarde a ponte terminar de surgir.";
    }

    if (this.phase === "portal") {
      return engine.isSceneExitReady()
        ? "A ponte de cristal ficou pronta. Use as setas e siga até o portal à direita."
        : "A ponte ficou pronta. O portal está aparecendo no outro lado.";
    }

    return `Regra: ${this.currentRule.label} | Tempo: ${this.remainingSeconds()}s`;
  }

  private rulePreviewCrystal(): CrystalObject {
    const previewByRule: Record<
      AttentionRuleId,
      Pick<CrystalObject, "color" | "size" | "bright">
    > = {
      blue: { color: "blue", size: "large", bright: false },
      small: { color: "green", size: "small", bright: false },
      red: { color: "red", size: "large", bright: false },
      bright: { color: "gold", size: "large", bright: true }
    };
    const preview = previewByRule[this.currentRule.id];
    const dimensions = preview.size === "small" ? { width: 28, height: 34 } : { width: 40, height: 50 };

    return {
      id: 10_000 + this.currentRuleIndex,
      kind: "crystal",
      x: 0,
      y: 0,
      baseX: 0,
      speed: 0,
      createdAt: 0,
      width: dimensions.width,
      height: dimensions.height,
      swayPhase: 0,
      swayAmplitude: 0,
      horizontalDrift: 0,
      rotation: 0,
      spin: 0,
      isTarget: true,
      ...preview
    };
  }

  private objectColor(fallingObject: FallingObject) {
    if (fallingObject.kind === "crystal") {
      return this.crystalFill(fallingObject.color);
    }

    if (fallingObject.distraction === "stone") {
      return "#96a9b4";
    }

    if (fallingObject.distraction === "leaf") {
      return "#8fd07d";
    }

    if (fallingObject.distraction === "bat") {
      return "#826392";
    }

    if (fallingObject.distraction === "drop") {
      return "#79d8ff";
    }

    return "#fff9e9";
  }

  private crystalFill(color: CrystalColor) {
    if (color === "blue") {
      return "#4aa8ff";
    }

    if (color === "red") {
      return "#ff6f6b";
    }

    if (color === "green") {
      return "#71d18c";
    }

    return "#ffd76a";
  }

  private drawCaveShell(ctx: CanvasRenderingContext2D, timeMs: number) {
    ctx.fillStyle = "#132b35";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 160);
    ctx.quadraticCurveTo(110, 68, 220, 108);
    ctx.quadraticCurveTo(332, 146, 448, 88);
    ctx.quadraticCurveTo(606, 24, 746, 118);
    ctx.quadraticCurveTo(850, 176, 960, 114);
    ctx.lineTo(960, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 249, 233, 0.06)";
    for (let index = 0; index < 7; index += 1) {
      const x = 82 + index * 122;
      const width = 34 + (index % 2) * 10;
      const height = 78 + (index % 3) * 18 + Math.sin(timeMs / 320 + index) * 3;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + width / 2, height);
      ctx.lineTo(x + width, 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawAbyss(ctx: CanvasRenderingContext2D, timeMs: number) {
    const gradient = ctx.createLinearGradient(0, 364, 0, 540);
    gradient.addColorStop(0, "rgba(8, 20, 26, 0.3)");
    gradient.addColorStop(0.28, "rgba(7, 18, 24, 0.84)");
    gradient.addColorStop(1, "rgba(4, 10, 14, 0.98)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(188, 454);
    ctx.lineTo(248, 328);
    ctx.lineTo(718, 328);
    ctx.lineTo(772, 454);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(111, 214, 197, 0.16)";
    for (let index = 0; index < 8; index += 1) {
      const x = 250 + index * 64;
      const y = 390 + Math.sin(timeMs / 240 + index) * 16;
      const radius = 8 + (index % 3) * 4;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCliffLedges(ctx: CanvasRenderingContext2D) {
    this.drawCliffPlatform(ctx, LEFT_LEDGE, "#2b4b59", "#5f7f8d");
    this.drawCliffPlatform(ctx, RIGHT_LEDGE, "#2e5362", "#668aa0");
  }

  private drawCliffPlatform(ctx: CanvasRenderingContext2D, platform: Platform, faceColor: string, edgeColor: string) {
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.moveTo(platform.x, platform.y);
    ctx.lineTo(platform.x + platform.width, platform.y);
    ctx.lineTo(platform.x + platform.width, platform.y + platform.height);
    ctx.lineTo(platform.x, platform.y + platform.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = edgeColor;
    ctx.beginPath();
    ctx.moveTo(platform.x, platform.y);
    ctx.lineTo(platform.x + platform.width, platform.y);
    ctx.lineTo(platform.x + platform.width - 18, platform.y + 18);
    ctx.lineTo(platform.x + 16, platform.y + 18);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 4;
    ctx.strokeRect(platform.x + 2, platform.y + 2, platform.width - 4, platform.height - 4);
  }

  private drawBridge(ctx: CanvasRenderingContext2D, timeMs: number) {
    const builtUnits = this.bridgeProgress * BRIDGE_SEGMENTS.length;

    for (let index = 0; index < BRIDGE_SEGMENTS.length; index += 1) {
      const segment = BRIDGE_SEGMENTS[index]!;
      const fillRatio = clamp01(builtUnits - index);

      if (fillRatio <= 0) {
        continue;
      }

      this.drawBridgeSegment(ctx, segment, fillRatio, timeMs, index);
    }
  }

  private drawBridgeSegment(
    ctx: CanvasRenderingContext2D,
    segment: { x: number; y: number; width: number; height: number },
    fillRatio: number,
    timeMs: number,
    index: number
  ) {
    const renderWidth = Math.max(6, segment.width * fillRatio);

    ctx.save();
    ctx.beginPath();
    ctx.rect(segment.x, segment.y - 4, renderWidth, segment.height + 6);
    ctx.clip();

    ctx.fillStyle = "#71d8ff";
    ctx.beginPath();
    ctx.moveTo(segment.x, segment.y);
    ctx.lineTo(segment.x + segment.width * 0.18, segment.y - 12);
    ctx.lineTo(segment.x + segment.width * 0.5, segment.y - 4);
    ctx.lineTo(segment.x + segment.width * 0.82, segment.y - 16);
    ctx.lineTo(segment.x + segment.width, segment.y);
    ctx.lineTo(segment.x + segment.width - 6, segment.y + 42);
    ctx.lineTo(segment.x + segment.width * 0.74, segment.y + 78);
    ctx.lineTo(segment.x + segment.width * 0.24, segment.y + 70);
    ctx.lineTo(segment.x + 6, segment.y + 30);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 249, 233, 0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(segment.x + segment.width * 0.24, segment.y + 8);
    ctx.lineTo(segment.x + segment.width * 0.44, segment.y + 54);
    ctx.lineTo(segment.x + segment.width * 0.66, segment.y + 14);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 249, 233, 0.2)";
    ctx.beginPath();
    ctx.arc(
      segment.x + segment.width * 0.52,
      segment.y + 20,
      12 + Math.sin(timeMs / 160 + index) * 2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }

  private drawCeiling(ctx: CanvasRenderingContext2D, timeMs: number) {
    ctx.fillStyle = "rgba(9, 28, 36, 0.7)";
    for (let index = 0; index < this.lanes.length; index += 1) {
      const laneX = this.lanes[index]!;
      const height = 24 + (index % 3) * 9 + Math.sin(timeMs / 300 + index) * 2;

      ctx.beginPath();
      ctx.moveTo(laneX - 20, 0);
      ctx.lineTo(laneX, height);
      ctx.lineTo(laneX + 20, 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawTargetCard(ctx: CanvasRenderingContext2D, timeMs: number) {
    drawRoundedRect(ctx, TARGET_CARD.x, TARGET_CARD.y, TARGET_CARD.width, TARGET_CARD.height, 22);
    ctx.fillStyle = "rgba(255, 249, 233, 0.94)";
    ctx.fill();
    ctx.strokeStyle = this.currentRule.accent;
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#173b4f";
    ctx.font = "900 16px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Item alvo", TARGET_CARD.x + TARGET_CARD.width / 2, TARGET_CARD.y + 18);

    drawRoundedRect(ctx, TARGET_CARD.x + 34, TARGET_CARD.y + 52, 124, 124, 22);
    ctx.fillStyle = "rgba(23, 59, 79, 0.08)";
    ctx.fill();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 3;
    ctx.stroke();

    const preview = this.rulePreviewCrystal();
    ctx.save();
    ctx.translate(TARGET_CARD.x + TARGET_CARD.width / 2, TARGET_CARD.y + 114);
    ctx.scale(1.8, 1.8);
    this.drawCrystal(ctx, preview, timeMs);
    ctx.restore();

    ctx.fillStyle = "#173b4f";
    ctx.font = "900 14px Trebuchet MS, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(this.currentRule.shortLabel, TARGET_CARD.x + TARGET_CARD.width / 2, TARGET_CARD.y + 193);

    const progressPercent = Math.round(this.bridgeProgress * 100);
    const barX = TARGET_CARD.x + 26;
    const barY = TARGET_CARD.y + 204;
    const barWidth = TARGET_CARD.width - 52;
    const barHeight = 20;

    drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 10);
    ctx.fillStyle = "rgba(23, 59, 79, 0.1)";
    ctx.fill();
    ctx.strokeStyle = "rgba(23, 59, 79, 0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (this.bridgeProgress > 0) {
      const innerWidth = (barWidth - 6) * this.bridgeProgress;
      drawRoundedRect(ctx, barX + 3, barY + 3, innerWidth, barHeight - 6, 8);
      ctx.fillStyle = this.currentRule.accent;
      ctx.fill();
    }

    ctx.font = "800 12px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#173b4f";
    ctx.fillText(`Ponte ${progressPercent}%`, TARGET_CARD.x + TARGET_CARD.width / 2, barY + barHeight / 2 + 1);
  }

  private drawRuleBanner(ctx: CanvasRenderingContext2D) {
    drawRoundedRect(ctx, 206, 150, 548, 124, 24);
    ctx.fillStyle = "rgba(9, 28, 36, 0.9)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = this.currentRule.accent;
    ctx.stroke();

    ctx.fillStyle = "#fff9e9";
    ctx.font = "900 18px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Novo alvo", 480, 184);
    ctx.font = "900 28px Trebuchet MS, sans-serif";
    ctx.fillText(this.currentRule.label, 480, 224);
  }

  private drawAssistBanner(ctx: CanvasRenderingContext2D) {
    drawRoundedRect(ctx, 286, 484, 388, 34, 15);
    ctx.fillStyle = "rgba(255, 215, 106, 0.94)";
    ctx.fill();
    ctx.fillStyle = "#173b4f";
    ctx.font = "900 15px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Ajuda Kog ativa: os cristais corretos estão destacados.", 480, 501);
  }

  private drawRobotPerchGlow(ctx: CanvasRenderingContext2D, playerX: number, playerY: number) {
    ctx.fillStyle = "rgba(111, 214, 197, 0.12)";
    ctx.beginPath();
    ctx.ellipse(playerX + 21, playerY + 30, 34, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFallingObject(ctx: CanvasRenderingContext2D, fallingObject: FallingObject, timeMs: number) {
    ctx.save();
    ctx.translate(fallingObject.x, fallingObject.y);
    ctx.rotate(fallingObject.rotation);

    if (fallingObject.kind === "crystal") {
      this.drawCrystal(ctx, fallingObject, timeMs);
    } else {
      this.drawDistraction(ctx, fallingObject, timeMs);
    }

    ctx.restore();
  }

  private drawCrystal(ctx: CanvasRenderingContext2D, crystal: CrystalObject, timeMs: number) {
    const highlight = crystal.isTarget && this.assistRemainingMs > 0;
    const glowAlpha = crystal.bright ? 0.3 : 0.15;
    const glowRadius = crystal.size === "small" ? 22 : 30;

    if (crystal.bright || highlight) {
      ctx.fillStyle = highlight ? "rgba(255, 215, 106, 0.36)" : `rgba(255, 249, 233, ${glowAlpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius + Math.sin(timeMs / 140 + crystal.id) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = this.crystalFill(crystal.color);
    ctx.beginPath();
    ctx.moveTo(0, -crystal.height / 2);
    ctx.lineTo(crystal.width / 2, -2);
    ctx.lineTo(crystal.width / 5, crystal.height / 2);
    ctx.lineTo(-crystal.width / 5, crystal.height / 2);
    ctx.lineTo(-crystal.width / 2, -2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = highlight ? "#fff9e9" : "#173b4f";
    ctx.lineWidth = highlight ? 5 : 4;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 249, 233, 0.78)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-crystal.width / 7, -crystal.height / 4);
    ctx.lineTo(0, crystal.height / 4);
    ctx.lineTo(crystal.width / 7, -crystal.height / 6);
    ctx.stroke();
  }

  private drawDistraction(ctx: CanvasRenderingContext2D, distraction: DistractionObject, timeMs: number) {
    if (distraction.distraction === "stone") {
      ctx.fillStyle = "#6d7d88";
      ctx.beginPath();
      ctx.moveTo(-16, -10);
      ctx.lineTo(10, -14);
      ctx.lineTo(18, 0);
      ctx.lineTo(12, 14);
      ctx.lineTo(-10, 12);
      ctx.lineTo(-18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = 4;
      ctx.stroke();
      return;
    }

    if (distraction.distraction === "leaf") {
      ctx.fillStyle = "#8fd07d";
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 9, Math.sin(timeMs / 180 + distraction.id) * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2f6b66";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      return;
    }

    if (distraction.distraction === "bat") {
      const flap = Math.sin(timeMs / 70 + distraction.id) * 0.7;

      ctx.fillStyle = "#513b5c";
      ctx.beginPath();
      ctx.arc(0, 1, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.quadraticCurveTo(-18, -14 - flap * 8, -26, 2);
      ctx.quadraticCurveTo(-16, 1, -8, 4);
      ctx.moveTo(8, 0);
      ctx.quadraticCurveTo(18, -14 - flap * 8, 26, 2);
      ctx.quadraticCurveTo(16, 1, 8, 4);
      ctx.fill();
      return;
    }

    if (distraction.distraction === "drop") {
      ctx.fillStyle = "#79d8ff";
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.bezierCurveTo(10, -8, 9, 6, 0, 14);
      ctx.bezierCurveTo(-9, 6, -10, -8, 0, -14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = 3;
      ctx.stroke();
      return;
    }

    ctx.fillStyle = "rgba(255, 249, 233, 0.52)";
    for (let index = 0; index < 6; index += 1) {
      ctx.beginPath();
      ctx.arc(
        -10 + index * 4,
        Math.sin(index + timeMs / 180 + distraction.id) * 4,
        3 + (index % 2),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  private drawShatterEffect(ctx: CanvasRenderingContext2D, effect: ShatterEffect) {
    const progress = clamp01(effect.ageMs / effect.durationMs);
    const fade = 1 - progress;

    ctx.save();
    ctx.globalAlpha = fade;

    if (effect.bright) {
      ctx.fillStyle = "rgba(255, 249, 233, 0.4)";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 24 * fade, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const piece of effect.pieces) {
      const distance = piece.speed * progress;
      const x = effect.x + Math.cos(piece.angle) * distance;
      const y = effect.y + Math.sin(piece.angle) * distance + progress * progress * 18;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(piece.rotation + piece.spin * effect.ageMs * 0.01);
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.moveTo(0, -piece.height / 2);
      ctx.lineTo(piece.width / 2, 0);
      ctx.lineTo(0, piece.height / 2);
      ctx.lineTo(-piece.width / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = effect.outline;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private cameraOffset(timeMs: number) {
    const progress = this.activeElapsedMs / ACTIVE_DURATION_MS;
    let intensity = 0.8 + progress * 5.2;

    if (this.phase === "banner") {
      intensity *= 0.55;
    }

    if (this.phase === "bridgeForming") {
      intensity *= 0.18;
    }

    if (this.phase === "portal") {
      intensity *= 0.1;
    }

    if (this.assistRemainingMs > 0) {
      intensity *= 0.35;
    }

    return {
      x: Math.sin(timeMs / 54) * intensity,
      y: Math.cos(timeMs / 67) * intensity * 0.58
    };
  }

  private get currentRule() {
    return RULES[this.currentRuleIndex]!;
  }
}
