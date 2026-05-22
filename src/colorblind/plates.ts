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
  activationThreshold: number;
  edgeLow: number;
  edgeHigh: number;
  coverageReach: number;
  sharedDotChance: number;
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

type DigitMask = {
  width: number;
  height: number;
  alpha: number[][];
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

const DIGIT_MASK_VALUES: Record<string, number> = {
  " ": 0,
  ".": 0.12,
  ":": 0.34,
  "*": 0.66,
  "#": 1
};

function createDigitMask(template: string): DigitMask {
  const rows = template
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const markerIndex = line.indexOf("|");
      return (markerIndex >= 0 ? line.slice(markerIndex + 1) : line).replace(/\r/g, "");
    });
  const width = rows.reduce((maxWidth, row) => Math.max(maxWidth, row.length), 0);
  const alpha = rows.map((row) =>
    row
      .padEnd(width, " ")
      .split("")
      .map((char) => DIGIT_MASK_VALUES[char] ?? 0)
  );

  return {
    width,
    height: rows.length,
    alpha
  };
}

const DIGIT_MASKS: Record<string, DigitMask> = {
  "0": createDigitMask(`
    |    .::.    
    |  :*####*:  
    | :########: 
    | *###::###* 
    |:###....###:
    |*##:    :##*
    |###      ###
    |###      ###
    |###      ###
    |###      ###
    |###      ###
    |###      ###
    |*##:    :##*
    |:###....###:
    | *###::###* 
    | :########: 
    |  :*####*:  
    |    .::.    
  `),
  "1": createDigitMask(`
    |     .::     
    |    :*##     
    |   :####     
    |  .#####     
    |    ###:     
    |    ###      
    |    ###      
    |    ###      
    |    ###      
    |    ###      
    |    ###      
    |    ###      
    |    ###      
    |    ###      
    |   :###:     
    |  :*####*.   
    | :########:  
    |   ......    
  `),
  "2": createDigitMask(`
    |   .::::.    
    |  :*####*:   
    | :########:  
    | *###::###*  
    | .:.   :###: 
    |       *##*  
    |      :###.  
    |     :###:   
    |    :###:    
    |   :###:     
    |  :###:      
    | :###.       
    | *##*        
    |:###::::::.  
    |*##########: 
    |###########* 
    |:##########: 
    |  ::::::::   
  `),
  "3": createDigitMask(`
    |   .::::.    
    |  :*####*:   
    | :########:  
    | *###::###*  
    | .::.  :###: 
    |       *##*  
    |    .:*###:  
    |    :#####.  
    |    .:*###:  
    |       *##*  
    |       *##*  
    | .::.  :###: 
    | *###::###*  
    | :########:  
    |  :*####*:   
    |    ::::     
  `),
  "4": createDigitMask(`
    |      ###    
    |     *###    
    |    :####    
    |   :##*##    
    |  .### ###   
    |  ###: ###   
    | :###  ###   
    | *##*  ###   
    |:########### 
    |############ 
    |###########: 
    |       ###   
    |       ###   
    |       ###   
    |      :###:  
    |      :###:  
  `),
  "5": createDigitMask(`
    |  ::::::::   
    | :########:  
    | *########*  
    | ###:        
    | ###         
    | ###:::::.   
    | #########:  
    | ##########: 
    | ::::..*###* 
    |        :###:
    |         ###*
    | .::.  .###* 
    | *###::###*: 
    | :########:  
    |  :*####*:   
    |    .::.     
  `),
  "6": createDigitMask(`
    |    .:::.    
    |   :*###*:   
    |  :#######:  
    | .###*::.    
    | :##*        
    | ###         
    |###:::::.    
    |#########:   
    |##########:  
    |###:  :###*  
    |###    *###  
    |###    *###  
    |*##:  :###*  
    |:###::###*:  
    | :########:  
    |  :*####*:   
    |    .::.     
  `),
  "7": createDigitMask(`
    |:###########: 
    |############* 
    |###########*  
    |.......:###:  
    |      .###*   
    |      *###    
    |     :###:    
    |     ###*     
    |    *###      
    |   :###:      
    |   ###*       
    |  *###        
    | .###:        
    | :###         
    | ###          
    |:##*          
  `),
  "8": createDigitMask(`
    |    .:::.    
    |  :*####*:   
    | :########:  
    | *###::###*  
    |:###....###: 
    |*##*    *##* 
    |:###....###: 
    | *###::###*  
    |  :######:   
    | *###::###*  
    |:###....###: 
    |###      ### 
    |###      ### 
    |*##*    *##* 
    |:###....###: 
    | *########*  
    |  :*####*:   
    |    .:::.    
  `),
  "9": createDigitMask(`
    |    .:::.    
    |  :*####*:   
    | :########:  
    | *###::###*  
    |:###....###: 
    |*##*    *##* 
    |###      ### 
    |###      ### 
    |*###:  :#### 
    |:########### 
    |  :######### 
    |       :###* 
    |        ###: 
    |    ..:###   
    | .:*#####:   
    | :######*.   
    |  .::::      
  `)
};

