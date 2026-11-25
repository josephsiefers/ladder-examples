import { describe, expect, it } from "vitest";
import {
  accuracy,
  accuracyByGroup,
  classMetrics,
  confusionMatrix,
  formatRate,
  renderConfusionMatrix,
} from "./classification";

const CLASSES = ["cat", "dog", "fox"] as const;

const PREDICTIONS = [
  { gold: "cat", predicted: "cat", group: "clean" },
  { gold: "cat", predicted: "dog", group: "hybrid" },
  { gold: "dog", predicted: "dog", group: "clean" },
  { gold: "dog", predicted: "dog", group: "clean" },
  { gold: "fox", predicted: "cat", group: "hybrid" },
  { gold: "fox", predicted: "error: timeout", group: "clean" },
];

describe("confusionMatrix", () => {
  it("counts each gold class (row) against each predicted class (column)", () => {
    expect(confusionMatrix(CLASSES, PREDICTIONS)).toEqual({
      classes: ["cat", "dog", "fox"],
      counts: [
        [1, 1, 0],
        [0, 2, 0],
        [1, 0, 0],
      ],
      unclassified: [0, 0, 1],
    });
  });

  it("rejects a gold label outside the classes", () => {
    expect(() => confusionMatrix(CLASSES, [{ gold: "owl", predicted: "cat" }])).toThrow(
      "Gold label 'owl' is not one of the classes: cat, dog, fox.",
    );
  });
});

describe("classMetrics", () => {
  it("gives each class's precision, recall and support, with none for a class never predicted", () => {
    expect(classMetrics(confusionMatrix(CLASSES, PREDICTIONS))).toEqual([
      { label: "cat", precision: 0.5, recall: 0.5, support: 2 },
      { label: "dog", precision: 2 / 3, recall: 1, support: 2 },
      { label: "fox", precision: undefined, recall: 0, support: 2 },
    ]);
  });

  it("gives no recall for a class with no gold cases", () => {
    const [, dog] = classMetrics(confusionMatrix(CLASSES, [{ gold: "cat", predicted: "dog" }]));

    expect(dog).toEqual({ label: "dog", precision: 0, recall: undefined, support: 0 });
  });
});

describe("accuracy", () => {
  it("is the share of predictions matching gold; an unclassified prediction is wrong", () => {
    expect(accuracy(PREDICTIONS)).toBe(0.5);
  });

  it("is undefined for no predictions", () => {
    expect(accuracy([])).toBeUndefined();
  });

  it("groups by case tag, in the order asked, with an empty group undefined", () => {
    expect(accuracyByGroup(PREDICTIONS, ["clean", "hybrid", "unknown"])).toEqual([
      { group: "clean", accuracy: 0.75, count: 4 },
      { group: "hybrid", accuracy: 0, count: 2 },
      { group: "unknown", accuracy: undefined, count: 0 },
    ]);
  });
});

describe("formatRate", () => {
  it("formats a rate as a percentage, and a missing one as n/a", () => {
    expect(formatRate(2 / 3)).toBe("66.7%");
    expect(formatRate(undefined)).toBe("n/a");
  });
});

describe("renderConfusionMatrix", () => {
  it("renders gold rows against predicted columns, with an unclassified column when needed", () => {
    expect(renderConfusionMatrix(confusionMatrix(CLASSES, PREDICTIONS))).toBe(
      [
        "| Gold \\ Predicted | cat | dog | fox | (no valid answer) |",
        "|---|---:|---:|---:|---:|",
        "| cat | 1 | 1 | 0 | 0 |",
        "| dog | 0 | 2 | 0 | 0 |",
        "| fox | 1 | 0 | 0 | 1 |",
      ].join("\n"),
    );
  });

  it("leaves out the unclassified column when every prediction is a class", () => {
    const matrix = confusionMatrix(CLASSES, [{ gold: "cat", predicted: "cat" }]);

    expect(renderConfusionMatrix(matrix).split("\n").slice(0, 3)).toEqual([
      "| Gold \\ Predicted | cat | dog | fox |",
      "|---|---:|---:|---:|",
      "| cat | 1 | 0 | 0 |",
    ]);
  });
});
