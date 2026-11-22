/** Names of every jurisdiction a contract might mention, by the plant value they belong to. */
export const JURISDICTION_NAMES: Record<string, readonly string[]> = {
  "england-and-wales": ["England", "Wales", "English"],
  "new-york": ["New York"],
  delaware: ["Delaware"],
  california: ["California"],
  ontario: ["Ontario"],
  singapore: ["Singapore"],
  other: [
    "Scotland",
    "Ireland",
    "Britain",
    "British",
    "United Kingdom",
    "United States",
    "Canada",
    "Texas",
    "Washington",
    "Massachusetts",
    "Illinois",
    "Florida",
    "Hong Kong",
    "Australia",
    "Germany",
    "France",
    "Japan",
    "India",
    "Switzerland",
    "Netherlands",
  ],
};

/** Which jurisdictions `text` names, by plant value. */
export function jurisdictionsNamed(text: string): string[] {
  return Object.entries(JURISDICTION_NAMES)
    .filter(([, names]) => names.some((name) => new RegExp(`\\b${name}\\b`).test(text)))
    .map(([jurisdiction]) => jurisdiction);
}

/** Words that state a duration or a date. */
export const TIME_WORDS =
  /\b(days?|weeks?|months?|years?|annual(ly)?|anniversary|January|February|March|April|May|June|July|August|September|October|November|December)\b/;
