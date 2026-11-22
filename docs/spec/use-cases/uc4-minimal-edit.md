# UC4: Minimal edit (future: needs grilling)

**Rung:** evaluator-optimizer, **climbed from a single call**. It starts as UC3's one-shot edit, and the loop is added only if the edit-size eval fails.

## Discovery card

- **O:** redlines associates accept without rewriting.
- **P:** for a deviating clause, the associate makes the smallest change that restores the playbook position.
- **D:** associates' actual edits from two years of redlines (gold).
- **Q:** over-editing slows negotiation with the counterparty; every edit must match the playbook.
- **C:** the criteria are explicit: the playbook position plus a minimal change.

## Justification sentence

> "I'd start with a one-shot edit because the playbook already gives the target position. I'd add an evaluator loop only if evals show edits materially larger than associates' edits, or drifting from the playbook."

## Agreed design (to be refined)

- **Judge + calibration:** an LLM-as-judge scores edit quality. It is calibrated against a constructed set (associate gold edits as "good"; planted over-edits and wrong-position edits as "bad") and reports how often it agrees with those labels. The judge itself has to be evaluated before it is trusted.
- **Loop:** generator → judge critique → revise, with an iteration cap.
- **Eval:** one-shot baseline vs loop on edit size, playbook adherence, iterations, and cost.
- If the baseline already matches associate edit size, report that and don't claim the climb was needed.

## Open questions

1. Definition of edit size (word-level edit distance? ratio to the associate's edit?) and what counts as "materially larger".
2. Judge rubric, and whether the judge uses Haiku or Sonnet.
3. Size of the calibration set, how the "bad" edits are constructed, and the agreement threshold for trusting the judge.
4. Iteration cap and stop condition (judge passes? no improvement?).
5. Whether judge-calibration labels need a human spot-check.
6. Ticket sizing.
