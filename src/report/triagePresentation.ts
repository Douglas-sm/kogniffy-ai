import { clampScore } from "@/ai/scoring";

export type TriageBand =
  | "extremelyPositive"
  | "positive"
  | "good"
  | "regular"
  | "attention"
  | "needsAttention";

export interface TriageBandDefinition {
  key: TriageBand;
  label: string;
  shortLabel: string;
  min: number;
  max: number;
  color: string;
  textColor: string;
}

export const TRIAGE_BAND_DEFINITIONS: readonly TriageBandDefinition[] = [
  {
    key: "extremelyPositive",
    label: "Extremamente positivo",
    shortLabel: "Excelente",
    min: 85,
    max: 100,
    color: "#1f6b3b",
    textColor: "#f5fff8"
  },
  {
    key: "positive",
    label: "Positivo",
    shortLabel: "Positivo",
    min: 75,
    max: 84,
    color: "#49a85f",
    textColor: "#f5fff8"
  },
  {
    key: "good",
    label: "Bom",
    shortLabel: "Bom",
    min: 65,
    max: 74,
    color: "#bedc63",
    textColor: "#23412d"
  },
  {
    key: "regular",
    label: "Regular",
    shortLabel: "Regular",
    min: 50,
    max: 64,
    color: "#f0c54b",
    textColor: "#4c3600"
  },
  {
    key: "attention",
    label: "Atenção",
    shortLabel: "Atenção",
    min: 35,
    max: 49,
    color: "#ef8f3d",
    textColor: "#fff7ef"
  },
  {
    key: "needsAttention",
    label: "Precisa de atenção",
    shortLabel: "Crítico",
    min: 0,
    max: 34,
    color: "#d84e4b",
    textColor: "#fff5f5"
  }
];

export function toTriageDisplayScore(rawRiskScore: number) {
  return clampScore(100 - clampScore(rawRiskScore));
}

export function triageBandForScore(score: number): TriageBandDefinition {
  const normalized = clampScore(score);

  return (
    TRIAGE_BAND_DEFINITIONS.find((band) => normalized >= band.min && normalized <= band.max) ??
    TRIAGE_BAND_DEFINITIONS[TRIAGE_BAND_DEFINITIONS.length - 1]!
  );
}

export function triageBandDefinitionForKey(key: TriageBand) {
  return TRIAGE_BAND_DEFINITIONS.find((band) => band.key === key) ?? TRIAGE_BAND_DEFINITIONS[0]!;
}

export function triageBandForRisk(rawRiskScore: number) {
  return triageBandForScore(toTriageDisplayScore(rawRiskScore));
}
