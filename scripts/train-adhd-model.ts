import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import * as tfFallback from "@tensorflow/tfjs";
import {
  ADHD_MODEL_FEATURES,
  type AttentionFeatureNormalization,
  type AttentionModelMetadata
} from "../src/ai/adhdFeatures";

type TensorFlowModule = typeof tfFallback;

const WINDOW_SIZE = 1024;
const CHANNEL_NAMES = [
  "Fp1",
  "Fp2",
  "F3",
  "F4",
  "C3",
  "C4",
  "P3",
  "P4",
  "O1",
  "O2",
  "F7",
  "F8",
  "T7",
  "T8",
  "P7",
  "P8",
  "Fz",
  "Cz",
  "Pz"
] as const;
const LEFT_RIGHT_PAIRS: Array<[number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
  [12, 13],
  [14, 15]
];
const FRONTAL_INDEXES = [0, 1, 2, 3, 10, 11, 16] as const;
const POSTERIOR_INDEXES = [6, 7, 8, 9, 14, 15, 18] as const;
const MIDLINE_INDEXES = [16, 17, 18] as const;
const EEG_DESCRIPTOR_NAMES = [
  "globalStd",
  "leftRightAbsDelta",
  "frontalPosteriorRatio",
  "midlineStd",
  "posteriorStd",
  "segmentDrift",
  "frontalStd"
] as const;

type EegDescriptorName = (typeof EEG_DESCRIPTOR_NAMES)[number];

interface SubjectInfo {
  id: string;
  label: number;
}

interface SubjectPassSummary {
  rawRowCount: number;
  subjects: SubjectInfo[];
}

interface TrainingRow {
  subjectId: string;
  label: number;
  eegFeatures: number[];
  features: number[];
}

interface RawFeatureNormalization {
  feature: EegDescriptorName;
  mean: number;
  std: number;
}

interface SubjectWindowBuilder {
  id: string;
  label: number;
  count: number;
  sums: number[];
  sumsSq: number[];
  firstRow: number[] | null;
  lastRow: number[] | null;
}

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

