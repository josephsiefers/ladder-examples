// Violates `public-entry-only` from outside every module: reaches past src/core/llm/index.ts.
import { complete } from "../src/core/llm/client";

export const report = (): unknown => complete();
