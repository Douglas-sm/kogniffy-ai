import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import {
  type ButtonRect,
  drawCaveBackground,
  drawChoiceButton,
  drawPanelText,
  drawPlatform,
  pointInRect
} from "@/game/scenes/sceneUtils";
import type { ContrastErrorType } from "@/metrics/metricsCollector";

interface ColorTrial {
  prompt: string;
  hidden: string;
  answer: string;
  options: string[];
  type: ContrastErrorType;
  seed: number;
  base: string;
  hiddenColor: string;
}

export class ColorScene implements GameScene {
  id = "colors";
  title = "Portão tecnológico";
  objective = "Identifique o código escondido nas cores";
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly trials: ColorTrial[] = [
    {
      prompt: "Existe um número escondido entre os círculos.",
      hidden: "7",
      answer: "7",
      options: ["7", "2", "9"],
      type: "redGreen",
      seed: 3,
      base: "#8bc77a",
      hiddenColor: "#d67661"
    },
    {
      prompt: "Agora procure o símbolo do caminho.",
      hidden: "Z",
      answer: "Z",
      options: ["N", "Z", "M"],
      type: "blueYellow",
      seed: 8,
      base: "#82b9df",
      hiddenColor: "#e7cf63"
    },
    {
      prompt: "O último código tem pouco contraste.",
      hidden: "4",
      answer: "4",
      options: ["1", "4", "8"],
      type: "lowContrast",
      seed: 12,
      base: "#b9d7b1",
      hiddenColor: "#8eb984"
    }
  ];

  private trialIndex = 0;
  private startedAt = 0;
  private completed = false;

  enter(engine: GameEngine) {
    this.trialIndex = 0;
    this.completed = false;
    this.startedAt = performance.now();
    engine.dialogBox.setLines([
      "Me ajude a decifrar o código para abrir a porta.",
      "Existe algo escondido entre essas cores.",
      "Observe os padrões com atenção."
    ]);
  }

  update() {
    return;
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#7e65d8");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    const trial = this.trials[this.trialIndex];
    drawPanelText(ctx, "Código cromático", trial?.prompt ?? "Portão desbloqueado.");

    if (trial) {
      this.drawIshihara(ctx, trial);
      this.optionRects(trial).forEach((rect) => drawChoiceButton(ctx, rect));
    }
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    const trial = this.trials[this.trialIndex];

    if (!trial || this.completed) {
      return;
    }

    const selected = this.optionRects(trial).find((rect) => pointInRect(pointer, rect));

    if (!selected) {
      return;
    }

    engine.metrics.recordAttempt();
    engine.metrics.recordResponseTime(performance.now() - this.startedAt);

    if (selected.label === trial.answer) {
      engine.clearErrorStreak(this.id);
      this.trialIndex += 1;
      this.startedAt = performance.now();

      if (this.trialIndex >= this.trials.length) {
        this.complete(engine);
      }
      return;
    }

    engine.metrics.recordContrastError(trial.type);
    engine.registerError(this.id);
  }

  onAutoHelp(engine: GameEngine) {
    this.complete(engine);
  }

  private complete(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.completed = true;
    engine.dialogBox.setLines(["O portão respondeu ao código. Vamos continuar."], () => engine.nextScene());
  }

  private optionRects(trial: ColorTrial): ButtonRect[] {
    return trial.options.map((label, index) => ({
      label,
      x: 602 + index * 104,
      y: 214,
      width: 76,
      height: 60
    }));
  }

  private drawIshihara(ctx: CanvasRenderingContext2D, trial: ColorTrial) {
    ctx.save();
    ctx.translate(270, 260);
    ctx.fillStyle = "#fff9e9";
    ctx.beginPath();
    ctx.arc(0, 0, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();

    for (let index = 0; index < 96; index += 1) {
      const angle = this.random(index, trial.seed) * Math.PI * 2;
      const radius = Math.sqrt(this.random(index + 31, trial.seed)) * 120;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const size = 7 + this.random(index + 7, trial.seed) * 12;

      ctx.fillStyle = index % 4 === 0 ? "#f6c55f" : trial.base;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = trial.hiddenColor;
    ctx.font = "900 142px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(trial.hidden, 0, 8);
    ctx.restore();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(270, 260, 130, 0, Math.PI * 2);
    ctx.stroke();
  }

  private random(index: number, seed: number) {
    return Math.abs(Math.sin(index * 91.345 + seed * 17.17)) % 1;
  }
}
