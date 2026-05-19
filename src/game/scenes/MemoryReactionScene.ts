import type { CameraOffset, GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import { PanelAudio } from "@/game/memory/PanelAudio";
import {
  MEMORY_BUTTONS,
  MEMORY_PANEL_TIMINGS,
  MEMORY_UNLOCK_LENGTH,
  createInitialSequence,
  extendSequence,
  memoryButtonLayouts,
  showTimingsForSequence
} from "@/game/memory/panelConfig";
import { type ButtonRect, drawRoundedRect, pointInRect } from "@/game/scenes/sceneUtils";

type MemoryPhase = "briefing" | "showing" | "awaitingInput" | "successPause" | "error" | "unlock";
type FeedbackMode = "sequence" | "correct" | "error" | "unlock";

interface ButtonFeedback {
  buttonIndex: number | null;
  startedAt: number;
  durationMs: number;
  mode: FeedbackMode;
}

const PANEL_FRAME = {
  x: 116,
  y: 114,
  width: 728,
  height: 246
} as const;

const DOOR_FRAME = {
  x: 292,
  y: 92,
  width: 376,
  height: 248
} as const;

const DECK_PLATFORM = {
  x: 0,
  y: 454,
  width: 960,
  height: 86
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value: number) {
  const normalized = clamp(value, 0, 1);
  return 1 - (1 - normalized) ** 3;
}

function drawSpaceBackdrop(ctx: CanvasRenderingContext2D, timeMs: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 540);
  gradient.addColorStop(0, "#030713");
  gradient.addColorStop(0.48, "#09172b");
  gradient.addColorStop(1, "#07121e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 960, 540);

  const nebula = ctx.createRadialGradient(720, 110, 20, 720, 110, 240);
  nebula.addColorStop(0, "rgba(73, 246, 255, 0.22)");
  nebula.addColorStop(0.45, "rgba(125, 140, 255, 0.14)");
  nebula.addColorStop(1, "rgba(3, 7, 19, 0)");
  ctx.fillStyle = nebula;
  ctx.fillRect(0, 0, 960, 540);

  const signalGlow = ctx.createRadialGradient(140, 140, 10, 140, 140, 200);
  signalGlow.addColorStop(0, "rgba(255, 93, 203, 0.16)");
  signalGlow.addColorStop(1, "rgba(255, 93, 203, 0)");
  ctx.fillStyle = signalGlow;
  ctx.fillRect(0, 0, 960, 540);

  ctx.fillStyle = "rgba(191, 232, 255, 0.85)";
  for (let index = 0; index < 42; index += 1) {
    const x = (index * 67 + Math.sin(timeMs / 700 + index) * 18 + 40) % 980;
    const y = 26 + ((index * 39) % 250);
    const radius = index % 4 === 0 ? 1.9 : 1.2;
    ctx.globalAlpha = 0.35 + ((index % 5) / 10) + Math.sin(timeMs / 500 + index) * 0.06;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(73, 246, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= 960; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 248);
    ctx.lineTo(x + 36, 454);
    ctx.stroke();
  }

  for (let y = 268; y <= 454; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
    ctx.stroke();
  }
}

function drawDeckPlatform(ctx: CanvasRenderingContext2D) {
  const deckGradient = ctx.createLinearGradient(0, DECK_PLATFORM.y, 0, 540);
  deckGradient.addColorStop(0, "#101f32");
  deckGradient.addColorStop(1, "#060c14");

  drawRoundedRect(ctx, DECK_PLATFORM.x, DECK_PLATFORM.y, DECK_PLATFORM.width, DECK_PLATFORM.height, 14);
  ctx.fillStyle = deckGradient;
  ctx.fill();

  ctx.strokeStyle = "rgba(91, 130, 171, 0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(73, 246, 255, 0.2)";
  ctx.fillRect(34, 468, 892, 4);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let index = 0; index < 12; index += 1) {
    const x = 36 + index * 74;
    ctx.beginPath();
    ctx.moveTo(x, 456);
    ctx.lineTo(x, 538);
    ctx.stroke();
  }
}

