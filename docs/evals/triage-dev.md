# UC2 triage eval: dev split

## The cases

18 generated intake documents (`intake-gen-*` in [data/evals/triage/dev/](../../data/evals/triage/dev/)), 470–1,300 words each (the NDA copies are the longest). The other 12 of the 30-document corpus are the held-out test split, which has not been run. `npm run generate -- intake` rebuilds the corpus from its plant specs in [data/evals/triage/plants/](../../data/evals/triage/plants/) and prints how many documents of each type, and how many hybrids, each split holds.

How a document is built:

- **NDAs** are copies of UC1's generated NDAs (`nda-copy`), plus confidentiality letters written from the clause-variant library.
- **Other types** come from the library's base kinds in [data/library/intake/kinds/](../../data/library/intake/kinds/): MSAs, SOWs and DPAs, and for `other` an employment contract, an engagement letter and a settlement letter.
- **Hybrids** are a base document with one or more ingredients from [data/library/intake/ingredients/](../../data/library/intake/ingredients/), each a piece of another document type's substance. A hybrid keeps its base document's type.
- The assembler shuffles order, headings and numbering with each plant's seed. The gold label, `docType` plus `ambiguity` plus evidence paragraphs, is correct by construction.

| Gold type | Clean | Hybrid | Hybrid ingredients |
|---|---:|---:|---|
| nda | 5 | 1 | non-solicitation section |
| msa | 2 | 1 | confidentiality section |
| dpa | 3 | 0 | |
| sow | 2 | 1 | confidentiality section + IP section |
| other | 3 | 0 | |
| **total** | **15** | **3** | |

## Results

`npm run eval -- triage --runs 3` with Haiku, every call recorded live (`--live`) on 2026-11-28. The prompt was not tuned against this corpus.

```
## Eval triage · split dev · 18 cases × 3 runs

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| docType | 100.0% | 0.0% | 100.0% | 100.0% |

docType accuracy 100.0% (mean of runs) · upgrade trigger: hybrid accuracy materially below clean (see below)

Overall accuracy, pooled over 54 case runs: 100.0%

### Per type (pooled over all runs)

| Type | Precision | Recall | Support |
|---|---:|---:|---:|
| nda | 100.0% | 100.0% | 18 |
| msa | 100.0% | 100.0% | 9 |
| dpa | 100.0% | 100.0% | 9 |
| sow | 100.0% | 100.0% | 9 |
| other | 100.0% | 100.0% | 9 |

### Confusion matrix (pooled over all runs)

| Gold \ Predicted | nda | msa | dpa | sow | other |
|---|---:|---:|---:|---:|---:|
| nda | 18 | 0 | 0 | 0 | 0 |
| msa | 0 | 9 | 0 | 0 | 0 |
| dpa | 0 | 0 | 9 | 0 | 0 |
| sow | 0 | 0 | 0 | 9 | 0 |
| other | 0 | 0 | 0 | 0 | 9 |

### Clean vs hybrid

| Ambiguity | Accuracy | Case runs |
|---|---:|---:|
| clean | 100.0% | 45 |
| hybrid | 100.0% | 9 |

### Failures

None.

Totals: 54 calls · live 54 · cached 0 · 137,214 input tokens · 5,987 output tokens · 0 failed case runs · wall time 20.3 s
```

Replaying from the committed cache (`--replay-only`) gives the same report, except the totals line counts all 54 calls as cached.

The review sheet of this run (`npm run eval -- triage --review-sheet`) has 0 disagreement rows, so it lists a random sample of 8 of the 18 agreeing rows.

## Upgrade trigger: not fired

Hybrid accuracy (100.0%, 9 case runs) is not below clean accuracy (100.0%, 45 case runs), so the [upgrade trigger](../spec/use-cases/uc2-intake-triage.md#justification-sentence) did not fire. Routing by type with Haiku stays at its rung, with no voting or human review added.

How far this goes:

- There are only 3 hybrid documents, and each one's title fits its gold type (for example "Framework Services Agreement" for the MSA). Hybrids whose title hides the primary purpose are #37.
- The test split has not been run.
- A human has not yet reviewed the answer key with the review sheet.
