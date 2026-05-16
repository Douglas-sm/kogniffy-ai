import type { GameEngine, GameScene, Platform } from "@/game/engine/GameEngine";
import { drawCaveBackground, drawPanelText, drawPlatform } from "@/game/scenes/sceneUtils";

export class IntroScene implements GameScene {
  id = "intro";
  title = "Entrada da montanha";
  objective = "Ajude Kog a chegar ao primeiro túnel";
  platforms: Platform[] = [
    { x: 0, y: 454, width: 960, height: 86 },
    { x: 360, y: 368, width: 170, height: 24 },
    { x: 610, y: 316, width: 180, height: 24 }
  ];

  private completed = false;

  enter(engine: GameEngine) {
    this.completed = false;
    engine.player.setCheckpoint(90, 360);
    engine.dialogBox.setLines([
      "Use as setas para se mover.",
      "Pressione espaço para pular.",
      "Minha nave caiu do outro lado da montanha. Vamos atravessar por dentro juntos."
    ]);
  }

  update(engine: GameEngine) {
    if (!this.completed && engine.player.x > 760 && engine.player.y < 360) {
      this.completed = true;
      engine.dialogBox.setLines(["Vamos continuar."], () => engine.nextScene());
    }
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#6fd6c5");

    ctx.fillStyle = "#f6c55f";
    ctx.beginPath();
    ctx.roundRect(790, 214, 86, 118, 18);
    ctx.fill();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#6fd6c5";
    ctx.beginPath();
    ctx.arc(833, 274, 22 + Math.sin(engine.timeMs / 240) * 4, 0, Math.PI * 2);
    ctx.fill();

    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    drawPanelText(ctx, "Kog está preso na entrada", "Suba nas plataformas e alcance o portão iluminado.");
  }
}
