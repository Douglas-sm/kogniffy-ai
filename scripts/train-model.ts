import * as fs from "node:fs/promises";
import path from "node:path";
import * as tfFallback from "@tensorflow/tfjs";

const FEATURES = [
  "avgResponseTime",
  "hesitationTime",
  "repeatedErrors",
  "impulsiveClicks",
  "sequenceMemoryScore",
  "colorContrastErrors",
  "letterInversionErrors",
  "reactionVariance"
] as const;

const LABELS = ["dyslexiaRisk", "colorVisionRisk", "attentionRisk", "memoryReactionRisk"] as const;

type FeatureName = (typeof FEATURES)[number];
type LabelName = (typeof LABELS)[number];

interface TrainingRow {
  features: Record<FeatureName, number>;
  labels: Record<LabelName, number>;
}

type TensorFlowModule = typeof tfFallback;

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

async function loadTensorFlow(): Promise<TensorFlowModule> {
  try {
    const tfNode = (await dynamicImport("@tensorflow/tfjs-node")) as TensorFlowModule;
    console.log("Using optional @tensorflow/tfjs-node backend.");
    return tfNode;
  } catch {
    console.warn("Optional @tensorflow/tfjs-node not found. Using @tensorflow/tfjs pure JS backend.");
    console.warn("For faster local training, install @tensorflow/tfjs-node in an environment with supported native bindings.");
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

async function loadCsv(filePath: string): Promise<TrainingRow[]> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]);
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));

  for (const column of [...FEATURES, ...LABELS]) {
    if (!indexByHeader.has(column)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }

  return lines.slice(1).map((line, rowOffset) => {
    const values = parseCsvLine(line);
    const rowNumber = rowOffset + 2;
    const features = Object.fromEntries(
      FEATURES.map((feature) => [feature, toNumber(values[indexByHeader.get(feature) ?? -1], feature, rowNumber)])
    ) as Record<FeatureName, number>;
    const labels = Object.fromEntries(
      LABELS.map((label) => {
        const value = toNumber(values[indexByHeader.get(label) ?? -1], label, rowNumber);
        return [label, value > 1 ? value / 100 : value];
      })
    ) as Record<LabelName, number>;

    return { features, labels };
  });
}

function buildNormalization(rows: TrainingRow[]) {
  return FEATURES.map((feature) => {
    const values = rows.map((row) => row.features[feature]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
    const std = Math.sqrt(variance) || 1;

    return { feature, mean, std };
  });
}

function normalizeRows(rows: TrainingRow[], normalization: ReturnType<typeof buildNormalization>) {
  return rows.map((row) =>
    normalization.map(({ feature, mean, std }) => (row.features[feature] - mean) / std)
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
  metadata: unknown
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
  const csvPath = process.argv[2];

  if (!csvPath) {
    throw new Error("Usage: pnpm train:model ./data/kogniffy-training.csv");
  }

  const inputPath = path.resolve(csvPath);
  const outputDir = path.resolve("models/kogniffy");
  const tf = await loadTensorFlow();
  const rows = await loadCsv(inputPath);
  const normalization = buildNormalization(rows);
  const xs = tf.tensor2d(normalizeRows(rows, normalization));
  const ys = tf.tensor2d(rows.map((row) => LABELS.map((label) => row.labels[label])));

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ units: 16, activation: "relu", inputShape: [FEATURES.length] }),
      tf.layers.dense({ units: 8, activation: "relu" }),
      tf.layers.dense({ units: LABELS.length, activation: "sigmoid" })
    ]
  });

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
    metrics: ["mae"]
  });

  await model.fit(xs, ys, {
    epochs: 60,
    batchSize: Math.min(16, rows.length),
    validationSplit: rows.length >= 10 ? 0.2 : 0,
    shuffle: true
  });

  await saveModelToFiles(tf, model, outputDir, { features: FEATURES, labels: LABELS, normalization });

  xs.dispose();
  ys.dispose();
  model.dispose();

  console.log(`Model saved to ${outputDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
