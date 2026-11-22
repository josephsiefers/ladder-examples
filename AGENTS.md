## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for josephsiefers/ode-examples (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commands

Scripts live in `package.json`. The ones that gate every change:

```sh
npm test                 # vitest, offline (fake LLM); evals are separate and never run here
npm run typecheck
npm run lint             # Oxlint holds every lint rule; Biome's linter is off
npm run format:check     # Biome: formatting + import order. Fix with `npm run format`
npm run depcruise        # module boundaries (dependency-cruiser)
npm run mutate           # mutation testing (StrykerJS); slow, so scope it (see below)
```

- Run the CLI as `npm run ladder -- <args>`; the `--` passes args through npm.
- Biome skips Markdown, so the spec and docs keep their hand formatting.
- The CLI loads an optional `.envrc` (see `.envrc.example`), with or without direnv. Tests need no API key.

## Pre-commit hook

Husky runs `.husky/pre-commit` on every commit: the token-size check on staged content, then Biome (writing fixes) on staged files and Oxlint on staged TypeScript (via lint-staged), then a whole-project typecheck, then the boundary check (`npm run depcruise`, over `src/`, `scripts/` and root `*.ts`). It runs no tests.

- **Never commit with `--no-verify`.** If the hook fails, fix the cause and commit again.
- **When the token check fails**, a staged file is over 5,000 tokens (characters ÷ 4). Follow the splitting advice the message prints, stage the result, and commit again. The check reads the **index**, so `git add` your fix before retrying. Run it by hand with `npm run check-tokens -- --staged` or `npm run check-tokens -- <path>...`.
- Exempt: lockfiles, `.cache/llm/`, `out/`, `reports/`, and binary files.

## Module boundaries

`.dependency-cruiser.cjs` enforces these; a violation names the rule and says what to do instead.

1. `public-entry-only`: a module under `src/core/*` or `src/usecases/*` is imported from outside only through its `index.ts`.
2. `sdk-only-in-llm`: only `src/core/llm` imports `@anthropic-ai/sdk`.
3. `fs-only-where-allowed`: only `src/core/documents`, `src/core/llm`, `src/core/eval` and `scripts/` import `fs`; use cases never do.
4. `no-usecase-to-usecase`: use cases never import other use cases; shared code moves into `src/core`.
5. `usecases-only-from-cli`: only `src/cli.ts` imports use cases (a use case's own tests excepted). Plus `no-circular`.

**If the boundary check blocks you, restructure; never add an exception without asking.** Each rule is proven by a fixture under `scripts/fixtures/boundaries/` (`scripts/boundaries.test.ts`); fixtures are excluded from the boundary check, typecheck, linting and mutation testing.

## Mutation testing

`npm run mutate` runs StrykerJS (`stryker.config.mjs`) over `src/` and `scripts/`, excluding tests, `prompts.ts`, `src/cli.ts` and fixtures. It fails below 70%. Runs are incremental (`reports/stryker-incremental.json`), so only changed code and tests are re-tested. The HTML report is `reports/mutation/index.html`.

Scope a run to the modules a ticket touched. `--mutate` replaces the configured list, so repeat the test exclusion:

```sh
npm run mutate -- --mutate 'src/core/llm/**/*.ts,!src/core/llm/**/*.test.ts'
npm run mutate -- --mutate 'scripts/check-tokens.ts'
```

TypeScript 7.0 ships no in-process compiler API, which Stryker needs, so `npm run mutate` loads `scripts/stryker-typescript6.mjs` to give Stryker the `typescript6` alias. For the same reason dependency-cruiser parses TypeScript with `@swc/core`.

## Definition of done

`docs/spec/README.md` (Definition of done) is the authoritative list, and every item on it applies to every ticket. Until a ticket's tooling exists, say in the closing comment which items were skipped.
