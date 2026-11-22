# UC6: Diligence investigation (future: needs grilling)

**Rung:** agent. An LLM uses translation-layer tools in a loop, getting ground truth from the data room at each step.

## Discovery card

- **O:** surface deal-blockers before signing.
- **P:** a senior associate digs through the data room, following amendments, exhibits, and cross-references wherever they lead.
- **D:** the same data room as UC5.
- **Q:** a missed blocker is very costly; false alarms waste partner time; the partner decides on every flag.
- **C:** open-ended; a step and cost budget per investigation; a human checkpoint on every flag.

## Justification sentence

> "An agent, because the investigation path depends on what each document reveals: amendments override originals, and exhibits are referenced but missing. So the number of steps can't be predicted. Stopping conditions: a step budget, a cost cap, and human approval of every flag."

**Downgrade trigger** (top rung): if evals show trajectories always follow the same few steps, fold the design back into an orchestrator.

## Agreed design (to be refined)

- Tools via the translation layer: search the data room, read a document, follow a reference (amendment/exhibit), flag for a partner. No raw file or API access.
- Candidate slices (to be confirmed when grilled): agent loop + step budget + cost cap, with an outcome eval (planted blockers found, steps taken, stayed within budget); then human checkpoint on every flag + trajectory eval (do the paths really vary?) + a UC5 vs UC6 comparison on the overriding-amendment question.
- Start on Haiku; the eval decides whether Sonnet is needed.

## Open questions

1. The exact tool set, tool argument design ("poka-yoke"), and what each tool returns.
2. Step budget and cost cap values; what happens when a budget is hit (partial report?).
3. Checkpoint UX: what the human sees when approving a flag.
4. How trajectory variety is measured for the downgrade trigger.
5. How the agent's findings are scored against gold (shared with UC5's scoring?).
6. Ticket sizing.
