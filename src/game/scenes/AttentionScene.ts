import { predictAttentionRisk, warmAttentionModel } from "@/ai/adhdModel";
import type { GameEngine, GameScene, Platform } from "@/game/engine/GameEngine";
import type { AttentionRuleId } from "@/metrics/metricsCollector";
import {
  drawCaveBackground,
  drawPanelText,
  drawPlatform,
  drawRoundedRect
} from "@/game/scenes/sceneUtils";

type CrystalColor = "blue" | "red" | "green" | "gold";
type CrystalSize = "small" | "large";
type DistractionKind = "stone" | "leaf" | "bat" | "drop" | "dust";
type ScenePhase = "banner" | "playing" | "complete";

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
const FLOOR_Y = 432;
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

export class AttentionScene implements GameScene {
  id = "attention";
  title = "Caverna em tremor";
  objective = "Colete apenas os cristais indicados pela regra atual";
  spawnSide = "left" as const;
  allowJump = false;
  exitMode = "portal" as const;
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly lanes = [96, 216, 336, 456, 576, 696, 816];
  private fallingObjects: FallingObject[] = [];
  private nextId = 1;
  private phase: ScenePhase = "banner";
  private bannerRemainingMs = RULE_BANNER_MS;
  private nextSpawnInMs = 560;
  private activeElapsedMs = 0;
  private currentRuleIndex = 0;
  private completed = false;
  private assistRemainingMs = 0;
  private correctHits = 0;
  private impulsiveErrors = 0;
  private omissions = 0;
  private distractionsCollected = 0;
  private lastRiskSampleAtMs = -RISK_SAMPLE_INTERVAL_MS;
  private riskPredictionPending = false;

  enter(engine: GameEngine) {
    this.fallingObjects = [];
    this.nextId = 1;
    this.phase = "banner";
    this.bannerRemainingMs = RULE_BANNER_MS;
    this.nextSpawnInMs = 560;
    this.activeElapsedMs = 0;
    this.currentRuleIndex = 0;
    this.completed = false;
    this.assistRemainingMs = 0;
    this.correctHits = 0;
    this.impulsiveErrors = 0;
    this.omissions = 0;
    this.distractionsCollected = 0;
    this.lastRiskSampleAtMs = -RISK_SAMPLE_INTERVAL_MS;
    this.riskPredictionPending = false;
    void warmAttentionModel();
    engine.metrics.startAttentionRule(this.currentRule.id, this.currentRule.label, 0);
    engine.dialogBox.setLines([
      "A caverna começou a tremer e tudo está caindo do teto.",
      "Mova o robô para a esquerda e para a direita e encoste apenas nos cristais que combinam com a regra do painel.",
      "Ignore pedras, folhas, morcegos, gotas d'água e poeira."
    ]);
  }

  update(engine: GameEngine, dt: number) {
    if (this.completed || engine.dialogBox.isActive) {
      return;
    }

    this.assistRemainingMs = Math.max(0, this.assistRemainingMs - dt * 1000);

    if (this.phase === "banner") {
      this.bannerRemainingMs = Math.max(0, this.bannerRemainingMs - dt * 1000);

      if (this.bannerRemainingMs <= 0) {
        this.phase = "playing";
        this.nextSpawnInMs = Math.min(this.nextSpawnInMs, 260);
      }

      return;
    }

    if (this.phase !== "playing") {
      return;
    }

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
      this.finishPhase(engine);
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

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#365e6b");
    this.drawCaveShell(ctx, engine.timeMs);
    drawPanelText(
      ctx,
      "Cristais em queda",
      this.completed
        ? "O tremor diminuiu. Leve o robô até o portal no centro para seguir viagem."
        : `Regra: ${this.currentRule.label} | Tempo: ${this.remainingSeconds()}s`
    );
    this.drawStatsCard(ctx);
    this.drawRuleTag(ctx);

    const shake = this.cameraOffset(engine.timeMs);

    ctx.save();
    ctx.translate(shake.x, shake.y);

    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    this.drawCeiling(ctx, engine.timeMs);
    this.drawCollectionGlow(ctx, engine.player.x, engine.player.y);

    for (const fallingObject of this.fallingObjects) {
      this.drawFallingObject(ctx, fallingObject, engine.timeMs);
    }

    ctx.restore();

    if (this.phase === "banner" && !this.completed) {
      this.drawRuleBanner(ctx);
    }

    if (this.assistRemainingMs > 0 && !this.completed) {
      this.drawAssistBanner(ctx);
    }
  }

