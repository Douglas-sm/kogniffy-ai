import type { GameEngine, GameScene, Platform, Rect } from "@/game/engine/GameEngine";
import {
  drawCaveBackground,
  drawCaveEntrance,
  drawGoalArrow,
  drawPanelText,
  drawPlatform
} from "@/game/scenes/sceneUtils";

export class IntroScene implements GameScene {
  id = "intro";
  title = "Entrada da montanha";
  objective = "Ande em linha reta até a entrada da caverna";
  spawnSide = "right" as const;
  allowJump = false;
  exitMode = "cave" as const;
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly entrance: Rect = {
    x: 116,
    y: 346,
    width: 138,
    height: 108
  };

  enter(engine: GameEngine) {
    engine.dialogBox.setLines([
      "Kog perdeu a nave e ficou preso do outro lado da montanha. A melhor saída é entrar pela caverna e atravessar por dentro.",
      "Use as setas esquerda e direita para andar em linha reta até a entrada da caverna. Quando você chegar lá, a próxima fase abre sozinha."
    ]);
  }

  update() {
    return;
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#6fd6c5");

    ctx.fillStyle = "#2f4b58";
    ctx.beginPath();
    ctx.moveTo(0, 454);
    ctx.lineTo(0, 228);
    ctx.quadraticCurveTo(58, 156, 154, 162);
    ctx.quadraticCurveTo(282, 174, 326, 454);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#426171";
    ctx.beginPath();
    ctx.moveTo(0, 454);
    ctx.lineTo(0, 272);
    ctx.quadraticCurveTo(48, 222, 118, 226);
    ctx.quadraticCurveTo(204, 232, 248, 454);
    ctx.closePath();
    ctx.fill();

    drawCaveEntrance(ctx, this.entrance);
    drawGoalArrow(ctx, this.entrance.x + this.entrance.width / 2, this.entrance.y - 42, engine.timeMs);

    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    drawPanelText(ctx, "Entrada da montanha", "Siga reto até o buraco da caverna marcado pela seta vermelha.");
  }

  getExitZone() {
    return this.entrance;
  }
}
