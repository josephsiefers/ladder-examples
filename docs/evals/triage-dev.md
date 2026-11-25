# UC2 triage eval: dev split

Linked from the README's [UC2 section](../../README.md#uc2-intake-triage).

## The corpus

30 generated intake documents in [data/firm/intake/](../../data/firm/intake/) (`intake-gen-01` to `intake-gen-30`: 18 dev, 12 test), with gold cases in [data/evals/triage/](../../data/evals/triage/). Their IDs say nothing about their type. `npm run generate -- intake` rebuilds them all, byte for byte.

- **NDAs (10).** Nine are copied from UC1's generated corpus into the firm's intake, so each firm system stays self-contained: eight byte for byte, and one with an added non-solicitation section (employees and customers). The tenth is a confidentiality undertaking written as a letter.
- **Others (20).** 5 MSA, 4 DPA, 4 SOW and 7 other (lease, employment contract, engagement letter, software licence, settlement letter), each assembled from a short-document library ([data/library/intake/](../../data/library/intake/)) with seeded title, opening and section variants and a seeded section order.
- **Hybrids (7: 4 dev, 3 test).** Each adds an ingredient of another type to a base document, and keeps the base's type: an MSA with a confidentiality section; an MSA with a DPA as Schedule 1; an NDA with a non-solicitation section; a SOW with confidentiality and IP sections; a DPA titled "Data Sharing Agreement"; a confidentiality letter (an NDA in letter form); an employment contract with a confidentiality section.

One plant spec per document ([data/evals/triage/plants/](../../data/evals/triage/plants/)) names its split, seed, document type, clean/hybrid, base document and ingredients. The generator refuses a spec whose type is not its base's, or whose ingredient is of its own type, and refuses to write unless there are at least 6 hybrids, hybrids in both splits, and every type in both splits. Gold cites the title plus the opening paragraphs that state the document's primary purpose.

| Type | Dev clean | Dev hybrid | Test clean | Test hybrid |
|---|---:|---:|---:|---:|
| nda | 5 | 1 | 3 | 1 |
| msa | 2 | 1 | 1 | 1 |
| dpa | 1 | 1 | 2 | 0 |
| sow | 2 | 1 | 1 | 0 |
| other | 4 | 0 | 2 | 1 |
| **total** | 14 | 4 | 9 | 3 |

`triage --all` covers these 30 documents as well as the 5 hand-written ones. Dev documents replay from the eval's cache (its run 1); test documents are not cached, so `--all` without `--replay-only` calls the API for them.

## Full report

`npm run eval -- triage --runs 3` with Haiku, every call recorded live on 2026-11-25 (`--live`). Replay it with `--replay-only`. The prompt is untuned.

### Eval triage · split dev · 18 cases × 3 runs

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| docType | 100.0% | 0.0% | 100.0% | 100.0% |

docType accuracy 100.0% (mean of runs) · upgrade trigger: hybrid accuracy materially below clean (see below)

Overall accuracy, pooled over 54 case runs: 100.0%

#### Per type (pooled over all runs)

| Type | Precision | Recall | Support |
|---|---:|---:|---:|
| nda | 100.0% | 100.0% | 18 |
| msa | 100.0% | 100.0% | 9 |
| dpa | 100.0% | 100.0% | 6 |
| sow | 100.0% | 100.0% | 9 |
| other | 100.0% | 100.0% | 12 |

#### Confusion matrix (pooled over all runs)

| Gold \ Predicted | nda | msa | dpa | sow | other |
|---|---:|---:|---:|---:|---:|
| nda | 18 | 0 | 0 | 0 | 0 |
| msa | 0 | 9 | 0 | 0 | 0 |
| dpa | 0 | 0 | 6 | 0 | 0 |
| sow | 0 | 0 | 0 | 9 | 0 |
| other | 0 | 0 | 0 | 0 | 12 |

#### Clean vs hybrid

| Ambiguity | Accuracy | Case runs |
|---|---:|---:|
| clean | 100.0% | 42 |
| hybrid | 100.0% | 12 |

#### Failures

None.

Totals: 54 calls · live 54 · cached 0 · 117,423 input tokens · 6,266 output tokens · 0 failed case runs · wall time 21.2 s

## Upgrade trigger: not fired

Hybrid accuracy (100.0%, 12 case runs) is not below clean accuracy (100.0%, 42 case runs), so routing by type stays as it is and no voting or human review is added. Two cautions:

- The dev split has only 4 hybrid documents, and the generated hybrids state their primary purpose plainly in their opening paragraphs, so they may be easier than real ones.
- The answer key is provisional until a human has read the review sheet (`npm run eval -- triage --review-sheet`): 0 disagreement rows, and a random sample of 8 of 18 agreeing rows.

The test split has not been run.
