# ODE Examples: Law Firm Contract Review

A runnable TypeScript project that makes the **design ladder** concrete. A fictional law firm has several contract-review needs. Each need is a **use case**, built at the lowest **rung** of LLM pattern that its discovery facts justify, with an eval that shows whether that rung is good enough.

The rungs, from least to most control given up: single call, prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer, agent. Pattern definitions follow Anthropic's [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents). Vocabulary is in [GLOSSARY.md](GLOSSARY.md); the spec, including each use case's discovery card, design and scoring, is in [docs/spec/README.md](docs/spec/README.md).

## Running it

You need Node 22.18 or later (`nvm use` reads `.nvmrc`).

```sh
npm install
cp .envrc.example .envrc       # then set ANTHROPIC_API_KEY (only needed for live calls)
npm run ladder -- --help
```

Checks:

```sh
npm test                        # offline unit tests (vitest)
npm run typecheck               # tsc --noEmit
npm run lint                    # Oxlint
npm run format:check            # Biome formatting and import order (npm run format to fix)
npm run depcruise               # module boundaries (dependency-cruiser)
npm run mutate                  # mutation testing (StrykerJS)
```

## Tests and evals

**Tests** (`npm test`) check our code against a fake LLM: offline, deterministic, no API key. **Evals** measure the model with real calls, run each case several times (3 by default) and report mean ± stdev per field, because one run hides inconsistency.

```sh
npm run eval -- <name> [--split smoke|dev|test] [--runs N] [--concurrency N] [--live | --replay-only]
```

The eval prints a Markdown report and saves the full run record under `reports/evals/`. The default split is `dev`; `test` is held out and runs only when asked for.

Every LLM call goes through a record/replay cache in `.cache/llm/`, which is committed, so every eval in this README replays without an API key. The cache key includes the run's sample index, so replayed runs keep their real variance. By default a miss calls the API and records it; `--live` always calls and overwrites; `--replay-only` makes a miss an error.

```sh
ANTHROPIC_API_KEY= npm run eval -- snapshot --split smoke --runs 3 --replay-only   # provably offline
```

After a generated dataset's first eval, a human checks its answer key with a **review sheet**: each gold value beside its source sentence, disagreements first. No model is called; the sheet is saved beside its run record.

```sh
npm run eval -- snapshot --review-sheet    # from the latest dev run record; --record <file> picks another
```

## Use cases

| Use case | Rung | Status |
|---|---|---|
| [UC1 Contract snapshot](#uc1-contract-snapshot) | Single call (rung-locked) | Built; dev eval run: target met |
| [UC2 Intake triage](#uc2-intake-triage) | Routing (by type, then easy/hard cascade) | Routing by type built; smoke eval run |
| UC3 NDA review | Prompt chaining + sectioning, then voting | Future ([spec](docs/spec/use-cases/uc3-nda-review.md)) |
| UC4 Minimal edit | Evaluator-optimizer | Future ([spec](docs/spec/use-cases/uc4-minimal-edit.md)) |
| UC5 Diligence question | Orchestrator-workers | Future ([spec](docs/spec/use-cases/uc5-diligence-question.md)) |
| UC6 Diligence investigation | Agent | Future ([spec](docs/spec/use-cases/uc6-diligence-investigation.md)) |

### UC1 Contract snapshot

Reads one contract and records its **contract snapshot** (parties, effective date, term, survival period, governing law, mutuality) for the matter record, in a single Haiku call with a fixed schema. UC1 shows the bottom rung, so it never climbs. Spec: [uc1-contract-snapshot.md](docs/spec/use-cases/uc1-contract-snapshot.md).

```sh
npm run ladder -- snapshot nda-sample-01         # one Haiku call; prints the snapshot as JSON
npm run eval -- snapshot --split smoke --runs 3   # 4 hand-written NDAs × 3 runs
npm run eval -- snapshot --runs 3                 # the 12 generated dev NDAs × 3 runs
npm run generate -- ndas && git status --short   # rebuilds the 20 generated NDAs; no diff
```

Dev results (Haiku, 12 generated NDAs, 3 runs, recorded 2026-11-22):

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| parties | 100.0% | 0.0% | 100.0% | 100.0% |
| effectiveDate | 100.0% | 0.0% | 100.0% | 100.0% |
| term | 100.0% | 0.0% | 100.0% | 100.0% |
| survivalPeriod | 100.0% | 0.0% | 100.0% | 100.0% |
| governingLaw | 100.0% | 0.0% | 100.0% | 100.0% |
| mutuality | 100.0% | 0.0% | 100.0% | 100.0% |

`effectiveDate 100.0% · term 100.0% → target 98%: MET`

**Verdict:** a single call is good enough so far. It met the 98% effective-date and term target on dev with no failures, and the prompt was not tuned against this corpus. On the smoke split it got governing law wrong in 1 of 3 runs on one contract (91.7% mean, 11.8% stdev), so it is not perfectly consistent. The result is provisional until a human has reviewed the answer key (#9), and the test split has not been run.

### UC2 Intake triage

Reads one **intake document**, classifies its **document type** (NDA, MSA, DPA, SOW or other) with Haiku, and a routing table in code sends it to its team's **queue**, so the model can never invent a queue. This is routing by type; the easy/hard cascade (#13) comes later. Spec: [uc2-intake-triage.md](docs/spec/use-cases/uc2-intake-triage.md).

```sh
npm run ladder -- triage intake-hand-03            # prints its type, rationale and queue
npm run ladder -- triage intake-hand-03 --route    # ...and files it in out/firm/queues/<queue>.jsonl
npm run ladder -- triage --all --route             # every intake document, one line each
npm run eval -- triage --split smoke --runs 3      # 5 hand-written documents, one per type × 3 runs
```

Smoke results (Haiku, 3 runs, recorded 2026-11-24 and 2026-11-25; cases and full report with the confusion matrix in [docs/evals/triage-smoke.md](docs/evals/triage-smoke.md)):

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| docType | 100.0% | 0.0% | 100.0% | 100.0% |

| Ambiguity | Accuracy | Case runs |
|---|---:|---:|
| clean | 100.0% | 9 |
| hybrid | 100.0% | 6 |

**Verdict:** routing works end to end, with every type routed correctly in every run, including both hybrids. Five documents cannot show whether the upgrade trigger (hybrid accuracy materially below clean) fires; that needs the generated dev split with more hybrids (#11).