function log(message: string, details?: unknown) {
  if (details === undefined) {
    console.log(`[train:adhd] ${message}`);
    return;
  }

  console.log(`[train:adhd] ${message}`, details);
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

function createWindowBuilder(id: string, label: number): SubjectWindowBuilder {
  return {
    id,
    label,
    count: 0,
    sums: CHANNEL_NAMES.map(() => 0),
    sumsSq: CHANNEL_NAMES.map(() => 0),
    firstRow: null,
    lastRow: null
  };
}

function resetWindowBuilder(builder: SubjectWindowBuilder) {
  builder.count = 0;
  builder.sums.fill(0);
  builder.sumsSq.fill(0);
  builder.firstRow = null;
  builder.lastRow = null;
}

function toNumber(value: string, column: string, rowNumber: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number in column "${column}" at row ${rowNumber}.`);
  }

  return parsed;
}

function toLabel(value: string, rowNumber: number) {
  if (value === "ADHD") {
    return 1;
  }

  if (value === "Control") {
    return 0;
  }

  throw new Error(`Invalid ADHD label "${value}" at row ${rowNumber}.`);
}

function shuffleInPlace<T>(values: T[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pickValuesByIndex(values: number[], indexes: readonly number[]) {
  return indexes.map((index) => values[index] ?? 0);
}

function buildRawDescriptors(builder: SubjectWindowBuilder) {
  const means = builder.sums.map((sum) => sum / Math.max(1, builder.count));
  const variances = builder.sumsSq.map((sumSq, index) => {
    const mean = means[index] ?? 0;
    return Math.max(0, sumSq / Math.max(1, builder.count) - mean ** 2);
  });
  const stds = variances.map((value) => Math.sqrt(value));
  const frontalStd = average(pickValuesByIndex(stds, FRONTAL_INDEXES));
  const posteriorStd = average(pickValuesByIndex(stds, POSTERIOR_INDEXES));
  const midlineStd = average(pickValuesByIndex(stds, MIDLINE_INDEXES));
  const leftRightAbsDelta = average(
    LEFT_RIGHT_PAIRS.map(([left, right]) => Math.abs((means[left] ?? 0) - (means[right] ?? 0)))
  );
  const segmentDrift = average(
    CHANNEL_NAMES.map((_, index) =>
      Math.abs((builder.lastRow?.[index] ?? 0) - (builder.firstRow?.[index] ?? 0))
    )
  );

  return [
    average(stds),
    leftRightAbsDelta,
    frontalStd / Math.max(1e-6, posteriorStd),
    midlineStd,
    posteriorStd,
    segmentDrift,
    frontalStd
  ];
}

function buildNormalization(rows: TrainingRow[]): AttentionFeatureNormalization[] {
  return ADHD_MODEL_FEATURES.map((feature, featureIndex) => {
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

function buildRawFeatureNormalization(rows: TrainingRow[]): RawFeatureNormalization[] {
  return EEG_DESCRIPTOR_NAMES.map((feature, featureIndex) => {
    const values = rows.map((row) => row.eegFeatures[featureIndex] ?? 0);
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

function normalizeRows(rows: TrainingRow[], normalization: AttentionFeatureNormalization[]) {
  return rows.map((row) =>
    normalization.map(({ mean, std }, featureIndex) => ((row.features[featureIndex] ?? 0) - mean) / std)
  );
}

function normalizeRawDescriptorVector(featureVector: number[], normalization: RawFeatureNormalization[]) {
  return normalization.map(({ mean, std }, featureIndex) => ((featureVector[featureIndex] ?? 0) - mean) / (std || 1));
}

function buildProxyFeatureVector(normalizedDescriptors: number[]) {
  const [
    globalStd,
    leftRightAbsDelta,
    frontalPosteriorRatio,
    midlineStd,
    posteriorStd,
    segmentDrift,
    frontalStd
  ] = normalizedDescriptors;

  return [
    sigmoid(0.65 * frontalPosteriorRatio + 0.35 * midlineStd),
    sigmoid(0.6 * leftRightAbsDelta + 0.4 * globalStd),
    sigmoid(0.55 * posteriorStd + 0.45 * segmentDrift),
    sigmoid(0.55 * frontalStd + 0.45 * segmentDrift)
  ];
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
  metadata: AttentionModelMetadata
) {
  await fsPromises.mkdir(outputDir, { recursive: true });

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

      await fsPromises.writeFile(path.join(outputDir, "model.json"), JSON.stringify(modelJson, null, 2), "utf8");
      await fsPromises.writeFile(path.join(outputDir, weightFileName), weightDataBuffer);
      await fsPromises.writeFile(path.join(outputDir, "normalization.json"), JSON.stringify(metadata, null, 2), "utf8");
      await fsPromises.writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");

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

async function readSubjectSummary(csvPath: string): Promise<SubjectPassSummary> {
  const input = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headers: string[] | null = null;
  let rawRowCount = 0;
  const subjects = new Map<string, SubjectInfo>();

  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line.replace(/^\uFEFF/, ""));
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    rawRowCount += 1;
    const values = parseCsvLine(line);
    const rowNumber = rawRowCount + 1;
    const id = values[headers.indexOf("ID")] ?? "";
    const label = toLabel(values[headers.indexOf("Class")] ?? "", rowNumber);

    if (!id) {
      throw new Error(`Missing subject ID at row ${rowNumber}.`);
    }

    const existing = subjects.get(id);

    if (existing && existing.label !== label) {
      throw new Error(`Mixed labels found for subject "${id}".`);
    }

    if (!existing) {
      subjects.set(id, { id, label });
    }
  }

  return {
    rawRowCount,
    subjects: [...subjects.values()]
  };
}

function splitSubjectsStratified(subjects: SubjectInfo[], validationRatio: number) {
  const byLabel = new Map<number, SubjectInfo[]>();

  for (const subject of subjects) {
    const bucket = byLabel.get(subject.label) ?? [];
    bucket.push(subject);
    byLabel.set(subject.label, bucket);
  }

  const validationIds = new Set<string>();

  for (const bucket of byLabel.values()) {
    shuffleInPlace(bucket);
    const validationCount = bucket.length > 1 ? Math.max(1, Math.round(bucket.length * validationRatio)) : 0;

    for (const subject of bucket.slice(0, validationCount)) {
      validationIds.add(subject.id);
    }
  }

  return validationIds;
}

async function buildWindowRows(csvPath: string, validationIds: Set<string>) {
  const input = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let headers: string[] | null = null;
  let channelIndexes: number[] = [];
  let classIndex = -1;
  let idIndex = -1;
  let dataRowCount = 0;
  const builders = new Map<string, SubjectWindowBuilder>();
  const rows: TrainingRow[] = [];
  let discardedPartialRows = 0;

  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line.replace(/^\uFEFF/, ""));
      channelIndexes = CHANNEL_NAMES.map((channel) => {
        const index = headers!.indexOf(channel);

        if (index < 0) {
          throw new Error(`Missing required CSV column: ${channel}`);
        }

        return index;
      });
      classIndex = headers.indexOf("Class");
      idIndex = headers.indexOf("ID");

      if (classIndex < 0 || idIndex < 0) {
        throw new Error('Missing required CSV columns: "Class" and/or "ID".');
      }

      continue;
    }

    if (!line.trim()) {
      continue;
    }

    dataRowCount += 1;
    const values = parseCsvLine(line);
    const rowNumber = dataRowCount + 1;
    const subjectId = values[idIndex] ?? "";
    const label = toLabel(values[classIndex] ?? "", rowNumber);
    const channels = channelIndexes.map((index, channelIndex) =>
      toNumber(values[index] ?? "", CHANNEL_NAMES[channelIndex]!, rowNumber)
    );

    if (!subjectId) {
      throw new Error(`Missing subject ID at row ${rowNumber}.`);
    }

    const builder = builders.get(subjectId) ?? createWindowBuilder(subjectId, label);

    if (builder.label !== label) {
      throw new Error(`Mixed labels found for subject "${subjectId}".`);
    }

    if (builder.count === 0) {
      builder.firstRow = [...channels];
    }

    builder.lastRow = [...channels];
    builder.count += 1;

    for (let index = 0; index < channels.length; index += 1) {
      const value = channels[index] ?? 0;
      builder.sums[index] += value;
      builder.sumsSq[index] += value ** 2;
    }

    if (builder.count === WINDOW_SIZE) {
      const eegFeatures = buildRawDescriptors(builder);
      rows.push({
        subjectId,
        label,
        eegFeatures,
        features: []
      });
      resetWindowBuilder(builder);
    }

    builders.set(subjectId, builder);
  }

  for (const builder of builders.values()) {
    discardedPartialRows += builder.count;
  }

  const trainRows = rows.filter((row) => !validationIds.has(row.subjectId));
  const validationRows = rows.filter((row) => validationIds.has(row.subjectId));
  const rawNormalization = buildRawFeatureNormalization(trainRows);

  for (const row of rows) {
    row.features = buildProxyFeatureVector(normalizeRawDescriptorVector(row.eegFeatures, rawNormalization));
  }

  return {
    rows,
    trainRows,
    validationRows,
    discardedPartialRows
  };
}

async function main() {
  const csvPath = path.resolve(process.argv[2] ?? "data/raw/adhd/adhdata.csv");
  const outputDir = path.resolve("models/adhd");

  log("Starting TensorFlow training for ADHD attention model.");
  log(`Input CSV: ${csvPath}`);
  log(`Output directory: ${outputDir}`);
  log(`Window size: ${WINDOW_SIZE}`);

  const tf = await loadTensorFlow();
  const subjectSummary = await readSubjectSummary(csvPath);
  const validationIds = splitSubjectsStratified(subjectSummary.subjects, 0.2);
  const subjectCount = subjectSummary.subjects.length;
  const subjectDistribution = {
    control: subjectSummary.subjects.filter((subject) => subject.label === 0).length,
    adhd: subjectSummary.subjects.filter((subject) => subject.label === 1).length
  };
  const { rows, trainRows, validationRows, discardedPartialRows } = await buildWindowRows(csvPath, validationIds);
  const positiveWindowCount = rows.filter((row) => row.label === 1).length;
  const negativeWindowCount = rows.length - positiveWindowCount;

  if (trainRows.length === 0 || validationRows.length === 0) {
    throw new Error("Training requires both train and validation rows.");
  }

  const normalization = buildNormalization(trainRows);
  const xsTrain = tf.tensor2d(normalizeRows(trainRows, normalization));
  const ysTrain = tf.tensor2d(trainRows.map((row) => [row.label]));
  const xsValidation = tf.tensor2d(normalizeRows(validationRows, normalization));
  const ysValidation = tf.tensor2d(validationRows.map((row) => [row.label]));
  const positiveTrainCount = trainRows.filter((row) => row.label === 1).length;
  const negativeTrainCount = trainRows.length - positiveTrainCount;
  const classWeight = {
    0: trainRows.length / (2 * Math.max(1, negativeTrainCount)),
    1: trainRows.length / (2 * Math.max(1, positiveTrainCount))
  };

  log("Dataset summary", {
    rawRowCount: subjectSummary.rawRowCount,
    subjectCount,
    validationSubjectCount: validationIds.size,
    subjectsControl: subjectDistribution.control,
    subjectsAdhd: subjectDistribution.adhd,
    windowCount: rows.length,
    trainRows: trainRows.length,
    validationRows: validationRows.length,
    windowsControl: negativeWindowCount,
    windowsAdhd: positiveWindowCount,
    discardedPartialRows
  });
  log("Derived features", ADHD_MODEL_FEATURES);
  log("Class weight", classWeight);

  const model = tf.sequential({
    layers: [tf.layers.dense({ units: 1, activation: "sigmoid", inputShape: [ADHD_MODEL_FEATURES.length] })]
  });

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"]
  });

  const history = await model.fit(xsTrain, ysTrain, {
    epochs: 120,
    batchSize: Math.min(32, trainRows.length),
    classWeight,
    shuffle: true,
    validationData: [xsValidation, ysValidation],
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        if ((epoch + 1) % 20 !== 0 && epoch !== 0 && epoch !== 119) {
          return;
        }

        log(`Epoch ${epoch + 1}/120`, {
          loss: logs?.loss,
          accuracy: readMetricFromLogs(logs, "acc", "accuracy"),
          valLoss: logs?.val_loss,
          valAccuracy: readMetricFromLogs(logs, "val_acc", "val_accuracy")
        });
      }
    }
  });

  const finalMetrics: AttentionModelMetadata["trainingMetrics"] = {
    loss: lastNumericHistoryValue(history.history, "loss") ?? null,
    accuracy: lastNumericHistoryValue(history.history, "acc", "accuracy") ?? null,
    valLoss: lastNumericHistoryValue(history.history, "val_loss") ?? null,
    valAccuracy: lastNumericHistoryValue(history.history, "val_acc", "val_accuracy") ?? null
  };
  const metadata: AttentionModelMetadata = {
    features: [...ADHD_MODEL_FEATURES],
    normalization,
    sourceDataset: "EEG Dataset for ADHD",
    inferenceMode: "behavioral-proxy-calibrated-by-eeg",
    modelType: "logistic-regression-proxy",
    windowSize: WINDOW_SIZE,
    rawRowCount: subjectSummary.rawRowCount,
    rowCount: rows.length,
    windowCount: rows.length,
    subjectCount,
    validationSubjectCount: validationIds.size,
    classDistribution: {
      control: subjectDistribution.control,
      adhd: subjectDistribution.adhd
    },
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
    `[train:adhd] ${error instanceof Error ? error.message : "Unknown error during ADHD model training."}`
  );
  process.exitCode = 1;
});
