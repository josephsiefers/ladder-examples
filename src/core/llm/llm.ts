import type { z } from "zod";
import type { ModelId } from "./models";

/** One structured-extraction call: a prompt in, a value matching `schema` out. */
export interface StructuredRequest<T> {
  model: ModelId;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Names the schema in errors and cache keys. */
  schemaName: string;
  maxTokens?: number;
  /** Which sample of a repeated call this is (the eval run number); part of the cache key. Default 0. */
  sampleIndex?: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** What one call cost: the model, its token usage and its latency, and whether it was replayed. */
export interface CallStats {
  model: ModelId;
  usage: Usage;
  latencyMs: number;
  /** Replayed from the LLM cache. Usage and latency are then the original live call's. */
  cached: boolean;
}

export interface StructuredResult<T> extends CallStats {
  value: T;
}

/** The seam every use case calls the model through; tests inject the fake LLM here. */
export interface Llm {
  extract<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}
