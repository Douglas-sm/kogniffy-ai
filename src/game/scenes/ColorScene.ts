import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import {
  buildIshiharaPlate,
  generateColorTrials,
  type ColorTrialSpec,
  type IshiharaPlate
} from "@/colorblind/plates";
import {
  type ButtonRect,
  drawCaveBackground,
  drawChoiceButton,
  drawPanelText,
  drawPlatform,
  pointInRect
} from "@/game/scenes/sceneUtils";

interface SceneTrial extends ColorTrialSpec {
  plate: IshiharaPlate;
}

const TRIAL_COUNT = 8;

export class ColorScene implements GameScene {
  id = "colors";
  title = "Portão tecnológico";
  objective = "Identifique o código escondido nas cores";
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private trials: SceneTrial[] = [];
  private trialIndex = 0;
  private trialAttemptCount = 0;
  private startedAt = 0;
  private waitingForTrialStart = false;
  private completed = false;

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

    engine.dialogBox.setLines([
      "O portão usa placas cromáticas para liberar a passagem.",
      "Os códigos agora misturam números e letras aleatórias.",
      "Observe os pontos com calma e escolha entre quatro símbolos."
    ]);
  }

  update(engine: GameEngine) {
    if (this.completed || engine.dialogBox.isActive || !this.waitingForTrialStart) {
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

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#6b7bd6");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    const trial = this.currentTrial();
    drawPanelText(
      ctx,
      "Código cromático",
      trial?.prompt ?? "Portão desbloqueado. O código foi aceito."
    );

    if (!trial) {
      return;
    }

    this.drawIshihara(ctx, trial);
    this.optionRects(trial).forEach((rect) => drawChoiceButton(ctx, rect));

    ctx.fillStyle = "#fff9e9";
    ctx.font = "800 17px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Escolha o caractere escondido:", 592, 164);
    ctx.fillStyle = "#d8e8ef";
    ctx.font = "700 14px Trebuchet MS, sans-serif";
    ctx.fillText(`Tentativa ${this.trialIndex + 1} de ${this.trials.length}`, 592, 184);
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    const trial = this.currentTrial();

    if (!trial || this.completed || this.waitingForTrialStart) {
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
      this.advanceOrComplete(engine);
      return;
    }

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

  private advanceOrComplete(engine: GameEngine) {
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
    engine.dialogBox.setLines(["O portão respondeu ao código. Vamos continuar."], () => engine.nextScene());
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
    const plateRadius = 126;
    const dotScale = 120;

    ctx.save();
    ctx.translate(270, 260);
    ctx.shadowColor = "rgba(49, 33, 9, 0.16)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.arc(0, 0, plateRadius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(270, 260);
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
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(270, 260, plateRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
