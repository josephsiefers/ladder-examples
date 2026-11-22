// Clean: a test may import its own module's fixtures.
import { prompt } from "./client.fixtures";

export const used = prompt;
