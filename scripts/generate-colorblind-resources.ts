import * as fs from "node:fs/promises";
import path from "node:path";
import {
  buildColorblindFeatureVectorFromPhase,
  COLORBLIND_MODEL_FEATURES
} from "../src/ai/colorblindFeatures";
import {
  COLORBLIND_CHARACTER_SET,
  createColorTrialSpec,
  generateColorTrials,
  rasterizeIshiharaPlate,
  type ColorDifficulty,
  type ColorPlateType
} from "../src/colorblind/plates";
import type { ColorPhaseSnapshot, ColorResponseRecord } from "../src/metrics/metricsCollector";

type SplitName = "train" | "validation" | "test";
type ProfileName = "control" | "lowContrastOnly" | "redGreenSensitive" | "blueYellowSensitive" | "mixedSevere";

interface ProfileConfig {
  label: 0 | 1;
  baseError: number;
  redGreenBoost: number;
  blueYellowBoost: number;
  lowContrastBoost: number;
  letterBoost: number;
  digitBoost: number;
  responseBaseMs: number;
  responseJitterMs: number;
  recoveryStep: number;
  autoHelpBias: number;
}

const OUTPUT_DIR = path.resolve("models/colorblind");
const DATASET_DIR = path.join(OUTPUT_DIR, "dataset");
const MANIFEST_DIR = path.join(OUTPUT_DIR, "manifests");
const DATASET_SPLITS: Record<SplitName, number> = {
  train: 24,
  validation: 6,
  test: 6
};
const TYPE_ROTATION: ColorPlateType[] = ["redGreen", "blueYellow", "lowContrast"];
const DIFFICULTY_ROTATION: ColorDifficulty[] = ["medium", "hard", "expert"];
const PROFILE_COUNTS: Record<ProfileName, number> = {
  control: 120,
  lowContrastOnly: 120,
  redGreenSensitive: 120,
  blueYellowSensitive: 120,
  mixedSevere: 120
};
const PROFILES: Record<ProfileName, ProfileConfig> = {
  control: {
    label: 0,
    baseError: 0.08,
    redGreenBoost: 0.03,
    blueYellowBoost: 0.03,
    lowContrastBoost: 0.08,
    letterBoost: 0.03,
    digitBoost: 0.02,
    responseBaseMs: 1050,
    responseJitterMs: 320,
    recoveryStep: 0.24,
    autoHelpBias: 0.02
  },
  lowContrastOnly: {
    label: 0,
    baseError: 0.11,
    redGreenBoost: 0.02,
    blueYellowBoost: 0.03,
    lowContrastBoost: 0.26,
    letterBoost: 0.04,
    digitBoost: 0.03,
    responseBaseMs: 1280,
    responseJitterMs: 360,
    recoveryStep: 0.2,
    autoHelpBias: 0.05
  },
  redGreenSensitive: {
    label: 1,
    baseError: 0.18,
    redGreenBoost: 0.34,
    blueYellowBoost: 0.05,
    lowContrastBoost: 0.08,
    letterBoost: 0.05,
    digitBoost: 0.04,
    responseBaseMs: 1500,
    responseJitterMs: 420,
    recoveryStep: 0.16,
    autoHelpBias: 0.12
  },
  blueYellowSensitive: {
    label: 1,
    baseError: 0.18,
    redGreenBoost: 0.06,
    blueYellowBoost: 0.31,
    lowContrastBoost: 0.08,
    letterBoost: 0.05,
    digitBoost: 0.04,
    responseBaseMs: 1520,
    responseJitterMs: 430,
    recoveryStep: 0.16,
    autoHelpBias: 0.12
  },
  mixedSevere: {
    label: 1,
    baseError: 0.25,
    redGreenBoost: 0.27,
    blueYellowBoost: 0.24,
    lowContrastBoost: 0.16,
    letterBoost: 0.08,
    digitBoost: 0.06,
    responseBaseMs: 1760,
    responseJitterMs: 480,
    recoveryStep: 0.1,
    autoHelpBias: 0.22
  }
};

function log(message: string, details?: unknown) {
  if (details === undefined) {
    console.log(`[generate:colorblind] ${message}`);
    return;
  }

  console.log(`[generate:colorblind] ${message}`, details);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function writePpmBuffer(width: number, height: number, data: Uint8ClampedArray) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
  const body = Buffer.from(data);
  return Buffer.concat([header, body]);
}

