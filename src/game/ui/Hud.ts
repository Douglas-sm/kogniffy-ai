import type { GameEngine } from "@/game/engine/GameEngine";
import { drawRoundedRect } from "@/game/scenes/sceneUtils";

export class Hud {
  draw(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    const scene = engine.currentScene;

    drawRoundedRect(ctx, 18, 14, 924, 54, 18);
    ctx.fillStyle = "rgba(255, 249, 233, 0.86)";
    ctx.fill();

    ctx.fillStyle = "#173b4f";
    ctx.font = "900 18px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(scene.title, 42, 41);

    ctx.font = "800 14px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#426171";
    ctx.fillText(scene.objective, 244, 41);

    ctx.textAlign = "right";
    ctx.fillStyle = "#173b4f";
    ctx.fillText(`Ajuda Kog: ${engine.metrics.snapshot().autoHelpCount}`, 916, 41);
  }
}
