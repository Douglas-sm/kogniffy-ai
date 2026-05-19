import { calculateScores } from "@/ai/scoring";
import { KogAssistant } from "@/game/entities/KogAssistant";
import { Player } from "@/game/entities/Player";
import { AttentionScene } from "@/game/scenes/AttentionScene";
import { ColorScene } from "@/game/scenes/ColorScene";
import { DyslexiaScene } from "@/game/scenes/DyslexiaScene";
import { FinalScene } from "@/game/scenes/FinalScene";
import { IntroScene } from "@/game/scenes/IntroScene";
import { MemoryReactionScene } from "@/game/scenes/MemoryReactionScene";
import { drawPortal, drawPortalHint } from "@/game/scenes/sceneUtils";
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

export interface Rect {
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

export interface CameraOffset {
  x: number;
  y: number;
}

export type SceneSpawnSide = "left" | "right";
export type SceneExitMode = "none" | "cave" | "portal";

export interface GameScene {
  id: string;
  title: string;
  objective: string;
  spawnSide: SceneSpawnSide;
  allowJump: boolean;
  exitMode: SceneExitMode;
  platforms: Platform[];
  enter(engine: GameEngine): void;
  update(engine: GameEngine, dt: number): void;
  draw(engine: GameEngine, ctx: CanvasRenderingContext2D): void;
  onClick?(engine: GameEngine, pointer: PointerPosition): void;
  onKeyDown?(engine: GameEngine, key: string): void;
  onAutoHelp?(engine: GameEngine): void;
  getCanvasCursor?(engine: GameEngine): string;
  getCameraOffset?(engine: GameEngine): CameraOffset;
  drawPointerOverlay?(engine: GameEngine, ctx: CanvasRenderingContext2D): void;
  getExitZone?(engine: GameEngine): Rect | null;
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
  private static readonly PLAYER_SPAWN_MARGIN = 72;
  private static readonly PORTAL_ZONE: Rect = {
    x: GAME_WIDTH / 2 - 46,
    y: 334,
    width: 92,
    height: 120
  };

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
  private sceneExitState: "idle" | "opening" | "ready" | "warping" = "idle";
  private sceneExitStartedAt = 0;

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
    this.enterScene();
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
    if (this.currentSceneIndex >= this.scenes.length - 1) {
      return;
    }

    this.currentSceneIndex += 1;
    this.errorStreakByScene.clear();
    this.enterScene();
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

