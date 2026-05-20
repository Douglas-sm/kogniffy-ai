# Kogniffy AI

Kogniffy AI is a gamified cognitive screening prototype built with Next.js, React, TypeScript, Node.js, native Canvas, SVG, Chart.js, and TensorFlow.js structure.

The product is intentionally presented as a friendly cartoon adventure, not as clinical software. A child helps Kog, a small intelligent drone, cross a mountain through caves, tunnels, old labs, technology gates, and memory panels.

## Ethical Notice

Required user-facing notice:

- “Esta experiência possui caráter apenas educativo e indicativo.”
- “Os resultados não representam diagnóstico clínico.”

The application must never state that a child has dyslexia, color blindness, attention deficit, or memory/reaction problems. It must use cautious language such as “possíveis indícios”, “sinais observados durante a experiência”, “resultado apenas indicativo”, and “procure um profissional especializado”.

This version does not collect personal data and does not send gameplay metrics to a backend.

## Stack

- Next.js 15
- React 19
- TypeScript
- Node.js
- Vercel/serverless-ready architecture
- Native Canvas API
- SVG
- CSS Modules
- Chart.js
- `@tensorflow/tfjs` for future browser inference
- optional `@tensorflow/tfjs-node` acceleration only for local training scripts
- pnpm

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

Other commands:

```bash
pnpm lint
pnpm build
pnpm train:model ./data/kogniffy-training.csv
pnpm train:adhd ./data/raw/adhd/adhdata.csv
pnpm train:cognitiveperformance ./data/raw/cognitiveperformance/human_cognitive_performance.csv
```

## Architecture

- `app/page.tsx`: landing page.
- `app/game/page.tsx`: Canvas game route.
- `app/report/page.tsx`: local report route with Chart.js.
- `src/game/engine/GameEngine.ts`: game loop, input, scene lifecycle, metrics integration.
- `src/game/entities`: player and Kog assistant.
- `src/game/scenes`: intro, letters, color patterns, attention, memory/reaction, and final scenes.
- `src/game/ui`: dialog box and HUD.
- `src/metrics/metricsCollector.ts`: in-memory metrics collector and `sessionStorage` snapshot.
- `src/ai/scoring.ts`: initial heuristic scoring from 0 to 100.
- `src/ai/modelLoader.ts`: future TensorFlow.js browser model loader with heuristic fallback.
- `src/report/generateReport.ts`: report text and category recommendations.
- `scripts/train-model.ts`: local TensorFlow.js training script.
- `scripts/train-adhd-model.ts`: local TensorFlow.js training script for the attention proxy model.
- `scripts/train-cognitiveperformance-model.ts`: local TensorFlow.js training script for the Nave do Kog cognitive performance model.
- `models/kogniffy`: future model output folder.

## Gameplay Metrics

The collector stores only local session metrics:

- `responseTimes`
- `hesitationTimes`
- `impulsiveClicks`
- `repeatedErrors`
- `sequenceScore`
- `contrastErrors`
- `inversionErrors`
- `missedTargets`
- `autoHelpCount`

The game records automatic Kog help after three consecutive errors in a scene. These events stay local and are included in the final session snapshot.

## Heuristic Scoring

The first version uses heuristic scores from `0` to `100`:

- `dyslexiaRisk`
- `colorVisionRisk`
- `attentionRisk`
- `memoryReactionRisk`

Bands:

- `0` to `35`: low
- `36` to `65`: intermediate
- `66` to `100`: high

These names are internal scoring fields. User-facing text must remain indicative and non-diagnostic.

## Local Model Training

Training is local only and must not run in production or inside Vercel serverless routes.

The default install intentionally does not install `@tensorflow/tfjs-node`, because that package uses native bindings and can fail on Windows/Node combinations without a matching prebuilt binary. The training script first tries to load optional `@tensorflow/tfjs-node`; if it is not available, it falls back to `@tensorflow/tfjs` pure JavaScript.

For faster local training, install `@tensorflow/tfjs-node` only in a compatible local environment, preferably Node.js 20 LTS or WSL/Linux. On native Windows, source builds require Visual Studio Build Tools with the “Desktop development with C++” workload.

Expected CSV columns:

```text
avgResponseTime,hesitationTime,repeatedErrors,impulsiveClicks,sequenceMemoryScore,colorContrastErrors,letterInversionErrors,reactionVariance,dyslexiaRisk,colorVisionRisk,attentionRisk,memoryReactionRisk
```

Labels can be `0..1` or `0..100`. The training scripts save TensorFlow artifacts under `models/<domain>/`:

```text
models/kogniffy/model.json
models/kogniffy/*.bin
models/kogniffy/normalization.json
```

The runtime model assets used by `app/api/models/*` are kept in Git so the report page can run after clone. Local-only datasets, manifests, session exports, and the experimental `models/kogniffy` output stay ignored by default.

## Suggested Datasets

Potential research datasets for local experiments:

- Predicting Risk of Dyslexia - PLOS ONE
- Dyslexia datasets
- Eye-tracking reading experiment
- Ishihara Like MNIST
- Ishihara blind test cards
- EEG Dataset for ADHD
- Human Cognitive Performance Analysis
- Reaction Time Dataset

Review dataset licenses, consent conditions, age groups, bias risks, and clinical limitations before any use.

## Deploy

The app is prepared for Vercel:

```bash
pnpm build
```

No server route is required for the first version. Browser gameplay metrics are kept in memory and then copied to `sessionStorage` only for the local report page.

## Limitations

This project is an educational prototype. It does not diagnose, treat, predict medical conditions, or replace professional assessment. Any high or intermediate score only indicates patterns observed during this specific experience and should be interpreted by qualified professionals when relevant.
