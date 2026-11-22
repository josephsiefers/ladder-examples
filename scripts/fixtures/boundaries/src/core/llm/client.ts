// Clean: imports inside its own module, and the SDK in src/core/llm.
import Anthropic from "@anthropic-ai/sdk";

export const complete = (): Anthropic => new Anthropic();
