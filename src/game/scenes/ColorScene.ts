import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import {
  buildIshiharaPlate,
  generateColorTrials,
  type ColorTrialSpec,
  type IshiharaPlate
} from "@/colorblind/plates";
import {
  type ButtonRect,
  type ChoiceButtonState,
  drawCaveBackground,
  drawChoiceButton,
  drawPlatform,
  pointInRect
} from "@/game/scenes/sceneUtils";

interface SceneTrial extends ColorTrialSpec {
  plate: IshiharaPlate;
}

const TRIAL_COUNT = 8;
const CORRECT_FEEDBACK_MS = 220;
const WRONG_FEEDBACK_MS = 360;

interface ButtonFeedback {
  label: string;
  state: Exclude<ChoiceButtonState, "idle">;
  untilMs: number;
}

export class ColorScene implements GameScene {
  id = "colors";
  title = "Portão tecnológico";
  objective = "Identifique o código numérico escondido nas cores";
  spawnSide = "right" as const;
  allowJump = false;
  exitMode = "portal" as const;
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private trials: SceneTrial[] = [];
  private trialIndex = 0;
  private trialAttemptCount = 0;
  private startedAt = 0;
  private waitingForTrialStart = false;
  private completed = false;
  private buttonFeedback: ButtonFeedback | null = null;
  private pendingAdvanceAtMs: number | null = null;

  enter(engine: GameEngine) {
    const sessionSeed = Date.now() % 100000;

    this.trials = generateColorTrials(TRIAL_COUNT, sessionSeed).map((trial) => ({
      ...trial,
      plate: buildIshiharaPlate(trial)
    }));
    this.trialIndex = 0;
    this.trialAttemptCount = 0;
    this.startedAt = 0;
    this.waitingForTrialStart = true;
    this.completed = false;
    this.buttonFeedback = null;
    this.pendingAdvanceAtMs = null;

    engine.dialogBox.setLines([
      "O portão usa placas cromáticas para liberar a passagem.",
      "Cada painel esconde apenas números para destravar o caminho.",
      "Observe os pontos com calma e escolha entre quatro números."
    ]);
  }

  update(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    if (this.pendingAdvanceAtMs !== null && engine.timeMs >= this.pendingAdvanceAtMs) {
      this.buttonFeedback = null;
      this.pendingAdvanceAtMs = null;
      this.advanceOrComplete(engine);
    }

    if (this.buttonFeedback && this.pendingAdvanceAtMs === null && engine.timeMs >= this.buttonFeedback.untilMs) {
      this.buttonFeedback = null;
    }

    if (this.completed || engine.dialogBox.isActive || !this.waitingForTrialStart || this.pendingAdvanceAtMs !== null) {
      return;
    }

    const trial = this.currentTrial();

    if (!trial) {
      return;
    }

    this.startedAt = performance.now();
    this.trialAttemptCount = 0;
    this.waitingForTrialStart = false;
    engine.metrics.recordColorTrialStarted(trial.type, trial.charType);
  }

  getHudMessage() {
    const trial = this.currentTrial();

    return this.completed
      ? "O portal abriu no centro. Caminhe até ele para seguir."
      : trial?.prompt ?? "Portão desbloqueado. O código foi aceito.";
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#6b7bd6");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    const trial = this.currentTrial();

    if (!trial) {
      return;
    }

    this.drawIshihara(ctx, trial);
    this.optionRects(trial).forEach((rect) => drawChoiceButton(ctx, rect, this.buttonStateFor(rect.label)));

    ctx.fillStyle = "#fff9e9";
    ctx.font = "800 17px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Escolha o número escondido:", 592, 164);
    ctx.fillStyle = "#d8e8ef";
    ctx.font = "700 14px Trebuchet MS, sans-serif";
    ctx.fillText(`Tentativa ${this.trialIndex + 1} de ${this.trials.length}`, 592, 184);
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    const trial = this.currentTrial();

    if (!trial || this.completed || this.waitingForTrialStart || this.pendingAdvanceAtMs !== null || this.hasActiveFeedback(engine.timeMs)) {
      return;
    }

