import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import { drawCaveBackground, drawPlatform, drawRoundedRect } from "@/game/scenes/sceneUtils";

interface FlyingLetter {
  char: string;
  x: number;
  y: number;
  speed: number;
  phase: number;
  state: "flying" | "falling";
  fallVelocityY: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  wrongFeedbackTime: number;
}

interface PendingAdvance {
  atMs: number;
  type: "nextWord" | "completeScene";
}

interface RacketSwing {
  startedAtMs: number;
  targetX: number;
  targetY: number;
}

const WORD_BANK = ["bola", "dado", "dedo", "boca", "mapa", "papa", "bala", "pipa", "bota", "pote"];
const WORDS_PER_ROUND = 3;
const LETTER_SLOTS = [
  { x: 136, y: 162 },
  { x: 248, y: 232 },
  { x: 356, y: 142 },
  { x: 478, y: 252 },
  { x: 590, y: 184 },
  { x: 716, y: 228 },
  { x: 798, y: 150 },
  { x: 196, y: 290 },
  { x: 662, y: 306 },
  { x: 842, y: 286 }
];
const SIMILAR_GROUPS: Record<string, string[]> = {
  b: ["d"],
  d: ["b"],
  p: ["q"],
  q: ["p"],
  m: ["n"],
  n: ["m"],
  f: ["t"],
  t: ["f"]
};
const SIMILAR_PAIRS = new Set(["bd", "db", "pq", "qp", "mn", "nm", "ft", "tf"]);
const WRONG_FEEDBACK_DURATION_S = 0.3;
const RACKET_SWING_DURATION_MS = 180;
const DISTRACTOR_POOL = Array.from(
  new Set([
    ...WORD_BANK.join("").split(""),
    ...Object.keys(SIMILAR_GROUPS),
    ...Object.values(SIMILAR_GROUPS).flat()
  ])
);

export class DyslexiaScene implements GameScene {
  id = "letters";
  title = "Caverna das letras";
  objective = "Forme as palavras";
  spawnSide = "left" as const;
  allowJump = false;
  exitMode = "portal" as const;
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private letters: FlyingLetter[] = [];
  private selectedWords: string[] = [];
  private currentWordIndex = 0;
  private currentLetterIndex = 0;
  private completed = false;
  private wordStartedAt = 0;
  private targetStartedAt = 0;
  private firstClickRecorded = false;
  private pendingAdvance: PendingAdvance | null = null;
  private racketSwing: RacketSwing | null = null;

  enter(engine: GameEngine) {
    this.completed = false;
    this.currentWordIndex = 0;
    this.currentLetterIndex = 0;
    this.firstClickRecorded = false;
    this.pendingAdvance = null;
    this.racketSwing = null;
    this.selectedWords = this.pickWords(WORDS_PER_ROUND);
    this.beginWord(engine, 0);

    engine.dialogBox.setLines([
      "Clique nas letras voadoras para formar as palavras.",
      "Precisamos organizar essas palavras para abrir a passagem.",
      "Observe com atenção as letras parecidas."
    ]);
  }

  update(engine: GameEngine, dt: number) {
    if (this.racketSwing && engine.timeMs - this.racketSwing.startedAtMs >= RACKET_SWING_DURATION_MS) {
      this.racketSwing = null;
    }

    if (this.completed || engine.dialogBox.isActive) {
      return;
    }

    this.updateLetters(engine, dt);

    if (!this.pendingAdvance) {
      return;
    }

    if (engine.timeMs < this.pendingAdvance.atMs) {
      return;
    }

    const nextAction = this.pendingAdvance.type;
    this.pendingAdvance = null;

    if (nextAction === "nextWord") {
      this.beginWord(engine, this.currentWordIndex + 1);
      return;
    }

    this.complete(engine);
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#f6c55f");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    for (const letter of this.letters) {
      this.drawFlyingLetter(ctx, letter, engine.timeMs);
    }