function drawPanelShell(ctx: CanvasRenderingContext2D) {
  drawRoundedRect(ctx, PANEL_FRAME.x, PANEL_FRAME.y, PANEL_FRAME.width, PANEL_FRAME.height, 28);
  ctx.fillStyle = "rgba(9, 18, 31, 0.9)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(94, 145, 196, 0.45)";
  ctx.stroke();

  drawRoundedRect(ctx, PANEL_FRAME.x + 18, PANEL_FRAME.y + 18, PANEL_FRAME.width - 36, PANEL_FRAME.height - 36, 20);
  ctx.fillStyle = "rgba(4, 11, 20, 0.92)";
  ctx.fill();
}

function drawStatusHeader(
  ctx: CanvasRenderingContext2D,
  phase: MemoryPhase,
  currentScore: number,
  bestSequence: number,
  sequenceLength: number,
  flashMs: number,
  unlockedByHelp: boolean
) {
  drawRoundedRect(ctx, 28, 20, 904, 72, 20);
  ctx.fillStyle = "rgba(6, 14, 25, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(73, 246, 255, 0.26)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ebf8ff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "900 24px Trebuchet MS, sans-serif";
  ctx.fillText("Nave do Kog", 50, 34);
  ctx.font = "700 15px Trebuchet MS, sans-serif";
  ctx.fillStyle = "rgba(194, 228, 255, 0.82)";
  ctx.fillText(statusTextForPhase(phase, sequenceLength, unlockedByHelp), 50, 62);

  const stats = [
    `Pontuação atual ${currentScore}`,
    `Maior sequência ${bestSequence}`,
    `Flash ${flashMs} ms`
  ];

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "900 15px Trebuchet MS, sans-serif";
  ctx.fillStyle = "#49f6ff";
  stats.forEach((label, index) => {
    ctx.fillText(label, 908, 34 + index * 15);
  });
}

function statusTextForPhase(phase: MemoryPhase, sequenceLength: number, unlockedByHelp: boolean) {
  if (phase === "briefing") {
    return "Painel aguardando sincronização manual.";
  }

  if (phase === "showing") {
    return `Memorize ${sequenceLength} sinais antes da porta liberar o painel.`;
  }

  if (phase === "awaitingInput") {
    return `Repita a sequência atual para abrir a porta bloqueada.`;
  }

  if (phase === "successPause") {
    return `Sequência aceita. O sistema vai adicionar mais um passo.`;
  }

  if (phase === "error") {
    return "Sequência incorreta. O painel está reinicializando.";
  }

  return unlockedByHelp ? "Kog assumiu o painel e liberou a porta." : "Sequência validada. Porta em destravamento.";
}