  onAutoHelp(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.assistRemainingMs = ASSIST_DURATION_MS;
    engine.metrics.recordAttentionAutoHelp();
  }

  getCameraOffset(engine: GameEngine) {
    return this.cameraOffset(engine.timeMs);
  }

  private finishPhase(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.completed = true;
    this.phase = "complete";
    this.activeElapsedMs = ACTIVE_DURATION_MS;
    this.assistRemainingMs = 0;
    this.fallingObjects = [];
    engine.metrics.completeAttentionRule(ACTIVE_DURATION_MS);
    engine.completeScene();
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
    const collectZone = {
      x: engine.player.x - 12,
      y: engine.player.y - 10,
      width: engine.player.width + 24,
      height: engine.player.height + 20
    };
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

      if (this.objectTouchesZone(fallingObject, collectZone)) {
        this.resolveCollection(engine, fallingObject);
        continue;
      }

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

  private resolveCollection(engine: GameEngine, fallingObject: FallingObject) {
    if (fallingObject.kind === "crystal" && fallingObject.isTarget) {
      this.correctHits += 1;
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

  private objectTouchesZone(fallingObject: FallingObject, zone: { x: number; y: number; width: number; height: number }) {
    return (
      fallingObject.x + fallingObject.width / 2 > zone.x &&
      fallingObject.x - fallingObject.width / 2 < zone.x + zone.width &&
      fallingObject.y + fallingObject.height / 2 > zone.y &&
      fallingObject.y - fallingObject.height / 2 < zone.y + zone.height
    );
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

  private drawStatsCard(ctx: CanvasRenderingContext2D) {
    drawRoundedRect(ctx, 708, 22, 226, 110, 18);
    ctx.fillStyle = "rgba(255, 249, 233, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 4;
    ctx.stroke();

    const stats = [
      `Acertos: ${this.correctHits}`,
      `Erros impulsivos: ${this.impulsiveErrors}`,
      `Omissões: ${this.omissions}`,
      `Distrações: ${this.distractionsCollected}`
    ];

    ctx.fillStyle = "#173b4f";
    ctx.font = "900 15px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    stats.forEach((line, index) => {
      ctx.fillText(line, 728, 44 + index * 20);
    });
  }

  private drawRuleTag(ctx: CanvasRenderingContext2D) {
    drawRoundedRect(ctx, 582, 34, 108, 30, 15);
    ctx.fillStyle = this.currentRule.accent;
    ctx.fill();
    ctx.fillStyle = "#173b4f";
    ctx.font = "900 13px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.currentRule.shortLabel, 636, 49);
  }

  private drawRuleBanner(ctx: CanvasRenderingContext2D) {
    drawRoundedRect(ctx, 212, 150, 536, 118, 24);
    ctx.fillStyle = "rgba(9, 28, 36, 0.9)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = this.currentRule.accent;
    ctx.stroke();

    ctx.fillStyle = "#fff9e9";
    ctx.font = "900 18px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Nova regra", 480, 182);
    ctx.font = "900 28px Trebuchet MS, sans-serif";
    ctx.fillText(this.currentRule.label, 480, 220);
  }

  private drawAssistBanner(ctx: CanvasRenderingContext2D) {
    drawRoundedRect(ctx, 300, 484, 360, 34, 15);
    ctx.fillStyle = "rgba(255, 215, 106, 0.94)";
    ctx.fill();
    ctx.fillStyle = "#173b4f";
    ctx.font = "900 15px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Ajuda Kog ativa: os cristais corretos estão destacados.", 480, 501);
  }

  private drawCollectionGlow(ctx: CanvasRenderingContext2D, playerX: number, playerY: number) {
    ctx.fillStyle = this.assistRemainingMs > 0 ? "rgba(255, 215, 106, 0.18)" : "rgba(111, 214, 197, 0.11)";
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

    ctx.fillStyle =
      crystal.color === "blue"
        ? "#4aa8ff"
        : crystal.color === "red"
          ? "#ff6f6b"
          : crystal.color === "green"
            ? "#71d18c"
            : "#ffd76a";
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

  private cameraOffset(timeMs: number) {
    const progress = this.activeElapsedMs / ACTIVE_DURATION_MS;
    let intensity = 0.8 + progress * 5.2;

    if (this.phase === "banner") {
      intensity *= 0.55;
    }

    if (this.assistRemainingMs > 0) {
      intensity *= 0.35;
    }

    if (this.completed) {
      intensity *= 0.25;
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
