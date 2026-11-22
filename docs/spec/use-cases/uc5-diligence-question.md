# UC5: Diligence question (future: needs grilling)

**Rung:** orchestrator-workers. A central call plans which contracts and clause types to check for *this* question, workers run the checks, and the orchestrator synthesises a memo.

## Discovery card

- **O:** answer a partner's diligence question in hours, not days.
- **P:** the partner asks; an associate picks the relevant contracts, reads the relevant clauses, and writes a memo.
- **D:** a data room of about 30 mixed contracts for a fictional acquisition target (supply, licence, lease, employment, distribution).
- **Q:** a missed consent requirement can delay closing; the partner reviews the memo.
- **C:** questions vary from deal to deal, so subtasks can't be fixed in advance.

## Justification sentence

> "I'd start with orchestrator-workers because which contracts and clause types to check depends on the question. I'd move to an agent only if evals show answers that depend on following references (amendments, exhibits) that a one-pass plan misses."

## Agreed design (to be refined)

- `ladder diligence "<question>"`: plan → workers → memo.
- The data room is shared with UC6. Planted findings: change-of-control clauses (one phrased as "assignment by operation of law"), **an amendment that overrides an original clause**, an exhibit referenced but not included, one genuine deal-blocker. Gold findings are recorded per question.
- The overriding amendment is designed to be where UC5 falls short and UC6 succeeds.
- Translation layer gains `findContracts(matter, filter)`.
- Eval scores the change-of-control question with Haiku and Sonnet side by side (a model-size climb on evidence).
- A 🧑 review of the data-room answer key happens before UC6 starts.

## Open questions

1. Data-room generation: does it reuse the clause-variant library approach? Which document kinds and how many of each?
2. Question set: change-of-control only, or several questions?
3. The orchestrator's plan schema; worker granularity (per contract? per contract × clause type?).
4. Memo format, and how a memo is scored against gold findings (finding-level recall/precision?).
5. Concurrency and cost limits on workers.
6. Ticket sizing.