    this.drawCurrentLetterPrompt(ctx);
    this.drawWordTray(ctx);
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.completed || this.pendingAdvance) {
      return;
    }

    const clicked = this.findClickedLetter(pointer);

    if (!clicked) {
      return;
    }

    this.startRacketSwing(engine.timeMs, clicked.x, clicked.y);
    const now = performance.now();
    const responseTime = now - this.targetStartedAt;
    engine.metrics.recordAttempt();
    engine.metrics.recordDyslexiaAttempt();
    engine.metrics.recordResponseTime(responseTime);
    engine.metrics.recordDyslexiaResponseTime(responseTime);

    if (!this.firstClickRecorded) {
      const firstClickTime = now - this.wordStartedAt;
      this.firstClickRecorded = true;
      engine.metrics.recordFirstClickTime(firstClickTime);
      engine.metrics.recordDyslexiaFirstClickTime(firstClickTime);
    }

    const expectedChar = this.currentWord()[this.currentLetterIndex];

    if (clicked.char === expectedChar) {
      engine.clearErrorStreak(this.id);
      engine.metrics.recordDyslexiaHit();
      this.startLetterFall(clicked);
      this.currentLetterIndex += 1;

      if (this.currentLetterIndex >= this.currentWord().length) {
        engine.metrics.recordDyslexiaWordCompleted();
        this.pendingAdvance = {
          atMs: engine.timeMs + 650,
          type: this.currentWordIndex >= this.selectedWords.length - 1 ? "completeScene" : "nextWord"
        };
      } else {
        this.targetStartedAt = now;
      }
      return;
    }

    engine.metrics.recordCorrection();
    engine.metrics.recordDyslexiaCorrection();
    engine.metrics.recordDyslexiaMiss();

    if (SIMILAR_PAIRS.has(`${expectedChar}${clicked.char}`)) {
      engine.metrics.recordInversionError();
      engine.metrics.recordDyslexiaInversionError();
    }

    this.triggerWrongFeedback(clicked);
    engine.registerError(this.id);
  }

  onAutoHelp(engine: GameEngine) {
    this.pendingAdvance = null;
    this.complete(engine);
  }

  getHudMessage() {
    return this.completed ? "Portal aberto no centro. Leve o robô até ele para continuar." : this.renderHeaderLine();
  }

  getCanvasCursor(engine: GameEngine) {
    if (this.completed) {
      return "default";
    }

    return engine.pointer.pointerType === "mouse" ? "none" : "default";
  }

  drawPointerOverlay(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    if (!engine.pointer.inside || engine.pointer.pointerType !== "mouse") {
      return;
    }

    const swingProgress = this.swingProgress(engine.timeMs);
    const swingArc = swingProgress === null ? 0 : Math.sin(swingProgress * Math.PI);
    const swing = -0.4 + Math.sin(engine.timeMs / 180) * 0.04 + swingArc * 0.96;

    ctx.save();
    ctx.translate(engine.pointer.x + swingArc * 13, engine.pointer.y - swingArc * 5);
    ctx.rotate(swing);

    ctx.strokeStyle = "#173b4f";
    ctx.lineCap = "round";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(14, 18);
    ctx.lineTo(48, 62);
    ctx.stroke();

    ctx.fillStyle = "#f06f59";
    ctx.beginPath();
    ctx.roundRect(34, 43, 12, 22, 5);
    ctx.fill();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 249, 233, 0.94)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 29, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#173b4f";
    ctx.stroke();

    ctx.strokeStyle = "rgba(23, 59, 79, 0.26)";
    ctx.lineWidth = 1.4;
    for (let offset = -12; offset <= 12; offset += 6) {
      ctx.beginPath();
      ctx.moveTo(offset, -22);
      ctx.lineTo(offset, 22);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-17, offset * 1.15);
      ctx.lineTo(17, offset * 1.15);
      ctx.stroke();
    }

    ctx.restore();

    if (this.racketSwing && swingProgress !== null) {
      const fade = 1 - swingProgress;

      ctx.save();
      ctx.translate(this.racketSwing.targetX, this.racketSwing.targetY);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = "#f6c55f";
      ctx.lineWidth = 4;

      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * 2 * index) / 6 + 0.15;
        const inner = 18;
        const outer = 30 + swingArc * 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }

      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + swingArc * 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private beginWord(engine: GameEngine, wordIndex: number) {
    this.currentWordIndex = wordIndex;
    this.currentLetterIndex = 0;
    this.firstClickRecorded = false;
    this.pendingAdvance = null;
    this.wordStartedAt = performance.now();
    this.targetStartedAt = this.wordStartedAt;
    this.letters = this.createLettersForWord(this.currentWord());
    engine.metrics.recordDyslexiaWordStarted();
  }

  private complete(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.completed = true;
    this.pendingAdvance = null;
    engine.completeScene();
  }

  private currentWord() {
    return this.selectedWords[this.currentWordIndex] ?? "";
  }

  private pickWords(count: number) {
    return this.shuffle([...WORD_BANK]).slice(0, count);
  }

  private createLettersForWord(word: string) {
    const targetLetters = word.split("");
    const distractorCount = Math.max(0, LETTER_SLOTS.length - targetLetters.length);
    const distractors = this.pickDistractors(word, distractorCount);
    const chars = this.shuffle([...targetLetters, ...distractors]);
    const slots = this.shuffle([...LETTER_SLOTS]).slice(0, chars.length);

    return chars.map((char, index) => ({
      char,
      x: slots[index].x,
      y: slots[index].y,
      speed: (index % 2 === 0 ? 1 : -1) * (34 + Math.random() * 22),
      phase: Math.random() * Math.PI * 2,
      state: "flying" as const,
      fallVelocityY: 0,
      rotation: 0,
      rotationSpeed: 0,
      opacity: 1,
      wrongFeedbackTime: 0
    }));
  }

  private pickDistractors(word: string, count: number) {
    const wordChars = new Set(word.split(""));
    const distractors: string[] = [];

    for (const char of wordChars) {
      for (const similar of SIMILAR_GROUPS[char] ?? []) {
        if (!wordChars.has(similar) && distractors.length < count) {
          distractors.push(similar);
        }
      }
    }

    const fallbackPool = this.shuffle(DISTRACTOR_POOL.filter((char) => !wordChars.has(char)));
    let fallbackIndex = 0;

    while (distractors.length < count) {
      distractors.push(fallbackPool[fallbackIndex % fallbackPool.length]);
      fallbackIndex += 1;
    }

    return distractors.slice(0, count);
  }

  private updateLetters(engine: GameEngine, dt: number) {
    this.letters = this.letters.filter((letter) => {
      letter.wrongFeedbackTime = Math.max(0, letter.wrongFeedbackTime - dt);

      if (letter.state === "falling") {
        letter.y += letter.fallVelocityY * dt;
        letter.x += letter.speed * dt * 0.22;
        letter.fallVelocityY += 920 * dt;
        letter.rotation += letter.rotationSpeed * dt;
        letter.opacity = Math.max(0, letter.opacity - dt * 0.95);
        return letter.y < 620 && letter.opacity > 0.02;
      }

      letter.x += letter.speed * dt;
      letter.y += Math.sin(engine.timeMs / 360 + letter.phase) * 0.35;

      if (letter.x < 64) {
        letter.x = 896;
      }

      if (letter.x > 908) {
        letter.x = 72;
      }

      return true;
    });
  }

  private findClickedLetter(pointer: PointerPosition) {
    for (let index = this.letters.length - 1; index >= 0; index -= 1) {
      const letter = this.letters[index];

      if (letter.state !== "flying") {
        continue;
      }

      const dx = pointer.x - letter.x;
      const dy = pointer.y - letter.y;

      if (Math.sqrt(dx * dx + dy * dy) <= 34) {
        return letter;
      }
    }

    return null;
  }

  private startLetterFall(letter: FlyingLetter) {
    letter.state = "falling";
    letter.fallVelocityY = 120;
    letter.rotationSpeed = (Math.random() * 3 + 2.4) * (Math.random() > 0.5 ? 1 : -1);
    letter.speed *= 0.3;
    letter.wrongFeedbackTime = 0;
  }

  private triggerWrongFeedback(letter: FlyingLetter) {
    letter.wrongFeedbackTime = WRONG_FEEDBACK_DURATION_S;
  }

  private startRacketSwing(timeMs: number, targetX: number, targetY: number) {
    this.racketSwing = {
      startedAtMs: timeMs,
      targetX,
      targetY
    };
  }

  private swingProgress(timeMs: number) {
    if (!this.racketSwing) {
      return null;
    }

    return Math.min(1, Math.max(0, (timeMs - this.racketSwing.startedAtMs) / RACKET_SWING_DURATION_MS));
  }

  private renderHeaderLine() {
    if (this.pendingAdvance) {
      return `Forme as palavras • Palavra ${this.currentWordIndex + 1} de ${this.selectedWords.length} concluída`;
    }

    return `Forme as palavras • Palavra ${this.currentWordIndex + 1} de ${this.selectedWords.length}`;
  }

  private drawCurrentLetterPrompt(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#fff9e9";
    ctx.font = "900 24px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      this.completed
        ? "As palavras já abriram o portal."
        : this.pendingAdvance
          ? "Palavra completa! Prepare a próxima."
          : `Toque na próxima letra: ${this.currentWord()[this.currentLetterIndex] ?? "ok"}`,
      480,
      374
    );
  }

  private drawWordTray(ctx: CanvasRenderingContext2D) {
    drawRoundedRect(ctx, 142, 464, 676, 56, 22);
    ctx.fillStyle = "rgba(255, 249, 233, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 249, 233, 0.42)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const cardWidth = 202;
    const cardHeight = 38;
    const gap = 12;
    const startX = (960 - cardWidth * this.selectedWords.length - gap * (this.selectedWords.length - 1)) / 2;

    this.selectedWords.forEach((_, index) => {
      const x = startX + index * (cardWidth + gap);
      const completed = index < this.currentWordIndex;
      const active = index === this.currentWordIndex && !this.completed;

      drawRoundedRect(ctx, x, 473, cardWidth, cardHeight, 16);
      ctx.fillStyle = completed ? "#fff9e9" : active ? "#f6c55f" : "rgba(255, 249, 233, 0.72)";
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = active ? 3.5 : 2.5;
      ctx.stroke();

      ctx.fillStyle = "#173b4f";
      ctx.font = "900 20px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.renderWordProgress(index), x + cardWidth / 2, 493);
    });
  }

  private renderWordProgress(wordIndex: number) {
    const word = this.selectedWords[wordIndex] ?? "";

    return word
      .split("")
      .map((char, index) => (this.isLetterVisible(wordIndex, index) ? char : "_"))
      .join(" ");
  }

  private isLetterVisible(wordIndex: number, letterIndex: number) {
    if (wordIndex < this.currentWordIndex) {
      return true;
    }

    if (wordIndex > this.currentWordIndex) {
      return false;
    }

    return letterIndex < this.currentLetterIndex;
  }

  private drawFlyingLetter(ctx: CanvasRenderingContext2D, letter: FlyingLetter, timeMs: number) {
    const wing = letter.state === "flying" ? Math.sin(timeMs / 120 + letter.phase) * 8 : 3;
    const wrongFeedbackProgress =
      letter.wrongFeedbackTime > 0 ? 1 - letter.wrongFeedbackTime / WRONG_FEEDBACK_DURATION_S : 0;
    const showWrongFeedback = letter.wrongFeedbackTime > 0 && letter.state === "flying";

    ctx.save();
    ctx.globalAlpha = letter.opacity;
    ctx.translate(letter.x, letter.y);
    ctx.rotate(letter.rotation);
    ctx.fillStyle = showWrongFeedback ? "rgba(240, 111, 89, 0.78)" : "rgba(111, 214, 197, 0.76)";
    ctx.beginPath();
    ctx.ellipse(-25, wing * 0.25, 18, 8, -0.5, 0, Math.PI * 2);
    ctx.ellipse(25, -wing * 0.25, 18, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = showWrongFeedback ? "#f06f59" : "#fff9e9";
    ctx.strokeStyle = showWrongFeedback ? "#8f2012" : "#173b4f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = showWrongFeedback ? "#fff9e9" : "#173b4f";
    ctx.font = "900 30px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter.char, 0, 1);

    if (showWrongFeedback) {
      ctx.globalAlpha = letter.opacity * (1 - wrongFeedbackProgress);
      ctx.fillStyle = "#f06f59";
      ctx.font = "900 22px Trebuchet MS, sans-serif";
      ctx.fillText("ops", 0, -34 - wrongFeedbackProgress * 20);
    }

    ctx.restore();
  }

  private shuffle<T>(items: T[]) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }

    return items;
  }
}
