import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import { type ButtonRect, drawCaveBackground, drawPlatform, drawRoundedRect, pointInRect } from "@/game/scenes/sceneUtils";
import { toTriageDisplayScore } from "@/report/triagePresentation";

type LaunchPhase = "idle" | "doorOpening" | "boarding" | "doorClosing" | "ignition" | "liftoff" | "boost" | "complete";

interface CutsceneState {
  phase: LaunchPhase;
  elapsedMs: number;
  doorOpen: number;
  boardingProgress: number;
  ignitionProgress: number;
  liftoffProgress: number;
  boostProgress: number;
  shipLift: number;
  shipShakeX: number;
  shipShakeY: number;
  thrusterPower: number;
}

interface CharacterPlacement {
  x: number;
  y: number;
  alpha: number;
}

interface RobotPlacement extends CharacterPlacement {
  rotation: number;
  driveProgress: number;
  moving: boolean;
}

const SUMMARY_PANEL = {
  x: 46,
  y: 46,
  width: 360,
  height: 176
} as const;

const SCENE_PANEL = {
  x: 432,
  y: 34,
  width: 486,
  height: 350
} as const;

const REPORT_BUTTON = {
  label: "Mostrar relatório",
  x: 86,
  y: 246,
  width: 280,
  height: 66
} satisfies ButtonRect;

const SHIP_CENTER_X = 748;
const SHIP_BASE_Y = 388;
const GROUND_SURFACE_Y = 398;
const ROBOT_SCALE = 0.88;
const ROBOT_WHEEL_RADIUS = 10 * ROBOT_SCALE;
const ROBOT_WAIT_X = 560;
const ROBOT_GROUND_Y = GROUND_SURFACE_Y - ROBOT_WHEEL_RADIUS;
const KOG_WAIT_X = 526;
const KOG_WAIT_Y = 302;
const RAMP_ANGLE = -0.38;

const DOOR_OPENING_MS = 450;
const BOARDING_END_MS = 1450;
const DOOR_CLOSING_END_MS = 1750;
const IGNITION_END_MS = 2550;
const LIFTOFF_END_MS = 3650;
const BOOST_END_MS = 4300;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function easeOutCubic(value: number) {
  const progress = clamp(value, 0, 1);
  return 1 - (1 - progress) ** 3;
}

function easeInCubic(value: number) {
  const progress = clamp(value, 0, 1);
  return progress ** 3;
}

function easeInOutCubic(value: number) {
  const progress = clamp(value, 0, 1);
  return progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
}

