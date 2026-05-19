import type { CognitiveMetrics } from "@/metrics/cognitiveMetrics";

declare global {
  interface Window {
    cognitiveMetrics?: CognitiveMetrics;
  }
}

export {};
