# UC1 snapshot eval: dev split

## The cases

12 generated NDAs (`nda-gen-*` in [data/evals/snapshot/dev/](../../data/evals/snapshot/dev/)). `npm run generate -- ndas` rebuilds them and prints which metadata plants each split covers.

## Results

`npm run eval -- snapshot --runs 3` with Haiku, recorded 2026-11-22. The prompt was not tuned against this corpus.

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| parties | 100.0% | 0.0% | 100.0% | 100.0% |
| effectiveDate | 100.0% | 0.0% | 100.0% | 100.0% |
| term | 100.0% | 0.0% | 100.0% | 100.0% |
| survivalPeriod | 100.0% | 0.0% | 100.0% | 100.0% |
| governingLaw | 100.0% | 0.0% | 100.0% | 100.0% |
| mutuality | 100.0% | 0.0% | 100.0% | 100.0% |

`effectiveDate 100.0% · term 100.0% → target 98%: MET`

No failures and no failed case runs. Totals: 36 calls, 187,245 input tokens, 12,150 output tokens.

**The effective-date/term target is met**, so the [deferred decision](../spec/use-cases/uc1-contract-snapshot.md#deferred-decision) is not triggered. This stands only until a human has reviewed the answer key (#9) with the run's review sheet. The test split has not been run.
