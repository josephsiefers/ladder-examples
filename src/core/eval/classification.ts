import { row, tableHead } from "./markdown";
import { formatPercent } from "./report";

/** The prediction of a case run that gave no valid answer (e.g. it errored). */
export const NO_ANSWER = null;

/** One classification: the gold class, the predicted class, and optionally the case's tag. */
export interface Prediction {
  gold: string;
  /** One of the classes, or `NO_ANSWER`: wrong, and counted in the `(no valid answer)` column. */
  predicted: string | typeof NO_ANSWER;
  /** A case tag to group accuracy by, e.g. an ambiguity: `clean` or `hybrid`. */
  group?: string;
}

/** Counts of gold class (row) against predicted class (column), in `classes` order. */
export interface ConfusionMatrix {
  classes: readonly string[];
  counts: number[][];
  /** Per gold class: predictions that were `NO_ANSWER`. */
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

/** The index of `label` in `classes`; a label outside them is an error. */
function classIndex(classes: readonly string[], label: string, kind: string): number {
  const index = classes.indexOf(label);
  if (index === -1) {
    throw new Error(`${kind} label '${label}' is not one of the classes: ${classes.join(", ")}.`);
  }
  return index;
}

export function confusionMatrix(
  classes: readonly string[],
  predictions: readonly Prediction[],
): ConfusionMatrix {
  const counts = classes.map(() => classes.map(() => 0));
  const unclassified = classes.map(() => 0);
  for (const { gold, predicted } of predictions) {
    const goldIndex = classIndex(classes, gold, "Gold");
    if (predicted === NO_ANSWER) {
      unclassified[goldIndex] = (unclassified[goldIndex] ?? 0) + 1;
      continue;
    }
    const goldRow = counts[goldIndex] ?? [];
    const column = classIndex(classes, predicted, "Predicted");
    goldRow[column] = (goldRow[column] ?? 0) + 1;
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
    ...tableHead(["Gold \\ Predicted", ...columns]),
    ...classes.map((label, index) =>
      row([
        label,
        ...(counts[index] ?? []).map(String),
        ...(showUnclassified ? [String(unclassified[index] ?? 0)] : []),
      ]),
    ),
  ].join("\n");
}
