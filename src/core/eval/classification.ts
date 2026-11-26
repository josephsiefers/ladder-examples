import { row } from "./markdown";
import { formatPercent } from "./report";

/** One classification: the gold class, the predicted label, and optionally the case's tag. */
export interface Prediction {
  gold: string;
  /** May be outside the classes, e.g. an error: it then counts as wrong and as unclassified. */
  predicted: string;
  /** A case tag to group accuracy by, e.g. an ambiguity: `clean` or `hybrid`. */
  group?: string;
}

/** Counts of gold class (row) against predicted class (column), in `classes` order. */
export interface ConfusionMatrix {
  classes: readonly string[];
  counts: number[][];
  /** Per gold class: predictions that were none of the classes. */
  unclassified: number[];
}

/** One class's precision and recall (undefined when nothing was predicted / gold as it). */
export interface ClassMetrics {
  label: string;
  precision: number | undefined;
  recall: number | undefined;
  /** Gold cases of the class. */
  support: number;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** `part / whole`, or undefined when `whole` is 0. */
const ratio = (part: number, whole: number) => (whole === 0 ? undefined : part / whole);

export function confusionMatrix(
  classes: readonly string[],
  predictions: readonly Prediction[],
): ConfusionMatrix {
  const counts = classes.map(() => classes.map(() => 0));
  const unclassified = classes.map(() => 0);
  for (const { gold, predicted } of predictions) {
    const goldIndex = classes.indexOf(gold);
    const goldRow = counts[goldIndex];
    if (!goldRow) {
      throw new Error(`Gold label '${gold}' is not one of the classes: ${classes.join(", ")}.`);
    }
    const column = classes.indexOf(predicted);
    const cells = column === -1 ? unclassified : goldRow;
    const at = column === -1 ? goldIndex : column;
    cells[at] = (cells[at] ?? 0) + 1;
  }
  return { classes, counts, unclassified };
}

export function classMetrics({ classes, counts, unclassified }: ConfusionMatrix): ClassMetrics[] {
  return classes.map((label, index) => {
    const goldRow = counts[index] ?? [];
    const correct = goldRow[index] ?? 0;
    const predicted = sum(counts.map((each) => each[index] ?? 0));
    const support = sum(goldRow) + (unclassified[index] ?? 0);
    return {
      label,
      precision: ratio(correct, predicted),
      recall: ratio(correct, support),
      support,
    };
  });
}

/** The share of predictions matching gold; undefined for none. */
export function accuracy(predictions: readonly Prediction[]): number | undefined {
  const correct = predictions.filter(({ gold, predicted }) => gold === predicted).length;
  return ratio(correct, predictions.length);
}

/** Accuracy within each group, in the order given; an empty group's accuracy is undefined. */
export function accuracyByGroup(
  predictions: readonly Prediction[],
  groups: readonly string[],
): { group: string; accuracy: number | undefined; count: number }[] {
  return groups.map((group) => {
    const inGroup = predictions.filter((prediction) => prediction.group === group);
    return { group, accuracy: accuracy(inGroup), count: inGroup.length };
  });
}

/** A rate as a percentage, or `n/a` when there is none. */
export function formatRate(rate: number | undefined): string {
  return rate === undefined ? "n/a" : formatPercent(rate);
}

/** The matrix as a Markdown table; an unclassified column appears only when it has any counts. */
export function renderConfusionMatrix({ classes, counts, unclassified }: ConfusionMatrix): string {
  const showUnclassified = unclassified.some((count) => count > 0);
  const columns = [...classes, ...(showUnclassified ? ["(no valid answer)"] : [])];
  return [
    row(["Gold \\ Predicted", ...columns]),
    `|---|${columns.map(() => "---:").join("|")}|`,
    ...classes.map((label, index) =>
      row([
        label,
        ...(counts[index] ?? []).map(String),
        ...(showUnclassified ? [String(unclassified[index] ?? 0)] : []),
      ]),
    ),
  ].join("\n");
}
