/** A Markdown table cell: pipes escaped, line breaks flattened. */
const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll(/\s*\n\s*/g, " ");

/** A Markdown table row, each cell escaped. */
export const row = (cells: readonly string[]) => `| ${cells.map(cell).join(" | ")} |`;

/** A count with its noun, pluralised: `1 row`, `2 rows`. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A Markdown table's header row and separator: the first column left-aligned, the rest right. */
export const tableHead = ([first = "", ...rest]: readonly string[]) => [
  row([first, ...rest]),
  `|---|${rest.map(() => "---:|").join("")}`,
];
