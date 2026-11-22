// Mutation testing: docs/spec/README.md (Tooling). Scope a run with `--mutate`; see AGENTS.md.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  checkerNodeArgs: ["--import", "./scripts/stryker-typescript6.mjs"],
  mutate: [
    "src/**/*.ts",
    "scripts/**/*.ts",
    "!**/*.test.ts",
    // Mutating prompt text produces meaningless survivors.
    "!**/prompts.ts",
    "!src/cli.ts",
    "!scripts/fixtures/**",
  ],
  thresholds: { high: 80, low: 70, break: 70 },
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
};