async function ensureStructure() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(DATASET_DIR, { recursive: true });
  await fs.mkdir(MANIFEST_DIR, { recursive: true });

  for (const split of Object.keys(DATASET_SPLITS) as SplitName[]) {
    for (const character of COLORBLIND_CHARACTER_SET) {
      await fs.mkdir(path.join(DATASET_DIR, split, character), { recursive: true });
    }
  }
}

function chooseType(sampleIndex: number, characterIndex: number): ColorPlateType {
  return TYPE_ROTATION[(sampleIndex + characterIndex) % TYPE_ROTATION.length];
}

function chooseDifficulty(sampleIndex: number, characterIndex: number): ColorDifficulty {
  return DIFFICULTY_ROTATION[(sampleIndex * 2 + characterIndex) % DIFFICULTY_ROTATION.length];
}

async function generateImageCorpus() {
  const manifests: Record<SplitName, string[]> = {
    train: [],
    validation: [],
    test: []
  };
  const countsBySplit: Record<SplitName, number> = {
    train: 0,
    validation: 0,
    test: 0
  };

  for (const [characterIndex, character] of COLORBLIND_CHARACTER_SET.entries()) {
    for (const split of Object.keys(DATASET_SPLITS) as SplitName[]) {
      const sampleCount = DATASET_SPLITS[split];

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const type = chooseType(sampleIndex, characterIndex);
        const difficulty = chooseDifficulty(sampleIndex, characterIndex);
        const seed = 5000 + characterIndex * 1000 + sampleIndex * 17 + split.length * 31;
        const trial = createColorTrialSpec(character, type, difficulty, seed);
        const image = rasterizeIshiharaPlate(trial, 28);
        const filename = `${character}_${sampleIndex.toString().padStart(3, "0")}.ppm`;
        const relativePath = path.join("dataset", split, character, filename);
        const absolutePath = path.join(OUTPUT_DIR, relativePath);

        await fs.writeFile(absolutePath, writePpmBuffer(image.width, image.height, image.data));
        manifests[split].push(
          JSON.stringify({
            split,
            label: character,
            type,
            difficulty,
            seed,
            path: relativePath.replaceAll("\\", "/")
          })
        );
        countsBySplit[split] += 1;
      }
    }
  }

  for (const split of Object.keys(manifests) as SplitName[]) {
    await fs.writeFile(path.join(MANIFEST_DIR, `${split}.jsonl`), `${manifests[split].join("\n")}\n`, "utf8");
  }

  await fs.writeFile(
    path.join(OUTPUT_DIR, "dataset-metadata.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        imageSize: [28, 28],
        characterCount: COLORBLIND_CHARACTER_SET.length,
        countsBySplit
      },
      null,
      2
    ),
    "utf8"
  );

  return countsBySplit;
}

function difficultyPenalty(difficulty: ColorDifficulty) {
  if (difficulty === "medium") {
    return 0.04;
  }

  if (difficulty === "hard") {
    return 0.11;
  }

  return 0.18;
}

function pickWrongOption(options: string[], answer: string, random: () => number) {
  const wrongOptions = options.filter((option) => option !== answer);
  return wrongOptions[Math.floor(random() * wrongOptions.length) % wrongOptions.length] ?? answer;
}

function createEmptyPhase(): ColorPhaseSnapshot {
  return {
    startedTrials: 0,
    completedTrials: 0,
    attempts: 0,
    hits: 0,
    misses: 0,
    responseTimes: [],
    autoHelpCount: 0,
    firstChoiceMisses: 0,
    letterTrials: 0,
    numberTrials: 0,
    redGreenTrials: 0,
    blueYellowTrials: 0,
    lowContrastTrials: 0,
    responses: []
  };
}

function pushResponse(phase: ColorPhaseSnapshot, response: ColorResponseRecord, isFirstAttempt: boolean) {
  phase.attempts += 1;
  phase.responseTimes.push(response.responseTimeMs);
  phase.responses.push(response);

  if (response.correct) {
    phase.hits += 1;
    return;
  }

  phase.misses += 1;

  if (isFirstAttempt) {
    phase.firstChoiceMisses += 1;
  }
}

function errorProbability(profile: ProfileConfig, trialType: ColorPlateType, difficulty: ColorDifficulty, charType: string) {
  const typeBoost =
    trialType === "redGreen"
      ? profile.redGreenBoost
      : trialType === "blueYellow"
        ? profile.blueYellowBoost
        : profile.lowContrastBoost;
  const charBoost = charType === "letter" ? profile.letterBoost : profile.digitBoost;

  return clamp(profile.baseError + typeBoost + difficultyPenalty(difficulty) + charBoost, 0.03, 0.92);
}

