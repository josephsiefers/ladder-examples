// Violates `no-circular`: index.ts and a.ts import each other.
import { a } from "./a";

export const b = (): number => 1;
export const ab = (): number => a() + b();
