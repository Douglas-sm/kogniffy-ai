function createKogSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 140">
      <g>
        <ellipse cx="80" cy="24" rx="45" ry="7" fill="#dff7f3"/>
        <ellipse cx="80" cy="24" rx="7" ry="26" fill="#dff7f3"/>
        <circle cx="80" cy="24" r="8" fill="#173b4f"/>
      </g>
      <path d="M34 69c0-33 21-55 46-55s46 22 46 55-21 55-46 55-46-22-46-55z" fill="#fff9e9" stroke="#173b4f" stroke-width="8"/>
      <path d="M48 72c0-18 14-31 32-31s32 13 32 31-14 31-32 31-32-13-32-31z" fill="#173b4f"/>
      <circle cx="80" cy="72" r="15" fill="#6fd6c5"/>
      <circle cx="86" cy="66" r="5" fill="#fff"/>
      <path d="M37 89L16 105M123 89l21 16" stroke="#173b4f" stroke-width="8" stroke-linecap="round"/>
    </svg>
  `;
}

export class KogAssistant {
  private image: HTMLImageElement | null = null;

  constructor() {
    if (typeof Image !== "undefined") {
      this.image = new Image();
      this.image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createKogSvg())}`;
    }
  }

  draw(ctx: CanvasRenderingContext2D, playerX: number, playerY: number, timeMs: number) {
    const x = Math.min(820, playerX + 74);
    const y = Math.max(88, playerY - 86 + Math.sin(timeMs / 420) * 10);

    if (this.image?.complete) {
      ctx.drawImage(this.image, x, y, 82, 72);
    } else {
      ctx.fillStyle = "#fff9e9";
      ctx.beginPath();
      ctx.arc(x + 42, y + 40, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6fd6c5";
      ctx.beginPath();
      ctx.arc(x + 42, y + 40, 12, 0, Math.PI * 2);
      ctx.fill();
    }

  }
}
