import type { ContractSnapshot } from "./schema";

/** The snapshot of the firm's sample NDA (nda-sample-01), as the ticket's demo expects it. */
export const SAMPLE_SNAPSHOT: ContractSnapshot = {
  parties: [
    { name: "Kestrel Bioanalytics Limited", role: "both" },
    { name: "Marlow Data Systems Ltd", role: "both" },
  ],
  effectiveDate: { kind: "date", value: "2025-03-03" },
  term: { kind: "fixed", months: 24 },
  survivalPeriod: { kind: "fixed", months: 60 },
  governingLaw: "england-and-wales",
  mutuality: "mutual",
};
