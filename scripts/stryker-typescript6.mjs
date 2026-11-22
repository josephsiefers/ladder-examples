// Loaded only into Stryker: its main process (`npm run mutate`) and its TypeScript-checker
// process (`checkerNodeArgs` in stryker.config.mjs). Both need the in-process compiler API, which
// TypeScript 7.0 does not ship, so they get the `typescript6` alias instead. `tsc` and everything
// else keep TypeScript 7.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "typescript" ? "typescript6" : specifier, context);
  },
});
