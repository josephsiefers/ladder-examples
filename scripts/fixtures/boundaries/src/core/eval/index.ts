// Violates `public-entry-only`: reaches past src/core/llm/index.ts.
import { complete } from "../llm/client";

export const run = (): unknown => complete();
