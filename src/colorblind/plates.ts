export type ColorPlateType = "redGreen" | "blueYellow" | "lowContrast";
export type ColorCharacterType = "digit" | "letter";
export type ColorDifficulty = "medium" | "hard" | "expert";

export interface ColorTrialSpec {
  prompt: string;
  hidden: string;
  answer: string;
  options: string[];
  type: ColorPlateType;
  seed: number;
  charType: ColorCharacterType;
  difficulty: ColorDifficulty;
}

export interface IshiharaDot {
  x: number;
  y: number;
  radius: number;
  color: string;
  isHidden: boolean;
}

export interface IshiharaPlate {
  dots: IshiharaDot[];
  backgroundColor: string;
  borderColor: string;
}

type Stroke = readonly [number, number, number, number];

type DifficultyConfig = {
  dotCount: number;
  maxRotation: number;
  maxOffset: number;
  swapChance: number;
  edgeDropChance: number;
  edgeLeakChance: number;
  speckleChance: number;
  minDotRadius: number;
  maxDotRadius: number;
  minGap: number;
  outerPadding: number;
  scale: number;
};

type PaletteConfig = {
  backgroundColor: string;
  borderColor: string;
  backgroundDots: string[];
  hiddenDots: string[];
  sharedDots: string[];
};

type GlyphSampler = {
  coverageAt: (x: number, y: number) => number;
};

type PackedDot = {
  x: number;
  y: number;
  radius: number;
};

const DIGITS = "0123456789".split("");
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const COLORBLIND_CHARACTER_SET = [...DIGITS, ...LETTERS];

const CONFUSABLE_MAP: Record<string, string[]> = {
  "0": ["O", "Q", "8", "6"],
  "1": ["I", "L", "7", "T"],
  "2": ["Z", "S", "7", "N"],
  "3": ["8", "B", "E", "9"],
  "4": ["A", "9", "H", "Y"],
  "5": ["S", "6", "8", "2"],
  "6": ["G", "C", "8", "0"],
  "7": ["1", "T", "Y", "Z"],
  "8": ["B", "3", "0", "6"],
  "9": ["G", "8", "4", "P"],
  A: ["4", "H", "R", "X"],
  B: ["8", "3", "R", "P"],
  C: ["G", "O", "6", "Q"],
  D: ["O", "0", "P", "Q"],
  E: ["F", "B", "3", "Z"],
  F: ["E", "P", "T", "I"],
  G: ["6", "C", "Q", "9"],
  H: ["A", "M", "N", "K"],
  I: ["1", "L", "T", "J"],
  J: ["I", "L", "U", "Y"],
  K: ["X", "H", "R", "Y"],
  L: ["1", "I", "J", "T"],
  M: ["N", "H", "W", "K"],
  N: ["M", "H", "Z", "A"],
  O: ["0", "Q", "C", "D"],
  P: ["R", "B", "F", "D"],
  Q: ["O", "0", "G", "C"],
  R: ["P", "B", "A", "K"],
  S: ["5", "2", "8", "Z"],
  T: ["1", "I", "Y", "7"],
  U: ["V", "O", "J", "Y"],
  V: ["Y", "U", "W", "X"],
  W: ["M", "V", "N", "X"],
  X: ["K", "Y", "H", "A"],
  Y: ["V", "T", "7", "X"],
  Z: ["2", "S", "N", "7"]
};

const S = {
  top: 0.14,
  upper: 0.28,
  mid: 0.5,
  lower: 0.72,
  bottom: 0.86,
  left: 0.22,
  innerLeft: 0.36,
  center: 0.5,
  innerRight: 0.64,
  right: 0.78
} as const;

