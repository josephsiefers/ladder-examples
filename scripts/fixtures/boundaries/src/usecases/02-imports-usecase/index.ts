// Violates `no-usecase-to-usecase`: one use case importing another.
import { contract } from "../01-reads-fs";

export const triage = (): string => contract();
