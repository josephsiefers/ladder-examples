import { z } from "zod";

const months = z.number().int().positive();

/** UC1's fixed schema: the contract snapshot as the matter record holds it. See the UC1 spec. */
export const contractSnapshotSchema = z.object({
  parties: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.enum(["discloser", "recipient", "both"]),
      }),
    )
    .min(1),
  effectiveDate: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("date"), value: z.iso.date() }),
    z.object({ kind: z.literal("last-signature") }),
    z.object({ kind: z.literal("not-stated") }),
  ]),
  term: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), months }),
    z.object({ kind: z.literal("until-terminated"), noticeDays: z.number().int().nonnegative() }),
    z.object({ kind: z.literal("not-stated") }),
  ]),
  survivalPeriod: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), months }),
    z.object({ kind: z.literal("indefinite") }),
    z.object({ kind: z.literal("not-stated") }),
  ]),
  governingLaw: z.enum([
    "england-and-wales",
    "new-york",
    "delaware",
    "california",
    "ontario",
    "singapore",
    "other",
    "not-stated",
  ]),
  mutuality: z.enum(["mutual", "one-way"]),
});

export type ContractSnapshot = z.infer<typeof contractSnapshotSchema>;

export const CONTRACT_SNAPSHOT_SCHEMA_NAME = "contract-snapshot";