const GLYPH_STROKES: Record<string, Stroke[]> = {
  "0": [
    [S.left, S.top, S.right, S.top],
    [S.left, S.bottom, S.right, S.bottom],
    [S.left, S.top, S.left, S.bottom],
    [S.right, S.top, S.right, S.bottom]
  ],
  "1": [
    [S.innerLeft, S.upper, S.center, S.top],
    [S.center, S.top, S.center, S.bottom],
    [S.innerLeft, S.bottom, S.innerRight, S.bottom]
  ],
  "2": [
    [S.left, S.top, S.right, S.top],
    [S.right, S.top, S.right, S.mid],
    [S.left, S.mid, S.right, S.mid],
    [S.left, S.mid, S.left, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  "3": [
    [S.left, S.top, S.right, S.top],
    [S.right, S.top, S.right, S.bottom],
    [S.left, S.mid, S.right, S.mid],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  "4": [
    [S.left, S.top, S.left, S.mid],
    [S.left, S.mid, S.right, S.mid],
    [S.right, S.top, S.right, S.bottom]
  ],
  "5": [
    [S.left, S.top, S.right, S.top],
    [S.left, S.top, S.left, S.mid],
    [S.left, S.mid, S.right, S.mid],
    [S.right, S.mid, S.right, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  "6": [
    [S.left, S.top, S.right, S.top],
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.mid, S.right, S.mid],
    [S.right, S.mid, S.right, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  "7": [
    [S.left, S.top, S.right, S.top],
    [S.right, S.top, S.center, S.bottom]
  ],
  "8": [
    [S.left, S.top, S.right, S.top],
    [S.left, S.bottom, S.right, S.bottom],
    [S.left, S.top, S.left, S.bottom],
    [S.right, S.top, S.right, S.bottom],
    [S.left, S.mid, S.right, S.mid]
  ],
  "9": [
    [S.left, S.top, S.right, S.top],
    [S.left, S.top, S.left, S.mid],
    [S.right, S.top, S.right, S.bottom],
    [S.left, S.mid, S.right, S.mid],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  A: [
    [S.left, S.bottom, S.center, S.top],
    [S.center, S.top, S.right, S.bottom],
    [S.innerLeft, S.mid, S.innerRight, S.mid]
  ],
  B: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.top, S.innerRight, S.top],
    [S.left, S.mid, S.innerRight, S.mid],
    [S.left, S.bottom, S.innerRight, S.bottom],
    [S.right, S.upper, S.right, S.lower]
  ],
  C: [
    [S.left, S.top, S.right, S.top],
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  D: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.top, S.innerRight, S.top],
    [S.left, S.bottom, S.innerRight, S.bottom],
    [S.right, S.upper, S.right, S.lower]
  ],
  E: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.top, S.right, S.top],
    [S.left, S.mid, S.innerRight, S.mid],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  F: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.top, S.right, S.top],
    [S.left, S.mid, S.innerRight, S.mid]
  ],
  G: [
    [S.left, S.top, S.right, S.top],
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.bottom, S.right, S.bottom],
    [S.center, S.mid, S.right, S.mid],
    [S.right, S.mid, S.right, S.bottom]
  ],
  H: [
    [S.left, S.top, S.left, S.bottom],
    [S.right, S.top, S.right, S.bottom],
    [S.left, S.mid, S.right, S.mid]
  ],
  I: [
    [S.left, S.top, S.right, S.top],
    [S.center, S.top, S.center, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  J: [
    [S.left, S.top, S.right, S.top],
    [S.center, S.top, S.center, S.bottom],
    [S.left, S.bottom, S.center, S.bottom]
  ],
  K: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.mid, S.right, S.top],
    [S.left, S.mid, S.right, S.bottom]
  ],
  L: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  M: [
    [S.left, S.bottom, S.left, S.top],
    [S.left, S.top, S.center, S.mid],
    [S.center, S.mid, S.right, S.top],
    [S.right, S.top, S.right, S.bottom]
  ],
  N: [
    [S.left, S.bottom, S.left, S.top],
    [S.left, S.top, S.right, S.bottom],
    [S.right, S.bottom, S.right, S.top]
  ],
  O: [
    [S.left, S.top, S.right, S.top],
    [S.left, S.bottom, S.right, S.bottom],
    [S.left, S.top, S.left, S.bottom],
    [S.right, S.top, S.right, S.bottom]
  ],
  P: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.top, S.right, S.top],
    [S.left, S.mid, S.right, S.mid],
    [S.right, S.top, S.right, S.mid]
  ],
  Q: [
    [S.left, S.top, S.right, S.top],
    [S.left, S.bottom, S.right, S.bottom],
    [S.left, S.top, S.left, S.bottom],
    [S.right, S.top, S.right, S.bottom],
    [S.center, S.lower, S.right, S.bottom]
  ],
  R: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.top, S.right, S.top],
    [S.left, S.mid, S.right, S.mid],
    [S.right, S.top, S.right, S.mid],
    [S.left, S.mid, S.right, S.bottom]
  ],
  S: [
    [S.left, S.top, S.right, S.top],
    [S.left, S.top, S.left, S.mid],
    [S.left, S.mid, S.right, S.mid],
    [S.right, S.mid, S.right, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  T: [
    [S.left, S.top, S.right, S.top],
    [S.center, S.top, S.center, S.bottom]
  ],
  U: [
    [S.left, S.top, S.left, S.bottom],
    [S.right, S.top, S.right, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ],
  V: [
    [S.left, S.top, S.center, S.bottom],
    [S.right, S.top, S.center, S.bottom]
  ],
  W: [
    [S.left, S.top, S.left, S.bottom],
    [S.left, S.bottom, S.center, S.lower],
    [S.center, S.lower, S.right, S.bottom],
    [S.right, S.bottom, S.right, S.top]
  ],
  X: [
    [S.left, S.top, S.right, S.bottom],
    [S.right, S.top, S.left, S.bottom]
  ],
  Y: [
    [S.left, S.top, S.center, S.mid],
    [S.right, S.top, S.center, S.mid],
    [S.center, S.mid, S.center, S.bottom]
  ],
  Z: [
    [S.left, S.top, S.right, S.top],
    [S.right, S.top, S.left, S.bottom],
    [S.left, S.bottom, S.right, S.bottom]
  ]
};

const DIFFICULTY_CONFIG: Record<ColorDifficulty, DifficultyConfig> = {
  medium: {
    dotCount: 620,
    maxRotation: 0.045,
    maxOffset: 0.9,
    swapChance: 0.01,
    edgeDropChance: 0.015,
    edgeLeakChance: 0.01,
    speckleChance: 0.002,
    minDotRadius: 0.024,
    maxDotRadius: 0.057,
    minGap: 0.0065,
    outerPadding: 0.02,
    scale: 3.15
  },
  hard: {
    dotCount: 680,
    maxRotation: 0.07,
    maxOffset: 1.15,
    swapChance: 0.018,
    edgeDropChance: 0.028,
    edgeLeakChance: 0.018,
    speckleChance: 0.003,
    minDotRadius: 0.022,
    maxDotRadius: 0.052,
    minGap: 0.0056,
    outerPadding: 0.018,
    scale: 3
  },
  expert: {
    dotCount: 740,
    maxRotation: 0.095,
    maxOffset: 1.35,
    swapChance: 0.028,
    edgeDropChance: 0.04,
    edgeLeakChance: 0.028,
    speckleChance: 0.004,
    minDotRadius: 0.02,
    maxDotRadius: 0.048,
    minGap: 0.0048,
    outerPadding: 0.016,
    scale: 2.85
  }
};

const PALETTES: Record<ColorPlateType, PaletteConfig> = {
  redGreen: {
    backgroundColor: "#f6ecd7",
    borderColor: "#d3c6ac",
    backgroundDots: ["#92a688", "#a0b27b", "#b7b16b", "#98b094", "#c2bc7a", "#7ea49a"],
    hiddenDots: ["#d18469", "#de9774", "#cb766d", "#c98286", "#e0a285", "#c46860"],
    sharedDots: ["#d6c292", "#bba783", "#9cac8b", "#e3d4b5"]
  },
  blueYellow: {
    backgroundColor: "#f6ecd7",
    borderColor: "#d3c6ac",
    backgroundDots: ["#79a4b1", "#87b1b7", "#97b8aa", "#6e9db1", "#a8b98d", "#82a99d"],
    hiddenDots: ["#c9a25c", "#ddb86d", "#c59d4f", "#e0bc7c", "#b99152", "#d2ad63"],
    sharedDots: ["#d8ca9e", "#aac09f", "#a5b8b7", "#e2d7b9"]
  },
  lowContrast: {
    backgroundColor: "#f6ecd7",
    borderColor: "#d3c6ac",
    backgroundDots: ["#a3b57c", "#b0bb85", "#c2bf8b", "#9cb07b", "#b4bf92", "#cabf95"],
    hiddenDots: ["#bca56f", "#c9ae7a", "#a89d75", "#d0ba88", "#b69d71", "#c6b483"],
    sharedDots: ["#d9cfad", "#b9c39b", "#c7b28b", "#e4dbc3"]
  }
};

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

function shuffleWithSeed<T>(values: T[], seed: number) {
  const copy = [...values];
  const random = createSeededRandom(seed);

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function pickDistinctValues(seed: number, pool: string[], count: number, exclude: string[]) {
  const disallowed = new Set(exclude);
  const picked: string[] = [];

  for (const value of shuffleWithSeed(pool, seed)) {
    if (disallowed.has(value) || picked.includes(value)) {
      continue;
    }

    picked.push(value);

    if (picked.length >= count) {
      break;
    }
  }

  return picked;
}

function typeScheduleForCount(count: number, seed: number) {
  const base: ColorPlateType[] = [
    "redGreen",
    "blueYellow",
    "lowContrast",
    "redGreen",
    "blueYellow",
    "lowContrast",
    "redGreen",
    "blueYellow"
  ];

  const values: ColorPlateType[] = [];
  while (values.length < count) {
    values.push(...base);
  }

  return shuffleWithSeed(values.slice(0, count), seed);
}

function charTypeScheduleForCount(count: number, seed: number) {
  const values: ColorCharacterType[] = [];
  let toggle: ColorCharacterType = "digit";

  while (values.length < count) {
    values.push(toggle);
    toggle = toggle === "digit" ? "letter" : "digit";
  }

  const scheduled = values.slice(0, count);
  const digitCount = Math.ceil(count / 2);
  const letterCount = Math.floor(count / 2);
  const balanced = [...new Array(digitCount).fill("digit"), ...new Array(letterCount).fill("letter")] as
    | ColorCharacterType[]
    | string[];

  return shuffleWithSeed(balanced as ColorCharacterType[], seed + scheduled.length);
}

function difficultyScheduleForCount(count: number, seed: number) {
  const base: ColorDifficulty[] = ["medium", "hard", "medium", "hard", "medium", "hard", "expert", "medium"];
  const values: ColorDifficulty[] = [];

  while (values.length < count) {
    values.push(...base);
  }

  return shuffleWithSeed(values.slice(0, count), seed);
}

function buildOptions(answer: string, charType: ColorCharacterType, seed: number) {
  const preferredPool = CONFUSABLE_MAP[answer] ?? [];
  const sameTypePool = charType === "digit" ? DIGITS : LETTERS;
  const mixedPool = [...preferredPool, ...sameTypePool, ...COLORBLIND_CHARACTER_SET];
  const distractors = pickDistinctValues(seed, mixedPool, 3, [answer]);

  return shuffleWithSeed([answer, ...distractors], seed + 701);
}

export function inferCharacterType(character: string): ColorCharacterType {
  return DIGITS.includes(character) ? "digit" : "letter";
}

export function createColorTrialSpec(
  hidden: string,
  type: ColorPlateType,
  difficulty: ColorDifficulty,
  seed: number,
  prompt = "Descubra o caractere escondido."
) {
  const charType = inferCharacterType(hidden);

  return {
    prompt,
    hidden,
    answer: hidden,
    options: buildOptions(hidden, charType, seed + 19),
    type,
    seed,
    charType,
    difficulty
  } satisfies ColorTrialSpec;
}

export function generateColorTrials(count: number, baseSeed: number) {
  const trials: ColorTrialSpec[] = [];
  const types = typeScheduleForCount(count, baseSeed + 11);
  const charTypes = charTypeScheduleForCount(count, baseSeed + 29);
  const difficulties = difficultyScheduleForCount(count, baseSeed + 47);
  const digits = shuffleWithSeed(DIGITS, baseSeed + 83);
  const letters = shuffleWithSeed(LETTERS, baseSeed + 107);
  let digitIndex = 0;
  let letterIndex = 0;

  for (let index = 0; index < count; index += 1) {
    const charType = charTypes[index];
    const hidden =
      charType === "digit"
        ? digits[digitIndex++ % digits.length]
        : letters[letterIndex++ % letters.length];
    const seed = baseSeed + index * 97 + 13;

    trials.push(
      createColorTrialSpec(
        hidden,
        types[index],
        difficulties[index],
        seed,
        `Placa ${index + 1} de ${count}. Descubra o caractere escondido.`
      )
    );
  }

  return trials;
}

function pointToSegmentDistanceSquared(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 1e-6) {
    const distX = px - x1;
    const distY = py - y1;
    return distX * distX + distY * distY;
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const closestX = x1 + dx * t;
  const closestY = y1 + dy * t;
  const distX = px - closestX;
  const distY = py - closestY;

  return distX * distX + distY * distY;
}

function glyphSample(strokes: Stroke[], x: number, y: number, thickness: number) {
  const radiusSquared = thickness * thickness;

  return strokes.some(([x1, y1, x2, y2]) => pointToSegmentDistanceSquared(x, y, x1, y1, x2, y2) <= radiusSquared)
    ? 1
    : 0;
}

function glyphCoverage(strokes: Stroke[], x: number, y: number, thickness: number) {
  const offsets = [
    [0, 0, 2],
    [-0.06, -0.06, 1],
    [0.06, -0.06, 1],
    [-0.06, 0.06, 1],
    [0.06, 0.06, 1],
    [-0.12, 0, 0.8],
    [0.12, 0, 0.8],
    [0, -0.12, 0.8],
    [0, 0.12, 0.8]
  ] as const;

  const totalWeight = offsets.reduce((sum, [, , weight]) => sum + weight, 0);
  const covered = offsets.reduce(
    (sum, [offsetX, offsetY, weight]) => sum + glyphSample(strokes, x + offsetX, y + offsetY, thickness) * weight,
    0
  );

  return covered / totalWeight;
}

function buildGlyphSampler(trial: ColorTrialSpec): GlyphSampler {
  const strokes = GLYPH_STROKES[trial.hidden];
  const config = DIFFICULTY_CONFIG[trial.difficulty];
  const random = createSeededRandom(trial.seed + 211);
  const rotation = (random() * 2 - 1) * config.maxRotation;
  const offsetX = (random() * 2 - 1) * config.maxOffset;
  const offsetY = (random() * 2 - 1) * config.maxOffset * 0.74;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const centerX = 14 + offsetX;
  const centerY = 14 + offsetY;
  const glyphWidth = config.scale * (trial.charType === "digit" ? 5.4 : 6.1);
  const glyphHeight = config.scale * 7.2;
  const thickness = trial.charType === "digit" ? 0.13 : 0.12;

  return {
    coverageAt: (x: number, y: number) => {
      const sourceXBase = 14 + x * 14;
      const sourceYBase = 14 + y * 14;
      const localX = sourceXBase - centerX;
      const localY = sourceYBase - centerY;
      const sourceX = (localX * cos + localY * sin) / glyphWidth + 0.5;
      const sourceY = (-localX * sin + localY * cos) / glyphHeight + 0.5;

      return glyphCoverage(strokes, sourceX, sourceY, thickness);
    }
  };
}

function sampleDotCoverage(sampler: GlyphSampler, x: number, y: number, radius: number) {
  const offsets = [
    [0, 0, 2],
    [-0.42, 0, 1],
    [0.42, 0, 1],
    [0, -0.42, 1],
    [0, 0.42, 1],
    [-0.28, -0.28, 0.75],
    [0.28, -0.28, 0.75],
    [-0.28, 0.28, 0.75],
    [0.28, 0.28, 0.75]
  ] as const;
  const reach = radius * 0.86;
  const totalWeight = offsets.reduce((sum, [, , weight]) => sum + weight, 0);
  const covered = offsets.reduce(
    (sum, [offsetX, offsetY, weight]) => sum + sampler.coverageAt(x + offsetX * reach, y + offsetY * reach) * weight,
    0
  );

  return covered / totalWeight;
}

function pickDotRadius(config: DifficultyConfig, random: () => number) {
  const span = config.maxDotRadius - config.minDotRadius;
  const bandRoll = random();

  if (bandRoll < 0.18) {
    return config.minDotRadius + span * (0.72 + random() * 0.28);
  }

  if (bandRoll < 0.54) {
    return config.minDotRadius + span * (0.38 + random() * 0.34);
  }

  return config.minDotRadius + span * (0.04 + random() * 0.3);
}

function buildPackedDots(config: DifficultyConfig, random: () => number) {
  const dots: PackedDot[] = [];
  const spatialIndex = new Map<string, PackedDot[]>();
  const cellSize = config.maxDotRadius * 2 + config.minGap;
  const candidates = Array.from({ length: config.dotCount }, () => pickDotRadius(config, random)).sort(
    (left, right) => right - left
  );

  const cellCoord = (value: number) => Math.floor(value / cellSize);
  const bucketKey = (cellX: number, cellY: number) => `${cellX}:${cellY}`;
  const addDot = (dot: PackedDot) => {
    const key = bucketKey(cellCoord(dot.x), cellCoord(dot.y));
    const bucket = spatialIndex.get(key);

    if (bucket) {
      bucket.push(dot);
    } else {
      spatialIndex.set(key, [dot]);
    }

    dots.push(dot);
  };
  const canPlace = (x: number, y: number, radius: number) => {
    const maxDistance = 0.985 - config.outerPadding - radius;

    if (x * x + y * y > maxDistance * maxDistance) {
      return false;
    }

    const influence = radius + config.maxDotRadius + config.minGap;
    const minCellX = cellCoord(x - influence);
    const maxCellX = cellCoord(x + influence);
    const minCellY = cellCoord(y - influence);
    const maxCellY = cellCoord(y + influence);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const bucket = spatialIndex.get(bucketKey(cellX, cellY));

        if (!bucket) {
          continue;
        }

        for (const dot of bucket) {
          const dx = x - dot.x;
          const dy = y - dot.y;
          const minDistance = radius + dot.radius + config.minGap;

          if (dx * dx + dy * dy < minDistance * minDistance) {
            return false;
          }
        }
      }
    }

    return true;
  };
  const tryPlace = (radius: number, attempts: number) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * (0.985 - config.outerPadding - radius);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      if (!canPlace(x, y, radius)) {
        continue;
      }

      addDot({ x, y, radius });
      return true;
    }

    return false;
  };

  for (const radius of candidates) {
    if (tryPlace(radius, 42)) {
      continue;
    }

    const reducedRadius = Math.max(config.minDotRadius * 0.92, radius * 0.92);

    if (reducedRadius < radius - 0.0005) {
      tryPlace(reducedRadius, 26);
    }
  }

  const minimumDots = Math.floor(config.dotCount * 0.88);
  let fillAttempts = 0;

  while (dots.length < minimumDots && fillAttempts < config.dotCount * 8) {
    fillAttempts += 1;
    const radius = config.minDotRadius * (0.92 + random() * 0.2);
    tryPlace(radius, 1);
  }

  return dots;
}