function drawDoor(ctx: CanvasRenderingContext2D, timeMs: number, unlockProgress: number, errorProgress: number) {
  const centerX = DOOR_FRAME.x + DOOR_FRAME.width / 2;
  const centerY = DOOR_FRAME.y + DOOR_FRAME.height / 2;
  const panelShift = easeOutCubic(unlockProgress) * 112;
  const glowAlpha = 0.16 + unlockProgress * 0.34;
  const pulse = 1 + Math.sin(timeMs / 220) * 0.03;
  const frameGlow = unlockProgress > 0 ? "#7dff72" : errorProgress > 0 ? "#ff6e78" : "#49f6ff";

  ctx.save();
  ctx.translate(centerX, centerY);

  const frameGradient = ctx.createLinearGradient(-188, -124, 188, 124);
  frameGradient.addColorStop(0, "#111f31");
  frameGradient.addColorStop(1, "#050a12");
  drawRoundedRect(ctx, -188, -124, 376, 248, 26);
  ctx.fillStyle = frameGradient;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = frameGlow;
  ctx.shadowColor = frameGlow;
  ctx.shadowBlur = 22 + unlockProgress * 16 + errorProgress * 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = `rgba(73, 246, 255, ${glowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 104 * pulse, 74 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  const leftX = -170 - panelShift;
  const rightX = -2 + panelShift;
  const panelGradient = ctx.createLinearGradient(-170, 0, 170, 0);
  panelGradient.addColorStop(0, "#18283d");
  panelGradient.addColorStop(0.52, "#0d1726");
  panelGradient.addColorStop(1, "#18283d");

  drawRoundedRect(ctx, leftX, -110, 168, 220, 20);
  ctx.fillStyle = panelGradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(140, 183, 222, 0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();

  drawRoundedRect(ctx, rightX, -110, 168, 220, 20);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(73, 246, 255, 0.2)";
  ctx.lineWidth = 2;
  for (let line = -76; line <= 76; line += 38) {
    ctx.beginPath();
    ctx.moveTo(leftX + 24, line);
    ctx.lineTo(leftX + 144, line);
    ctx.moveTo(rightX + 24, line);
    ctx.lineTo(rightX + 144, line);
    ctx.stroke();
  }

  ctx.fillStyle = unlockProgress > 0 ? "#7dff72" : errorProgress > 0 ? "#ff6e78" : "#49f6ff";
  ctx.beginPath();
  ctx.arc(0, 0, 17 + unlockProgress * 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#03101a";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  rect: ButtonRect,
  index: number,
  intensity: number,
  errorProgress: number,
  timeMs: number
) {
  const config = MEMORY_BUTTONS[index]!;
  const borderColor = errorProgress > 0.08 ? "#ff6e78" : config.glow;
  const glowStrength = clamp(0.18 + intensity * 0.82, 0.18, 1.1);
  const lightProgress = clamp((intensity - 0.08) / 0.95, 0, 1);
  const pulse = 1 + Math.sin(timeMs / 180 + index * 0.6) * 0.015;

  ctx.save();
  ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.scale(pulse, pulse);

  ctx.fillStyle = errorProgress > 0.08 ? "rgba(255, 110, 120, 0.12)" : `${hexToRgba(config.glow, 0.12 + glowStrength * 0.34)}`;
  ctx.shadowColor = errorProgress > 0.08 ? "#ff6e78" : config.glow;
  ctx.shadowBlur = 16 + glowStrength * 20;
  ctx.beginPath();
  ctx.roundRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height, 18);
  ctx.fill();

  ctx.shadowBlur = 0;

  const bodyGradient = ctx.createLinearGradient(0, -rect.height / 2, 0, rect.height / 2);

  if (errorProgress > 0.08) {
    bodyGradient.addColorStop(0, "rgba(112, 24, 39, 0.98)");
    bodyGradient.addColorStop(1, "rgba(58, 16, 24, 0.95)");
  } else {
    bodyGradient.addColorStop(0, `rgba(9, 18, 31, ${0.96 - lightProgress * 0.18})`);
    bodyGradient.addColorStop(1, `rgba(6, 12, 22, ${0.96 - lightProgress * 0.08})`);
  }

  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.roundRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height, 18);
  ctx.fill();

  if (errorProgress <= 0.08) {
    const lightGradient = ctx.createLinearGradient(0, -rect.height / 2, 0, rect.height / 2);
    lightGradient.addColorStop(0, hexToRgba(config.color, 0.18 + lightProgress * 0.46));
    lightGradient.addColorStop(0.58, hexToRgba(config.glow, 0.08 + lightProgress * 0.28));
    lightGradient.addColorStop(1, hexToRgba(config.color, 0.04 + lightProgress * 0.14));
    ctx.fillStyle = lightGradient;
    ctx.beginPath();
    ctx.roundRect(-rect.width / 2 + 4, -rect.height / 2 + 4, rect.width - 8, rect.height - 8, 15);
    ctx.fill();

    ctx.fillStyle = hexToRgba("#ffffff", 0.05 + lightProgress * 0.18);
    ctx.beginPath();
    ctx.roundRect(-rect.width / 2 + 10, -rect.height / 2 + 8, rect.width - 20, 16, 8);
    ctx.fill();
  }

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.fillStyle = errorProgress > 0.08 ? "#ffd7db" : lightProgress > 0.4 ? "#f8fdff" : config.color;
  ctx.font = "900 26px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(config.label, 0, -6);

  ctx.font = "700 12px Trebuchet MS, sans-serif";
  ctx.fillStyle = "rgba(231, 244, 255, 0.7)";
  ctx.fillText(`canal ${index + 1}`, 0, 18);
  ctx.restore();
}

function drawProgressRow(ctx: CanvasRenderingContext2D, phase: MemoryPhase, inputIndex: number, sequenceLength: number) {
  const activeCount = phase === "awaitingInput" ? inputIndex : phase === "successPause" || phase === "unlock" ? sequenceLength : 0;

  drawRoundedRect(ctx, 254, 374, 452, 40, 16);
  ctx.fillStyle = "rgba(7, 15, 26, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(73, 246, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const slotWidth = 58;
  for (let index = 0; index < sequenceLength; index += 1) {
    const x = 274 + index * 64;
    drawRoundedRect(ctx, x, 386, slotWidth, 16, 8);
    ctx.fillStyle = index < activeCount ? "rgba(73, 246, 255, 0.92)" : "rgba(255, 255, 255, 0.09)";
    ctx.fill();
  }
}

function drawPhaseCaption(ctx: CanvasRenderingContext2D, phase: MemoryPhase, inputIndex: number, sequenceLength: number) {
  ctx.fillStyle = "rgba(214, 235, 255, 0.88)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 17px Trebuchet MS, sans-serif";

  if (phase === "awaitingInput") {
    ctx.fillText(`Entrada liberada: toque ${inputIndex + 1} de ${sequenceLength}.`, 480, 430);
    return;
  }

  if (phase === "showing") {
    ctx.fillText("Observe os sinais. O painel ainda está bloqueado para clique.", 480, 430);
    return;
  }

  if (phase === "successPause") {
    ctx.fillText("Padrão validado. Expandindo sequência.", 480, 430);
    return;
  }

  if (phase === "error") {
    ctx.fillText("Erro detectado. Reinicializando a senha luminosa.", 480, 430);
    return;
  }

  if (phase === "unlock") {
    ctx.fillText("Porta liberando acesso ao compartimento principal.", 480, 430);
    return;
  }

  ctx.fillText("Aguardando sincronização do painel.", 480, 430);
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export class MemoryReactionScene implements GameScene {
  id = "memory";
  title = "Nave do Kog";
  objective = "Memorize o painel para destravar a porta";
  spawnSide = "left" as const;
  allowJump = false;
  exitMode = "none" as const;
  platforms: Platform[] = [DECK_PLATFORM];

  private readonly audio = new PanelAudio();
  private readonly buttonRects: ButtonRect[] = memoryButtonLayouts().map((layout, index) => ({
    ...layout,
    label: MEMORY_BUTTONS[index]!.label
  }));

  private phase: MemoryPhase = "briefing";
  private sequence: number[] = [];
  private showIndex = 0;
  private inputIndex = 0;
  private currentScore = 0;
  private bestSequence = 0;
  private unlockedByHelp = false;
  private phaseEndsAt = 0;
  private nextSignalAt = 0;
  private inputReleasedAt = 0;
  private lastAcceptedClickAt = 0;
  private shakeUntil = 0;
  private feedback: ButtonFeedback | null = null;

  enter(engine: GameEngine) {
    this.phase = "briefing";
    this.sequence = [];
    this.showIndex = 0;
    this.inputIndex = 0;
    this.currentScore = 0;
    this.bestSequence = 0;
    this.unlockedByHelp = false;
    this.phaseEndsAt = 0;
    this.nextSignalAt = 0;
    this.inputReleasedAt = 0;
    this.lastAcceptedClickAt = 0;
    this.shakeUntil = 0;
    this.feedback = null;

    engine.dialogBox.setLines(
      [
        "A porta travou e o painel só responde a uma sequência luminosa.",
        "Observe os 6 botões neon com atenção.",
        "Quando a sequência terminar, repita exatamente a ordem para abrir a nave."
      ],
      () => {
        this.audio.prime();
        this.startNewAttempt(engine);
      }
    );
  }

  update(engine: GameEngine, _dt: number) {
    if (engine.dialogBox.isActive) {
      return;
    }

    if (this.phase === "showing") {
      this.updateShowingPhase(engine);
      return;
    }

    if (this.phase === "successPause" && engine.timeMs >= this.phaseEndsAt) {
      this.sequence = extendSequence(this.sequence);
      this.beginShowing(engine, MEMORY_PANEL_TIMINGS.roundStartDelayMs);
      return;
    }

    if (this.phase === "error" && engine.timeMs >= this.phaseEndsAt) {
      this.startNewAttempt(engine);
      return;
    }

    if (this.phase === "unlock" && engine.timeMs >= this.phaseEndsAt) {
      engine.nextScene();
    }
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    const shake = this.cameraOffset(engine.timeMs);

    ctx.save();
    ctx.translate(shake.x, shake.y);
    drawSpaceBackdrop(ctx, engine.timeMs);
    drawDoor(ctx, engine.timeMs, this.unlockProgress(engine.timeMs), this.errorProgress(engine.timeMs));
    drawPanelShell(ctx);
    drawDeckPlatform(ctx);

    const showTimings = showTimingsForSequence(this.sequence.length || 2);
    drawStatusHeader(
      ctx,
      this.phase,
      this.currentScore,
      this.bestSequence,
      Math.max(2, this.sequence.length || 2),
      showTimings.flashMs,
      this.unlockedByHelp
    );

    const errorProgress = this.errorProgress(engine.timeMs);
    this.buttonRects.forEach((rect, index) => {
      drawButton(ctx, rect, index, this.buttonIntensity(index, engine.timeMs), errorProgress, engine.timeMs);
    });

    drawProgressRow(ctx, this.phase, this.inputIndex, Math.max(2, this.sequence.length || 2));
    drawPhaseCaption(ctx, this.phase, this.inputIndex, Math.max(2, this.sequence.length || 2));

    if (errorProgress > 0) {
      ctx.fillStyle = `rgba(255, 110, 120, ${0.08 + errorProgress * 0.12})`;
      ctx.fillRect(0, 0, 960, 540);
    }
    ctx.restore();
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.phase === "showing" || this.phase === "successPause" || this.phase === "error") {
      engine.metrics.recordCognitiveImpulsiveClick();
      return;
    }

    if (this.phase !== "awaitingInput") {
      return;
    }

    const selectedIndex = this.buttonRects.findIndex((rect) => pointInRect(pointer, rect));

    if (selectedIndex < 0) {
      return;
    }

    this.audio.prime();
    const now = performance.now();
    const elapsedSinceCheckpoint = this.inputIndex === 0 ? now - this.inputReleasedAt : now - this.lastAcceptedClickAt;

    engine.metrics.recordAttempt();
    engine.metrics.recordReactionTime(elapsedSinceCheckpoint);

    if (this.inputIndex === 0) {
      engine.metrics.recordCognitiveResponseTime(elapsedSinceCheckpoint);
    } else {
      engine.metrics.recordCognitiveInterClickTime(elapsedSinceCheckpoint);
    }

    this.lastAcceptedClickAt = now;
    this.feedback = {
      buttonIndex: selectedIndex,
      startedAt: engine.timeMs,
      durationMs: 220,
      mode: selectedIndex === this.sequence[this.inputIndex] ? "correct" : "error"
    };
    this.audio.playButton(selectedIndex, 1.08);

    if (selectedIndex !== this.sequence[this.inputIndex]) {
      this.failRound(engine);
      return;
    }

    this.audio.playCorrect(selectedIndex);
    this.inputIndex += 1;

    if (this.inputIndex < this.sequence.length) {
      return;
    }

    engine.clearErrorStreak(this.id);
    this.currentScore += 1;
    this.bestSequence = Math.max(this.bestSequence, this.sequence.length);
    engine.metrics.recordMaxSequenceLength(this.sequence.length);
    engine.metrics.recordSequenceScore(this.sequence.length);
    engine.metrics.recordCognitiveMaxSequence(this.sequence.length);

    if (this.sequence.length >= MEMORY_UNLOCK_LENGTH) {
      this.beginUnlock(engine.timeMs, false);
      return;
    }

    this.phase = "successPause";
    this.phaseEndsAt = engine.timeMs + MEMORY_PANEL_TIMINGS.successPauseMs;
  }

  onAutoHelp(_engine: GameEngine) {
    if (this.phase === "unlock") {
      return;
    }

    this.audio.prime();
    this.beginUnlock(_engine.timeMs, true);
  }

  getCanvasCursor(engine: GameEngine) {
    if (this.phase !== "awaitingInput") {
      return "default";
    }

    return this.buttonRects.some((rect) => pointInRect(engine.pointer, rect)) ? "pointer" : "default";
  }

  getCameraOffset(engine: GameEngine): CameraOffset {
    return this.cameraOffset(engine.timeMs);
  }

  private cameraOffset(timeMs: number): CameraOffset {
    if (timeMs >= this.shakeUntil) {
      return { x: 0, y: 0 };
    }

    const progress = 1 - (this.shakeUntil - timeMs) / MEMORY_PANEL_TIMINGS.shakeDurationMs;
    const magnitude = (1 - clamp(progress, 0, 1)) * 9;
    return {
      x: Math.sin(timeMs / 12) * magnitude,
      y: Math.cos(timeMs / 18) * magnitude * 0.55
    };
  }

  private startNewAttempt(engine: GameEngine) {
    this.phase = "showing";
    this.sequence = createInitialSequence();
    this.showIndex = 0;
    this.inputIndex = 0;
    this.currentScore = 0;
    this.unlockedByHelp = false;
    this.feedback = null;
    this.beginShowing(engine, MEMORY_PANEL_TIMINGS.roundStartDelayMs);
  }

  private beginShowing(engine: GameEngine, delayMs: number) {
    this.phase = "showing";
    this.showIndex = 0;
    this.inputIndex = 0;
    this.nextSignalAt = engine.timeMs + delayMs;
  }

  private updateShowingPhase(engine: GameEngine) {
    if (engine.timeMs < this.nextSignalAt) {
      return;
    }

    if (this.showIndex >= this.sequence.length) {
      this.phase = "awaitingInput";
      this.inputIndex = 0;
      this.inputReleasedAt = performance.now();
      this.lastAcceptedClickAt = this.inputReleasedAt;
      this.feedback = null;
      return;
    }

    const buttonIndex = this.sequence[this.showIndex]!;
    const timings = showTimingsForSequence(this.sequence.length);

    this.feedback = {
      buttonIndex,
      startedAt: engine.timeMs,
      durationMs: timings.flashMs,
      mode: "sequence"
    };
    this.audio.playButton(buttonIndex, 0.92);
    this.showIndex += 1;
    this.nextSignalAt = engine.timeMs + timings.flashMs + timings.gapMs;
  }

  private failRound(engine: GameEngine) {
    this.phase = "error";
    this.phaseEndsAt = engine.timeMs + MEMORY_PANEL_TIMINGS.errorPauseMs;
    this.shakeUntil = engine.timeMs + MEMORY_PANEL_TIMINGS.shakeDurationMs;
    this.inputIndex = 0;
    this.currentScore = 0;
    this.unlockedByHelp = false;
    engine.metrics.recordSequenceError();
    engine.metrics.recordCognitiveError();
    engine.registerError(this.id);
    this.audio.playError();
  }

  private beginUnlock(startedAtMs: number, unlockedByHelp: boolean) {
    this.phase = "unlock";
    this.phaseEndsAt = startedAtMs + MEMORY_PANEL_TIMINGS.unlockDurationMs;
    this.unlockedByHelp = unlockedByHelp;
    this.feedback = {
      buttonIndex: null,
      startedAt: startedAtMs,
      durationMs: MEMORY_PANEL_TIMINGS.unlockDurationMs,
      mode: "unlock"
    };
    this.audio.playUnlock();
  }

  private unlockProgress(timeMs: number) {
    if (this.phase !== "unlock" || !this.feedback) {
      return 0;
    }

    return clamp((timeMs - this.feedback.startedAt) / 1_050, 0, 1);
  }

  private errorProgress(timeMs: number) {
    if (this.phase !== "error" || !this.feedback) {
      return 0;
    }

    const progress = clamp((timeMs - this.feedback.startedAt) / this.feedback.durationMs, 0, 1);
    return Math.sin(progress * Math.PI);
  }

  private buttonIntensity(index: number, timeMs: number) {
    let intensity = 0.08;

    if (this.phase === "unlock") {
      intensity = 0.2 + Math.max(0, Math.sin(timeMs / 140 + index * 0.55)) * 0.24;
    }

    if (!this.feedback) {
      return intensity;
    }

    const elapsed = timeMs - this.feedback.startedAt;
    const progress = clamp(elapsed / this.feedback.durationMs, 0, 1);
    const pulse = Math.sin(progress * Math.PI);

    if (this.feedback.buttonIndex === index) {
      if (this.feedback.mode === "error") {
        return Math.max(intensity, 0.14 + pulse * 1.05);
      }

      if (this.feedback.mode === "correct") {
        return Math.max(intensity, 0.28 + pulse * 0.96);
      }

      return Math.max(intensity, 0.22 + pulse * 0.88);
    }

    if (this.feedback.mode === "unlock") {
      return Math.max(intensity, pulse * 0.18);
    }

    return intensity;
  }
}