const DIFFICULTY_CONFIG: Record<ColorDifficulty, DifficultyConfig> = {
  medium: {
    dotCount: 760,
    maxRotation: 0.04,
    maxOffset: 0.75,
    swapChance: 0.008,
    edgeDropChance: 0.012,
    edgeLeakChance: 0.008,
    speckleChance: 0.0014,
    minDotRadius: 0.018,
    maxDotRadius: 0.045,
    minGap: 0.0048,
    outerPadding: 0.018,
    scale: 2.95,
    activationThreshold: 0.52,
    edgeLow: 0.18,
    edgeHigh: 0.82,
    coverageReach: 0.78,
    sharedDotChance: 0.1
  },
  hard: {
    dotCount: 840,
    maxRotation: 0.055,
    maxOffset: 0.92,
    swapChance: 0.012,
    edgeDropChance: 0.018,
    edgeLeakChance: 0.012,
    speckleChance: 0.0018,
    minDotRadius: 0.017,
    maxDotRadius: 0.041,
    minGap: 0.0043,
    outerPadding: 0.017,
    scale: 2.83,
    activationThreshold: 0.54,
    edgeLow: 0.2,
    edgeHigh: 0.8,
    coverageReach: 0.76,
    sharedDotChance: 0.095
  },
  expert: {
    dotCount: 920,
    maxRotation: 0.075,
    maxOffset: 1.08,
    swapChance: 0.017,
    edgeDropChance: 0.024,
    edgeLeakChance: 0.017,
    speckleChance: 0.0022,
    minDotRadius: 0.016,
    maxDotRadius: 0.038,
    minGap: 0.0038,
    outerPadding: 0.016,
    scale: 2.72,
    activationThreshold: 0.56,
    edgeLow: 0.22,
    edgeHigh: 0.78,
    coverageReach: 0.74,
    sharedDotChance: 0.09
  }
};

