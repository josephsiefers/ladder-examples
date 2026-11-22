# UC1: Contract snapshot

**Rung:** single call (augmented LLM: one document in, one fixed schema out).
**Rung-locked:** UC1 exists to show the bottom rung. It never climbs. If evals show a single call can't do the job, the problem is reshaped rather than the design.

## Discovery card

- **O (Outcome):** stop paralegals keying contract snapshots into the matter record by hand.
- **P (Process):** a paralegal opens the contract, finds the parties, effective date, term, survival period, governing law, and mutuality, and types them into the matter record.
- **D (Data):** about 300 contracts a week. Two years of keyed snapshots exist and can serve as gold labels.
- **Q (Quality):** a wrong term date means a missed renewal reminder. The paralegal confirms every record.
- **C (Constraints):** fixed schema; the output must fit the matter record.

## Justification sentence

> "I'd start with a single call because it's one document into one fixed schema. I'd move to a chain (extract, then verify) only if evals show effective-date or term accuracy below 98%."

**Target:** effective date and term field accuracy ≥ 98% on the dev split, mean of 3 runs.

## Snapshot schema

| Field | Shape |
|---|---|
| `parties` | list of `{name, role: discloser \| recipient \| both}`. Mutual NDAs use `both`. Names are the legal entity without "and its Affiliates". |
| `effectiveDate` | `{kind: "date", value: "YYYY-MM-DD"}` \| `{kind: "last-signature"}` \| `{kind: "not-stated"}` |
| `term` | `{kind: "fixed", months}` \| `{kind: "until-terminated", noticeDays}` \| `{kind: "not-stated"}` |
| `survivalPeriod` | `{kind: "fixed", months}` \| `{kind: "indefinite"}` \| `{kind: "not-stated"}`. Where survival differs by kind of information (e.g. 2 years, but indefinite for trade secrets), the period for confidential information in general. |
| `governingLaw` | `england-and-wales` \| `new-york` \| `delaware` \| `california` \| `ontario` \| `singapore` \| `other` \| `not-stated` |
| `mutuality` | `mutual` \| `one-way` |

"Not stated" is always an explicit value. An invented value counts as an error. Governing law means the law chosen, not the courts chosen.

## Scoring

- Each field is scored exact-match after normalisation: case-folded, whitespace collapsed, trailing punctuation stripped. Parties are compared as an order-insensitive set of `(name, role)`.
- Reported per field: mean accuracy, stdev, min and max across runs, plus a failures list (case, field, expected, actual).
- The report states whether effective-date and term accuracy met the 98% target.

## Metadata plants (difficulty without clause deviations)

Clause bodies always use standard wording; clause-deviation plants belong to UC3. The difficulty comes from how metadata is expressed:

- an effective date in numerals, in words ("the 3rd day of March 2025"), as the date of last signature, or not stated;
- a term in months or in years ("two (2) years"), or until terminated on N days' notice;
- a **survival period that looks like the term** (the agreement runs 2 years, obligations survive 5) and an indefinite survival period for trade secrets;
- a one-way NDA whose recital mentions "mutual discussions";
- governing law of one jurisdiction with the courts of another;
- parties named "X Limited and its Affiliates".

## Datasets

- **smoke:** `nda-sample-01` plus 3 hand-written NDAs (#4, #5).
- **dev / test:** 20 generated NDAs, 12 dev and 8 test (#7). Each metadata plant appears at least twice in dev and at least once in test.

## Results

Dev split: 12 generated NDAs (#7), Haiku, 3 runs, recorded 2026-11-22. The prompt was not tuned against this corpus.

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| parties | 100.0% | 0.0% | 100.0% | 100.0% |
| effectiveDate | 100.0% | 0.0% | 100.0% | 100.0% |
| term | 100.0% | 0.0% | 100.0% | 100.0% |
| survivalPeriod | 100.0% | 0.0% | 100.0% | 100.0% |
| governingLaw | 100.0% | 0.0% | 100.0% | 100.0% |
| mutuality | 100.0% | 0.0% | 100.0% | 100.0% |

`effectiveDate 100.0% · term 100.0% → target 98%: MET`

No failures and no failed case runs (36 calls). **The effective-date/term target is met.** The deferred decision below is not triggered, but this stands only until the answer key has been reviewed (#9). The test split has not been run.

## Deferred decision

- **If effective-date/term accuracy is below 98%** after the answer key has been reviewed (#9): revisit then. Candidate responses are bounded prompt improvement with in-context examples on dev, or reshaping UC1 (e.g. dropping the failing field). Do not decide in advance.

## Tickets
#4, #5, #7, #8, #9 (plus #6, shared infrastructure).
