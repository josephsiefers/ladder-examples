// Violates `test-code-is-private`: production code importing a test fixture.
import { samples } from "./stats.fixtures";

export const mean = (): number => samples.reduce((a, b) => a + b, 0) / samples.length;
