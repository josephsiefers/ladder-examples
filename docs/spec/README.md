# Spec: Design Ladder Worked Example

A runnable TypeScript project that makes the design ladder concrete. A fictional law firm has several contract-review needs. Each need is a **use case**, built at the lowest **rung** its discovery facts justify, with an eval that shows whether that rung is good enough.

Vocabulary is defined in [GLOSSARY.md](../../GLOSSARY.md). Pattern definitions follow Anthropic's [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

## Use cases

| Use case | Rung | Spec |
|---|---|---|
| UC1 Contract snapshot | Single call (rung-locked) | [uc1](use-cases/uc1-contract-snapshot.md) |
| UC2 Intake triage | Routing (by type, then easy/hard cascade) | [uc2](use-cases/uc2-intake-triage.md) |
| UC3 NDA review | Prompt chaining + sectioning, then voting | [uc3](use-cases/uc3-nda-review.md) |
| UC4 Minimal edit | Evaluator-optimizer (climbed from single call) | [uc4](use-cases/uc4-minimal-edit.md) |
| UC5 Diligence question | Orchestrator-workers | [uc5](use-cases/uc5-diligence-question.md) |
| UC6 Diligence investigation | Agent | [uc6](use-cases/uc6-diligence-investigation.md) |

Tickets are GitHub sub-issues of [#1](https://github.com/josephsiefers/ladder-examples/issues/1), with native blocking links. GitHub is the only record of ticket status and build order.

Future use cases record their discovery card, justification sentence, and **open questions**. A later grilling session settles those questions, using this spec as its reference, before any tickets are written.

## Project-wide decisions

### Shape
- One firm, one use case per rung. No single pipeline is forced to use every rung, because that would contradict the ladder's own rule.
- Where a use case is meant to show a climb, the eval decides. If the eval does not justify the climb, the README says so honestly. Results are never rigged. The one exception is a deliberately labelled anti-pattern demo in UC3b.
- Out of scope: Word/OOXML output, firm tenancy and deployment, ADRs.

### Models
- `claude-haiku-5-5` by default everywhere. `claude-sonnet-5-5` only where the design calls for a larger model (UC2's hard route), or where an eval justifies it.
- Real API calls. The API key comes from `.envrc` (see `.envrc.example`).
- Sampling parameters stay at API defaults, so measured variance is real.

### Tests vs evals
- **Tests** (`npm test`, vitest) verify *our code* against a fake LLM injected at the `core/llm` seam. They are offline, fast and deterministic. Stryker depends on this.
- **Evals** (`npm run eval -- <usecase>`) measure *model behaviour* with real calls, which are cached. Evals never run in `npm test`.
- Each eval is run N times (default 3) and reports mean ± stdev, because one run hides inconsistency.
- Datasets are split into **dev** (iterate here), **test** (runs only when `--split test` is passed explicitly; never tune prompts against it), and **smoke** (hand-written cases for demos and quick checks).

### LLM cache (record/replay)
- Each call is cached on disk, keyed by a hash of model, prompt, schema, params, and **sample index**. Without the sample index, runs 2..N would replay run 1 and variance would always be zero.
- Modes: default read-through; `--live` calls the API and overwrites the cache; `--replay-only` turns a miss into an error, so it works without an API key.
- `.cache/llm/` is **committed**, so anyone can replay every eval for free.

### Synthetic data
- Hybrid generation: a **clause-variant library** written once, with placeholders for planted values, plus a deterministic **assembler** that builds each document from a **plant spec** using a seeded shuffle of order, headings and numbering. Gold labels are correct by construction and record the evidence paragraph for each field.
- After a generated dataset's first eval, a human reviews a **review sheet**: each gold label shown next to its source sentence, with model/answer-key disagreements sorted first. This is a reading check, not a legal one.

### Firm systems (translation layer)
- `data/firm/` is the fake firm: contracts and intake documents. It is reached **only** through `core/documents`, which exposes intent-level operations (`readContract`, `listIntake`, `routeToQueue`, …).
- Writes made by the fake firm (for example, routed queues) go to `out/firm/`, which is gitignored.
- Human checkpoints are interactive CLI prompts, with `--auto-approve` for evals.

## Tooling

| Concern | Tool | Notes |
|---|---|---|
| Runtime | Node 22, TypeScript strict, `tsx` | ESM, `noUncheckedIndexedAccess` |
| SDK | `@anthropic-ai/sdk` | Imported only by `core/llm` |
| Schemas | `zod` | All structured LLM output is validated |
| CLI | `commander` | Binary name `ladder` |
| Tests | `vitest` | Colocated `*.test.ts` |
| Formatting | Biome | Formatter + import sorting only; Biome's linter is off |
| Linting | Oxlint | All lint rules live here |
| Boundaries | dependency-cruiser | Rules below |
| Mutation | StrykerJS | Vitest runner + TypeScript checker; break threshold 70%; `prompts.ts`, the CLI entry, script entry blocks (disabled by comment), tests and fixtures excluded |
| Hooks | Husky + lint-staged | Pre-commit runs no tests |

### Pre-commit hook
1. Clean-tree guard: the commit is refused if any tracked file has unstaged changes or any untracked file is not ignored. The whole-project checks read the working tree, so it must match what is committed.
2. Then, in parallel:
   - Token-size check on staged content: about chars ÷ 4, limit 5,000 per file. Exempt: lockfiles, `.cache/llm/**`, `out/**`, `reports/**`, binaries. Failure messages tell the agent how to split the file.
   - In sequence:
     1. `biome check --write` on staged files (via lint-staged): formatting plus import order, matching `npm run format:check`. Biome's linter is off, so nothing else runs.
     2. `oxlint` on staged files.
     3. `tsc --noEmit` and `depcruise` on the whole project, in parallel with each other. They wait for lint-staged because Biome rewrites staged files.

### Module boundaries (dependency-cruiser)
1. Each module under `src/core/*` and `src/usecases/*` is imported from outside **only through its `index.ts`**.
2. Only `src/core/llm` imports `@anthropic-ai/sdk`.
3. Only `src/core/documents`, `src/core/llm`, `src/core/eval`, and `scripts/` import `fs`. **Use cases never import `fs`**, so firm data can only be reached through the translation layer.
4. Use cases never import other use cases. Shared needs move into `core`.
5. Only `src/cli.ts` imports use cases (tests inside the use case excepted). No circular dependencies.
6. Test code is private: only `*.test.ts` and `*.fixtures.ts` files import `*.test.ts` or `*.fixtures.ts` files. Shared test fixtures live in `<name>.fixtures.ts` next to the tests.

### Layout
```
src/cli.ts                      CLI entry (commander)
src/core/llm/                   client, models, structured output, cache, fake LLM, pricing
src/core/documents/             translation layer over data/firm
src/core/eval/                  datasets, runner, stats, reports, review sheets
src/usecases/01-contract-snapshot/
src/usecases/02-intake-triage/  each: index.ts, schema.ts, prompts.ts, eval.ts
scripts/                        check-tokens, check-context, generate (assembler)
data/firm/                      fake firm systems: contracts/, intake/
data/library/                   clause-variant library (generator input)
data/evals/<eval>/<split>/      gold cases, one JSON per case
data/evals/<eval>/plants/       plant specs, one JSON per generated case
.cache/llm/                     committed LLM cache
out/  reports/                  gitignored: firm writes, eval run records, review sheets
```

## Definition of done (every ticket)
- `npm test` passes.
- The pre-commit hook passes on the commit. `--no-verify` is never used.
- `npm run mutate`, scoped to the modules the ticket touched, passes its break threshold (70% for the run, not per file; deterministic code only).
- Use-case tickets run their eval live with `--runs 3`, save the report as `docs/evals/<eval>-<split>.md`, and paste its table into the PR body. The README's use-case table gets one line: the verdict, linked to that report.
- One PR per ticket, with `Closes #<n>` in its body. A human squash-merges it into `master`, which closes the issue.
- The ticket fits one agent session (≤ ~150k tokens of context). If it turns out bigger, stop and comment on the issue with what remains, instead of pushing through.
- Each ticket's **Demo** commands work exactly as written.
