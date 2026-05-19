import * as fs from "node:fs/promises";
import path from "node:path";
import * as tfFallback from "@tensorflow/tfjs";
import {
  COGNITIVE_PERFORMANCE_MODEL_FEATURES,
  buildCognitivePerformanceFeatureValuesFromDatasetRow,
  buildCognitivePerformanceFeatureVectorFromValues,
  type CognitivePerformanceFeatureNormalization,
  type CognitivePerformanceModelMetadata
} from "../src/ai/cognitivePerformanceFeatures";

type TensorFlowModule = typeof tfFallback;

interface TrainingRow {
  features: number[];
  label: number;
}

const FEATURE_COLUMNS = {
  reactionTimeMs: "Reaction_Time",
  memoryTestScore: "Memory_Test_Score"
} as const;
const TARGET_COLUMN = "AI_Predicted_Score";

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

function log(message: string, details?: unknown) {
  if (details === undefined) {
    console.log(`[train:cognitiveperformance] ${message}`);
    return;
  }

  console.log(`[train:cognitiveperformance] ${message}`, details);
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

function parseCsvLine(line: string) {
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

    if (char === "," && !quoted) {
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
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number in column "${column}" at row ${rowNumber}.`);
  }

  return parsed;
}

function toLabel(value: string, rowNumber: number) {
  const parsed = toNumber(value, TARGET_COLUMN, rowNumber);

  if (parsed < 0) {
    throw new Error(`Invalid target value in "${TARGET_COLUMN}" at row ${rowNumber}.`);
  }

  return parsed > 1 ? parsed / 100 : parsed;
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

  const headers = parseCsvLine(lines[0].replace(/^\uFEFF/, ""));
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const requiredColumns = [FEATURE_COLUMNS.reactionTimeMs, FEATURE_COLUMNS.memoryTestScore, TARGET_COLUMN];

  for (const column of requiredColumns) {
    if (!indexByHeader.has(column)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }

  return lines.slice(1).map((line, rowOffset) => {
    const values = parseCsvLine(line);
    const rowNumber = rowOffset + 2;
    const featureValues = buildCognitivePerformanceFeatureValuesFromDatasetRow({
      reactionTimeMs: toNumber(
        values[indexByHeader.get(FEATURE_COLUMNS.reactionTimeMs) ?? -1],
        FEATURE_COLUMNS.reactionTimeMs,
        rowNumber
      ),
      memoryTestScore: toNumber(
        values[indexByHeader.get(FEATURE_COLUMNS.memoryTestScore) ?? -1],
        FEATURE_COLUMNS.memoryTestScore,
        rowNumber
      )
    });

    return {
      features: buildCognitivePerformanceFeatureVectorFromValues(featureValues),
      label: toLabel(values[indexByHeader.get(TARGET_COLUMN) ?? -1], rowNumber)
    };
  });
}

function shuffleInPlace<T>(values: T[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function splitRows(rows: TrainingRow[], validationRatio: number) {
  const shuffled = [...rows];
  shuffleInPlace(shuffled);
  const validationCount = Math.max(1, Math.round(shuffled.length * validationRatio));

  return {
    trainRows: shuffled.slice(validationCount),
    validationRows: shuffled.slice(0, validationCount)
  };
}

function buildNormalization(rows: TrainingRow[]): CognitivePerformanceFeatureNormalization[] {
  return COGNITIVE_PERFORMANCE_MODEL_FEATURES.map((feature, featureIndex) => {
    const values = rows.map((row) => row.features[featureIndex] ?? 0);
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

function normalizeRows(rows: TrainingRow[], normalization: CognitivePerformanceFeatureNormalization[]) {
  return rows.map((row) =>
    normalization.map(({ mean, std }, featureIndex) => ((row.features[featureIndex] ?? 0) - mean) / std)
  );
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
  metadata: CognitivePerformanceModelMetadata
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
  const csvPath = path.resolve(process.argv[2] ?? "data/raw/cognitiveperformance/human_cognitive_performance.csv");
  const outputDir = path.resolve("models/cognitiveperformance");

  log("Starting TensorFlow training for cognitive performance.");
  log(`Input CSV: ${csvPath}`);
  log(`Output directory: ${outputDir}`);

  const tf = await loadTensorFlow();
  const rows = await loadRows(csvPath);
  const { trainRows, validationRows } = splitRows(rows, 0.2);

  if (trainRows.length === 0 || validationRows.length === 0) {
    throw new Error("Training requires both train and validation rows.");
  }

  const normalization = buildNormalization(trainRows);
  const xsTrain = tf.tensor2d(normalizeRows(trainRows, normalization));
  const ysTrain = tf.tensor2d(trainRows.map((row) => [row.label]));
  const xsValidation = tf.tensor2d(normalizeRows(validationRows, normalization));
  const ysValidation = tf.tensor2d(validationRows.map((row) => [row.label]));

  log("Dataset summary", {
    featureCount: COGNITIVE_PERFORMANCE_MODEL_FEATURES.length,
    rowCount: rows.length,
    trainRows: trainRows.length,
    validationRows: validationRows.length,
    targetColumn: TARGET_COLUMN
  });
  log("Derived features", COGNITIVE_PERFORMANCE_MODEL_FEATURES);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ units: 16, activation: "relu", inputShape: [COGNITIVE_PERFORMANCE_MODEL_FEATURES.length] }),
      tf.layers.dense({ units: 8, activation: "relu" }),
      tf.layers.dense({ units: 1, activation: "sigmoid" })
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "meanSquaredError",
    metrics: ["mae"]
  });

  const history = await model.fit(xsTrain, ysTrain, {
    epochs: 80,
    batchSize: Math.min(64, trainRows.length),
    shuffle: true,
    validationData: [xsValidation, ysValidation],
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        if ((epoch + 1) % 10 !== 0 && epoch !== 0 && epoch !== 79) {
          return;
        }

        log(`Epoch ${epoch + 1}/80`, {
          loss: logs?.loss,
          mae: readMetricFromLogs(logs, "mae"),
          valLoss: logs?.val_loss,
          valMae: readMetricFromLogs(logs, "val_mae")
        });
      }
    }
  });

  const finalMetrics = {
    loss: lastHistoryValue(history.history, "loss") ?? null,
    mae: lastHistoryValue(history.history, "mae") ?? null,
    valLoss: lastHistoryValue(history.history, "val_loss") ?? null,
    valMae: lastHistoryValue(history.history, "val_mae") ?? null
  };
  const metadata: CognitivePerformanceModelMetadata = {
    features: [...COGNITIVE_PERFORMANCE_MODEL_FEATURES],
    normalization,
    sourceDataset: path.relative(process.cwd(), csvPath),
    targetColumn: TARGET_COLUMN,
    rowCount: rows.length,
    trainRowCount: trainRows.length,
    validationRowCount: validationRows.length,
    proxyDefinitionVersion: "v1",
    trainingMetrics: finalMetrics,
    trainedAt: new Date().toISOString()
  };

  await saveModelToFiles(tf, model, outputDir, metadata);

  xsTrain.dispose();
  ysTrain.dispose();
  xsValidation.dispose();
  ysValidation.dispose();
  model.dispose();

  log("Final metrics", finalMetrics);
  log(`Model saved to ${outputDir}`);
}

main().catch((error: unknown) => {
  console.error(
    `[train:cognitiveperformance] ${
      error instanceof Error ? error.message : "Unknown error during cognitive performance training."
    }`
  );
  process.exitCode = 1;
});
