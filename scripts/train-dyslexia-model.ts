import * as fs from "node:fs/promises";
import path from "node:path";
import * as tfFallback from "@tensorflow/tfjs";
import {
  DYSLEXIA_MODEL_FEATURES,
  DYSLEXIA_PHASE_DATASET_QUESTIONS,
  buildDyslexiaFeatureVectorFromAggregate,
  type DyslexiaFixtureChecks,
  type DyslexiaFeatureNormalization,
  type DyslexiaModelMetadata,
  type DyslexiaModelTrainingMetrics,
  type DyslexiaRiskMapping
} from "../src/ai/dyslexiaFeatures";

type TensorFlowModule = typeof tfFallback;

interface TrainingRow {
  features: number[];
  label: number;
}

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

function log(message: string, details?: unknown) {
  if (details === undefined) {
    console.log(`[train:dyslexia] ${message}`);
    return;
  }

  console.log(`[train:dyslexia] ${message}`, details);
}

function readMetricFromLogs(logs: tfFallback.Logs | undefined, ...keys: string[]) {
  if (!logs) {
    return undefined;
  }

  for (const key of keys) {
    const value = logs[key];

    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

function lastHistoryValue(history: tfFallback.History["history"], ...keys: string[]) {
  for (const key of keys) {
    const values = history[key];

    if (!Array.isArray(values) || values.length === 0) {
      continue;
    }

    return values[values.length - 1];
  }

  return undefined;
}

async function loadTensorFlow(): Promise<TensorFlowModule> {
  try {
    const tfNode = (await dynamicImport("@tensorflow/tfjs-node")) as TensorFlowModule;
    log("Using optional @tensorflow/tfjs-node backend.");
    return tfNode;
  } catch {
    log("Optional @tensorflow/tfjs-node not found. Using @tensorflow/tfjs pure JS backend.");
    log("For faster local training, install @tensorflow/tfjs-node in a compatible local environment.");
    return tfFallback;
  }
}

function parseDelimitedLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function toNumber(value: string, column: string, rowNumber: number) {
  const parsed = Number(value.replace(",", "."));

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number in column "${column}" at row ${rowNumber}.`);
  }

  return parsed;
}

function toLabel(value: string, rowNumber: number) {
  const normalized = value.trim();

  if (normalized === "Yes") {
    return 1;
  }

  if (normalized === "No") {
    return 0;
  }

  throw new Error(`Invalid Dyslexia label "${value}" at row ${rowNumber}.`);
}

async function loadRows(csvPath: string): Promise<TrainingRow[]> {
  const content = await fs.readFile(csvPath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one data row.");
  }

  const headers = parseDelimitedLine(lines[0], ";");
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const requiredColumns = [
    ...DYSLEXIA_PHASE_DATASET_QUESTIONS.flatMap((questionId) => [
      `Clicks${questionId}`,
      `Hits${questionId}`,
      `Misses${questionId}`
    ]),
    "Dyslexia"
  ];

  for (const column of requiredColumns) {
    if (!indexByHeader.has(column)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }

  return lines.slice(1).map((line, rowOffset) => {
    const values = parseDelimitedLine(line, ";");
    const rowNumber = rowOffset + 2;
    const totalClicks = DYSLEXIA_PHASE_DATASET_QUESTIONS.reduce(
      (sum, questionId) =>
        sum + toNumber(values[indexByHeader.get(`Clicks${questionId}`) ?? -1], `Clicks${questionId}`, rowNumber),
      0
    );
    const totalHits = DYSLEXIA_PHASE_DATASET_QUESTIONS.reduce(
      (sum, questionId) =>
        sum + toNumber(values[indexByHeader.get(`Hits${questionId}`) ?? -1], `Hits${questionId}`, rowNumber),
      0
    );
    const totalMisses = DYSLEXIA_PHASE_DATASET_QUESTIONS.reduce(
      (sum, questionId) =>
        sum + toNumber(values[indexByHeader.get(`Misses${questionId}`) ?? -1], `Misses${questionId}`, rowNumber),
      0
    );
    const label = toLabel(values[indexByHeader.get("Dyslexia") ?? -1], rowNumber);

    return {
      features: buildDyslexiaFeatureVectorFromAggregate({
        questionCount: DYSLEXIA_PHASE_DATASET_QUESTIONS.length,
        totalClicks,
        totalHits,
        totalMisses
      }),
      label
    };
  });
}

function shuffleInPlace<T>(values: T[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function splitRowsStratified(rows: TrainingRow[], validationRatio: number) {
  const byLabel = new Map<number, TrainingRow[]>();

  for (const row of rows) {
    const bucket = byLabel.get(row.label) ?? [];
    bucket.push(row);
    byLabel.set(row.label, bucket);
  }

  const trainRows: TrainingRow[] = [];
  const validationRows: TrainingRow[] = [];

  for (const bucket of byLabel.values()) {
    shuffleInPlace(bucket);
    const validationCount = bucket.length > 1 ? Math.max(1, Math.round(bucket.length * validationRatio)) : 0;
    validationRows.push(...bucket.slice(0, validationCount));
    trainRows.push(...bucket.slice(validationCount));
  }

  shuffleInPlace(trainRows);
  shuffleInPlace(validationRows);
  return { trainRows, validationRows };
}

function buildNormalization(rows: TrainingRow[]): DyslexiaFeatureNormalization[] {
  return DYSLEXIA_MODEL_FEATURES.map((feature, featureIndex) => {
    const values = rows.map((row) => row.features[featureIndex]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);

    return {
      feature,
      mean,
      std: Math.sqrt(variance) || 1
    };
  });
}

function normalizeRows(rows: TrainingRow[], normalization: DyslexiaFeatureNormalization[]) {
  return rows.map((row) =>
    normalization.map(({ mean, std }, featureIndex) => (row.features[featureIndex] - mean) / std)
  );
}

function normalizeFeatureVector(featureVector: number[], normalization: DyslexiaFeatureNormalization[]) {
  return normalization.map(({ mean, std }, featureIndex) => (featureVector[featureIndex] - mean) / std);
}

async function predictProbability(
  tf: TensorFlowModule,
  model: tfFallback.LayersModel,
  featureVector: number[]
) {
  const input = tf.tensor2d([featureVector]);
  const output = model.predict(input);

  if (Array.isArray(output)) {
    input.dispose();
    output.forEach((tensor) => tensor.dispose());
    return null;
  }

  const prediction = output as tfFallback.Tensor;
  const values = Array.from(await prediction.data());

  input.dispose();
  prediction.dispose();

  return typeof values[0] === "number" ? values[0] : null;
}

function toRiskFromProbability(probability: number, riskMapping: DyslexiaRiskMapping) {
  const mapped = riskMapping === "oneMinusProbability" ? 1 - probability : probability;
  return Math.max(0, Math.min(100, Math.round(mapped * 100)));
}

async function evaluateFixtures(
  tf: TensorFlowModule,
  model: tfFallback.LayersModel,
  normalization: DyslexiaFeatureNormalization[]
) {
  const protocolGoodControl = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 6,
    totalClicks: 24,
    totalHits: 24,
    totalMisses: 0
  });
  const protocolBadControl = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 6,
    totalClicks: 48,
    totalHits: 12,
    totalMisses: 18
  });
  const gameGoodControl = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 3,
    totalClicks: 12,
    totalHits: 12,
    totalMisses: 0
  });
  const gameBadControl = buildDyslexiaFeatureVectorFromAggregate({
    questionCount: 3,
    totalClicks: 18,
    totalHits: 8,
    totalMisses: 6
  });
  const protocolGoodProbability = await predictProbability(
    tf,
    model,
    normalizeFeatureVector(protocolGoodControl, normalization)
  );
  const protocolBadProbability = await predictProbability(
    tf,
    model,
    normalizeFeatureVector(protocolBadControl, normalization)
  );
  const gameGoodProbability = await predictProbability(tf, model, normalizeFeatureVector(gameGoodControl, normalization));
  const gameBadProbability = await predictProbability(tf, model, normalizeFeatureVector(gameBadControl, normalization));

  if (
    protocolGoodProbability === null ||
    protocolBadProbability === null ||
    gameGoodProbability === null ||
    gameBadProbability === null
  ) {
    return {
      riskMapping: "probability" as const,
      fixtureChecks: {
        goodControlRisk: 0,
        badControlRisk: 0,
        gameGoodControlRisk: 0,
        gameBadControlRisk: 0,
        passed: false
      }
    };
  }

  const probabilityGap =
    (protocolBadProbability - protocolGoodProbability) + (gameBadProbability - gameGoodProbability);
  const invertedGap =
    (1 - protocolBadProbability - (1 - protocolGoodProbability)) +
    (1 - gameBadProbability - (1 - gameGoodProbability));
  const riskMapping: DyslexiaRiskMapping = probabilityGap >= invertedGap ? "probability" : "oneMinusProbability";
  const goodControlRisk = toRiskFromProbability(protocolGoodProbability, riskMapping);
  const badControlRisk = toRiskFromProbability(protocolBadProbability, riskMapping);
  const gameGoodControlRisk = toRiskFromProbability(gameGoodProbability, riskMapping);
  const gameBadControlRisk = toRiskFromProbability(gameBadProbability, riskMapping);
  const fixtureChecks: DyslexiaFixtureChecks = {
    goodControlRisk,
    badControlRisk,
    gameGoodControlRisk,
    gameBadControlRisk,
    passed: badControlRisk >= goodControlRisk + 10 && gameBadControlRisk >= gameGoodControlRisk + 20
  };

  return {
    riskMapping,
    fixtureChecks
  };
}

function weightDataToBuffer(weightData?: tfFallback.io.WeightData) {
  if (!weightData) {
    return Buffer.alloc(0);
  }

  if (Array.isArray(weightData)) {
    return Buffer.concat(weightData.map((buffer) => Buffer.from(buffer)));
  }

  return Buffer.from(weightData);
}

async function saveModelToFiles(
  tf: TensorFlowModule,
  model: tfFallback.LayersModel,
  outputDir: string,
  metadata: DyslexiaModelMetadata
) {
  await fs.mkdir(outputDir, { recursive: true });

  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      const weightFileName = "group1-shard1of1.bin";
      const weightDataBuffer = weightDataToBuffer(artifacts.weightData);
      const modelJson = {
        format: artifacts.format,
        generatedBy: artifacts.generatedBy,
        convertedBy: artifacts.convertedBy,
        modelTopology: artifacts.modelTopology,
        weightsManifest: [
          {
            paths: [weightFileName],
            weights: artifacts.weightSpecs ?? []
          }
        ]
      };

      await fs.writeFile(path.join(outputDir, "model.json"), JSON.stringify(modelJson, null, 2), "utf8");
      await fs.writeFile(path.join(outputDir, weightFileName), weightDataBuffer);
      await fs.writeFile(path.join(outputDir, "normalization.json"), JSON.stringify(metadata, null, 2), "utf8");
      await fs.writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");

      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: "JSON",
          weightDataBytes: weightDataBuffer.byteLength
        }
      };
    })
  );
}

async function main() {
  const csvPath = path.resolve(process.argv[2] ?? "data/raw/dyslexia/dyslexia.csv");
  const outputDir = path.resolve("models/dyslexia");

  log("Starting TensorFlow training for dyslexia phase.");
  log(`Input CSV: ${csvPath}`);
  log(`Output directory: ${outputDir}`);
  log(`Question mapping: ${DYSLEXIA_PHASE_DATASET_QUESTIONS.map((value) => `Q${value}`).join(", ")}`);

  const tf = await loadTensorFlow();
  const rows = await loadRows(csvPath);
  const positiveCount = rows.filter((row) => row.label === 1).length;
  const negativeCount = rows.length - positiveCount;
  const { trainRows, validationRows } = splitRowsStratified(rows, 0.2);

  if (trainRows.length === 0 || validationRows.length === 0) {
    throw new Error("Training requires both train and validation rows.");
  }

  const normalization = buildNormalization(trainRows);
  const xsTrain = tf.tensor2d(normalizeRows(trainRows, normalization));
  const ysTrain = tf.tensor2d(trainRows.map((row) => [row.label]));
  const xsValidation = tf.tensor2d(normalizeRows(validationRows, normalization));
  const ysValidation = tf.tensor2d(validationRows.map((row) => [row.label]));

  const classWeight = {
    0: rows.length / (2 * Math.max(1, negativeCount)),
    1: rows.length / (2 * Math.max(1, positiveCount))
  };

  log("Dataset summary", {
    featureCount: DYSLEXIA_MODEL_FEATURES.length,
    rows: rows.length,
    noDyslexia: negativeCount,
    dyslexia: positiveCount
  });
  log("Split summary", {
    trainRows: trainRows.length,
    validationRows: validationRows.length
  });
  log("Derived features", DYSLEXIA_MODEL_FEATURES);
  log("Class weight", classWeight);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ units: 12, activation: "relu", inputShape: [DYSLEXIA_MODEL_FEATURES.length] }),
      tf.layers.dense({ units: 6, activation: "relu" }),
      tf.layers.dense({ units: 1, activation: "sigmoid" })
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"]
  });

  const history = await model.fit(xsTrain, ysTrain, {
    epochs: 80,
    batchSize: Math.min(32, trainRows.length),
    classWeight,
    shuffle: true,
    validationData: [xsValidation, ysValidation],
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        if ((epoch + 1) % 10 !== 0 && epoch !== 0 && epoch !== 79) {
          return;
        }

        log(`Epoch ${epoch + 1}/80`, {
          loss: logs?.loss,
          accuracy: readMetricFromLogs(logs, "acc", "accuracy"),
          valLoss: logs?.val_loss,
          valAccuracy: readMetricFromLogs(logs, "val_acc", "val_accuracy")
        });
      }
    }
  });

  const finalMetrics: DyslexiaModelTrainingMetrics = {
    loss: (lastHistoryValue(history.history, "loss") as number | undefined) ?? null,
    accuracy: (lastHistoryValue(history.history, "acc", "accuracy") as number | undefined) ?? null,
    valLoss: (lastHistoryValue(history.history, "val_loss") as number | undefined) ?? null,
    valAccuracy: (lastHistoryValue(history.history, "val_acc", "val_accuracy") as number | undefined) ?? null
  };
  const { riskMapping, fixtureChecks } = await evaluateFixtures(tf, model, normalization);
  const metadata: DyslexiaModelMetadata = {
    features: [...DYSLEXIA_MODEL_FEATURES],
    normalization,
    questionIds: [...DYSLEXIA_PHASE_DATASET_QUESTIONS],
    rowCount: rows.length,
    classDistribution: {
      noDyslexia: negativeCount,
      dyslexia: positiveCount
    },
    trainingMetrics: finalMetrics,
    riskMapping,
    fixtureChecks,
    trainedAt: new Date().toISOString()
  };

  await saveModelToFiles(tf, model, outputDir, metadata);

  xsTrain.dispose();
  ysTrain.dispose();
  xsValidation.dispose();
  ysValidation.dispose();
  model.dispose();

  log("Final metrics", finalMetrics);
  log("Fixture checks", fixtureChecks);
  log("Risk mapping", riskMapping);
  log(`Model saved to ${outputDir}`);
}

main().catch((error: unknown) => {
  console.error(
    `[train:dyslexia] ${error instanceof Error ? error.message : "Unknown error during dyslexia model training."}`
  );
  process.exitCode = 1;
});
