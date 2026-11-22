// Violates `usecases-only-from-cli`: core importing a use case.
import { contract } from "../../usecases/01-reads-fs";

export const summarise = (): string => contract();
