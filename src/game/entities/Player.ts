import type { Platform } from "@/game/engine/GameEngine";

interface PlayerUpdateOptions {
  allowJump: boolean;
  controlsEnabled: boolean;
  freeze: boolean;
  moveTowardX?: number | null;
}

export interface PlayerDrawWarpEffect {
  progress: number;
  targetX: number;
  targetY: number;
}

export class Player {
  x = 90;
  y = 360;
  width = 42;
  height = 58;
  velocityX = 0;
  velocityY = 0;
  grounded = false;
  checkpoint = { x: 90, y: 360 };
  private facing = 1;
  private wheelRotation = 0;
  private jumpBurst = 0;
  private landingCompression = 0;

  reset(x = this.checkpoint.x, y = this.checkpoint.y) {
    this.x = x;
    this.y = y;
    this.velocityX = 0;
    this.velocityY = 0;
    this.grounded = false;
    this.wheelRotation = 0;
    this.jumpBurst = 0;
    this.landingCompression = 0;
  }

  setCheckpoint(x: number, y: number) {
    this.checkpoint = { x, y };
  }

  update(keys: Set<string>, platforms: Platform[], dt: number, options: PlayerUpdateOptions) {
    if (options.freeze) {
      this.velocityX = 0;
      this.velocityY = 0;
      return;
    }

    const moveSpeed = 340;
    const gravity = 1550;
    const jumpForce = 620;
    const wasGrounded = this.grounded;
    let landedThisFrame = false;
    let landingSpeed = 0;

    const moveTowardX = options.moveTowardX ?? null;
    const wantsLeft = options.controlsEnabled && keys.has("ArrowLeft");
    const wantsRight = options.controlsEnabled && keys.has("ArrowRight");
    const hasManualHorizontalInput = wantsLeft || wantsRight;

    this.velocityX = 0;

    if (wantsLeft && !wantsRight) {
      this.velocityX = -moveSpeed;
    } else if (wantsRight && !wantsLeft) {
      this.velocityX = moveSpeed;
    } else if (!hasManualHorizontalInput && options.controlsEnabled && moveTowardX !== null) {
      const distanceToTarget = moveTowardX - this.x;

      if (Math.abs(distanceToTarget) <= 4) {
        this.x = moveTowardX;
      } else {
        this.velocityX = Math.sign(distanceToTarget) * moveSpeed;
      }
    }

    if (this.velocityX !== 0) {
      this.facing = this.velocityX > 0 ? 1 : -1;
    }

    if (options.allowJump && options.controlsEnabled && keys.has("Space") && this.grounded) {
      this.velocityY = -jumpForce;
      this.grounded = false;
      this.jumpBurst = 1;
      this.landingCompression = 0;
    }

    this.wheelRotation += (this.velocityX / 10) * dt;
    this.jumpBurst = Math.max(0, this.jumpBurst - dt * 4.6);
    this.landingCompression = Math.max(0, this.landingCompression - dt * 5.2);

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
        landingSpeed = this.velocityY;
        this.y = platform.y - this.height;
        this.velocityY = 0;
        this.grounded = true;
        landedThisFrame = true;
        break;
      }
    }

    if (!wasGrounded && landedThisFrame) {
      this.landingCompression = Math.min(1, landingSpeed / 760);
      this.jumpBurst = 0;
    }

    this.x = Math.max(0, Math.min(960 - this.width, this.x));

    if (this.y > 560) {
      this.reset();
    }
  }

  draw(ctx: CanvasRenderingContext2D, timeMs: number, warp: PlayerDrawWarpEffect | null = null) {
    const centerX = this.x + this.width / 2;
    const warpProgress = warp?.progress ?? 0;
    const driveRatio = Math.min(1, Math.abs(this.velocityX) / 340);
    const bounce = this.grounded ? Math.sin(timeMs / 110) * (0.5 + driveRatio * 1.2) : 0;
    const airborneRatio = this.grounded ? 0 : Math.min(1, Math.abs(this.velocityY) / 720 + 0.14);
    const bodyTilt = (this.velocityX / 340) * 0.08 - this.jumpBurst * 0.08 * this.facing + this.landingCompression * 0.04;
    const bodyY = 14 - this.jumpBurst * 5.5 + this.landingCompression * 1.5;
    const headY = -2 - this.jumpBurst * 4.5 + this.landingCompression * 0.8;
    const wheelY = 44 + this.jumpBurst * 1.8 + this.landingCompression * 2.2;
    const shadowScaleX = 1 - airborneRatio * 0.35 + driveRatio * 0.06;
    const shadowScaleY = 1 - airborneRatio * 0.22 + this.landingCompression * 0.1;
    const targetX = warp?.targetX ?? centerX;
    const targetY = warp?.targetY ?? this.y + 8;
    const drawCenterX = centerX + (targetX - centerX) * warpProgress;
    const drawCenterY = this.y + 4 + bounce + (targetY - (this.y + 4 + bounce)) * warpProgress;
    const drawScale = 1 - warpProgress * 0.74;
    const drawAlpha = 1 - warpProgress * 0.6;
    const shadowY = this.y + this.height + 8 + (targetY - (this.y + this.height + 8)) * warpProgress;

    ctx.save();
    ctx.globalAlpha = drawAlpha * 0.45;
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(
      drawCenterX,
      shadowY,
      22 * shadowScaleX * (1 - warpProgress * 0.35),
      7 * shadowScaleY * (1 - warpProgress * 0.2),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.globalAlpha = drawAlpha;

    ctx.translate(drawCenterX, drawCenterY);
    ctx.rotate(bodyTilt);
    ctx.scale(drawScale, drawScale);

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    this.drawSpring(ctx, -12, bodyY + 14, wheelY - 10);
    this.drawSpring(ctx, 12, bodyY + 14, wheelY - 10);

    ctx.fillStyle = "#6f98a8";
    ctx.beginPath();
    ctx.roundRect(-18, bodyY, 36, 20, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.roundRect(-11, bodyY + 4, 22, 9, 4);
    ctx.fill();

    ctx.fillStyle = "#6fd6c5";
    ctx.beginPath();
    ctx.roundRect(-8, bodyY + 6, 16, 5, 3);
    ctx.fill();

    ctx.fillStyle = "#d9edf2";
    ctx.beginPath();
    ctx.roundRect(-14, headY, 28, 18, 7);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.scale(this.facing, 1);

    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.roundRect(-10, headY + 4, 20, 7, 3);
    ctx.fill();

    ctx.fillStyle = "#6fd6c5";
    ctx.beginPath();
    ctx.roundRect(-9, headY + 5, 18, 5, 2.5);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(4, headY + 7.5, 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#173b4f";
    ctx.beginPath();
    ctx.moveTo(5, headY + 1);
    ctx.lineTo(10, headY - 8);
    ctx.stroke();

    ctx.fillStyle = "#dff7f3";
    ctx.beginPath();
    ctx.arc(10, headY - 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-20, bodyY + 10);
    ctx.lineTo(-24, bodyY + 13);
    ctx.moveTo(20, bodyY + 10);
    ctx.lineTo(24, bodyY + 13);
    ctx.stroke();

    ctx.fillStyle = "#f5c86b";
    ctx.beginPath();
    ctx.roundRect(-14, bodyY + 16, 28, 4, 2);
    ctx.fill();

    this.drawWheel(ctx, -13, wheelY, this.wheelRotation);
    this.drawWheel(ctx, 13, wheelY, this.wheelRotation);

    ctx.restore();
  }

  private drawSpring(ctx: CanvasRenderingContext2D, x: number, topY: number, bottomY: number) {
    const segmentHeight = Math.max(2, (bottomY - topY) / 4);

    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x - 3, topY + segmentHeight);
    ctx.lineTo(x + 3, topY + segmentHeight * 2);
    ctx.lineTo(x - 3, topY + segmentHeight * 3);
    ctx.lineTo(x, bottomY);
    ctx.stroke();
  }

  private drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#87aeb9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(rotation);
    ctx.strokeStyle = "#dff7f3";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let spoke = 0; spoke < 5; spoke += 1) {
      const angle = (Math.PI * 2 * spoke) / 5;
      ctx.moveTo(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5);
      ctx.lineTo(Math.cos(angle) * 7, Math.sin(angle) * 7);
    }

    ctx.stroke();

    ctx.fillStyle = "#6fd6c5";
    ctx.beginPath();
    ctx.arc(0, -6.4, 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#9ec8d3";
    ctx.beginPath();
    ctx.arc(0, 0, 3.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
