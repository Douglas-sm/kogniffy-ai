import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import {
  drawCaveBackground,
  drawPanelText,
  drawPlatform
} from "@/game/scenes/sceneUtils";

interface FlyingLetter {
  char: string;
  x: number;
  y: number;
  speed: number;
  phase: number;
}

const SIMILAR_PAIRS = new Set(["bd", "db", "pq", "qp", "mn", "nm", "ft", "tf"]);

export class DyslexiaScene implements GameScene {
  id = "letters";
  title = "Caverna das letras";
  objective = "Clique nas letras voadoras na ordem certa";
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly expected = ["m", "a", "p", "a"];
  private letters: FlyingLetter[] = [];
  private currentIndex = 0;
  private completed = false;
  private startedAt = 0;
  private firstClickRecorded = false;

  enter(engine: GameEngine) {
    this.currentIndex = 0;
    this.completed = false;
    this.firstClickRecorded = false;
    this.startedAt = performance.now();
    this.letters = [
      { char: "m", x: 136, y: 162, speed: 40, phase: 0.1 },
      { char: "n", x: 248, y: 232, speed: -34, phase: 1.2 },
      { char: "a", x: 356, y: 142, speed: 46, phase: 2.1 },
      { char: "p", x: 478, y: 252, speed: -52, phase: 0.6 },
      { char: "q", x: 590, y: 184, speed: 38, phase: 2.8 },
      { char: "a", x: 716, y: 228, speed: -42, phase: 1.9 },
      { char: "b", x: 798, y: 150, speed: 48, phase: 1.4 },
      { char: "d", x: 196, y: 290, speed: -36, phase: 2.5 },
      { char: "f", x: 662, y: 306, speed: 32, phase: 0.4 },
      { char: "t", x: 842, y: 286, speed: -44, phase: 3.3 }
    ];

    engine.dialogBox.setLines([
      "Clique nas letras voadoras para formar palavras.",
      "Precisamos organizar essas letras para abrir a passagem.",
      "Observe com atenção as letras parecidas."
    ]);
  }

  update(engine: GameEngine, dt: number) {
    if (this.completed || engine.dialogBox.isActive) {
      return;
    }

    for (const letter of this.letters) {
      letter.x += letter.speed * dt;
      letter.y += Math.sin(engine.timeMs / 360 + letter.phase) * 0.35;

      if (letter.x < 64) {
        letter.x = 896;
      }

      if (letter.x > 908) {
        letter.x = 72;
      }
    }
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#f6c55f");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    drawPanelText(ctx, "Letras mágicas", `Forme: ${this.renderWordProgress()}`);

    for (const letter of this.letters) {
      this.drawFlyingLetter(ctx, letter, engine.timeMs);
    }

    ctx.fillStyle = "#fff9e9";
    ctx.font = "900 24px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Próxima letra: ${this.expected[this.currentIndex] ?? "ok"}`, 480, 374);
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.completed) {
      return;
    }

    const clicked = this.letters.find((letter) => {
      const dx = pointer.x - letter.x;
      const dy = pointer.y - letter.y;
      return Math.sqrt(dx * dx + dy * dy) <= 34;
    });

    if (!clicked) {
      return;
    }

    const now = performance.now();
    engine.metrics.recordAttempt();
    engine.metrics.recordResponseTime(now - this.startedAt);

    if (!this.firstClickRecorded) {
      this.firstClickRecorded = true;
      engine.metrics.recordFirstClickTime(now - this.startedAt);
    }

    const expectedChar = this.expected[this.currentIndex];

    if (clicked.char === expectedChar) {
      engine.clearErrorStreak(this.id);
      this.currentIndex += 1;

      if (this.currentIndex >= this.expected.length) {
        this.complete(engine);
      }
      return;
    }

    engine.metrics.recordCorrection();

    if (SIMILAR_PAIRS.has(`${expectedChar}${clicked.char}`)) {
      engine.metrics.recordInversionError();
    }

    engine.registerError(this.id);
  }

  onAutoHelp(engine: GameEngine) {
    this.currentIndex = this.expected.length;
    this.complete(engine);
  }

  private complete(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.completed = true;
    engine.dialogBox.setLines(["A passagem abriu. Vamos continuar."], () => engine.nextScene());
  }

  private renderWordProgress() {
    return this.expected
      .map((char, index) => (index < this.currentIndex ? char : "_"))
      .join(" ");
  }

  private drawFlyingLetter(ctx: CanvasRenderingContext2D, letter: FlyingLetter, timeMs: number) {
    const wing = Math.sin(timeMs / 120 + letter.phase) * 8;

    ctx.save();
    ctx.translate(letter.x, letter.y);
    ctx.fillStyle = "rgba(111, 214, 197, 0.76)";
    ctx.beginPath();
    ctx.ellipse(-25, wing * 0.25, 18, 8, -0.5, 0, Math.PI * 2);
    ctx.ellipse(25, -wing * 0.25, 18, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff9e9";
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#173b4f";
    ctx.font = "900 30px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter.char, 0, 1);
    ctx.restore();
  }
}
