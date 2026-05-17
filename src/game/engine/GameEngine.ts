import { calculateScores } from "@/ai/scoring";
import { KogAssistant } from "@/game/entities/KogAssistant";
import { Player } from "@/game/entities/Player";
import { AttentionScene } from "@/game/scenes/AttentionScene";
import { ColorScene } from "@/game/scenes/ColorScene";
import { DyslexiaScene } from "@/game/scenes/DyslexiaScene";
import { FinalScene } from "@/game/scenes/FinalScene";
import { IntroScene } from "@/game/scenes/IntroScene";
import { MemoryReactionScene } from "@/game/scenes/MemoryReactionScene";
import { DialogBox } from "@/game/ui/DialogBox";
import { Hud } from "@/game/ui/Hud";
import { metricsCollector, saveMetricsSnapshot } from "@/metrics/metricsCollector";

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PointerPosition {
  x: number;
  y: number;
}

export interface PointerState extends PointerPosition {
  inside: boolean;
  pointerType: string | null;
}

export interface GameScene {
  id: string;
  title: string;
  objective: string;
  platforms: Platform[];
  enter(engine: GameEngine): void;
  update(engine: GameEngine, dt: number): void;
  draw(engine: GameEngine, ctx: CanvasRenderingContext2D): void;
  onClick?(engine: GameEngine, pointer: PointerPosition): void;
  onKeyDown?(engine: GameEngine, key: string): void;
  onAutoHelp?(engine: GameEngine): void;
  getCanvasCursor?(engine: GameEngine): string;
  drawPointerOverlay?(engine: GameEngine, ctx: CanvasRenderingContext2D): void;
}

interface GameEngineOptions {
  onComplete: () => void;
}

const HELP_LINES = [
  "Deixe eu te ajudar nesta etapa...",
  "Tudo bem, vamos fazer isso juntos.",
  "Essa parte era complicada mesmo.",
  "Vou abrir o caminho para você.",
  "Não se preocupe, vamos continuar."
];

export class GameEngine {
  readonly player = new Player();
  readonly kog = new KogAssistant();
  readonly dialogBox = new DialogBox();
  readonly hud = new Hud();
  readonly metrics = metricsCollector;
  readonly keys = new Set<string>();
  readonly pointer: PointerState = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    inside: false,
    pointerType: null
  };

  private readonly ctx: CanvasRenderingContext2D;
  private readonly scenes: GameScene[];
  private readonly onComplete: () => void;
  private currentSceneIndex = 0;
  private animationId = 0;
  private lastFrame = 0;
  private errorStreakByScene = new Map<string, number>();
  private cursorStyle = "default";

  timeMs = 0;

  constructor(private readonly canvas: HTMLCanvasElement, options: GameEngineOptions) {
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context is unavailable.");
    }

    this.ctx = context;
    this.onComplete = options.onComplete;
    this.canvas.width = GAME_WIDTH;
    this.canvas.height = GAME_HEIGHT;
    this.scenes = [
      new IntroScene(),
      new DyslexiaScene(),
      new ColorScene(),
      new AttentionScene(),
      new MemoryReactionScene(),
      new FinalScene()
    ];

    this.metrics.reset();
    this.currentScene.enter(this);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.syncCanvasCursor();
    this.animationId = window.requestAnimationFrame(this.loop);
  }

  get currentScene() {
    return this.scenes[this.currentSceneIndex];
  }

  get sceneNumber() {
    return this.currentSceneIndex + 1;
  }

  get totalScenes() {
    return this.scenes.length;
  }

  nextScene() {
    this.currentSceneIndex = Math.min(this.currentSceneIndex + 1, this.scenes.length - 1);
    this.errorStreakByScene.clear();
    this.player.reset(90, 360);
    this.currentScene.enter(this);
    this.syncCanvasCursor();
  }

  registerError(sceneId: string) {
    this.metrics.recordRepeatedError();
    const nextCount = (this.errorStreakByScene.get(sceneId) ?? 0) + 1;
    this.errorStreakByScene.set(sceneId, nextCount);

    if (nextCount < 3) {
      return;
    }

    this.errorStreakByScene.set(sceneId, 0);
    this.metrics.recordAutoHelp(this.currentScene.title);

    if (sceneId === "letters") {
      this.metrics.recordDyslexiaAutoHelp();
    }

    const phrase = HELP_LINES[(this.metrics.snapshot().autoHelpCount - 1) % HELP_LINES.length];
    this.dialogBox.setLines([phrase, "Não se preocupe, vamos continuar."], () => {
      this.currentScene.onAutoHelp?.(this);
    });
  }

  clearErrorStreak(sceneId: string) {
    this.errorStreakByScene.set(sceneId, 0);
  }

  finishAndOpenReport() {
    const snapshot = this.metrics.finalize();
    saveMetricsSnapshot(snapshot);
    this.onComplete();
  }

  liveOverallScore() {
    return calculateScores(this.metrics.snapshot()).overallScore;
  }

  destroy() {
    window.cancelAnimationFrame(this.animationId);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.style.cursor = "";
  }

  private loop = (timestamp: number) => {
    const dt = Math.min(0.032, (timestamp - this.lastFrame) / 1000 || 0);
    this.lastFrame = timestamp;
    this.timeMs = timestamp;

    this.player.update(this.keys, this.currentScene.platforms, dt);
    this.currentScene.update(this, dt);
    this.currentScene.draw(this, this.ctx);
    this.player.draw(this.ctx, this.timeMs);
    this.kog.draw(this.ctx, this.player.x, this.player.y, this.timeMs);
    this.hud.draw(this.ctx, this);
    this.dialogBox.draw(this.ctx);
    this.currentScene.drawPointerOverlay?.(this, this.ctx);
    this.syncCanvasCursor();

    this.animationId = window.requestAnimationFrame(this.loop);
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    const key = event.code === "Space" ? "Space" : event.key;

    if (["ArrowLeft", "ArrowRight", "Space", "Enter"].includes(key)) {
      event.preventDefault();
    }

    if (key === "Enter" && this.dialogBox.isActive) {
      this.dialogBox.advance();
      return;
    }

    if (key === "Enter") {
      this.currentScene.onKeyDown?.(this, key);
      return;
    }

    this.keys.add(key);
    this.currentScene.onKeyDown?.(this, key);
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    const key = event.code === "Space" ? "Space" : event.key;
    this.keys.delete(key);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.updatePointerFromEvent(event, true);
  };

  private handlePointerLeave = (event: PointerEvent) => {
    this.pointer.inside = false;
    this.pointer.pointerType = event.pointerType || this.pointer.pointerType;
  };

  private handlePointerDown = (event: PointerEvent) => {
    this.updatePointerFromEvent(event, true);

    if (this.dialogBox.isActive) {
      return;
    }

    this.currentScene.onClick?.(this, { x: this.pointer.x, y: this.pointer.y });
  };

  private updatePointerFromEvent(event: PointerEvent, inside: boolean) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * GAME_WIDTH;
    this.pointer.y = ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT;
    this.pointer.inside = inside;
    this.pointer.pointerType = event.pointerType || this.pointer.pointerType;
  }

  private syncCanvasCursor() {
    const nextCursor = this.currentScene.getCanvasCursor?.(this) ?? "default";

    if (nextCursor === this.cursorStyle) {
      return;
    }

    this.cursorStyle = nextCursor;
    this.canvas.style.cursor = nextCursor;
  }
}