    const selected = this.optionRects(trial).find((rect) => pointInRect(pointer, rect));

    if (!selected) {
      return;
    }

    const responseTime = performance.now() - this.startedAt;
    const isFirstAttempt = this.trialAttemptCount === 0;
    const correct = selected.label === trial.answer;

    this.trialAttemptCount += 1;

    engine.metrics.recordAttempt();
    engine.metrics.recordResponseTime(responseTime);
    engine.metrics.recordColorResponse(
      {
        target: trial.answer,
        selected: selected.label,
        correct,
        trialType: trial.type,
        difficulty: trial.difficulty,
        charType: trial.charType,
        responseTimeMs: responseTime,
        optionSet: [...trial.options],
        trialIndex: this.trialIndex,
        usedAutoHelp: false
      },
      isFirstAttempt
    );

    if (correct) {
      engine.clearErrorStreak(this.id);
      engine.metrics.recordColorTrialCompleted();
      this.buttonFeedback = {
        label: selected.label,
        state: "correct",
        untilMs: engine.timeMs + CORRECT_FEEDBACK_MS
      };
      this.pendingAdvanceAtMs = engine.timeMs + CORRECT_FEEDBACK_MS;
      return;
    }

    this.buttonFeedback = {
      label: selected.label,
      state: "wrong",
      untilMs: engine.timeMs + WRONG_FEEDBACK_MS
    };
    engine.metrics.recordContrastError(trial.type);
    engine.registerError(this.id);
  }

  onAutoHelp(engine: GameEngine) {
    if (!this.currentTrial() || this.completed) {
      return;
    }

    engine.metrics.recordColorTrialCompleted();
    engine.clearErrorStreak(this.id);
    this.advanceOrComplete(engine);
  }

  private currentTrial() {
    return this.trials[this.trialIndex] ?? null;
  }

  private hasActiveFeedback(timeMs: number) {
    return Boolean(this.buttonFeedback && timeMs < this.buttonFeedback.untilMs);
  }

  private buttonStateFor(label: string): ChoiceButtonState {
    if (!this.buttonFeedback || this.buttonFeedback.label !== label) {
      return "idle";
    }

    return this.buttonFeedback.state;
  }

  private advanceOrComplete(engine: GameEngine) {
    this.buttonFeedback = null;
    this.pendingAdvanceAtMs = null;
    this.trialIndex += 1;

    if (this.trialIndex >= this.trials.length) {
      this.complete(engine);
      return;
    }

    this.waitingForTrialStart = true;
  }

  private complete(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.completed = true;
    engine.completeScene();
  }

  private optionRects(trial: SceneTrial): ButtonRect[] {
    const positions = [
      { x: 592, y: 206 },
      { x: 706, y: 206 },
      { x: 592, y: 286 },
      { x: 706, y: 286 }
    ];

    return trial.options.map((label, index) => ({
      label,
      x: positions[index]?.x ?? 592,
      y: positions[index]?.y ?? 206,
      width: 90,
      height: 62
    }));
  }

  private drawIshihara(ctx: CanvasRenderingContext2D, trial: SceneTrial) {
    const plateRadius = 132;
    const dotScale = 124;

    ctx.save();
    ctx.translate(270, 260);
    ctx.shadowColor = "rgba(49, 33, 9, 0.1)";
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "rgba(255, 251, 242, 0.96)";
    ctx.beginPath();
    ctx.arc(0, 0, plateRadius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(270, 260);
    ctx.fillStyle = "#fffdf7";
    ctx.beginPath();
    ctx.arc(0, 0, plateRadius + 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = trial.plate.backgroundColor;
    ctx.beginPath();
    ctx.arc(0, 0, plateRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();

    for (const dot of trial.plate.dots) {
      ctx.fillStyle = dot.color;
      ctx.beginPath();
      ctx.arc(dot.x * dotScale, dot.y * dotScale, dot.radius * dotScale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.strokeStyle = trial.plate.borderColor;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(270, 260, plateRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(270, 260, plateRadius + 1.9, 0, Math.PI * 2);
    ctx.stroke();
  }
}
