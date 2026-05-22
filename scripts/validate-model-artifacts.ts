import * as fs from "node:fs/promises";
import path from "node:path";
import {
  buildColorblindFeatureVectorFromPhase,
  type ColorblindModelMetadata
} from "../src/ai/colorblindFeatures";
import {
  buildCognitivePerformanceFeatureVectorFromValues,
  type CognitivePerformanceModelMetadata
} from "../src/ai/cognitivePerformanceFeatures";
import {
  buildDyslexiaFeatureVectorFromAggregate,
  type DyslexiaModelMetadata,
  type DyslexiaRiskMapping
} from "../src/ai/dyslexiaFeatures";
import {
  buildReactionTimeFeatureVectorFromValues,
  type ReactionTimeModelMetadata
} from "../src/ai/reactionTimeFeatures";

type ModelArtifacts<TMetadata> = {
  metadata: TMetadata;
  weights: Record<string, number[]>;
};

function relu(values: number[]) {
  return values.map((value) => Math.max(0, value));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function softmax(values: number[]) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return exps.map((value) => value / total);
}

function multiplyDense(input: number[], rows: number, columns: number, weights: number[]) {
  const output = new Array(columns).fill(0);

  for (let column = 0; column < columns; column += 1) {
    let total = 0;

    for (let row = 0; row < rows; row += 1) {
      total += (input[row] ?? 0) * (weights[row * columns + column] ?? 0);
    }

    output[column] = total;
  }

  return output;
}

function addBias(values: number[], bias: number[]) {
  return values.map((value, index) => value + (bias[index] ?? 0));
}

function findWeight(weights: Record<string, number[]>, suffix: string) {
  const key = Object.keys(weights).find((candidate) => candidate.endsWith(suffix));

  if (!key) {
    throw new Error(`Missing weight tensor ${suffix}.`);
  }

  return weights[key]!;
}

function runDenseModel(input: number[], weights: Record<string, number[]>) {
  const dense1Bias = findWeight(weights, "Dense1/bias");
  const dense2Bias = findWeight(weights, "Dense2/bias");
  const dense3Bias = findWeight(weights, "Dense3/bias");
  let layer = relu(addBias(multiplyDense(input, input.length, dense1Bias.length, findWeight(weights, "Dense1/kernel")), dense1Bias));
  layer = relu(addBias(multiplyDense(layer, layer.length, dense2Bias.length, findWeight(weights, "Dense2/kernel")), dense2Bias));
  layer = addBias(multiplyDense(layer, layer.length, dense3Bias.length, findWeight(weights, "Dense3/kernel")), dense3Bias);

  return dense3Bias.length === 1 ? [sigmoid(layer[0] ?? 0)] : softmax(layer);
}

function normalizeFeatureVector<
  TMetadata extends {
    normalization: Array<{
      mean: number;
      std: number;
    }>;
  }
>(featureVector: number[], metadata: TMetadata) {
  return metadata.normalization.map(({ mean, std }, index) => ((featureVector[index] ?? 0) - mean) / (std || 1));
}

function readFloat32Array(buffer: Buffer, offsetBytes: number, count: number) {
  return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset + offsetBytes, count));
}

async function loadArtifacts<TMetadata>(modelDir: string) {
  const rootDir = path.resolve(modelDir);
  const modelJson = JSON.parse(await fs.readFile(path.join(rootDir, "model.json"), "utf8")) as {
    weightsManifest: Array<{
      weights: Array<{
        name: string;
        shape: number[];
      }>;
    }>;
  };
  const metadata = JSON.parse(await fs.readFile(path.join(rootDir, "normalization.json"), "utf8")) as TMetadata;
  const weightBuffer = await fs.readFile(path.join(rootDir, "group1-shard1of1.bin"));
  const weights: Record<string, number[]> = {};
  let offsetBytes = 0;

  for (const spec of modelJson.weightsManifest[0]?.weights ?? []) {
    const size = spec.shape.reduce((product, dimension) => product * dimension, 1);
    weights[spec.name] = readFloat32Array(weightBuffer, offsetBytes, size);
    offsetBytes += size * 4;
  }

  return {
    metadata,
    weights
  } satisfies ModelArtifacts<TMetadata>;
}

function toDyslexiaRisk(probability: number, riskMapping: DyslexiaRiskMapping) {
  const mapped = riskMapping === "oneMinusProbability" ? 1 - probability : probability;
  return Math.max(0, Math.min(100, Math.round(mapped * 100)));
}

