import type { Platform, PointerPosition, Rect } from "@/game/engine/GameEngine";

export interface ButtonRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export function pointInRect(point: PointerPosition, rect: ButtonRect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

export function drawCaveBackground(ctx: CanvasRenderingContext2D, timeMs: number, accent: string) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 540);
  gradient.addColorStop(0, "#8bd7e8");
  gradient.addColorStop(0.52, "#355a64");
  gradient.addColorStop(1, "#173b4f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 960, 540);

  ctx.fillStyle = "rgba(255, 249, 233, 0.22)";
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 83 + Math.sin(timeMs / 900 + index) * 18) % 990;
    const y = 70 + ((index * 47) % 260);
    ctx.beginPath();
    ctx.arc(x, y, 3 + (index % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = accent;
  for (let index = 0; index < 9; index += 1) {
    const x = 40 + index * 112;
    const height = 42 + (index % 4) * 18;
    ctx.beginPath();
    ctx.moveTo(x, 438);
    ctx.lineTo(x + 20, 438 - height);
    ctx.lineTo(x + 42, 438);
    ctx.closePath();
    ctx.globalAlpha = 0.72;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawPlatform(ctx: CanvasRenderingContext2D, platform: Platform) {
  drawRoundedRect(ctx, platform.x, platform.y, platform.width, platform.height, 14);
  ctx.fillStyle = "#2f6b66";
  ctx.fill();
  ctx.fillStyle = "#6fd6c5";
  ctx.fillRect(platform.x + 12, platform.y + 8, platform.width - 24, 6);
}

export function drawCaveEntrance(ctx: CanvasRenderingContext2D, rect: Rect) {
  ctx.save();
  ctx.fillStyle = "#102430";
  ctx.beginPath();
  ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height * 0.58, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 249, 233, 0.08)";
  ctx.beginPath();
  ctx.ellipse(
    rect.x + rect.width / 2 - 14,
    rect.y + rect.height * 0.52,
    rect.width * 0.24,
    rect.height * 0.18,
    -0.4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.strokeStyle = "#173b4f";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

export function drawGoalArrow(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number) {
  const floatY = Math.sin(timeMs / 160) * 6;

  ctx.save();
  ctx.translate(x, y + floatY);
  ctx.fillStyle = "#dd3b43";
  ctx.strokeStyle = "#7c161c";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, 26);
  ctx.lineTo(-14, 6);
  ctx.lineTo(-5, 6);
  ctx.lineTo(-5, -18);
  ctx.lineTo(5, -18);
  ctx.lineTo(5, 6);
  ctx.lineTo(14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawPortal(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  timeMs: number,
  revealProgress: number,
  warpProgress = 0
) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const scale = 0.35 + revealProgress * 0.65;
  const pulse = 1 + Math.sin(timeMs / 180) * 0.05 + warpProgress * 0.12;
  const ringAlpha = 0.52 + warpProgress * 0.28;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);

  ctx.fillStyle = `rgba(111, 214, 197, ${0.18 + revealProgress * 0.28})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, rect.width * 0.95 * pulse, rect.height * 0.72 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#173b4f";
  ctx.beginPath();
  ctx.ellipse(0, 0, rect.width * 0.52, rect.height * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(111, 214, 197, ${ringAlpha})`;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, 0, rect.width * 0.5 * pulse, rect.height * 0.4 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#f6c55f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, rect.width * 0.64 * pulse, rect.height * 0.5 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();

  for (let index = 0; index < 10; index += 1) {
    const angle = timeMs / 360 + index * 0.63;
    const radiusX = rect.width * (0.26 + (index % 3) * 0.08) * pulse;
    const radiusY = rect.height * (0.18 + (index % 4) * 0.05) * pulse;
    const sparkX = Math.cos(angle) * radiusX;
    const sparkY = Math.sin(angle) * radiusY;
    const sparkSize = 3 + (index % 3);

    ctx.fillStyle = index % 2 === 0 ? "#fff9e9" : "#6fd6c5";
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawPortalHint(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  timeMs: number,
  revealProgress: number,
  message = "Clique no portal ou use as setas para seguir"
) {
  const centerX = rect.x + rect.width / 2;
  const cardWidth = 374;
  const cardHeight = 42;
  const cardX = centerX - cardWidth / 2;
  const cardY = rect.y - 108;

  ctx.save();
  ctx.globalAlpha = revealProgress;

  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 15);
  ctx.fillStyle = "rgba(255, 249, 233, 0.96)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#173b4f";
  ctx.stroke();

  ctx.fillStyle = "#173b4f";
  ctx.font = "900 16px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, centerX, cardY + cardHeight / 2 + 1);

  ctx.restore();

  drawGoalArrow(ctx, centerX, rect.y - 52, timeMs);
}

export function drawChoiceButton(ctx: CanvasRenderingContext2D, rect: ButtonRect, active = false) {
  drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
  ctx.fillStyle = active ? "#f6c55f" : "#fff9e9";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#173b4f";
  ctx.stroke();
  ctx.fillStyle = "#173b4f";
  ctx.font = "900 24px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(rect.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
}

export function drawPanelText(ctx: CanvasRenderingContext2D, title: string, line: string) {
  drawRoundedRect(ctx, 26, 22, 530, 74, 18);
  ctx.fillStyle = "rgba(255, 249, 233, 0.9)";
  ctx.fill();
  ctx.fillStyle = "#173b4f";
  ctx.font = "900 24px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, 48, 34);
  ctx.font = "700 16px Trebuchet MS, sans-serif";
  ctx.fillStyle = "#426171";
  ctx.fillText(line, 48, 66);
}
