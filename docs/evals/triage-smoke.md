# UC2 triage eval: smoke split

Linked from the README's [UC2 section](../../README.md#uc2-intake-triage).

## The cases

Five hand-written intake documents in [data/firm/intake/](../../data/firm/intake/), 570–640 words each, one per document type. Each opens with a client's cover note. Gold labels are in [data/evals/triage/smoke/](../../data/evals/triage/smoke/).

| Case | Gold type | Ambiguity | What it is |
|---|---|---|---|
| `intake-hand-01` | nda | clean | A one-way confidentiality agreement ahead of a minority investment. |
| `intake-hand-02` | msa | hybrid | An MSA with a five-year confidentiality section, which the client calls "basically an NDA". |
| `intake-hand-03` | dpa | clean | An Article 28 data processing agreement with a payroll provider. |
| `intake-hand-04` | sow | clean | A statement of work under the MSA in `intake-hand-02`. |
| `intake-hand-05` | other | hybrid | A letter of intent to buy a business, with a binding confidentiality paragraph and a note asking whether it belongs with the NDA team. |

## Full report

`npm run eval -- triage --split smoke --runs 3` with Haiku. Every call was recorded live: twelve on 2026-11-24 with `--live`, and `intake-hand-05`'s three on 2026-11-25, after its paragraph IDs started being parsed and its prompt changed:

```
## Eval triage · split smoke · 5 cases × 3 runs

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| docType | 100.0% | 0.0% | 100.0% | 100.0% |

docType accuracy 100.0% (mean of runs) · upgrade trigger: hybrid accuracy materially below clean (see below)

Overall accuracy, pooled over 15 case runs: 100.0%

### Per type (pooled over all runs)

| Type | Precision | Recall | Support |
|---|---:|---:|---:|
| nda | 100.0% | 100.0% | 3 |
| msa | 100.0% | 100.0% | 3 |
| dpa | 100.0% | 100.0% | 3 |
| sow | 100.0% | 100.0% | 3 |
| other | 100.0% | 100.0% | 3 |

### Confusion matrix (pooled over all runs)

| Gold \ Predicted | nda | msa | dpa | sow | other |
|---|---:|---:|---:|---:|---:|
| nda | 3 | 0 | 0 | 0 | 0 |
| msa | 0 | 3 | 0 | 0 | 0 |
| dpa | 0 | 0 | 3 | 0 | 0 |
| sow | 0 | 0 | 0 | 3 | 0 |
| other | 0 | 0 | 0 | 0 | 3 |

### Clean vs hybrid

| Ambiguity | Accuracy | Case runs |
|---|---:|---:|
| clean | 100.0% | 9 |
| hybrid | 100.0% | 6 |

### Failures

None.

Totals: 15 calls · live 3 · cached 12 · 33,939 input tokens · 1,756 output tokens · 0 failed case runs · wall time 2.4 s
```

Replaying from the committed cache gives the same report, except the totals line counts all 15 calls as cached.