function reactionPerformance(probabilities: number[]) {
  return Math.round((probabilities[0] ?? 0) * 100 + (probabilities[1] ?? 0) * 50);
}

async function main() {
  const dyslexia = await loadArtifacts<DyslexiaModelMetadata>("models/dyslexia");
  const colorblind = await loadArtifacts<ColorblindModelMetadata>("models/colorblind");
  const reaction = await loadArtifacts<ReactionTimeModelMetadata>("models/reactiontime");
  const cognitive = await loadArtifacts<CognitivePerformanceModelMetadata>("models/cognitiveperformance");

  const dyslexiaGoodVector = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 6,
    totalClicks: 24,
    totalHits: 24,
    totalMisses: 0
  });
  const dyslexiaBadVector = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 6,
    totalClicks: 48,
    totalHits: 12,
    totalMisses: 18
  });
  const dyslexiaGameGoodVector = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 3,
    totalClicks: 12,
    totalHits: 12,
    totalMisses: 0
  });
  const dyslexiaGameBadVector = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 3,
    totalClicks: 18,
    totalHits: 8,
    totalMisses: 6
  });
  const dyslexiaGoodRisk = toDyslexiaRisk(
    runDenseModel(normalizeFeatureVector(dyslexiaGoodVector, dyslexia.metadata), dyslexia.weights)[0] ?? 0,
    dyslexia.metadata.riskMapping
  );
  const dyslexiaBadRisk = toDyslexiaRisk(
    runDenseModel(normalizeFeatureVector(dyslexiaBadVector, dyslexia.metadata), dyslexia.weights)[0] ?? 0,
    dyslexia.metadata.riskMapping
  );
  const dyslexiaGameGoodRisk = toDyslexiaRisk(
    runDenseModel(normalizeFeatureVector(dyslexiaGameGoodVector, dyslexia.metadata), dyslexia.weights)[0] ?? 0,
    dyslexia.metadata.riskMapping
  );
  const dyslexiaGameBadRisk = toDyslexiaRisk(
    runDenseModel(normalizeFeatureVector(dyslexiaGameBadVector, dyslexia.metadata), dyslexia.weights)[0] ?? 0,
    dyslexia.metadata.riskMapping
  );

  const colorblindGoodVector = buildColorblindFeatureVectorFromPhase({
    startedTrials: 8,
    completedTrials: 8,
    attempts: 8,
    hits: 8,
    misses: 0,
    responseTimes: [1500, 1600, 1550, 1450, 1580, 1490, 1520, 1510],
    autoHelpCount: 0,
    firstChoiceMisses: 0,
    responses: [
      { correct: true, trialType: "redGreen", charType: "letter", responseTimeMs: 1500 },
      { correct: true, trialType: "redGreen", charType: "digit", responseTimeMs: 1600 },
      { correct: true, trialType: "redGreen", charType: "letter", responseTimeMs: 1550 },
      { correct: true, trialType: "blueYellow", charType: "digit", responseTimeMs: 1450 },
      { correct: true, trialType: "blueYellow", charType: "letter", responseTimeMs: 1580 },
      { correct: true, trialType: "blueYellow", charType: "digit", responseTimeMs: 1490 },
      { correct: true, trialType: "lowContrast", charType: "letter", responseTimeMs: 1520 },
      { correct: true, trialType: "lowContrast", charType: "digit", responseTimeMs: 1510 }
    ]
  });
  const colorblindBadVector = buildColorblindFeatureVectorFromPhase({
    startedTrials: 8,
    completedTrials: 8,
    attempts: 8,
    hits: 2,
    misses: 6,
    responseTimes: [2200, 2400, 2350, 2600, 2250, 2450, 2500, 2550],
    autoHelpCount: 2,
    firstChoiceMisses: 6,
    responses: [
      { correct: false, trialType: "redGreen", charType: "letter", responseTimeMs: 2200 },
      { correct: false, trialType: "redGreen", charType: "digit", responseTimeMs: 2400 },
      { correct: false, trialType: "redGreen", charType: "letter", responseTimeMs: 2350 },
      { correct: false, trialType: "blueYellow", charType: "digit", responseTimeMs: 2600 },
      { correct: false, trialType: "blueYellow", charType: "letter", responseTimeMs: 2250 },
      { correct: false, trialType: "blueYellow", charType: "digit", responseTimeMs: 2450 },
      { correct: false, trialType: "lowContrast", charType: "letter", responseTimeMs: 2500 },
      { correct: true, trialType: "lowContrast", charType: "digit", responseTimeMs: 2550 }
    ]
  });

  if (!colorblindGoodVector || !colorblindBadVector) {
    throw new Error("Failed to build colorblind validation fixtures.");
  }

  const colorblindGoodRisk = Math.round(
    (runDenseModel(normalizeFeatureVector(colorblindGoodVector, colorblind.metadata), colorblind.weights)[0] ?? 0) * 100
  );
  const colorblindBadRisk = Math.round(
    (runDenseModel(normalizeFeatureVector(colorblindBadVector, colorblind.metadata), colorblind.weights)[0] ?? 0) * 100
  );

  const reactionGood = runDenseModel(
    normalizeFeatureVector(buildReactionTimeFeatureVectorFromValues({ reactionTimeProxyMs: 300 }), reaction.metadata),
    reaction.weights
  );
  const reactionAverage = runDenseModel(
    normalizeFeatureVector(buildReactionTimeFeatureVectorFromValues({ reactionTimeProxyMs: 500 }), reaction.metadata),
    reaction.weights
  );
  const reactionBad = runDenseModel(
    normalizeFeatureVector(buildReactionTimeFeatureVectorFromValues({ reactionTimeProxyMs: 780 }), reaction.metadata),
    reaction.weights
  );

  const cognitiveGoodPerformance = Math.round(
    (runDenseModel(
      normalizeFeatureVector(
        buildCognitivePerformanceFeatureVectorFromValues({
          reactionTimeProxyMs: 250,
          memoryTestProxyScore: 95
        }),
        cognitive.metadata
      ),
      cognitive.weights
    )[0] ?? 0) * 100
  );
  const cognitiveAveragePerformance = Math.round(
    (runDenseModel(
      normalizeFeatureVector(
        buildCognitivePerformanceFeatureVectorFromValues({
          reactionTimeProxyMs: 400,
          memoryTestProxyScore: 70
        }),
        cognitive.metadata
      ),
      cognitive.weights
    )[0] ?? 0) * 100
  );
  const cognitiveBadPerformance = Math.round(
    (runDenseModel(
      normalizeFeatureVector(
        buildCognitivePerformanceFeatureVectorFromValues({
          reactionTimeProxyMs: 580,
          memoryTestProxyScore: 45
        }),
        cognitive.metadata
      ),
      cognitive.weights
    )[0] ?? 0) * 100
  );

  const checks = {
    dyslexia:
      dyslexiaBadRisk > dyslexiaGoodRisk &&
      dyslexiaGameBadRisk > dyslexiaGameGoodRisk &&
      dyslexia.metadata.fixtureChecks.passed,
    colorblind: colorblindBadRisk > colorblindGoodRisk,
    reaction:
      reactionPerformance(reactionGood) > reactionPerformance(reactionAverage) &&
      reactionPerformance(reactionAverage) > reactionPerformance(reactionBad),
    cognitive:
      cognitiveGoodPerformance > cognitiveAveragePerformance &&
      cognitiveAveragePerformance > cognitiveBadPerformance
  };

  console.log("[validate:model-artifacts] Results", {
    dyslexia: {
      riskMapping: dyslexia.metadata.riskMapping,
      goodRisk: dyslexiaGoodRisk,
      badRisk: dyslexiaBadRisk,
      gameGoodRisk: dyslexiaGameGoodRisk,
      gameBadRisk: dyslexiaGameBadRisk,
      fixtureChecks: dyslexia.metadata.fixtureChecks
    },
    colorblind: {
      goodRisk: colorblindGoodRisk,
      badRisk: colorblindBadRisk
    },
    reaction: {
      goodPerformance: reactionPerformance(reactionGood),
      averagePerformance: reactionPerformance(reactionAverage),
      badPerformance: reactionPerformance(reactionBad)
    },
    cognitive: {
      goodPerformance: cognitiveGoodPerformance,
      averagePerformance: cognitiveAveragePerformance,
      badPerformance: cognitiveBadPerformance
    },
    checks
  });

  if (Object.values(checks).some((value) => value === false)) {
    throw new Error("One or more model artifact checks failed.");
  }
}

main().catch((error: unknown) => {
  console.error(
    `[validate:model-artifacts] ${error instanceof Error ? error.message : "Unknown error during artifact validation."}`
  );
  process.exitCode = 1;
});
