# ODE Examples: Law Firm Contract Review

A runnable TypeScript project that makes the **design ladder** concrete. A fictional law firm has several contract-review needs. Each need is a **use case**, built at the lowest **rung** of LLM pattern that its discovery facts justify, with an eval that shows whether that rung is good enough.

The rungs, from least to most control given up: single call, prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer, agent. Pattern definitions follow Anthropic's [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents). Vocabulary is defined in [GLOSSARY.md](GLOSSARY.md), and the design (discovery cards, justification sentences, schemas, scoring) is in [docs/spec/README.md](docs/spec/README.md).

## Use cases

| Use case | Rung | Result |
|---|---|---|
| [UC1 Contract snapshot](docs/spec/use-cases/uc1-contract-snapshot.md) | Single call (rung-locked) | Target met on dev ([report](docs/evals/snapshot-dev.md)); answer key not yet reviewed |
| [UC2 Intake triage](docs/spec/use-cases/uc2-intake-triage.md) | Routing (by type, then easy/hard cascade) | Routing by type built; smoke eval only ([report](docs/evals/triage-smoke.md)) |
| [UC3 NDA review](docs/spec/use-cases/uc3-nda-review.md) | Prompt chaining + sectioning, then voting | Not built |
| [UC4 Minimal edit](docs/spec/use-cases/uc4-minimal-edit.md) | Evaluator-optimizer | Not built |
| [UC5 Diligence question](docs/spec/use-cases/uc5-diligence-question.md) | Orchestrator-workers | Not built |
| [UC6 Diligence investigation](docs/spec/use-cases/uc6-diligence-investigation.md) | Agent | Not built |

### UC1 Contract snapshot: single call

```
┌──────────────────┐     ┌──────────────────────────────┐     ┌────────────────────┐
│ contract         │     │ single call                  │     │ contract snapshot  │
│ core/documents   │────▶│ Haiku, native structured     │────▶│ validated by zod;  │
│ [N.M] paragraphs │     │ output, fixed schema         │     │ invalid = error    │
└──────────────────┘     └──────────────────────────────┘     └────────────────────┘
```

### UC2 Intake triage: routing

```
intake document ──▶ classify [LLM] ──▶ routing table [code] ──▶ queue
core/documents      Haiku: docType     nda → nda-review           routeToQueue
                    + rationale        msa, sow → commercial      (only with --route)
                                       dpa → privacy
                                       other → senior-associate
```

## Running it

You need the Node version in `.nvmrc` (`nvm use`).

```sh
npm install
cp .envrc.example .envrc       # then set ANTHROPIC_API_KEY (only needed for live calls)
npm run ladder -- --help

npm run ladder -- snapshot nda-sample-01           # UC1: print one contract's snapshot
npm run ladder -- triage intake-hand-03 --route    # UC2: classify one intake document and file it
npm run eval -- snapshot --split smoke --runs 3    # replay an eval from the committed cache
```

**Tests** (`npm test`) check _our code_ against a fake LLM: offline, deterministic, no API key. **Evals** (`npm run eval -- <usecase>`) measure _model behaviour_ with real calls, and never run as part of `npm test`. The other checks are the scripts in `package.json`.

## The LLM cache

Every LLM call goes through a record/replay cache in `.cache/llm/`, which is committed, so anyone can replay every eval without an API key. A miss calls the API and records the result. Two global flags change that:

- **`--live`** always calls the API and overwrites the entry.
- **`--replay-only`** turns a miss into an error, so it provably needs no API key.

A replayed call reports the original call's tokens and latency. A corrupt entry is an error naming the file: delete it, or re-record it with `--live`.

### Why the cache key includes the run number

An eval runs each case several times because sampling stays at API defaults: the same prompt can come back different, and that variance is what the stdev column measures. If the key were only the prompt, runs 2 to N would replay run 1's answer, every run would be identical, and the stdev would always read zero. The cache would hide exactly what the eval exists to show.

So each run passes its run number as the call's **sample index**, and the index is part of the key. Run 2 of a case is a different entry from run 1, recorded from its own live call, and replaying the cache replays the real variance.

**Future work:** nothing prunes entries that no prompt produces any more. After a prompt change, old entries stay on disk until deleted by hand.

## Reading an eval report

An eval prints a Markdown report and saves the full run record under `reports/evals/`.

- **Mean** is the field's accuracy averaged over runs; **stdev** is how much it moves between runs. A high mean with a high stdev means the model is right only some of the time: the same contract can come back different on another run, which a single run would hide.
- **The target line** compares the fields named in the use case's justification sentence with its target. This decides whether the rung is good enough.
- **Failures** lists each wrong value and in how many runs it failed. A thrown error (for example, invalid model output) fails every field of that case run.
- **Splits:** prompts are tuned on `dev` (the default). `test` is held out and loads only with an explicit `--split test`.

## Checking the answer key: the review sheet

A wrong gold label marks a correct model answer as a failure, and can make a use case look as if it needs redesigning. So after a generated dataset's first eval, a human checks the answer key by reading. No legal knowledge is needed.

```sh
npm run eval -- snapshot --review-sheet                                       # from the latest dev run record
npm run eval -- snapshot --record reports/evals/snapshot-dev-<stamp>.json     # from a chosen run record
```

No model is called. The sheet lists each answer-key value beside what the model said and the source sentence it came from, with disagreements first. For each row, ask: does the source sentence say what the answer key says? On a disagreement, decide whether the model, the key, or neither is right.
