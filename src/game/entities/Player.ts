import type { Platform } from "@/game/engine/GameEngine";

export class Player {
  x = 90;
  y = 360;
  width = 42;
  height = 58;
  velocityX = 0;
  velocityY = 0;
  grounded = false;
  checkpoint = { x: 90, y: 360 };

  reset(x = this.checkpoint.x, y = this.checkpoint.y) {
    this.x = x;
    this.y = y;
    this.velocityX = 0;
    this.velocityY = 0;
  }

  setCheckpoint(x: number, y: number) {
    this.checkpoint = { x, y };
  }

  update(keys: Set<string>, platforms: Platform[], dt: number) {
    const moveSpeed = 260;
    const gravity = 1550;
    const jumpForce = 620;

    this.velocityX = 0;

    if (keys.has("ArrowLeft")) {
      this.velocityX = -moveSpeed;
    }

    if (keys.has("ArrowRight")) {
      this.velocityX = moveSpeed;
    }

    if (keys.has("Space") && this.grounded) {
      this.velocityY = -jumpForce;
      this.grounded = false;
    }

    this.x += this.velocityX * dt;
    this.velocityY += gravity * dt;
    this.y += this.velocityY * dt;
    this.grounded = false;

    for (const platform of platforms) {
      const overlapsX = this.x + this.width > platform.x && this.x < platform.x + platform.width;
      const hitsTop =
        this.y + this.height >= platform.y &&
        this.y + this.height - this.velocityY * dt <= platform.y &&
        this.velocityY >= 0;

      if (overlapsX && hitsTop) {
        this.y = platform.y - this.height;
        this.velocityY = 0;
        this.grounded = true;
      }
    }

    this.x = Math.max(0, Math.min(960 - this.width, this.x));

    if (this.y > 560) {
      this.reset();
    }
  }

  draw(ctx: CanvasRenderingContext2D, timeMs: number) {
    const bounce = Math.sin(timeMs / 140) * (this.grounded ? 1.5 : 0);
    const centerX = this.x + this.width / 2;

    ctx.save();
    ctx.translate(0, bounce);

    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(centerX, this.y + this.height + 8, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f06f59";
    ctx.beginPath();
    ctx.roundRect(this.x + 6, this.y + 18, 30, 32, 10);
    ctx.fill();

    ctx.fillStyle = "#fff9e9";
    ctx.beginPath();
    ctx.arc(centerX, this.y + 16, 17, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.arc(centerX - 6, this.y + 14, 3, 0, Math.PI * 2);
    ctx.arc(centerX + 6, this.y + 14, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, this.y + 19, 7, 0.1, Math.PI - 0.1);
    ctx.stroke();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.x + 13, this.y + 50);
    ctx.lineTo(this.x + 9, this.y + 62);
    ctx.moveTo(this.x + 29, this.y + 50);
    ctx.lineTo(this.x + 34, this.y + 62);
    ctx.stroke();

    ctx.restore();
  }
}
