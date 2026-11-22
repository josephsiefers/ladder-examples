/** Models the ladder uses: Haiku by default, Sonnet only where a design or an eval justifies it. */
export const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;

export type ModelId = (typeof MODELS)[number];

export const DEFAULT_MODEL: ModelId = "claude-haiku-5-5";
