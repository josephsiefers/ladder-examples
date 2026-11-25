# UC2: Intake triage

**Rung:** routing, in two layers:
1. **By type:** classify each intake document's document type, then **code** maps the type to a queue.
2. **Easy/hard:** a cascade. Haiku classifies everything and marks each document `routine` or `unusual`; unusual documents are re-classified by Sonnet.

## Discovery card

- **O (Outcome):** intake documents reach the right team's queue the same day.
- **P (Process):** a clerk reads each document, decides its type and forwards it. Odd ones go to a senior associate.
- **D (Data):** about 400 documents a week, roughly 75% templated NDAs. Inbox history records where each document went.
- **Q (Quality):** a misroute costs about a day. NDAs sent down the wrong path waste associate time.
- **C (Constraints):** the cheap path must handle the clean NDAs. Big-model spend goes only where it is needed.

## Justification sentence

> "I'd start with routing because there are five distinct document types, each with its own playbook and team, and most volume is easy NDAs a small model can handle. I'd add voting or human review on low-confidence documents only if evals show hybrid documents being misrouted."

**Upgrade trigger:** accuracy on hybrid documents is materially below accuracy on clean documents. If it fires, record it and stop; the upgrade becomes future work.

## Classification

- Output: `{docType: nda | msa | dpa | sow | other, rationale}`. #13 adds `difficulty: routine | unusual`.
- Document type is decided by **primary purpose**. A hybrid document still has exactly one type, for example an MSA with a confidentiality section → `msa`.

## Routing table (code, not LLM)

| Document type | Queue |
|---|---|
| `nda` | `nda-review` (stub until UC3 exists) |
| `msa` | `commercial` |
| `sow` | `commercial` |
| `dpa` | `privacy` |
| `other` | `senior-associate` |

## Datasets

- **smoke:** 5 hand-written intake documents, one per type (#10).
- **dev / test:** 30 intake documents (18 dev, 12 test): about 10 NDAs taken from UC1's generated corpus and about 20 generated others, including at least 6 hybrids across types (#11).
- Each gold label carries `docType`, `ambiguity: clean | hybrid`, and evidence (the title plus the paragraphs that show primary purpose).

## Scoring

- Overall accuracy, per-type precision and recall, a 5×5 confusion matrix, and accuracy on clean vs hybrid documents reported separately.
- In the cascade (#13), three strategies side by side: `haiku`, `sonnet`, and `cascade`. Columns: accuracy, hybrid accuracy, escalation rate, cost per 1,000 documents, p50 and p95 latency.

## Results

**Dev split (#11)**: Haiku, 3 runs, 18 documents (14 clean, 4 hybrid), recorded live 2026-11-25. Prompt untuned.

| Field | Mean | Stdev | Min | Max |
|---|---:|---:|---:|---:|
| docType | 100.0% | 0.0% | 100.0% | 100.0% |

| Gold \ Predicted | nda | msa | dpa | sow | other |
|---|---:|---:|---:|---:|---:|
| nda | 18 | 0 | 0 | 0 | 0 |
| msa | 0 | 9 | 0 | 0 | 0 |
| dpa | 0 | 0 | 6 | 0 | 0 |
| sow | 0 | 0 | 0 | 9 | 0 |
| other | 0 | 0 | 0 | 0 | 12 |

| Ambiguity | Accuracy | Case runs |
|---|---:|---:|
| clean | 100.0% | 42 |
| hybrid | 100.0% | 12 |

**Upgrade trigger: not fired.** Hybrid accuracy equals clean accuracy (both 100.0%). Caveats: only 4 dev hybrids, whose openings state their primary purpose plainly; the answer key awaits its human review (review sheet: 0 disagreements, 8 of 18 agreeing rows sampled); the test split has not been run.

## Tickets
#10, #11, #12, #13.
