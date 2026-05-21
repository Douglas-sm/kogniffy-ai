import { drawRoundedRect } from "@/game/scenes/sceneUtils";
import { wrapTextToLines } from "@/game/ui/textLayout";

export class DialogBox {
  private lines: string[] = [];
  private index = 0;
  private onComplete: (() => void) | null = null;

  get isActive() {
    return this.lines.length > 0;
  }

  setLines(lines: string[], onComplete?: () => void) {
    this.lines = lines;
    this.index = 0;
    this.onComplete = onComplete ?? null;
  }

  advance() {
    if (!this.isActive) {
      return;
    }

    this.index += 1;

    if (this.index >= this.lines.length) {
      const callback = this.onComplete;
      this.lines = [];
      this.index = 0;
      this.onComplete = null;
      callback?.();
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.isActive) {
      return;
    }

    drawRoundedRect(ctx, 44, 390, 872, 118, 18);
    ctx.fillStyle = "rgba(255, 249, 233, 0.96)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#173b4f";
    ctx.stroke();

    ctx.fillStyle = "#f06f59";
    ctx.font = "900 18px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Kog", 74, 414);

    ctx.fillStyle = "#173b4f";
    ctx.font = "800 22px Trebuchet MS, sans-serif";
    wrapTextToLines(ctx, this.lines[this.index], 790).forEach((line, index) => {
      ctx.fillText(line, 74, 446 + index * 30);
    });

    ctx.fillStyle = "#426171";
    ctx.font = "800 14px Trebuchet MS, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Clique ou toque", 884, 476);
  }
}
