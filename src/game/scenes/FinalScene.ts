import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import { type ButtonRect, drawCaveBackground, drawPlatform, drawRoundedRect, pointInRect } from "@/game/scenes/sceneUtils";
import { toTriageDisplayScore } from "@/report/triagePresentation";

export class FinalScene implements GameScene {
  id = "final";
  title = "Saída da montanha";
  objective = "Veja o resumo e abra o relatório";
  spawnSide = "left" as const;
  allowJump = false;
  exitMode = "none" as const;
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly reportButton: ButtonRect = {
    label: "Mostrar relatório",
    x: 342,
    y: 326,
    width: 276,
    height: 66
  };
  private launchAtMs: number | null = null;
  private clickStartedAtMs: number | null = null;
  private reportOpened = false;

  enter(engine: GameEngine) {
    this.launchAtMs = null;
    this.clickStartedAtMs = null;
    this.reportOpened = false;
    engine.dialogBox.setLines([
      "A travessia terminou.",
      "O relatório organiza os sinais observados nesta triagem.",
      "Os resultados não representam diagnóstico clínico."
    ]);
  }

  update(engine: GameEngine) {
    if (this.launchAtMs === null || this.reportOpened || engine.timeMs < this.launchAtMs) {
      return;
    }

    this.reportOpened = true;
    engine.finishAndOpenReport();
  }

  getHudMessage() {
    return "Esta experiência possui caráter de triagem lúdica e indicativa.";
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#f6c55f");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    ctx.fillStyle = "rgba(255, 249, 233, 0.92)";
    ctx.beginPath();
    ctx.roundRect(238, 126, 484, 172, 24);
    ctx.fill();
    ctx.strokeStyle = "#173b4f";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#173b4f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 34px Trebuchet MS, sans-serif";
    ctx.fillText("Jornada concluída", 480, 172);
    ctx.font = "800 20px Trebuchet MS, sans-serif";
    ctx.fillText(`Índice geral de triagem: ${toTriageDisplayScore(engine.liveOverallScore())}/100`, 480, 220);
    ctx.fillText(`Tempo total: ${Math.round(engine.metrics.snapshot().totalTimeMs / 1000)}s`, 480, 254);

    this.drawReportButton(ctx, engine);
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (this.launchAtMs !== null || !pointInRect(pointer, this.reportButton)) {
      return;
    }

    this.clickStartedAtMs = engine.timeMs;
    this.launchAtMs = engine.timeMs + 620;
  }

  getCanvasCursor(engine: GameEngine) {
    if (this.launchAtMs !== null || engine.pointer.pointerType !== "mouse") {
      return "default";
    }

    return pointInRect(engine.pointer, this.reportButton) ? "pointer" : "default";
  }

  private drawReportButton(ctx: CanvasRenderingContext2D, engine: GameEngine) {
    const hovered =
      this.launchAtMs === null &&
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
    ctx.fillText(this.reportButton.label, this.reportButton.x + this.reportButton.width / 2, buttonY + 33);
    ctx.restore();

    if (launching) {
      ctx.fillStyle = "#173b4f";
      ctx.font = "800 15px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("IA analisando os dados da sessão...", 480, 414);
    }
  }
}
