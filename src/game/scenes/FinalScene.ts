import type { GameEngine, GameScene, Platform, PointerPosition } from "@/game/engine/GameEngine";
import {
  type ButtonRect,
  drawCaveBackground,
  drawChoiceButton,
  drawPanelText,
  drawPlatform,
  pointInRect
} from "@/game/scenes/sceneUtils";

export class FinalScene implements GameScene {
  id = "final";
  title = "Saída da montanha";
  objective = "Veja o resumo e abra o relatório";
  platforms: Platform[] = [{ x: 0, y: 454, width: 960, height: 86 }];

  private readonly reportButton: ButtonRect = {
    label: "Mostrar relatório",
    x: 342,
    y: 326,
    width: 276,
    height: 66
  };

  enter(engine: GameEngine) {
    engine.dialogBox.setLines([
      "A travessia terminou.",
      "O relatório mostra apenas sinais observados durante a experiência.",
      "Os resultados não representam diagnóstico clínico."
    ]);
  }

  update() {
    return;
  }

  draw(engine: GameEngine, ctx: CanvasRenderingContext2D) {
    drawCaveBackground(ctx, engine.timeMs, "#f6c55f");
    for (const platform of this.platforms) {
      drawPlatform(ctx, platform);
    }

    drawPanelText(ctx, "Nave recuperada", "Esta experiência possui caráter apenas educativo e indicativo.");

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
    ctx.fillText(`Pontuação geral: ${engine.liveOverallScore()}/100`, 480, 220);
    ctx.fillText(`Tempo total: ${Math.round(engine.metrics.snapshot().totalTimeMs / 1000)}s`, 480, 254);

    drawChoiceButton(ctx, this.reportButton, true);
  }

  onClick(engine: GameEngine, pointer: PointerPosition) {
    if (pointInRect(pointer, this.reportButton)) {
      engine.finishAndOpenReport();
    }
  }

  onKeyDown(engine: GameEngine, key: string) {
    if (key === "Enter" && !engine.dialogBox.isActive) {
      engine.finishAndOpenReport();
    }
  }

  enterReport(engine: GameEngine) {
    engine.finishAndOpenReport();
  }
}
