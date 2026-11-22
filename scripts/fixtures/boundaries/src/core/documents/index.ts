// Violates `sdk-only-in-llm`: the SDK outside src/core/llm.
import Anthropic from "@anthropic-ai/sdk";

export const client = new Anthropic();
