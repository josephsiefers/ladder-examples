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
```

## Tests vs evals

- **Tests** (`npm test`) verify _our code_ against a fake LLM. They are offline, fast and deterministic, and need no API key.
- **Evals** (`npm run eval -- <usecase>`) measure _model behaviour_ with real API calls. Each eval runs several times (3 by default) and reports mean ± stdev, because a single run hides inconsistency. Evals never run as part of `npm test`.
- Every LLM call is recorded in `.cache/llm/`, which is committed, so anyone can replay every eval without an API key.

## Use cases

| Use case | Rung | Status |
|---|---|---|
| [UC1 Contract snapshot](#uc1-contract-snapshot) | Single call (rung-locked) | Planned |
| [UC2 Intake triage](#uc2-intake-triage) | Routing (by type, then easy/hard cascade) | Planned |
| [UC3 NDA review](#uc3-nda-review-future) | Prompt chaining + sectioning, then voting | Future |
| [UC4 Minimal edit](#uc4-minimal-edit-future) | Evaluator-optimizer | Future |
| [UC5 Diligence question](#uc5-diligence-question-future) | Orchestrator-workers | Future |
| [UC6 Diligence investigation](#uc6-diligence-investigation-future) | Agent | Future |

### UC1 Contract snapshot

_Not built yet._ Spec: [uc1-contract-snapshot.md](docs/spec/use-cases/uc1-contract-snapshot.md).

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
