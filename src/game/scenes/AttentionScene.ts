import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import {
  drawCaveBackground,
  drawPanelText,
  drawPlatform
} from "@/game/scenes/sceneUtils";

interface Stimulus {
  id: number;
  x: number;
  y: number;
  correct: boolean;
  createdAt: number;
  speed: number;
}

interface Obstacle {
  x: number;
  y: number;
  createdAt: number;
  cleared: boolean;
}

export class AttentionScene implements GameScene {
  id = "attention";
  title = "Área de obstáculos";
  objective = "Toque apenas nos cristais e pule no momento certo";
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private stimuli: Stimulus[] = [];
  private obstacle: Obstacle | null = null;
  private nextSpawnAt = 0;
  private nextObstacleAt = 0;
  private nextId = 1;
  private correctHits = 0;
  private successfulJumps = 0;
  private completed = false;

  enter(engine: GameEngine) {
    this.stimuli = [];
    this.obstacle = null;
    this.nextId = 1;
    this.correctHits = 0;
    this.successfulJumps = 0;
    this.completed = false;
    this.nextSpawnAt = engine.timeMs + 500;
    this.nextObstacleAt = engine.timeMs + 1800;
    engine.dialogBox.setLines([
      "Cuidado, preste atenção nos obstáculos.",
      "Nem tudo que aparece deve ser tocado.",
      "Espere o momento certo."
    ]);
  }

  update(engine: GameEngine, dt: number) {
    if (this.completed || engine.dialogBox.isActive) {
      return;
    }

    if (engine.timeMs > this.nextSpawnAt) {
      this.spawnStimulus(engine);
      this.nextSpawnAt = engine.timeMs + 720;
    }

    if (!this.obstacle && engine.timeMs > this.nextObstacleAt) {
      this.obstacle = {
        x: 990,
        y: 398,
        createdAt: performance.now(),
        cleared: false
      };
    }

    for (const stimulus of this.stimuli) {
      stimulus.x -= stimulus.speed * dt;
      stimulus.y += Math.sin(engine.timeMs / 180 + stimulus.id) * 0.45;
    }

    const missed = this.stimuli.filter((stimulus) => stimulus.correct && stimulus.x < -40);
    for (const stimulus of missed) {
      engine.metrics.recordMissedTarget();
      engine.registerError(this.id);
      this.stimuli = this.stimuli.filter((item) => item.id !== stimulus.id);
    }

    this.stimuli = this.stimuli.filter((stimulus) => stimulus.x > -70);

    if (this.obstacle) {
      this.obstacle.x -= 270 * dt;

      if (!this.obstacle.cleared && this.obstacle.x < 245) {
        engine.metrics.recordMissedTarget();
        engine.registerError(this.id);
        this.obstacle = null;
        this.nextObstacleAt = engine.timeMs + 1600;
      }
    }

    if (this.correctHits >= 5 && this.successfulJumps >= 2) {
      this.complete(engine);
    }
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#f06f59");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    drawPanelText(
      ctx,
      "Túnel instável",
      `Cristais corretos: ${this.correctHits}/5 | Pulso de pulo: ${this.successfulJumps}/2`
    );

    ctx.strokeStyle = "rgba(255, 249, 233, 0.8)";
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(220, 338, 80, 104);
    ctx.setLineDash([]);

    for (const stimulus of this.stimuli) {
      this.drawStimulus(ctx, stimulus, engine.timeMs);
    }

    if (this.obstacle) {
      ctx.fillStyle = "#f6c55f";
      ctx.beginPath();
      ctx.roundRect(this.obstacle.x, this.obstacle.y, 42, 46, 10);
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.completed) {
      return;
    }

    const hit = this.stimuli.find((stimulus) => {
      const dx = pointer.x - stimulus.x;
      const dy = pointer.y - stimulus.y;
      return Math.sqrt(dx * dx + dy * dy) < 28;
    });

    if (!hit) {
      return;
    }

    if (hit.correct) {
      engine.clearErrorStreak(this.id);
      engine.metrics.recordReactionTime(performance.now() - hit.createdAt);
      this.correctHits += 1;
    } else {
      engine.metrics.recordImpulsiveClick();
      engine.registerError(this.id);
    }

    this.stimuli = this.stimuli.filter((stimulus) => stimulus.id !== hit.id);
  }

  onKeyDown(engine: GameEngine, key: string) {
    if (key !== "Space" || this.completed || engine.dialogBox.isActive) {
      return;
    }

    if (this.obstacle && this.obstacle.x >= 220 && this.obstacle.x <= 300 && !this.obstacle.cleared) {
      this.obstacle.cleared = true;
      this.successfulJumps += 1;
      engine.clearErrorStreak(this.id);
      engine.metrics.recordReactionTime(performance.now() - this.obstacle.createdAt);
      this.obstacle = null;
      this.nextObstacleAt = engine.timeMs + 1700;
      return;
    }

    engine.metrics.recordImpulsiveClick();
    engine.registerError(this.id);
  }

  onAutoHelp(engine: GameEngine) {
    this.correctHits = 5;
    this.successfulJumps = 2;
    this.complete(engine);
  }

  private complete(engine: GameEngine) {
    if (this.completed) {
      return;
    }

    this.completed = true;
    engine.dialogBox.setLines(["A área instável ficou para trás. Vamos continuar."], () => engine.nextScene());
  }

  private spawnStimulus(engine: GameEngine) {
    const correct = this.nextId % 3 !== 0;
    this.stimuli.push({
      id: this.nextId,
      x: 940,
      y: correct ? 170 + (this.nextId % 4) * 46 : 130 + (this.nextId % 5) * 54,
      correct,
      createdAt: performance.now(),
      speed: correct ? 230 : 280
    });
    this.nextId += 1;

    if (engine.timeMs > this.nextSpawnAt + 2000) {
      this.nextSpawnAt = engine.timeMs + 720;
    }
  }

  private drawStimulus(ctx: CanvasRenderingContext2D, stimulus: Stimulus, timeMs: number) {
    ctx.save();
    ctx.translate(stimulus.x, stimulus.y);

    if (stimulus.correct) {
      const glow = 22 + Math.sin(timeMs / 160 + stimulus.id) * 5;
      ctx.fillStyle = "rgba(111, 214, 197, 0.36)";
      ctx.beginPath();
      ctx.arc(0, 0, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6fd6c5";
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(20, 0);
      ctx.lineTo(0, 24);
      ctx.lineTo(-20, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#f06f59";
      ctx.beginPath();
      ctx.arc(0, 0, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff9e9";
      ctx.font = "900 22px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", 0, 1);
    }

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
}
