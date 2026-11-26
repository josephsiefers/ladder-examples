import { checkKnownIntake, type IntakeDesk, type RoutingRecord } from "./intake";

/** When every in-memory routing happens, so output that shows it is deterministic. */
const ROUTED_AT = "2026-11-24T09:30:00.000Z";

/**
 * An intake desk that routes into in-memory queues instead of the desk's own, for tests and
 * offline runs: each routing record is kept in `routed`, and positions count per queue.
 */
export function withMemoryQueues<Desk extends IntakeDesk>(
  desk: Desk,
): Desk & { routed: RoutingRecord[] } {
  const routed: RoutingRecord[] = [];
  return {
    ...desk,
    routed,
    async routeToQueue({ documentId, queue, rationale }) {
      checkKnownIntake(documentId, await desk.listIntake());
      const record = { id: documentId, queue, rationale, routedAt: ROUTED_AT };
      routed.push(record);
      return { ...record, position: routed.filter((each) => each.queue === queue).length };
    },
  };
}
