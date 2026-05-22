import assert from "node:assert/strict";
import {
  buildIshiharaPlate,
  createColorTrialSpec,
  rasterizeIshiharaPlate,
  type ColorDifficulty,
  type ColorPlateType,
  type IshiharaPlate
} from "../src/colorblind/plates";

const TYPES: ColorPlateType[] = ["redGreen", "blueYellow", "lowContrast"];
const DIFFICULTIES: ColorDifficulty[] = ["medium", "hard", "expert"];
const DIGITS = "0123456789".split("");

function hiddenRatio(plate: IshiharaPlate) {
  const hiddenDots = plate.dots.filter((dot) => dot.isHidden).length;
  return hiddenDots / Math.max(1, plate.dots.length);
}

function hiddenCenter(plate: IshiharaPlate) {
  const hiddenDots = plate.dots.filter((dot) => dot.isHidden);
  const totalWeight = hiddenDots.reduce((sum, dot) => sum + dot.radius * dot.radius, 0);

  if (totalWeight <= 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: hiddenDots.reduce((sum, dot) => sum + dot.x * dot.radius * dot.radius, 0) / totalWeight,
    y: hiddenDots.reduce((sum, dot) => sum + dot.y * dot.radius * dot.radius, 0) / totalWeight
  };
}

function rasterHash(plate: ReturnType<typeof rasterizeIshiharaPlate>) {
  let hash = 2166136261;

  for (const value of plate.data) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateDeterminism() {
  const trial = createColorTrialSpec("8", "redGreen", "medium", 90210);
  const firstPlate = buildIshiharaPlate(trial);
  const secondPlate = buildIshiharaPlate(trial);
  const firstRaster = rasterizeIshiharaPlate(trial, 28);
  const secondRaster = rasterizeIshiharaPlate(trial, 28);

  assert.deepStrictEqual(secondPlate, firstPlate, "A mesma seed deve gerar a mesma placa.");
  assert.equal(rasterHash(firstRaster), rasterHash(secondRaster), "A mesma seed deve gerar o mesmo raster.");
}

function validateBoundsAndCenter() {
  for (const type of TYPES) {
    for (const difficulty of DIFFICULTIES) {
      for (const digit of DIGITS) {
        const trial = createColorTrialSpec(digit, type, difficulty, 12000 + digit.charCodeAt(0) * 31 + difficulty.length);
        const plate = buildIshiharaPlate(trial);
        const center = hiddenCenter(plate);

        for (const dot of plate.dots) {
          assert.ok(
            Math.hypot(dot.x, dot.y) + dot.radius <= 0.985001,
            `${type}/${difficulty}/${digit}: encontrou ponto fora do disco da placa.`
          );
        }

        assert.ok(
          Math.abs(center.x) <= 0.17 && Math.abs(center.y) <= 0.18,
          `${type}/${difficulty}/${digit}: centro do dígito saiu do miolo da placa (${center.x.toFixed(3)}, ${center.y.toFixed(3)}).`
        );
      }
    }
  }
}

function validateRatios() {
  const summaries: string[] = [];

  for (const type of TYPES) {
    const sampleRatios: string[] = [];

    for (const digit of ["1", "6", "8"]) {
      const sampleTrial = createColorTrialSpec(digit, type, "medium", 31000 + digit.charCodeAt(0) * 13);
      const samplePlate = buildIshiharaPlate(sampleTrial);
      sampleRatios.push(`${digit}=${hiddenRatio(samplePlate).toFixed(3)}`);
    }

    summaries.push(`${type}: ${sampleRatios.join(" | ")}`);
  }

  for (const type of TYPES) {
    for (const difficulty of DIFFICULTIES) {
      for (const digit of DIGITS) {
        const trial = createColorTrialSpec(digit, type, difficulty, 18000 + digit.charCodeAt(0) * 29 + difficulty.length * 17);
        const plate = buildIshiharaPlate(trial);
        const ratio = hiddenRatio(plate);

        assert.ok(ratio >= 0.16, `${type}/${difficulty}/${digit}: dígito ficou pequeno demais (${ratio.toFixed(3)}).`);
        assert.ok(ratio <= 0.45, `${type}/${difficulty}/${digit}: dígito ficou grande demais (${ratio.toFixed(3)}).`);
      }
    }
  }

  console.log("[validate:colorblind-plates] Ratios de amostra (medium):");
  for (const summary of summaries) {
    console.log(`[validate:colorblind-plates] ${summary}`);
  }
}

function main() {
  validateDeterminism();
  validateBoundsAndCenter();
  validateRatios();
  console.log("[validate:colorblind-plates] Todas as checagens passaram.");
}

main();
