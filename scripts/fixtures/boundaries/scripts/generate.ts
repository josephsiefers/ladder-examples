// Clean: scripts may touch the filesystem.
import { writeFileSync } from "node:fs";

export const generate = (): void => writeFileSync("out/x.md", "");