    if (sceneId === "colors") {
      this.metrics.recordColorAutoHelp();
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

  completeScene() {
    if (this.currentScene.exitMode !== "portal" || this.sceneExitState !== "idle") {
      return;
    }

    this.keys.clear();
    this.sceneExitState = "opening";
    this.sceneExitStartedAt = this.timeMs;
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

    this.player.update(this.keys, this.currentScene.platforms, dt, {
      allowJump: this.currentScene.allowJump && this.sceneExitState === "idle",
      controlsEnabled: !this.dialogBox.isActive && this.sceneExitState !== "warping",
      freeze: this.sceneExitState === "warping"
    });
    this.currentScene.update(this, dt);
    this.updateSceneExit();
    this.currentScene.draw(this, this.ctx);
    const warpEffect = this.getWarpEffect();
    const cameraOffset = this.currentScene.getCameraOffset?.(this) ?? null;

    this.ctx.save();

    if (cameraOffset) {
      this.ctx.translate(cameraOffset.x, cameraOffset.y);
    }

    this.drawSceneExit();
    this.player.draw(this.ctx, this.timeMs, warpEffect);
    this.kog.draw(this.ctx, this.player.x, this.player.y, this.timeMs, warpEffect);
    this.ctx.restore();
    this.hud.draw(this.ctx, this);
    this.dialogBox.draw(this.ctx);
    this.currentScene.drawPointerOverlay?.(this, this.ctx);
    this.syncCanvasCursor();

    this.animationId = window.requestAnimationFrame(this.loop);
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    const key = event.code === "Space" ? "Space" : event.key;

    if (["ArrowLeft", "ArrowRight", "Space"].includes(key)) {
      event.preventDefault();
    }

    if (["ArrowLeft", "ArrowRight", "Space"].includes(key)) {
      this.keys.add(key);
    }

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
      this.dialogBox.advance();
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

  private enterScene() {
    this.keys.clear();
    this.sceneExitState = this.currentScene.exitMode === "cave" ? "ready" : "idle";
    this.sceneExitStartedAt = 0;

    const spawn = this.sceneSpawnPosition(this.currentScene.spawnSide);
    this.player.setCheckpoint(spawn.x, spawn.y);
    this.player.reset(spawn.x, spawn.y);

    this.currentScene.enter(this);
    this.syncCanvasCursor();
  }

  private sceneSpawnPosition(side: SceneSpawnSide) {
    const floorY = this.currentScene.platforms.length
      ? Math.max(...this.currentScene.platforms.map((platform) => platform.y))
      : 454;
    const x =
      side === "left"
        ? GameEngine.PLAYER_SPAWN_MARGIN
        : GAME_WIDTH - GameEngine.PLAYER_SPAWN_MARGIN - this.player.width;

    return {
      x,
      y: floorY - this.player.height
    };
  }

  private updateSceneExit() {
    if (this.sceneExitState === "warping") {
      if (this.timeMs - this.sceneExitStartedAt >= 560) {
        this.nextScene();
      }
      return;
    }

    if (this.currentScene.exitMode === "portal") {
      if (this.sceneExitState === "opening" && this.timeMs - this.sceneExitStartedAt >= 420) {
        this.sceneExitState = "ready";
      }

      if (this.sceneExitState === "ready" && this.playerTouchesRect(GameEngine.PORTAL_ZONE)) {
        this.beginWarp();
      }
      return;
    }

    if (this.currentScene.exitMode === "cave" && !this.dialogBox.isActive) {
      const exitZone = this.currentScene.getExitZone?.(this);

      if (exitZone && this.playerTouchesRect(exitZone)) {
        this.beginWarp();
      }
    }
  }

  private drawSceneExit() {
    if (this.currentScene.exitMode !== "portal" || this.sceneExitState === "idle") {
      return;
    }

    const revealProgress =
      this.sceneExitState === "opening"
        ? Math.min(1, (this.timeMs - this.sceneExitStartedAt) / 420)
        : 1;
    const warpProgress =
      this.sceneExitState === "warping"
        ? Math.min(1, (this.timeMs - this.sceneExitStartedAt) / 560)
        : 0;

    drawPortal(this.ctx, GameEngine.PORTAL_ZONE, this.timeMs, revealProgress, warpProgress);
    drawPortalHint(this.ctx, GameEngine.PORTAL_ZONE, this.timeMs, revealProgress);
  }

  private getWarpEffect() {
    if (this.sceneExitState !== "warping") {
      return null;
    }

    const target = this.currentExitRect();

    if (!target) {
      return null;
    }

    return {
      progress: Math.min(1, (this.timeMs - this.sceneExitStartedAt) / 560),
      targetX: target.x + target.width / 2,
      targetY: target.y + target.height / 2
    };
  }

  private currentExitRect() {
    if (this.currentScene.exitMode === "portal") {
      return GameEngine.PORTAL_ZONE;
    }

    if (this.currentScene.exitMode === "cave") {
      return this.currentScene.getExitZone?.(this) ?? null;
    }

    return null;
  }

  private beginWarp() {
    if (this.sceneExitState === "warping") {
      return;
    }

    this.keys.clear();
    this.sceneExitState = "warping";
    this.sceneExitStartedAt = this.timeMs;
  }

  private playerTouchesRect(rect: Rect) {
    return (
      this.player.x + this.player.width > rect.x &&
      this.player.x < rect.x + rect.width &&
      this.player.y + this.player.height > rect.y &&
      this.player.y < rect.y + rect.height
    );
  }
}
