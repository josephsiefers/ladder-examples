/**
 * Module boundaries: docs/spec/README.md (Module boundaries).
 *
 * Every rule's `comment` is printed on violation (`--output-type err-long`), so it says what to
 * do instead. If a rule blocks you, restructure the code. Never add an exception without asking.
 *
 * @type {import("dependency-cruiser").IConfiguration}
 */
const MODULE_INTERNALS = "^src/(core|usecases)/[^/]+/";
const MODULE_ENTRY = "^src/(core|usecases)/[^/]+/index\\.ts$";

const publicEntryOnly = {
  name: "public-entry-only",
  comment:
    "A module under src/core/ or src/usecases/ is imported from outside only through its " +
    "index.ts. Instead: import from the module's index.ts, and if what you need is not " +
    "exported there, decide whether it belongs in the module's public interface and " +
    "re-export it from index.ts.",
  severity: "error",
};

module.exports = {
  forbidden: [
    // Two halves of one rule: importers outside every module, and importers in another module.
    {
      ...publicEntryOnly,
      from: { pathNot: MODULE_INTERNALS },
      to: { path: MODULE_INTERNALS, pathNot: MODULE_ENTRY },
    },
    {
      ...publicEntryOnly,
      from: { path: "^(src/(?:core|usecases)/[^/]+/)" },
      to: { path: MODULE_INTERNALS, pathNot: ["^$1", MODULE_ENTRY] },
    },
    {
      name: "no-circular",
      comment:
        "No circular dependencies. Instead: move what both files need into a third file " +
        "that both import, or invert the dependency by passing a function or value in.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-usecase-to-usecase",
      comment:
        "Use cases never import other use cases. Instead: move the shared code into a module " +
        "under src/core/ and import it from there in both use cases.",
      severity: "error",
      from: { path: "^src/usecases/([^/]+)/" },
      to: { path: "^src/usecases/", pathNot: "^src/usecases/$1/" },
    },
    {
      name: "usecases-only-from-cli",
      comment:
        "Only src/cli.ts imports use cases (a use case's own tests excepted). Instead: if " +
        "core needs something a use case has, move it into src/core/; if a use case needs to " +
        "be wired up, do it in src/cli.ts.",
      severity: "error",
      from: { pathNot: ["^src/cli\\.ts$", "^src/usecases/"] },
      to: { path: "^src/usecases/" },
    },
    {
      name: "test-code-is-private",
      comment:
        "Only tests and fixtures files import *.test.ts or *.fixtures.ts files. Instead: if " +
        "production code needs the value, move it out of the fixtures file into the module " +
        "that owns it, and have the fixtures import it from there.",
      severity: "error",
      from: { pathNot: "\\.(test|fixtures)\\.ts$" },
      to: { path: "\\.(test|fixtures)\\.ts$" },
    },
    {
      name: "sdk-only-in-llm",
      comment:
        "Only src/core/llm may import @anthropic-ai/sdk. Instead: call the model through the " +
        "src/core/llm public entry, which owns the cache, structured output and the fake LLM " +
        "that tests inject.",
      severity: "error",
      from: { pathNot: "^src/core/llm/" },
      to: { path: "(^|/)@anthropic-ai/sdk(/|$)" },
    },
    {
      name: "fs-only-where-allowed",
      comment:
        "Only src/core/documents, src/core/llm, src/core/eval and scripts/ may touch the " +
        "filesystem; use cases never do. Instead: read firm data through an intent-level " +
        "operation on src/core/documents (add one if it is missing), or move the file " +
        "access into the core module that owns it.",
      severity: "error",
      from: { pathNot: ["^src/core/(documents|llm|eval)/", "^scripts/"] },
      to: { dependencyTypes: ["core"], path: "^(node:)?fs(/|$)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^scripts/fixtures/" },
  },
};
