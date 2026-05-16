import { drawRoundedRect } from "@/game/scenes/sceneUtils";

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
    this.wrapText(ctx, this.lines[this.index], 74, 446, 790, 30);

    ctx.fillStyle = "#426171";
    ctx.font = "800 14px Trebuchet MS, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Enter", 884, 476);
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(" ");
    let line = "";
    let currentY = y;

    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      const metrics = ctx.measureText(nextLine);

      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = word;
        currentY += lineHeight;
      } else {
        line = nextLine;
      }
    }

    if (line) {
      ctx.fillText(line, x, currentY);
    }
  }
}
