export interface MemoryButtonDefinition {
  id: string;
  label: string;
  color: string;
  glow: string;
  frequency: number;
}

export interface MemoryButtonLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MEMORY_SEQUENCE_START_LENGTH = 2;
export const MEMORY_UNLOCK_LENGTH = 6;

export const MEMORY_PANEL_TIMINGS = {
  roundStartDelayMs: 260,
  successPauseMs: 680,
  errorPauseMs: 940,
  unlockDurationMs: 1_800,
  shakeDurationMs: 520
} as const;

export const MEMORY_BUTTONS: ReadonlyArray<MemoryButtonDefinition> = [
  { id: "cyan", label: "A1", color: "#49f6ff", glow: "#6cfaff", frequency: 220 },
  { id: "magenta", label: "B2", color: "#ff5dcb", glow: "#ff8fdd", frequency: 262 },
  { id: "amber", label: "C3", color: "#ffb347", glow: "#ffd16e", frequency: 294 },
  { id: "lime", label: "D4", color: "#7dff72", glow: "#a3ff98", frequency: 330 },
  { id: "violet", label: "E5", color: "#7d8cff", glow: "#a8b2ff", frequency: 392 },
  { id: "red", label: "F6", color: "#ff6e78", glow: "#ff9ea4", frequency: 440 }
] as const;

export function createInitialSequence(random = Math.random) {
  const sequence: number[] = [];

  while (sequence.length < MEMORY_SEQUENCE_START_LENGTH) {
    sequence.push(randomButtonIndex(random));
  }

  return sequence;
}

export function extendSequence(sequence: number[], random = Math.random) {
  return [...sequence, randomButtonIndex(random)];
}

export function memoryButtonLayouts(): MemoryButtonLayout[] {
  const startX = 182;
  const startY = 164;
  const width = 168;
  const height = 78;
  const gapX = 214;
  const gapY = 108;

  return MEMORY_BUTTONS.map((_, index) => ({
    x: startX + (index % 3) * gapX,
    y: startY + Math.floor(index / 3) * gapY,
    width,
    height
  }));
}

export function showTimingsForSequence(sequenceLength: number) {
  const difficultyLevel = Math.max(0, sequenceLength - MEMORY_SEQUENCE_START_LENGTH);

  return {
    flashMs: Math.max(220, 420 - difficultyLevel * 25),
    gapMs: Math.max(80, 160 - difficultyLevel * 10)
  };
}

function randomButtonIndex(random: () => number) {
  return Math.floor(random() * MEMORY_BUTTONS.length);
}