const PALETTES: Record<ColorPlateType, PaletteConfig> = {
  redGreen: {
    backgroundColor: "#fbf8ef",
    borderColor: "#d9d0bd",
    backgroundDots: ["#7f9641", "#6f8e33", "#8ca24d", "#93a95a", "#83984a", "#7b9257"],
    hiddenDots: ["#d38768", "#db9b79", "#cf7b62", "#de9175", "#c96d58", "#d98b6f"],
    sharedDots: ["#e8dfcd", "#cfd6b0", "#d9caa8", "#d5dcc8"]
  },
  blueYellow: {
    backgroundColor: "#fbf8ef",
    borderColor: "#d9d0bd",
    backgroundDots: ["#6b9aaa", "#76a7b4", "#89b1b4", "#7c9fa9", "#8fb4a9", "#7198a7"],
    hiddenDots: ["#c39b53", "#d6b36c", "#b98d45", "#d8ad62", "#c8a15b", "#ddb872"],
    sharedDots: ["#e7dfcc", "#b9cbc3", "#c8d5d7", "#dcd2ba"]
  },
  lowContrast: {
    backgroundColor: "#fbf8ef",
    borderColor: "#d9d0bd",
    backgroundDots: ["#98a96f", "#a4b47a", "#aeb784", "#96a86e", "#b2bc8d", "#a1b07a"],
    hiddenDots: ["#bea06f", "#c6ac79", "#b59667", "#ccb183", "#c2a573", "#b99969"],
    sharedDots: ["#e8dfcf", "#c8cfb0", "#d7c8aa", "#dde0d1"]
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

function difficultyScheduleForCount(count: number, seed: number) {
  const base: ColorDifficulty[] = ["medium", "hard", "medium", "hard", "medium", "hard", "expert", "medium"];
  const values: ColorDifficulty[] = [];

  while (values.length < count) {
    values.push(...base);
  }

  return shuffleWithSeed(values.slice(0, count), seed);
}

function buildOptions(answer: string, charType: ColorCharacterType, seed: number) {
  const preferredPool = (CONFUSABLE_MAP[answer] ?? []).filter((value) =>
    charType === "digit" ? DIGITS.includes(value) : LETTERS.includes(value)
  );
  const sameTypePool = charType === "digit" ? DIGITS : LETTERS;
  const distractors = pickDistinctValues(seed, [...preferredPool, ...sameTypePool], 3, [answer]);

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
  prompt?: string
) {
  const charType = inferCharacterType(hidden);
  const resolvedPrompt = prompt ?? (charType === "digit" ? "Descubra o número escondido." : "Descubra o caractere escondido.");

  return {
    prompt: resolvedPrompt,
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
  const difficulties = difficultyScheduleForCount(count, baseSeed + 47);
  const digits = shuffleWithSeed(DIGITS, baseSeed + 83);
  let digitIndex = 0;

  for (let index = 0; index < count; index += 1) {
    const hidden = digits[digitIndex++ % digits.length];
    const seed = baseSeed + index * 97 + 13;

    trials.push(
      createColorTrialSpec(
        hidden,
        types[index],
        difficulties[index],
        seed,
        `Placa ${index + 1} de ${count}. Descubra o número escondido.`
      )
    );
  }

  return trials;
}

function plateDifficultyConfig(trial: ColorTrialSpec) {
  const base = DIFFICULTY_CONFIG[trial.difficulty];

  if (trial.charType !== "digit") {
    return base;
  }

  return {
    ...base,
    maxRotation: base.maxRotation * 0.45,
    maxOffset: base.maxOffset * 0.4,
    swapChance: base.swapChance * 0.25,
    edgeDropChance: base.edgeDropChance * 0.35,
    edgeLeakChance: base.edgeLeakChance * 0.25,
    speckleChance: base.speckleChance * 0.2,
    scale: base.scale * 1.04,
    activationThreshold: Math.min(0.64, base.activationThreshold + 0.055),
    edgeLow: Math.max(0.12, base.edgeLow - 0.04),
    edgeHigh: Math.max(base.edgeLow + 0.2, base.edgeHigh - 0.08),
    coverageReach: Math.max(0.66, base.coverageReach - 0.06),
    sharedDotChance: Math.max(0.045, base.sharedDotChance * 0.58)
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(min: number, max: number, value: number) {
  if (value <= min) {
    return 0;
  }

  if (value >= max) {
    return 1;
  }

  const t = (value - min) / (max - min);
  return t * t * (3 - 2 * t);
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

function sampleDigitMask(mask: DigitMask, x: number, y: number) {
  if (x <= 0 || x >= 1 || y <= 0 || y >= 1) {
    return 0;
  }

  const sampleX = x * (mask.width - 1);
  const sampleY = y * (mask.height - 1);
  const left = Math.floor(sampleX);
  const top = Math.floor(sampleY);
  const right = Math.min(mask.width - 1, left + 1);
  const bottom = Math.min(mask.height - 1, top + 1);
  const lerpX = sampleX - left;
  const lerpY = sampleY - top;
  const topLeft = mask.alpha[top]?.[left] ?? 0;
  const topRight = mask.alpha[top]?.[right] ?? 0;
  const bottomLeft = mask.alpha[bottom]?.[left] ?? 0;
  const bottomRight = mask.alpha[bottom]?.[right] ?? 0;
  const topValue = topLeft + (topRight - topLeft) * lerpX;
  const bottomValue = bottomLeft + (bottomRight - bottomLeft) * lerpX;
  const blended = topValue + (bottomValue - topValue) * lerpY;

  return smoothstep(0.08, 0.88, blended);
}

function buildDigitGlyphSampler(trial: ColorTrialSpec, config: DifficultyConfig): GlyphSampler {
  const mask = DIGIT_MASKS[trial.hidden];
  const random = createSeededRandom(trial.seed + 211);
  const rotation = (random() * 2 - 1) * config.maxRotation;
  const offsetX = (random() * 2 - 1) * config.maxOffset;
  const offsetY = (random() * 2 - 1) * config.maxOffset * 0.56;
  const skew = (random() * 2 - 1) * 0.06;
  const warpFrequency = 1.35 + random() * 0.35;
  const warpPhase = random() * Math.PI * 2;
  const warpX = 0.012 + random() * 0.01;
  const warpY = 0.008 + random() * 0.006;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const centerX = 14 + offsetX;
  const centerY = 14.16 + offsetY + (trial.hidden === "7" ? 0.16 : 0);
  const widthBias = trial.hidden === "1" ? 5.45 : trial.hidden === "7" ? 5.3 : 5.35;
  const heightBias = trial.hidden === "1" ? 7.25 : trial.hidden === "4" ? 6.95 : 7.15;
  const glyphWidth = config.scale * widthBias;
  const glyphHeight = config.scale * heightBias;

  return {
    coverageAt: (x: number, y: number) => {
      const sourceXBase = 14 + x * 14;
      const sourceYBase = 14 + y * 14;
      const localX = sourceXBase - centerX;
      const localY = sourceYBase - centerY;
      const rotatedX = localX * cos + localY * sin;
      const rotatedY = -localX * sin + localY * cos;
      let sourceX = rotatedX / glyphWidth + 0.5;
      let sourceY = rotatedY / glyphHeight + 0.5;

      sourceX += (sourceY - 0.5) * skew;
      sourceX += Math.sin((sourceY * warpFrequency + warpPhase) * Math.PI) * warpX;
      sourceY += Math.sin((sourceX * 1.8 + warpPhase * 0.5) * Math.PI) * warpY;

      return sampleDigitMask(mask, clamp01(sourceX), clamp01(sourceY));
    }
  };
}

function buildGlyphSampler(trial: ColorTrialSpec): GlyphSampler {
  const config = plateDifficultyConfig(trial);

  if (trial.charType === "digit" && DIGIT_MASKS[trial.hidden]) {
    return buildDigitGlyphSampler(trial, config);
  }

  const strokes = GLYPH_STROKES[trial.hidden];
  const random = createSeededRandom(trial.seed + 211);
  const rotation = (random() * 2 - 1) * config.maxRotation;
  const offsetX = (random() * 2 - 1) * config.maxOffset;
  const offsetY = (random() * 2 - 1) * config.maxOffset * 0.74;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const centerX = 14 + offsetX;
  const centerY = 14 + offsetY;
  const glyphWidth = config.scale * (trial.charType === "digit" ? 5.9 : 6.1);
  const glyphHeight = config.scale * (trial.charType === "digit" ? 7.55 : 7.2);
  const thickness = trial.charType === "digit" ? 0.155 : 0.12;

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

function sampleDotCoverage(sampler: GlyphSampler, x: number, y: number, radius: number, config: DifficultyConfig) {
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
  const reach = radius * config.coverageReach;
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

  if (bandRoll < 0.08) {
    return config.minDotRadius + span * (0.76 + random() * 0.24);
  }

  if (bandRoll < 0.34) {
    return config.minDotRadius + span * (0.42 + random() * 0.28);
  }

  return config.minDotRadius + span * (0.08 + random() * 0.26);
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
    if (tryPlace(radius, 56)) {
      continue;
    }

    const reducedRadius = Math.max(config.minDotRadius * 0.92, radius * 0.92);

    if (reducedRadius < radius - 0.0005) {
      tryPlace(reducedRadius, 32);
    }
  }

  const minimumDots = Math.floor(config.dotCount * 0.88);
  let fillAttempts = 0;

  while (dots.length < minimumDots && fillAttempts < config.dotCount * 10) {
    fillAttempts += 1;
    const radius = config.minDotRadius * (0.92 + random() * 0.2);
    tryPlace(radius, 1);
  }

  return dots;
}

function resolveDotMembership(coverage: number, config: DifficultyConfig, random: () => number) {
  const nearEdge = coverage > config.edgeLow && coverage < config.edgeHigh;
  let active = coverage >= config.activationThreshold;
  const noise = random();

  if (active && nearEdge && noise < config.edgeDropChance) {
    active = false;
  } else if (!active && nearEdge && noise < config.edgeLeakChance) {
    active = true;
  } else if (!active && coverage > config.edgeLow * 0.55 && noise < config.speckleChance) {
    active = true;
  }

  if (random() < config.swapChance) {
    active = !active;
  }

  return active;
}

function pickDotColor(palette: PaletteConfig, isHidden: boolean, random: () => number, config: DifficultyConfig) {
  if (random() < config.sharedDotChance) {
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
  const config = plateDifficultyConfig(trial);
  const palette = PALETTES[trial.type];
  const random = createSeededRandom(trial.seed + 389);
  const sampler = buildGlyphSampler(trial);
  const layout = buildPackedDots(config, random);
  const dots = layout.map(({ x, y, radius }) => {
    const coverage = sampleDotCoverage(sampler, x, y, radius, config);
    const isHidden = resolveDotMembership(coverage, config, random);

    return {
      x,
      y,
      radius,
      color: pickDotColor(palette, isHidden, random, config),
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