function resolveDotMembership(coverage: number, config: DifficultyConfig, random: () => number) {
  const nearEdge = coverage > 0.18 && coverage < 0.82;
  let active = coverage >= 0.52;
  const noise = random();

  if (active && nearEdge && noise < config.edgeDropChance) {
    active = false;
  } else if (!active && nearEdge && noise < config.edgeLeakChance) {
    active = true;
  } else if (!active && coverage > 0.08 && noise < config.speckleChance) {
    active = true;
  }

  if (random() < config.swapChance) {
    active = !active;
  }

  return active;
}

function pickDotColor(palette: PaletteConfig, isHidden: boolean, random: () => number) {
  if (random() < 0.14) {
    const sharedColors = palette.sharedDots;
    return sharedColors[Math.floor(random() * sharedColors.length) % sharedColors.length];
  }

  const colors = isHidden ? palette.hiddenDots : palette.backgroundDots;
  return colors[Math.floor(random() * colors.length) % colors.length];
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

export function buildIshiharaPlate(trial: ColorTrialSpec): IshiharaPlate {
  const config = DIFFICULTY_CONFIG[trial.difficulty];
  const palette = PALETTES[trial.type];
  const random = createSeededRandom(trial.seed + 389);
  const sampler = buildGlyphSampler(trial);
  const layout = buildPackedDots(config, random);
  const dots = layout.map(({ x, y, radius }) => {
    const coverage = sampleDotCoverage(sampler, x, y, radius);
    const isHidden = resolveDotMembership(coverage, config, random);

    return {
      x,
      y,
      radius,
      color: pickDotColor(palette, isHidden, random),
      isHidden
    };
  });

  return {
    dots,
    backgroundColor: palette.backgroundColor,
    borderColor: palette.borderColor
  };
}

export function rasterizeIshiharaPlate(trial: ColorTrialSpec, size = 28) {
  const plate = buildIshiharaPlate(trial);
  const background = hexToRgb(plate.backgroundColor);
  const outside = { r: 255, g: 255, b: 255 };
  const data = new Uint8ClampedArray(size * size * 3);

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const normalizedX = ((pixelX + 0.5) / size) * 2 - 1;
      const normalizedY = ((pixelY + 0.5) / size) * 2 - 1;
      const insidePlate = normalizedX * normalizedX + normalizedY * normalizedY <= 1;
      const base = insidePlate ? background : outside;
      const offset = (pixelY * size + pixelX) * 3;
      data[offset] = base.r;
      data[offset + 1] = base.g;
      data[offset + 2] = base.b;
    }
  }

  for (const dot of plate.dots) {
    const rgb = hexToRgb(dot.color);
    const centerX = ((dot.x + 1) / 2) * size;
    const centerY = ((dot.y + 1) / 2) * size;
    const radius = dot.radius * (size / 2);
    const minX = Math.max(0, Math.floor(centerX - radius - 1));
    const maxX = Math.min(size - 1, Math.ceil(centerX + radius + 1));
    const minY = Math.max(0, Math.floor(centerY - radius - 1));
    const maxY = Math.min(size - 1, Math.ceil(centerY + radius + 1));

    for (let pixelY = minY; pixelY <= maxY; pixelY += 1) {
      for (let pixelX = minX; pixelX <= maxX; pixelX += 1) {
        const dx = pixelX + 0.5 - centerX;
        const dy = pixelY + 0.5 - centerY;

        if (dx * dx + dy * dy > radius * radius) {
          continue;
        }

        const offset = (pixelY * size + pixelX) * 3;
        data[offset] = rgb.r;
        data[offset + 1] = rgb.g;
        data[offset + 2] = rgb.b;
      }
    }
  }

  return {
    width: size,
    height: size,
    data
  };
}
