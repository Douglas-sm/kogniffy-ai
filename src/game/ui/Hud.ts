import type { GameEngine } from "@/game/engine/GameEngine";
import { drawRoundedRect } from "@/game/scenes/sceneUtils";
import { wrapTextToLines } from "@/game/ui/textLayout";

const CARD_X = 18;
const CARD_Y = 14;
const CARD_WIDTH = 924;
const CARD_HEIGHT = 70;
const CARD_RADIUS = 18;
const LEFT_PADDING = 24;
const RIGHT_PADDING = 26;
const RIGHT_COLUMN_WIDTH = 238;
const COLUMN_GAP = 20;

export class Hud {
  draw(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    const scene = engine.currentScene;

    if ((scene.shouldShowHud?.(engine) ?? true) === false) {
      return;
    }

    const showRightColumn = scene.shouldShowHudRightColumn?.(engine) ?? true;
    const message = scene.getHudMessage?.(engine) ?? scene.objective;
    const stats = showRightColumn ? (scene.getHudStats?.(engine) ?? []).slice(0, 4) : [];
    const leftX = CARD_X + LEFT_PADDING;
    const rightX = CARD_X + CARD_WIDTH - RIGHT_PADDING;
    const rightColumnLeft = rightX - RIGHT_COLUMN_WIDTH;
    const messageRightLimit = showRightColumn ? rightColumnLeft - COLUMN_GAP : rightX;
    const messageWidth = messageRightLimit - leftX;

    drawRoundedRect(ctx, CARD_X, CARD_Y, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    ctx.fillStyle = "rgba(255, 249, 233, 0.86)";
    ctx.fill();

    ctx.fillStyle = "#173b4f";
    ctx.font = "900 18px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(scene.title, leftX, CARD_Y + 10);

    ctx.font = "800 13px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#426171";
    wrapTextToLines(ctx, message, messageWidth, 2).forEach((line, index) => {
      ctx.fillText(line, leftX, CARD_Y + 34 + index * 14);
    });

    if (!showRightColumn) {
      return;
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#173b4f";
    ctx.font = "900 14px Trebuchet MS, sans-serif";
    ctx.fillText(`Ajuda Kog: ${engine.metrics.snapshot().autoHelpCount}`, rightX, CARD_Y + 10);

    if (!stats.length) {
      return;
    }

    ctx.font = "800 11px Trebuchet MS, sans-serif";
    ctx.fillStyle = "#426171";
    stats.forEach((line, index) => {
      ctx.fillText(line, rightX, CARD_Y + 29 + index * 11);
    });
  }
}
