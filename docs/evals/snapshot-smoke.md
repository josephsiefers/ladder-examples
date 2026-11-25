# UC1 snapshot eval: smoke split

## The cases

`nda-sample-01` plus three hand-written NDAs in [data/firm/contracts/](../../data/firm/contracts/), each planting different traps in how the snapshot is written. Gold labels are in [data/evals/snapshot/smoke/](../../data/evals/snapshot/smoke/).

- `nda-sample-02`: effective at the last signature, and a term that runs until terminated on 30 days' notice.
- `nda-sample-03`: a one-way NDA whose recital mentions "mutual discussions", under New York law with Delaware courts.
- `nda-sample-04`: a party named "Halden Robotics Pte. Ltd. and its Affiliates", with indefinite survival for trade secrets only. The gold survival period is the 2 years that apply to confidential information in general, following the prompt's rule.

## Results

`npm run eval -- snapshot --split smoke --runs 3` with Haiku, recorded 2026-11-22:

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| parties | 100.0% | 0.0% | 100.0% | 100.0% |
| effectiveDate | 100.0% | 0.0% | 100.0% | 100.0% |
| term | 100.0% | 0.0% | 100.0% | 100.0% |
| survivalPeriod | 100.0% | 0.0% | 100.0% | 100.0% |
| governingLaw | 91.7% | 11.8% | 75.0% | 100.0% |
| mutuality | 100.0% | 0.0% | 100.0% | 100.0% |

`effectiveDate 100.0% · term 100.0% → target 98%: MET`

One failure: in 1 of 3 runs, `nda-sample-04`'s "laws of the Republic of Singapore" came back as `other` instead of `singapore`. Totals: 12 calls, 58,236 input tokens, 3,634 output tokens. Before the cache existed, a separate run of the same eval missed it in 2 of 3 runs.

Four hand-written cases say little about the 98% target, which is measured on the [dev split](snapshot-dev.md). They do show the misses are not consistent: the same contract gets a different governing law on different runs, which a single run would hide.
