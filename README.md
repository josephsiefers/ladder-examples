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
- Every LLM call is recorded in `.cache/llm/`, which is committed, so anyone can replay every eval without an API key.

## Use cases

| Use case | Rung | Status |
|---|---|---|
| [UC1 Contract snapshot](#uc1-contract-snapshot) | Single call (rung-locked) | Built (eval to come) |
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
