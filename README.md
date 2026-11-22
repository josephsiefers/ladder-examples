# ODE Examples: Law Firm Contract Review

A runnable TypeScript project that makes the **design ladder** concrete. A fictional law firm has several contract-review needs. Each need is a **use case**, built at the lowest **rung** of LLM pattern that its discovery facts justify, with an eval that shows whether that rung is good enough.

The rungs, from least to most control given up: single call, prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer, agent. Pattern definitions follow Anthropic's [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents). Vocabulary is defined in [GLOSSARY.md](GLOSSARY.md), and the full spec is in [docs/spec/README.md](docs/spec/README.md).

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

## Tests vs evals

- **Tests** (`npm test`) verify _our code_ against a fake LLM. They are offline, fast and deterministic, and need no API key.
- **Evals** (`npm run eval -- <usecase>`) measure _model behaviour_ with real API calls. Each eval runs several times (3 by default) and reports mean ± stdev, because a single run hides inconsistency. Evals never run as part of `npm test`.
- Every LLM call is recorded in `.cache/llm/`, which is committed, so anyone can replay every eval without an API key (see [The LLM cache](#the-llm-cache)).

## The LLM cache

Every LLM call goes through a record/replay cache in `.cache/llm/`. Each entry is one JSON file holding the call's key fields, the validated value, its token usage, the original call's latency and when it was recorded. Entries are sharded into subdirectories by the first two characters of the key. The key is a SHA-256 hash of the model, system prompt, user prompt, schema name, JSON schema, max tokens and sample index.

Two global flags, which work with both `snapshot` and `eval`, choose the mode:

- **Default (read-through):** a hit replays the entry; a miss calls the API and records the result.
- **`--live`:** always calls the API and overwrites the entry.
- **`--replay-only`:** a miss is an error naming the key fields, so no API key is needed.

A replayed call reports the original call's usage and latency, so token totals stay meaningful. The `snapshot` summary line ends in `· cached`, and the eval totals count `live` and `cached` calls separately. A corrupt entry is an error naming the file, never a silent miss: delete it, or re-record it with `--live`.

```sh
npm run eval -- snapshot --split smoke --runs 3                                  # replays the committed smoke calls: "live 0"
ANTHROPIC_API_KEY= npm run eval -- snapshot --split smoke --runs 3 --replay-only # the same, provably offline
npm run eval -- snapshot --split smoke --runs 1 --live                           # fresh calls for the first run (sample index 0), re-recorded
```

### Why the cache key includes the run number

An eval runs each case several times because sampling stays at API defaults: the same prompt can come back different, and that variance is what the stdev column measures. If the key were only the prompt, runs 2 to N would replay run 1's answer, every run would be identical, and the stdev would always read zero. The cache would hide exactly what the eval exists to show.

So each run passes its run number as the call's **sample index**, and the index is part of the key. Run 2 of a case is a different entry from run 1, recorded from its own live call, and replaying the cache replays the real variance. Single CLI calls use sample index 0.

**Future work:** nothing prunes entries that no prompt produces any more. After a prompt change, old entries stay on disk until deleted by hand.

## Reading an eval report

`npm run eval -- <name> [--split smoke|dev|test] [--runs N] [--concurrency N] [--live | --replay-only]` prints a Markdown report and saves the full run record (every output, error, call and token count) as JSON under `reports/evals/`.

- **The table** has one row per field. Each run scores every case, giving the field one accuracy per run. **Mean** is the average of those accuracies. **Stdev** (population) is how much they move between runs, and **min**/**max** are the worst and best runs. A high mean with a high stdev means the model is right only some of the time: the same contract can come back different on another run.
- **Why run N times:** sampling stays at API defaults, so one run is one draw. One run can hide a field that flips between answers. Three runs (the default) show the inconsistency.
- **The target line** compares the fields named in the use case's justification sentence with its target. This is what decides whether the rung is good enough.
- **Failures** lists each wrong value: the case, the field, the expected (gold) and actual values, and in how many runs it failed. A thrown error (for example, invalid model output) fails every field of that case run.
- **Totals** are calls (split into live and cached), tokens, failed case runs and wall time. Cached calls count the tokens of the original live call.
- **Splits:** `smoke` holds a few hand-written cases for demos and quick checks. `dev` is where prompts get tuned. `test` is held out: it loads only with an explicit `--split test`, and prompts are never tuned against it. The default split is `dev`.

## Use cases

| Use case | Rung | Status |
|---|---|---|
| [UC1 Contract snapshot](#uc1-contract-snapshot) | Single call (rung-locked) | Built; dev eval run: target met |
| [UC2 Intake triage](#uc2-intake-triage) | Routing (by type, then easy/hard cascade) | Planned |
| [UC3 NDA review](#uc3-nda-review-future) | Prompt chaining + sectioning, then voting | Future |
| [UC4 Minimal edit](#uc4-minimal-edit-future) | Evaluator-optimizer | Future |
| [UC5 Diligence question](#uc5-diligence-question-future) | Orchestrator-workers | Future |
| [UC6 Diligence investigation](#uc6-diligence-investigation-future) | Agent | Future |

### UC1 Contract snapshot

Reads one contract and records its **contract snapshot** (parties, effective date, term, survival period, governing law, mutuality) for the matter record. Spec: [uc1-contract-snapshot.md](docs/spec/use-cases/uc1-contract-snapshot.md).

**Discovery card**

- **Outcome:** stop paralegals keying contract snapshots into the matter record by hand.
- **Process:** a paralegal opens the contract, finds the six facts, and types them into the matter record.
- **Data:** about 300 contracts a week. Two years of keyed snapshots exist and can serve as gold labels.
- **Quality:** a wrong term date means a missed renewal reminder. The paralegal confirms every record.
- **Constraints:** fixed schema; the output must fit the matter record.

**Design: single call (rung-locked)**

```
┌──────────────────┐     ┌──────────────────────────────┐     ┌────────────────────┐
│ contract         │     │ single call                  │     │ contract snapshot  │
│ core/documents   │────▶│ Haiku, native structured     │────▶│ validated by zod;  │
│ [N.M] paragraphs │     │ output, fixed schema         │     │ invalid = error    │
└──────────────────┘     └──────────────────────────────┘     └────────────────────┘
```

> "I'd start with a single call because it's one document into one fixed schema. I'd move to a chain (extract, then verify) only if evals show effective-date or term accuracy below 98%."

UC1 exists to show the bottom rung, so it never climbs: if the eval shows a single call can't do the job, the problem is reshaped rather than the design. The prompt ([prompts.ts](src/usecases/01-contract-snapshot/prompts.ts)) defines each field precisely: the term is not the survival period, governing law is the law and not the courts, "not stated" beats a guess, and party names leave out "and its Affiliates".

**Run it**

```sh
npm run ladder -- snapshot nda-sample-01         # one live Haiku call; prints the snapshot as JSON
npm run ladder -- snapshot does-not-exist        # error: Contract 'does-not-exist' not found. ...
```

The snapshot is followed by one line with the model, input and output tokens, and latency, for example `model claude-haiku-5-5 · 5,624 input tokens · 265 output tokens · 3.49 s`. Contracts live in [data/firm/contracts/](data/firm/contracts/) and are read only through `core/documents`.

**Eval**

```sh
npm run eval -- snapshot --split smoke --runs 3   # 4 smoke NDAs × 3 runs, replayed from the committed cache
npm run eval -- snapshot --runs 3                 # the 12 generated dev NDAs × 3 runs, replayed from the committed cache
```

Each field is scored exact-match after normalisation (case-folded, whitespace collapsed, trailing punctuation stripped). Parties are compared as an order-insensitive set of (name, role). An invented value where the contract states nothing scores false. Gold cases live in [data/evals/snapshot/](data/evals/snapshot/), one JSON file per case, with the evidence paragraph for each field.

The smoke split is `nda-sample-01` plus three hand-written NDAs, each planting different traps in how the snapshot is written:

- `nda-sample-02`: effective at the last signature, and a term that runs until terminated on 30 days' notice.
- `nda-sample-03`: a one-way NDA whose recital mentions "mutual discussions", under New York law with Delaware courts.
- `nda-sample-04`: a party named "Halden Robotics Pte. Ltd. and its Affiliates", with indefinite survival for trade secrets only. The gold survival period is the 2 years that apply to confidential information in general, following the prompt's rule.

Smoke results (Haiku, 3 runs, recorded 2026-11-22; replay them with `--replay-only`):

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| parties | 100.0% | 0.0% | 100.0% | 100.0% |
| effectiveDate | 100.0% | 0.0% | 100.0% | 100.0% |
| term | 100.0% | 0.0% | 100.0% | 100.0% |
| survivalPeriod | 100.0% | 0.0% | 100.0% | 100.0% |
| governingLaw | 91.7% | 11.8% | 75.0% | 100.0% |
| mutuality | 100.0% | 0.0% | 100.0% | 100.0% |

`effectiveDate 100.0% · term 100.0% → target 98%: MET`

One failure: in 1 of 3 runs, `nda-sample-04`'s "laws of the Republic of Singapore" came back as `other` instead of `singapore`. Totals: 12 calls, 58,236 input tokens, 3,634 output tokens. Before the cache existed, a separate run of the same eval missed it in 2 of 3 runs.

Four hand-written cases say little about the 98% target, which is measured on the dev split. They do show the misses are not consistent: the same contract gets a different governing law on different runs, which a single run would hide.

**The generated corpus**

The dev and test splits are 20 generated NDAs (`nda-gen-01` to `nda-gen-20`: 12 dev, 8 test), built by a deterministic generator whose answer keys are correct by construction:

```sh
npm run generate -- ndas && git status --short   # rebuilds all 20 and prints the coverage table; no diff
```

- The **clause-variant library** ([data/library/nda/](data/library/nda/)) holds 2–3 standard wordings for each of the 15 playbook clause types (plus general boilerplate), and the metadata phrasings with `{{placeholders}}`. Standard wording never states a jurisdiction, duration, date or party role, so it can't contradict a planted value.
- Each NDA has a **plant spec** ([data/evals/snapshot/plants/](data/evals/snapshot/plants/)): its split, seed, parties, mutuality, metadata values, and the phrasings that express them.
- The **assembler** ([scripts/generate/](scripts/generate/)) picks the clause variants, wordings and clause order with a seeded RNG, numbers the contract in the firm's format, and fills the placeholders. It writes the contract to `data/firm/contracts/` and a gold case to `data/evals/snapshot/<split>/`. The gold snapshot is computed from the spec, and the evidence is the paragraph each value landed in. A value that is not stated has no evidence.

Every metadata plant appears at least twice in dev and once in test:

| Plant | Dev (min 2) | Test (min 1) |
|---|---:|---:|
| effective date in numerals | 4 | 2 |
| effective date in words | 3 | 2 |
| effective date at last signature | 3 | 2 |
| effective date not stated | 2 | 2 |
| term in months | 4 | 2 |
| term in years | 4 | 3 |
| term until terminated on notice | 4 | 3 |
| survival period that looks like the term | 3 | 2 |
| survival indefinite for trade secrets | 3 | 1 |
| survival indefinite | 3 | 2 |
| one-way with a mutual recital | 2 | 1 |
| governing law ≠ courts | 5 | 2 |
| party and its Affiliates | 3 | 2 |

Dev results (Haiku, 12 generated NDAs, 3 runs, recorded 2026-11-22; replay them with `--replay-only`):

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| parties | 100.0% | 0.0% | 100.0% | 100.0% |
| effectiveDate | 100.0% | 0.0% | 100.0% | 100.0% |
| term | 100.0% | 0.0% | 100.0% | 100.0% |
| survivalPeriod | 100.0% | 0.0% | 100.0% | 100.0% |
| governingLaw | 100.0% | 0.0% | 100.0% | 100.0% |
| mutuality | 100.0% | 0.0% | 100.0% | 100.0% |

`effectiveDate 100.0% · term 100.0% → target 98%: MET`

No failures and no failed case runs. Totals: 36 calls, 187,245 input tokens, 12,150 output tokens. **The target was met on the dev split, with the prompt unchanged** (it was not tuned against this corpus). This result is provisional until a human has reviewed the answer key (#9). The test split has not been run.

### UC2 Intake triage

_Not built yet._ Spec: [uc2-intake-triage.md](docs/spec/use-cases/uc2-intake-triage.md).

### UC3 NDA review (future)

_Future: the design still has open questions._ Spec: [uc3-nda-review.md](docs/spec/use-cases/uc3-nda-review.md).

### UC4 Minimal edit (future)

_Future: the design still has open questions._ Spec: [uc4-minimal-edit.md](docs/spec/use-cases/uc4-minimal-edit.md).

### UC5 Diligence question (future)

_Future: the design still has open questions._ Spec: [uc5-diligence-question.md](docs/spec/use-cases/uc5-diligence-question.md).

### UC6 Diligence investigation (future)

_Future: the design still has open questions._ Spec: [uc6-diligence-investigation.md](docs/spec/use-cases/uc6-diligence-investigation.md).