function responseTime(profile: ProfileConfig, difficulty: ColorDifficulty, attemptNumber: number, random: () => number) {
  const difficultyTime = difficulty === "medium" ? 0 : difficulty === "hard" ? 180 : 340;
  return Math.round(
    profile.responseBaseMs +
      difficultyTime +
      attemptNumber * 210 +
      (random() * 2 - 1) * profile.responseJitterMs
  );
}

function simulateSession(profileName: ProfileName, seed: number) {
  const profile = PROFILES[profileName];
  const trials = generateColorTrials(8, seed);
  const random = createSeededRandom(seed + 9001);
  const phase = createEmptyPhase();

  for (const [trialIndex, trial] of trials.entries()) {
    phase.startedTrials += 1;

    if (trial.type === "redGreen") {
      phase.redGreenTrials += 1;
    } else if (trial.type === "blueYellow") {
      phase.blueYellowTrials += 1;
    } else {
      phase.lowContrastTrials += 1;
    }

    if (trial.charType === "letter") {
      phase.letterTrials += 1;
    } else {
      phase.numberTrials += 1;
    }

    const baseError = errorProbability(profile, trial.type, trial.difficulty, trial.charType);
    let resolved = false;

    for (let attemptNumber = 1; attemptNumber <= 3 && !resolved; attemptNumber += 1) {
      const attemptError = clamp(baseError - (attemptNumber - 1) * profile.recoveryStep, 0.02, 0.95);
      const correct = random() >= attemptError;
      const selected = correct ? trial.answer : pickWrongOption(trial.options, trial.answer, random);
      const record: ColorResponseRecord = {
        target: trial.answer,
        selected,
        correct,
        trialType: trial.type,
        difficulty: trial.difficulty,
        charType: trial.charType,
        responseTimeMs: responseTime(profile, trial.difficulty, attemptNumber, random),
        optionSet: [...trial.options],
        trialIndex,
        usedAutoHelp: false
      };

      pushResponse(phase, record, attemptNumber === 1);

      if (correct) {
        phase.completedTrials += 1;
        resolved = true;
        break;
      }

      const shouldAutoHelp =
        attemptNumber === 3 ||
        (attemptNumber >= 2 && random() < clamp(profile.autoHelpBias + attemptError * 0.18, 0, 0.85));

      if (shouldAutoHelp) {
        phase.autoHelpCount += 1;
        phase.completedTrials += 1;
        resolved = true;
      }
    }

    if (!resolved) {
      phase.completedTrials += 1;
    }
  }

  return phase;
}

async function generateBehaviorDataset() {
  const rows: string[] = [
    ["sessionId", "profileName", ...COLORBLIND_MODEL_FEATURES, "ColorBlind"].join(",")
  ];
  let sessionId = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const profileName of Object.keys(PROFILE_COUNTS) as ProfileName[]) {
    const count = PROFILE_COUNTS[profileName];

    for (let index = 0; index < count; index += 1) {
      const phase = simulateSession(profileName, 40000 + sessionId * 17);
      const featureVector = buildColorblindFeatureVectorFromPhase(phase);

      if (!featureVector) {
        continue;
      }

      const label = PROFILES[profileName].label;
      rows.push(
        [
          String(sessionId),
          profileName,
          ...featureVector.map((value) => value.toFixed(6)),
          String(label)
        ].join(",")
      );

      if (label === 1) {
        positiveCount += 1;
      } else {
        negativeCount += 1;
      }

      sessionId += 1;
    }
  }

  await fs.writeFile(path.join(OUTPUT_DIR, "sessions.csv"), `${rows.join("\n")}\n`, "utf8");

  return {
    rows: sessionId,
    positiveCount,
    negativeCount
  };
}

async function main() {
  log("Generating local colorblind resources.");
  log(`Output directory: ${OUTPUT_DIR}`);

  await ensureStructure();
  const countsBySplit = await generateImageCorpus();
  const behaviorSummary = await generateBehaviorDataset();

  log("Image corpus summary", countsBySplit);
  log("Behavior dataset summary", behaviorSummary);
  log("Colorblind resources generated successfully.");
}

main().catch((error: unknown) => {
  console.error(
    `[generate:colorblind] ${
      error instanceof Error ? error.message : "Unknown error during colorblind resource generation."
    }`
  );
  process.exitCode = 1;
});
