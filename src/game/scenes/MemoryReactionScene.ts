import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import {
  type ButtonRect,
  drawCaveBackground,
  drawChoiceButton,
  drawPanelText,
  drawPlatform,
  pointInRect
} from "@/game/scenes/sceneUtils";

type MemoryPhase = "showing" | "input" | "pause" | "complete";

export class MemoryReactionScene implements GameScene {
  id = "memory";
  title = "Nave do Kog";
  objective = "Repita a sequência do painel";
  spawnSide = "left" as const;
  allowJump = false;
  exitMode = "portal" as const;
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly pattern = [0, 2, 1, 3, 2];
  private readonly labels = ["Sol", "Cristal", "Raio", "Porta"];
  private sequenceLength = 2;
  private sequence: number[] = [];
  private phase: MemoryPhase = "showing";
  private showIndex = 0;
  private showNextAt = 0;
  private activeButton: number | null = null;
  private inputIndex = 0;
  private lastPromptAt = 0;
  private pauseUntil = 0;
  private completed = false;

  enter(engine: GameEngine) {
    this.sequenceLength = 2;
    this.completed = false;
    this.startRound(engine);
    engine.dialogBox.setLines([
      "Me ajude a lembrar a sequência.",
      "Acho que a nave ainda responde aos comandos antigos.",
      "Observe a ordem com atenção."
    ]);
  }

  update(engine: GameEngine) {
    if (this.completed || engine.dialogBox.isActive) {
      return;
    }

    if (this.phase === "pause" && engine.timeMs > this.pauseUntil) {
      this.sequenceLength += 1;
      this.startRound(engine);
      return;
    }

    if (this.phase !== "showing" || engine.timeMs < this.showNextAt) {
      return;
    }

    if (this.showIndex >= this.sequence.length) {
      this.activeButton = null;
      this.phase = "input";
      this.inputIndex = 0;
      this.lastPromptAt = performance.now();
      return;
    }

    this.activeButton = this.sequence[this.showIndex];
    this.showIndex += 1;
    this.showNextAt = engine.timeMs + 680;

    window.setTimeout(() => {
      if (this.phase === "showing") {
        this.activeButton = null;
      }
    }, 320);
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#6fd6c5");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    drawPanelText(ctx, "Painel da nave", this.instructionText());

    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.roundRect(218, 132, 524, 260, 24);
    ctx.fill();
    ctx.fillStyle = "#244958";
    ctx.beginPath();
    ctx.roundRect(246, 158, 468, 208, 18);
    ctx.fill();

    this.buttonRects().forEach((rect, index) => {
      drawChoiceButton(ctx, rect, this.activeButton === index);
    });
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.completed || this.phase !== "input") {
      return;
    }

    const selectedIndex = this.buttonRects().findIndex((rect) => pointInRect(pointer, rect));

    if (selectedIndex < 0) {
      return;
    }

    engine.metrics.recordAttempt();
    engine.metrics.recordReactionTime(performance.now() - this.lastPromptAt);
    this.lastPromptAt = performance.now();

    if (selectedIndex === this.sequence[this.inputIndex]) {
      engine.clearErrorStreak(this.id);
      this.inputIndex += 1;

      if (this.inputIndex >= this.sequence.length) {
        engine.metrics.recordMaxSequenceLength(this.sequence.length);
        engine.metrics.recordSequenceScore(this.sequence.length);

        if (this.sequence.length >= 5) {
          this.complete(engine);
          return;
        }

        this.phase = "pause";
        this.pauseUntil = engine.timeMs + 780;
      }
      return;
    }

    engine.metrics.recordSequenceError();
    engine.registerError(this.id);
    this.inputIndex = 0;
  }

  onAutoHelp(engine: GameEngine) {
    engine.metrics.recordMaxSequenceLength(Math.max(3, this.sequenceLength));
    this.complete(engine);
  }

  private startRound(engine: GameEngine) {
    this.sequence = this.pattern.slice(0, this.sequenceLength);
    this.phase = "showing";
    this.showIndex = 0;
    this.activeButton = null;
    this.showNextAt = engine.timeMs + 420;
  }

  private complete(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.completed = true;
    this.phase = "complete";
    engine.completeScene();
  }

  private instructionText() {
    if (this.completed) {
      return "Portal aberto no centro. Leve o robô até ele para concluir a travessia.";
    }

    if (this.phase === "showing") {
      return `Observe a ordem com atenção. Sequência ${this.sequence.length}.`;
    }

    if (this.phase === "input") {
      return `Repita a sequência. Toque ${this.inputIndex + 1} de ${this.sequence.length}.`;
    }

    return "Muito bem. Preparando uma sequência maior.";
  }

  private buttonRects(): ButtonRect[] {
    return this.labels.map((label, index) => ({
      label,
      x: 286 + (index % 2) * 212,
      y: 190 + Math.floor(index / 2) * 92,
      width: 176,
      height: 64
    }));
  }
}