function rotatePoint(x: number, y: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

export class FinalScene implements GameScene {
  id = "final";
  title = "Saída da montanha";
  objective = "Veja o resumo e abra o relatório";
  spawnSide = "left" as const;
  allowJump = false;
  exitMode = "none" as const;
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly reportButton: ButtonRect = REPORT_BUTTON;
  private launchAtMs: number | null = null;
  private clickStartedAtMs: number | null = null;
  private reportOpened = false;

  enter(engine: GameEngine) {
    this.launchAtMs = null;
    this.clickStartedAtMs = null;
    this.reportOpened = false;
    engine.metrics.finalize();
    engine.dialogBox.setLines([
      "A travessia terminou.",
      "O relatório organiza os sinais observados nesta triagem.",
      "Os resultados não representam diagnóstico clínico."
    ]);
  }

  update(engine: GameEngine) {
    if (this.launchAtMs === null || this.reportOpened) {
      return;
    }

    if (engine.timeMs - this.launchAtMs < BOOST_END_MS) {
      return;
    }

    this.reportOpened = true;
    engine.finishAndOpenReport();
  }

  shouldShowHud() {
    return false;
  }

  isMovementEnabled() {
    return false;
  }

  shouldDrawDefaultActors() {
    return false;
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    const cutscene = this.getCutsceneState(engine.timeMs);

    drawCaveBackground(ctx, engine.timeMs, "#f6c55f");
    this.drawSkyAccent(ctx, engine.timeMs);

    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    this.drawScenePanel(ctx, engine.timeMs, cutscene);
    this.drawSummaryPanel(ctx, engine);
    this.drawReportButton(ctx, engine);
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.launchAtMs !== null || engine.dialogBox.isActive || !pointInRect(pointer, this.reportButton)) {
      return;
    }

    this.clickStartedAtMs = engine.timeMs;
    this.launchAtMs = engine.timeMs;
  }

  getCanvasCursor(engine: GameEngine) {
    if (this.launchAtMs !== null || engine.dialogBox.isActive || engine.pointer.pointerType !== "mouse") {
      return "default";
    }

    return pointInRect(engine.pointer, this.reportButton) ? "pointer" : "default";
  }

  private getCutsceneState(timeMs: number): CutsceneState {
    if (this.launchAtMs === null) {
      return {
        phase: "idle",
        elapsedMs: 0,
        doorOpen: 0,
        boardingProgress: 0,
        ignitionProgress: 0,
        liftoffProgress: 0,
        boostProgress: 0,
        shipLift: 0,
        shipShakeX: 0,
        shipShakeY: 0,
        thrusterPower: 0
      };
    }

    const elapsedMs = Math.max(0, timeMs - this.launchAtMs);

    if (elapsedMs < DOOR_OPENING_MS) {
      return {
        phase: "doorOpening",
        elapsedMs,
        doorOpen: easeOutCubic(elapsedMs / DOOR_OPENING_MS),
        boardingProgress: 0,
        ignitionProgress: 0,
        liftoffProgress: 0,
        boostProgress: 0,
        shipLift: 0,
        shipShakeX: 0,
        shipShakeY: 0,
        thrusterPower: 0
      };
    }

    if (elapsedMs < BOARDING_END_MS) {
      return {
        phase: "boarding",
        elapsedMs,
        doorOpen: 1,
        boardingProgress: clamp((elapsedMs - DOOR_OPENING_MS) / (BOARDING_END_MS - DOOR_OPENING_MS), 0, 1),
        ignitionProgress: 0,
        liftoffProgress: 0,
        boostProgress: 0,
        shipLift: 0,
        shipShakeX: 0,
        shipShakeY: 0,
        thrusterPower: 0
      };
    }

    if (elapsedMs < DOOR_CLOSING_END_MS) {
      return {
        phase: "doorClosing",
        elapsedMs,
        doorOpen: 1 - easeInOutCubic((elapsedMs - BOARDING_END_MS) / (DOOR_CLOSING_END_MS - BOARDING_END_MS)),
        boardingProgress: 1,
        ignitionProgress: 0,
        liftoffProgress: 0,
        boostProgress: 0,
        shipLift: 0,
        shipShakeX: 0,
        shipShakeY: 0,
        thrusterPower: 0
      };
    }

    if (elapsedMs < IGNITION_END_MS) {
      const ignitionProgress = clamp((elapsedMs - DOOR_CLOSING_END_MS) / (IGNITION_END_MS - DOOR_CLOSING_END_MS), 0, 1);
      const shakeStrength = 1 + ignitionProgress * 2.8;

      return {
        phase: "ignition",
        elapsedMs,
        doorOpen: 0,
        boardingProgress: 1,
        ignitionProgress,
        liftoffProgress: 0,
        boostProgress: 0,
        shipLift: -ignitionProgress * 2,
        shipShakeX: Math.sin(timeMs / 24) * shakeStrength,
        shipShakeY: Math.cos(timeMs / 29) * shakeStrength * 0.55,
        thrusterPower: 0.34 + easeOutCubic(ignitionProgress) * 0.66
      };
    }

    if (elapsedMs < LIFTOFF_END_MS) {
      const liftoffProgress = clamp((elapsedMs - IGNITION_END_MS) / (LIFTOFF_END_MS - IGNITION_END_MS), 0, 1);

      return {
        phase: "liftoff",
        elapsedMs,
        doorOpen: 0,
        boardingProgress: 1,
        ignitionProgress: 1,
        liftoffProgress,
        boostProgress: 0,
        shipLift: -lerp(0, 116, easeInOutCubic(liftoffProgress)),
        shipShakeX: Math.sin(timeMs / 42) * (1 - liftoffProgress) * 1.5,
        shipShakeY: Math.cos(timeMs / 50) * (1 - liftoffProgress) * 1.1,
        thrusterPower: 0.88 + Math.sin(timeMs / 72) * 0.05
      };
    }

    if (elapsedMs < BOOST_END_MS) {
      const boostProgress = clamp((elapsedMs - LIFTOFF_END_MS) / (BOOST_END_MS - LIFTOFF_END_MS), 0, 1);

      return {
        phase: "boost",
        elapsedMs,
        doorOpen: 0,
        boardingProgress: 1,
        ignitionProgress: 1,
        liftoffProgress: 1,
        boostProgress,
        shipLift: -116 - lerp(0, 470, easeInCubic(boostProgress)),
        shipShakeX: 0,
        shipShakeY: 0,
        thrusterPower: 1
      };
    }

    return {
      phase: "complete",
      elapsedMs,
      doorOpen: 0,
      boardingProgress: 1,
      ignitionProgress: 1,
      liftoffProgress: 1,
      boostProgress: 1,
      shipLift: -586,
      shipShakeX: 0,
      shipShakeY: 0,
      thrusterPower: 1
    };
  }

  private getRampGeometry(shipX: number, shipY: number) {
    const anchorX = shipX - 52;
    const anchorY = shipY - 34;
    const footSurfaceOffset = rotatePoint(-82, 0, RAMP_ANGLE);
    const entrySurfaceOffset = rotatePoint(-4, 0, RAMP_ANGLE);

    return {
      foot: {
        x: anchorX + footSurfaceOffset.x + 8,
        y: anchorY + footSurfaceOffset.y - ROBOT_WHEEL_RADIUS + 1
      },
      entry: {
        x: anchorX + entrySurfaceOffset.x - 2,
        y: anchorY + entrySurfaceOffset.y - ROBOT_WHEEL_RADIUS + 1
      },
      interior: {
        x: shipX - 26,
        y: shipY - 46
      }
    };
  }

  private drawSummaryPanel(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    const snapshot = engine.metrics.snapshot();
    const score = toTriageDisplayScore(engine.liveOverallScore());
    const totalTime = Math.round(snapshot.totalTimeMs / 1000);

    ctx.save();
    drawRoundedRect(ctx, SUMMARY_PANEL.x, SUMMARY_PANEL.y, SUMMARY_PANEL.width, SUMMARY_PANEL.height, 28);
    ctx.fillStyle = "rgba(255, 249, 233, 0.94)";
    ctx.fill();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "rgba(246, 197, 95, 0.16)";
    ctx.beginPath();
    ctx.ellipse(SUMMARY_PANEL.x + 74, SUMMARY_PANEL.y + 56, 82, 42, -0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#173b4f";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "900 34px Trebuchet MS, sans-serif";
    ctx.fillText("Jornada", SUMMARY_PANEL.x + 30, SUMMARY_PANEL.y + 26);
    ctx.fillText("concluída", SUMMARY_PANEL.x + 30, SUMMARY_PANEL.y + 64);

    this.drawSummaryMetric(ctx, SUMMARY_PANEL.x + 30, SUMMARY_PANEL.y + 122, "Índice geral", `${score}/100`);
    this.drawSummaryMetric(ctx, SUMMARY_PANEL.x + 202, SUMMARY_PANEL.y + 122, "Tempo total", `${totalTime}s`);
    ctx.restore();
  }

  private drawSummaryMetric(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string) {
    ctx.save();
    drawRoundedRect(ctx, x, y, 138, 44, 14);
    ctx.fillStyle = "rgba(246, 197, 95, 0.18)";
    ctx.fill();

    ctx.fillStyle = "#5b7280";
    ctx.font = "800 13px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, x + 14, y + 4);

    ctx.fillStyle = "#173b4f";
    ctx.font = "900 22px Trebuchet MS, sans-serif";
    ctx.fillText(value, x + 14, y + 19);
    ctx.restore();
  }

  private drawSkyAccent(ctx: CanvasRenderingContext2D, timeMs: number) {
    const sunGlow = ctx.createRadialGradient(760, 66, 20, 760, 66, 170);
    sunGlow.addColorStop(0, "rgba(255, 245, 202, 0.84)");
    sunGlow.addColorStop(0.44, "rgba(255, 217, 120, 0.28)");
    sunGlow.addColorStop(1, "rgba(255, 217, 120, 0)");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(560, 0, 400, 250);

    ctx.fillStyle = "rgba(255, 249, 233, 0.18)";
    for (let index = 0; index < 5; index += 1) {
      const x = 566 + index * 62 + Math.sin(timeMs / 1200 + index) * 12;
      const y = 74 + (index % 3) * 34;
      ctx.beginPath();
      ctx.ellipse(x, y, 30 + (index % 2) * 12, 12 + (index % 3) * 4, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawScenePanel(ctx: CanvasRenderingContext2D, timeMs: number, cutscene: CutsceneState) {
    ctx.save();
    drawRoundedRect(ctx, SCENE_PANEL.x, SCENE_PANEL.y, SCENE_PANEL.width, SCENE_PANEL.height, 30);
    ctx.fillStyle = "rgba(255, 249, 233, 0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 249, 233, 0.56)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.save();
    drawRoundedRect(ctx, SCENE_PANEL.x + 6, SCENE_PANEL.y + 6, SCENE_PANEL.width - 12, SCENE_PANEL.height - 12, 24);
    ctx.clip();

    const panelGradient = ctx.createLinearGradient(0, SCENE_PANEL.y, 0, SCENE_PANEL.y + SCENE_PANEL.height);
    panelGradient.addColorStop(0, "#d9f4ff");
    panelGradient.addColorStop(0.58, "#7ec7dc");
    panelGradient.addColorStop(1, "#3c7481");
    ctx.fillStyle = panelGradient;
    ctx.fillRect(SCENE_PANEL.x, SCENE_PANEL.y, SCENE_PANEL.width, SCENE_PANEL.height);

    const lightColumn = ctx.createLinearGradient(640, SCENE_PANEL.y, 820, SCENE_PANEL.y + SCENE_PANEL.height);
    lightColumn.addColorStop(0, "rgba(255, 244, 173, 0.26)");
    lightColumn.addColorStop(1, "rgba(255, 244, 173, 0)");
    ctx.fillStyle = lightColumn;
    ctx.fillRect(622, 34, 250, 370);

    ctx.fillStyle = "rgba(255, 249, 233, 0.26)";
    for (let index = 0; index < 7; index += 1) {
      const x = 510 + index * 58 + Math.sin(timeMs / 1000 + index * 0.9) * 18;
      const y = 96 + (index % 4) * 28;
      ctx.beginPath();
      ctx.ellipse(x, y, 34 + (index % 2) * 12, 14 + (index % 3) * 4, -0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#5d7a88";
    ctx.beginPath();
    ctx.moveTo(796, 342);
    ctx.lineTo(828, 308);
    ctx.lineTo(850, 326);
    ctx.lineTo(868, 314);
    ctx.lineTo(900, 344);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#476774";
    ctx.beginPath();
    ctx.moveTo(804, 344);
    ctx.lineTo(832, 320);
    ctx.lineTo(848, 334);
    ctx.lineTo(870, 322);
    ctx.lineTo(894, 346);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#3d6f55";
    ctx.beginPath();
    ctx.moveTo(432, 384);
    ctx.lineTo(432, 342);
    ctx.quadraticCurveTo(534, 318, 610, 332);
    ctx.quadraticCurveTo(702, 350, 814, 334);
    ctx.quadraticCurveTo(874, 326, 918, 346);
    ctx.lineTo(918, 384);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#2d5d49";
    ctx.beginPath();
    ctx.moveTo(432, 384);
    ctx.lineTo(432, 360);
    ctx.quadraticCurveTo(554, 344, 632, 354);
    ctx.quadraticCurveTo(738, 368, 918, 352);
    ctx.lineTo(918, 384);
    ctx.closePath();
    ctx.fill();

    if (cutscene.thrusterPower > 0) {
      ctx.fillStyle = `rgba(255, 187, 88, ${0.12 + cutscene.thrusterPower * 0.24})`;
      ctx.beginPath();
      ctx.ellipse(SHIP_CENTER_X, GROUND_SURFACE_Y + 4, 92 + cutscene.thrusterPower * 18, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(176, 236, 179, 0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(432, GROUND_SURFACE_Y - 4);
    ctx.quadraticCurveTo(542, 370, 620, 376);
    ctx.quadraticCurveTo(730, 386, 918, 368);
    ctx.stroke();
    ctx.restore();

    this.drawShipShadow(ctx, cutscene);
    this.drawBoardingCharacters(ctx, timeMs, cutscene);
    this.drawShip(ctx, timeMs, cutscene);
    ctx.restore();
  }

  private drawShipShadow(ctx: CanvasRenderingContext2D, cutscene: CutsceneState) {
    const liftRatio = clamp((-cutscene.shipLift) / 586, 0, 1);
    const shadowScale = 1 - liftRatio * 0.46;
    const shadowAlpha = 0.22 - liftRatio * 0.14;

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.05, shadowAlpha)})`;
    ctx.beginPath();
    ctx.ellipse(SHIP_CENTER_X, GROUND_SURFACE_Y + 4, 72 * shadowScale, 18 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBoardingCharacters(ctx: CanvasRenderingContext2D, timeMs: number, cutscene: CutsceneState) {
    const robot = this.getRobotPlacement(cutscene);
    const kog = this.getKogPlacement(timeMs, cutscene);

    if (robot.alpha > 0.02) {
      this.drawRobot(ctx, robot);
    }

    if (kog.alpha > 0.02) {
      this.drawKog(ctx, kog.x, kog.y, timeMs, kog.alpha);
    }
  }

  private getRobotPlacement(cutscene: CutsceneState): RobotPlacement {
    const ramp = this.getRampGeometry(SHIP_CENTER_X, SHIP_BASE_Y);

    if (
      cutscene.phase === "doorClosing" ||
      cutscene.phase === "ignition" ||
      cutscene.phase === "liftoff" ||
      cutscene.phase === "boost" ||
      cutscene.phase === "complete"
    ) {
      return { x: ramp.interior.x, y: ramp.interior.y, alpha: 0, rotation: 0, driveProgress: 0, moving: false };
    }

    if (cutscene.phase === "idle" || cutscene.phase === "doorOpening") {
      return { x: ROBOT_WAIT_X, y: ROBOT_GROUND_Y, alpha: 1, rotation: 0, driveProgress: 0, moving: false };
    }

    if (cutscene.boardingProgress < 0.56) {
      const progress = easeInOutCubic(cutscene.boardingProgress / 0.56);
      return {
        x: lerp(ROBOT_WAIT_X, ramp.foot.x - 18, progress),
        y: ROBOT_GROUND_Y,
        alpha: 1,
        rotation: 0,
        driveProgress: progress,
        moving: true
      };
    }

    if (cutscene.boardingProgress < 0.9) {
      const progress = easeInOutCubic((cutscene.boardingProgress - 0.56) / 0.34);
      return {
        x: lerp(ramp.foot.x - 18, ramp.entry.x, progress),
        y: lerp(ROBOT_GROUND_Y, ramp.entry.y, progress),
        alpha: 1,
        rotation: RAMP_ANGLE,
        driveProgress: 1 + progress,
        moving: true
      };
    }

    const progress = easeInOutCubic((cutscene.boardingProgress - 0.9) / 0.1);
    return {
      x: lerp(ramp.entry.x, ramp.interior.x, progress),
      y: lerp(ramp.entry.y, ramp.interior.y, progress),
      alpha: 1 - progress,
      rotation: lerp(RAMP_ANGLE, 0, progress),
      driveProgress: 2 + progress,
      moving: true
    };
  }

  private getKogPlacement(timeMs: number, cutscene: CutsceneState): CharacterPlacement {
    const floatOffset = Math.sin(timeMs / 360) * 4;
    const ramp = this.getRampGeometry(SHIP_CENTER_X, SHIP_BASE_Y);

    if (
      cutscene.phase === "doorClosing" ||
      cutscene.phase === "ignition" ||
      cutscene.phase === "liftoff" ||
      cutscene.phase === "boost" ||
      cutscene.phase === "complete"
    ) {
      return { x: ramp.interior.x + 8, y: ramp.interior.y - 40, alpha: 0 };
    }

    if (cutscene.phase === "idle" || cutscene.phase === "doorOpening") {
      return { x: KOG_WAIT_X, y: KOG_WAIT_Y + floatOffset, alpha: 1 };
    }

    if (cutscene.boardingProgress < 0.62) {
      const progress = easeInOutCubic(cutscene.boardingProgress / 0.62);
      return {
        x: lerp(KOG_WAIT_X, ramp.entry.x - 28, progress),
        y: lerp(KOG_WAIT_Y, ramp.entry.y - 48, progress) + floatOffset * 0.4,
        alpha: 1
      };
    }

    if (cutscene.boardingProgress < 0.9) {
      const progress = easeInOutCubic((cutscene.boardingProgress - 0.62) / 0.28);
      return {
        x: lerp(ramp.entry.x - 28, ramp.interior.x + 8, progress),
        y: lerp(ramp.entry.y - 48, ramp.interior.y - 44, progress) + floatOffset * 0.2,
        alpha: 1
      };
    }

    const progress = easeInOutCubic((cutscene.boardingProgress - 0.9) / 0.1);
    return {
      x: lerp(ramp.interior.x + 8, ramp.interior.x + 22, progress),
      y: lerp(ramp.interior.y - 44, ramp.interior.y - 48, progress),
      alpha: 1 - progress
    };
  }

  private drawRobot(ctx: CanvasRenderingContext2D, robot: RobotPlacement) {
    const bodyY = -30;
    const headY = -46;
    const wheelY = 0;
    const bounce = robot.moving ? Math.sin(robot.driveProgress * Math.PI * 6) * 0.8 : 0;
    const bodyTilt = robot.rotation + (robot.moving ? Math.sin(robot.driveProgress * Math.PI * 4) * 0.015 : 0);
    const wheelRotation = robot.moving ? robot.driveProgress * Math.PI * 7 : 0;

    ctx.save();
    ctx.globalAlpha = robot.alpha * 0.28;
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.beginPath();
    ctx.ellipse(robot.x, robot.y + 10, 20, 6, robot.rotation, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = robot.alpha;
    ctx.translate(robot.x, robot.y + bounce);
    ctx.rotate(bodyTilt);
    ctx.scale(ROBOT_SCALE, ROBOT_SCALE);

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    this.drawRobotSpring(ctx, -12, bodyY + 14, wheelY - 10);
    this.drawRobotSpring(ctx, 12, bodyY + 14, wheelY - 10);

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

    this.drawRobotWheel(ctx, -13, wheelY, wheelRotation);
    this.drawRobotWheel(ctx, 13, wheelY, wheelRotation);
    ctx.restore();
  }

  private drawRobotSpring(ctx: CanvasRenderingContext2D, x: number, topY: number, bottomY: number) {
    const segmentHeight = (bottomY - topY) / 4;

    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(x - 3, topY + segmentHeight);
    ctx.lineTo(x + 3, topY + segmentHeight * 2);
    ctx.lineTo(x - 3, topY + segmentHeight * 3);
    ctx.lineTo(x, bottomY);
    ctx.stroke();
  }

  private drawRobotWheel(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number) {
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

  private drawKog(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number, alpha: number) {
    const haloPulse = 1 + Math.sin(timeMs / 320) * 0.04;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(0.5, 0.5);

    ctx.fillStyle = "rgba(111, 214, 197, 0.16)";
    ctx.beginPath();
    ctx.ellipse(0, 8, 42 * haloPulse, 14 * haloPulse, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#dff7f3";
    ctx.beginPath();
    ctx.ellipse(0, -22, 45, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -22, 7, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.arc(0, -22, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff9e9";
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-40, 22);
    ctx.bezierCurveTo(-46, -16, -24, -46, 0, -46);
    ctx.bezierCurveTo(24, -46, 46, -16, 40, 22);
    ctx.bezierCurveTo(36, 48, 18, 62, 0, 62);
    ctx.bezierCurveTo(-18, 62, -36, 48, -40, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.ellipse(0, 14, 32, 31, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6fd6c5";
    ctx.beginPath();
    ctx.arc(0, 14, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(6, 8, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-40, 32);
    ctx.lineTo(-64, 48);
    ctx.moveTo(40, 32);
    ctx.lineTo(64, 48);
    ctx.stroke();
    ctx.restore();
  }

  private drawShip(ctx: CanvasRenderingContext2D, timeMs: number, cutscene: CutsceneState) {
    const shipX = SHIP_CENTER_X + cutscene.shipShakeX;
    const shipBaseY = SHIP_BASE_Y + cutscene.shipLift + cutscene.shipShakeY;

    if (cutscene.thrusterPower > 0) {
      this.drawThrusterFlames(ctx, shipX, shipBaseY, timeMs, cutscene.thrusterPower, cutscene.phase === "boost");
    }

    ctx.save();
    ctx.translate(shipX, shipBaseY);

    ctx.fillStyle = "rgba(255, 249, 233, 0.14)";
    ctx.beginPath();
    ctx.ellipse(0, -84, 52, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    const hullGradient = ctx.createLinearGradient(-52, -166, 52, 0);
    hullGradient.addColorStop(0, "#fdf7df");
    hullGradient.addColorStop(0.45, "#f6cf7d");
    hullGradient.addColorStop(1, "#dd8b53");
    ctx.fillStyle = hullGradient;
    ctx.beginPath();
    ctx.roundRect(-50, -150, 100, 142, 40);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-32, -146);
    ctx.quadraticCurveTo(0, -188, 32, -146);
    ctx.lineTo(20, -138);
    ctx.quadraticCurveTo(0, -164, -20, -138);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(-50, -150, 100, 142, 40);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-32, -146);
    ctx.quadraticCurveTo(0, -188, 32, -146);
    ctx.stroke();

    ctx.fillStyle = "#274958";
    ctx.beginPath();
    ctx.roundRect(-22, -132, 44, 50, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#85f4f1";
    ctx.beginPath();
    ctx.roundRect(-18, -128, 36, 42, 18);
    ctx.fill();

    for (const offset of [-26, 0, 26]) {
      ctx.fillStyle = "#fff9e9";
      ctx.beginPath();
      ctx.arc(offset, -56, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = offset === 0 ? "#6fd6c5" : "#f06f59";
      ctx.beginPath();
      ctx.arc(offset, -56, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#4d7081";
    ctx.beginPath();
    ctx.roundRect(-40, -12, 80, 20, 10);
    ctx.fill();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#173b4f";
    ctx.beginPath();
    ctx.roundRect(-28, -4, 56, 16, 7);
    ctx.fill();

    if (cutscene.doorOpen > 0.01) {
      ctx.fillStyle = "#102430";
      ctx.beginPath();
      ctx.roundRect(-52, -108, 32, 74, 12);
      ctx.fill();

      ctx.save();
      ctx.translate(0, -cutscene.doorOpen * 42);
      ctx.fillStyle = "#efb55f";
      ctx.beginPath();
      ctx.roundRect(-52, -108, 32, 74, 12);
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(-52, -34);
      ctx.rotate(-cutscene.doorOpen * 0.38);
      ctx.fillStyle = "#e6c67b";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-82, 0);
      ctx.lineTo(-112, 32);
      ctx.lineTo(-26, 32);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.strokeStyle = "rgba(23, 59, 79, 0.22)";
      ctx.lineWidth = 2;
      for (let index = 0; index < 3; index += 1) {
        const rampX = -90 + index * 22;
        ctx.beginPath();
        ctx.moveTo(rampX, 2);
        ctx.lineTo(rampX - 18, 26);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = "#efb55f";
      ctx.beginPath();
      ctx.roundRect(-52, -108, 32, 74, 12);
      ctx.fill();
      ctx.strokeStyle = "#173b4f";
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawThrusterFlames(
    ctx: CanvasRenderingContext2D,
    shipX: number,
    shipBaseY: number,
    timeMs: number,
    power: number,
    boosting: boolean
  ) {
    const intensity = clamp(power, 0, 1);
    const primaryLength = lerp(34, boosting ? 250 : 142, intensity);
    const sideLength = primaryLength * 0.66;
    const flutter = 0.86 + Math.sin(timeMs / 42) * 0.08;

    ctx.save();
    ctx.fillStyle = `rgba(255, 209, 114, ${0.18 + intensity * 0.34})`;
    ctx.beginPath();
    ctx.ellipse(shipX, shipBaseY + 18, 70 + intensity * 22, 18 + intensity * 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const outerFlame = ctx.createLinearGradient(shipX, shipBaseY, shipX, shipBaseY + primaryLength);
    outerFlame.addColorStop(0, "rgba(255, 249, 233, 0.95)");
    outerFlame.addColorStop(0.26, "rgba(255, 212, 102, 0.96)");
    outerFlame.addColorStop(0.7, "rgba(240, 111, 89, 0.86)");
    outerFlame.addColorStop(1, "rgba(240, 111, 89, 0)");
    ctx.fillStyle = outerFlame;
    ctx.beginPath();
    ctx.moveTo(shipX - 18, shipBaseY + 4);
    ctx.bezierCurveTo(
      shipX - 34 * flutter,
      shipBaseY + primaryLength * 0.34,
      shipX - 20 * flutter,
      shipBaseY + primaryLength * 0.72,
      shipX,
      shipBaseY + primaryLength
    );
    ctx.bezierCurveTo(
      shipX + 20 * flutter,
      shipBaseY + primaryLength * 0.72,
      shipX + 34 * flutter,
      shipBaseY + primaryLength * 0.34,
      shipX + 18,
      shipBaseY + 4
    );
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 249, 233, 0.94)";
    ctx.beginPath();
    ctx.moveTo(shipX - 10, shipBaseY + 2);
    ctx.bezierCurveTo(
      shipX - 20,
      shipBaseY + sideLength * 0.25,
      shipX - 10,
      shipBaseY + sideLength * 0.58,
      shipX,
      shipBaseY + sideLength * 0.78
    );
    ctx.bezierCurveTo(
      shipX + 10,
      shipBaseY + sideLength * 0.58,
      shipX + 20,
      shipBaseY + sideLength * 0.25,
      shipX + 10,
      shipBaseY + 2
    );
    ctx.closePath();
    ctx.fill();

    for (const offset of [-28, 28]) {
      const sideGradient = ctx.createLinearGradient(shipX + offset, shipBaseY, shipX + offset, shipBaseY + sideLength);
      sideGradient.addColorStop(0, "rgba(255, 236, 170, 0.88)");
      sideGradient.addColorStop(0.5, "rgba(246, 197, 95, 0.82)");
      sideGradient.addColorStop(1, "rgba(240, 111, 89, 0)");
      ctx.fillStyle = sideGradient;
      ctx.beginPath();
      ctx.moveTo(shipX + offset - 8, shipBaseY + 4);
      ctx.quadraticCurveTo(shipX + offset - 20, shipBaseY + sideLength * 0.45, shipX + offset, shipBaseY + sideLength);
      ctx.quadraticCurveTo(shipX + offset + 20, shipBaseY + sideLength * 0.45, shipX + offset + 8, shipBaseY + 4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawReportButton(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    const hovered =
      this.launchAtMs === null &&
      !engine.dialogBox.isActive &&
      engine.pointer.inside &&
      engine.pointer.pointerType === "mouse" &&
      pointInRect(engine.pointer, this.reportButton);
    const launching = this.launchAtMs !== null;
    const pressElapsed = this.clickStartedAtMs === null ? Number.POSITIVE_INFINITY : engine.timeMs - this.clickStartedAtMs;
    const pressed = launching || pressElapsed < 180;
    const lift = launching ? 2 : hovered ? -3 : 0;
    const buttonY = this.reportButton.y + (pressed ? 4 : lift);
    const shadowBlur = launching ? 24 : hovered ? 18 : 10;
    const glowAlpha = launching ? 0.4 : hovered ? 0.22 : 0.1;

    ctx.save();
    ctx.shadowColor = `rgba(23, 59, 79, ${glowAlpha})`;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetY = pressed ? 2 : 8;
    drawRoundedRect(ctx, this.reportButton.x, buttonY, this.reportButton.width, this.reportButton.height, 16);
    const buttonGradient = ctx.createLinearGradient(0, buttonY, 0, buttonY + this.reportButton.height);
    buttonGradient.addColorStop(0, launching ? "#ffeeb6" : hovered ? "#ffe38c" : "#f6c55f");
    buttonGradient.addColorStop(1, launching ? "#f7c44f" : "#efb844");
    ctx.fillStyle = buttonGradient;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, this.reportButton.x, buttonY, this.reportButton.width, this.reportButton.height, 16);
    ctx.stroke();

    if (launching) {
      ctx.save();
      drawRoundedRect(ctx, this.reportButton.x + 3, buttonY + 3, this.reportButton.width - 6, this.reportButton.height - 6, 13);
      ctx.clip();
      const scanX = this.reportButton.x - 120 + ((engine.timeMs - (this.clickStartedAtMs ?? engine.timeMs)) % 520);
      const scan = ctx.createLinearGradient(scanX, 0, scanX + 120, 0);
      scan.addColorStop(0, "rgba(255, 255, 255, 0)");
      scan.addColorStop(0.5, "rgba(255, 255, 255, 0.38)");
      scan.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = scan;
      ctx.fillRect(this.reportButton.x, buttonY, this.reportButton.width, this.reportButton.height);
      ctx.restore();
    }

    ctx.fillStyle = "#173b4f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 24px Trebuchet MS, sans-serif";

    if (launching) {
      this.drawButtonLoadingState(ctx, engine, buttonY);
    } else {
      ctx.fillText(this.reportButton.label, this.reportButton.x + this.reportButton.width / 2, buttonY + 33);
    }

    ctx.restore();
  }

  private drawButtonLoadingState(ctx: CanvasRenderingContext2D, engine: GameEngine, buttonY: number) {
    const loadingLabel = "Decolando...";
    const spinnerRotation = ((engine.timeMs - (this.clickStartedAtMs ?? engine.timeMs)) / 220) * Math.PI * 2;
    const spinnerRadius = 8;
    const spinnerDiameter = spinnerRadius * 2;
    const gap = 12;
    const centerX = this.reportButton.x + this.reportButton.width / 2;
    const centerY = buttonY + this.reportButton.height / 2;
    const labelWidth = ctx.measureText(loadingLabel).width;
    const totalWidth = spinnerDiameter + gap + labelWidth;
    const spinnerX = centerX - totalWidth / 2 + spinnerRadius;
    const labelX = spinnerX + spinnerRadius + gap;

    ctx.save();
    ctx.translate(spinnerX, centerY);
    ctx.rotate(spinnerRotation);
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(23, 59, 79, 0.24)";
    ctx.beginPath();
    ctx.arc(0, 0, spinnerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#173b4f";
    ctx.beginPath();
    ctx.arc(0, 0, spinnerRadius, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(loadingLabel, labelX, centerY);
    ctx.restore();
  }
}
