import * as fs from "node:fs/promises";
import path from "node:path";
import * as tfFallback from "@tensorflow/tfjs";
import {
  REACTION_TIME_MODEL_FEATURES,
  buildReactionTimeFeatureValuesFromDatasetRow,
  buildReactionTimeFeatureVectorFromValues,
  type ReactionTimeCategory,
  type ReactionTimeFeatureNormalization,
  type ReactionTimeModelMetadata
} from "../src/ai/reactionTimeFeatures";

type TensorFlowModule = typeof tfFallback;

interface TrainingRow {
  features: number[];
  label: ReactionTimeCategory;
  labelIndex: number;
}

const FEATURE_COLUMN = "visual_reaction_time";
const TARGET_COLUMN = "category";
const LABEL_ORDER: ReactionTimeCategory[] = ["good", "average", "bad"];

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

function log(message: string, details?: unknown) {
  if (details === undefined) {
    console.log(`[train:reactiontime] ${message}`);
    return;
  }

  console.log(`[train:reactiontime] ${message}`, details);
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

function lastNumericHistoryValue(history: tfFallback.History["history"], ...keys: string[]) {
  const value = lastHistoryValue(history, ...keys);

  if (typeof value === "number") {
    return value;
  }

  if (value instanceof tfFallback.Tensor) {
    const metric = value.dataSync()[0];
    value.dispose();
    return typeof metric === "number" && Number.isFinite(metric) ? metric : undefined;
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

function toLabel(value: string, rowNumber: number): TrainingRow["label"] {
  if (LABEL_ORDER.includes(value as ReactionTimeCategory)) {
    return value as ReactionTimeCategory;
  }

  throw new Error(`Invalid reaction category "${value}" at row ${rowNumber}.`);
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

  for (const column of [FEATURE_COLUMN, TARGET_COLUMN]) {
    if (!indexByHeader.has(column)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }

  return lines.slice(1).map((line, rowOffset) => {
    const values = parseCsvLine(line);
    const rowNumber = rowOffset + 2;
    const label = toLabel(values[indexByHeader.get(TARGET_COLUMN) ?? -1], rowNumber);
    const featureValues = buildReactionTimeFeatureValuesFromDatasetRow({
      visualReactionTimeMs: toNumber(values[indexByHeader.get(FEATURE_COLUMN) ?? -1], FEATURE_COLUMN, rowNumber)
    });

    return {
      features: buildReactionTimeFeatureVectorFromValues(featureValues),
      label,
      labelIndex: LABEL_ORDER.indexOf(label)
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
  const byLabel = new Map<ReactionTimeCategory, TrainingRow[]>();

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

function buildNormalization(rows: TrainingRow[]): ReactionTimeFeatureNormalization[] {
  return REACTION_TIME_MODEL_FEATURES.map((feature, featureIndex) => {
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

function normalizeRows(rows: TrainingRow[], normalization: ReactionTimeFeatureNormalization[]) {
  return rows.map((row) =>
    normalization.map(({ mean, std }, featureIndex) => ((row.features[featureIndex] ?? 0) - mean) / std)
  );
}

function oneHot(labelIndex: number) {
  return LABEL_ORDER.map((_, index) => (index === labelIndex ? 1 : 0));
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
  metadata: ReactionTimeModelMetadata
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
  const csvPath = path.resolve(process.argv[2] ?? "data/raw/reactiontime/reaction_time_dataset.csv");
  const outputDir = path.resolve("models/reactiontime");

  log("Starting TensorFlow training for reaction time.");
  log(`Input CSV: ${csvPath}`);
  log(`Output directory: ${outputDir}`);

  const tf = await loadTensorFlow();
  const rows = await loadRows(csvPath);
  const { trainRows, validationRows } = splitRowsStratified(rows, 0.2);

  if (trainRows.length === 0 || validationRows.length === 0) {
    throw new Error("Training requires both train and validation rows.");
  }

  const normalization = buildNormalization(trainRows);
  const xsTrain = tf.tensor2d(normalizeRows(trainRows, normalization));
  const ysTrain = tf.tensor2d(trainRows.map((row) => oneHot(row.labelIndex)));
  const xsValidation = tf.tensor2d(normalizeRows(validationRows, normalization));
  const ysValidation = tf.tensor2d(validationRows.map((row) => oneHot(row.labelIndex)));
  const classDistribution = LABEL_ORDER.reduce(
    (distribution, label) => {
      distribution[label] = rows.filter((row) => row.label === label).length;
      return distribution;
    },
    {} as Record<ReactionTimeCategory, number>
  );

  log("Dataset summary", {
    featureCount: REACTION_TIME_MODEL_FEATURES.length,
    rowCount: rows.length,
    trainRows: trainRows.length,
    validationRows: validationRows.length,
    targetColumn: TARGET_COLUMN,
    classDistribution
  });
  log("Derived features", REACTION_TIME_MODEL_FEATURES);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ units: 12, activation: "relu", inputShape: [REACTION_TIME_MODEL_FEATURES.length] }),
      tf.layers.dense({ units: 8, activation: "relu" }),
      tf.layers.dense({ units: LABEL_ORDER.length, activation: "softmax" })
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"]
  });

  const history = await model.fit(xsTrain, ysTrain, {
    epochs: 70,
    batchSize: Math.min(64, trainRows.length),
    shuffle: true,
    validationData: [xsValidation, ysValidation],
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        if ((epoch + 1) % 10 !== 0 && epoch !== 0 && epoch !== 69) {
          return;
        }

        log(`Epoch ${epoch + 1}/70`, {
          loss: logs?.loss,
          accuracy: readMetricFromLogs(logs, "acc", "accuracy"),
          valLoss: logs?.val_loss,
          valAccuracy: readMetricFromLogs(logs, "val_acc", "val_accuracy")
        });
      }
    }
  });

  const finalMetrics: ReactionTimeModelMetadata["trainingMetrics"] = {
    loss: lastNumericHistoryValue(history.history, "loss") ?? null,
    accuracy: lastNumericHistoryValue(history.history, "acc", "accuracy") ?? null,
    valLoss: lastNumericHistoryValue(history.history, "val_loss") ?? null,
    valAccuracy: lastNumericHistoryValue(history.history, "val_acc", "val_accuracy") ?? null
  };
  const metadata: ReactionTimeModelMetadata = {
    features: [...REACTION_TIME_MODEL_FEATURES],
    normalization,
    sourceDataset: path.relative(process.cwd(), csvPath),
    targetColumn: TARGET_COLUMN,
    rowCount: rows.length,
    trainRowCount: trainRows.length,
    validationRowCount: validationRows.length,
    classDistribution,
    featureColumnsUsed: [FEATURE_COLUMN],
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
    `[train:reactiontime] ${
      error instanceof Error ? error.message : "Unknown error during reaction time training."
    }`
  );
  process.exitCode = 1;
});
