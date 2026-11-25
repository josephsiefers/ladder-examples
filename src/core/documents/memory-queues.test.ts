import { describe, expect, it } from "vitest";
import { type IntakeDesk, IntakeNotFoundError } from "./intake";
import { withMemoryQueues } from "./memory-queues";

/** A desk with two documents whose own routing must never be called. */
const desk: IntakeDesk = {
  listIntake: async () => ["intake-a", "intake-b"],
  readIntake: async () => {
    throw new Error("not read");
  },
  routeToQueue: async () => {
    throw new Error("the firm's queues are not used");
  },
};

describe("withMemoryQueues", () => {
  it("keeps the desk's reads and records routing in memory at a fixed time", async () => {
    const documents = withMemoryQueues(desk);

    const receipt = await documents.routeToQueue({
      documentId: "intake-a",
      queue: "privacy",
      rationale: "A DPA.",
    });

    const record = {
      id: "intake-a",
      queue: "privacy",
      rationale: "A DPA.",
      routedAt: "2026-11-24T09:30:00.000Z",
    };
    expect(receipt).toEqual({ ...record, position: 1 });
    expect(documents.routed).toEqual([record]);
    expect(await documents.listIntake()).toEqual(["intake-a", "intake-b"]);
  });

  it("numbers each queue's positions separately", async () => {
    const documents = withMemoryQueues(desk);
    const route = (documentId: string, queue: "commercial" | "privacy") =>
      documents.routeToQueue({ documentId, queue, rationale: "x" });

    const positions = [
      await route("intake-a", "commercial"),
      await route("intake-b", "privacy"),
      await route("intake-b", "commercial"),
    ].map((receipt) => receipt.position);

    expect(positions).toEqual([1, 1, 2]);
  });

  it("refuses to route an unknown document, recording nothing", async () => {
    const documents = withMemoryQueues(desk);

    const route = documents.routeToQueue({ documentId: "nope", queue: "privacy", rationale: "x" });

    await expect(route).rejects.toThrow(IntakeNotFoundError);
    await expect(route).rejects.toThrow(
      "Intake document 'nope' not found. Known intake documents: intake-a, intake-b.",
    );
    expect(documents.routed).toEqual([]);
  });
});
