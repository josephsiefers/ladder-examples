# ODE Examples: Law Firm Contract Review

A worked example of the design ladder: one law firm's contract-review needs, each solved at the lowest rung of LLM pattern that its discovery facts justify.

## Design ladder

**Rung**:
One of the LLM system patterns, ordered by how much control is given up: single call, prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer, agent.
_Avoid_: Level, tier, architecture

**Augmented LLM**:
The building block every rung is made from: one model call enhanced with retrieval, tools, and/or memory.
_Avoid_: Base model, bot

**Sectioning**:
Parallelization where independent subtasks run at the same time and their results are combined.

**Voting**:
Parallelization where the same task runs several times and the results are compared for confidence.

**Code gate**:
A deterministic check written in code that sits between LLM steps and decides whether work proceeds.
_Avoid_: Validator step, guard prompt

**Translation layer**:
The boundary between the LLM and a firm system, exposing intent-level operations instead of raw endpoints.
_Avoid_: API wrapper, adapter

**Use case**:
One firm need with its own discovery card, design, and eval, solved at the lowest rung its facts justify.
_Avoid_: Feature, workflow, scenario

**Discovery card**:
The five discovery answers for one need: Outcome, Process, Data, Quality, Constraints (O/P/D/Q/C).
_Avoid_: Requirements, spec

**Justification sentence**:
The one-line defence of a design: "I'd start with [rung] because [discovery answer]. I'd move up to [next rung] only if evals show [specific failure]."

**Upgrade trigger**:
The specific eval result that would justify climbing to the next rung.
_Avoid_: Escalation criteria

## Firm

**Associate**:
A junior lawyer who reviews contracts and must sign off on every redline.

**Partner**:
A senior lawyer who spot-checks associate work and receives escalations.

**Counterparty**:
The other side of a contract, whose draft the firm is reviewing.

**Playbook**:
The firm's catalogue of positions, one entry per clause type.
_Avoid_: Policy, rulebook, guidelines

**Clause type**:
A category of contractual substance (e.g. indemnity, limitation of liability) that the playbook takes a position on, identified by what a passage does rather than its heading.
_Avoid_: Section, heading

**Paragraph ID**:
The number a document gives one of its paragraphs, written at the paragraph's start: a clause number such as `4.2`, or a list number such as `6.`, whose ID is `6`. Contracts number every paragraph `N.M`; an intake document may use either style, or none. A prompt or a citation marks it as `[4.2]` or `[6]`. A numbered heading (`## 5. Confidentiality`) has no paragraph ID.
_Avoid_: Clause number, section number

**Standard position**:
The playbook's preferred wording or outcome for a clause type.

**Fallback position**:
A less-preferred outcome the playbook still accepts for a clause type.

**Verdict**:
The result of checking one clause type against the playbook: acceptable, acceptable under fallback, deviates, or beyond limit / missing.

**Redline**:
The reviewed contract returned with proposed edits and comments, each edit citing the playbook entry it enforces.
_Avoid_: Markup, diff

**Matter record**:
The firm's record of one client matter, where facts about its contracts are kept.
_Avoid_: Case file, ticket

**Contract snapshot**:
The key facts of one contract recorded in the matter record: parties, effective date, term, survival period, governing law, and mutuality.
_Avoid_: Metadata, summary, abstract

**Term**:
How long the agreement itself runs.
_Avoid_: Duration (ambiguous with survival period)

**Survival period**:
How long confidentiality obligations continue after the term ends; distinct from the term.

**Mutuality**:
Whether both parties disclose and protect information (mutual) or only one does (one-way).
_Avoid_: Bilateral, unilateral

## Intake

**Intake document**:
A document arriving at the firm that has not yet been classified or routed.

**Document type**:
The category an intake document belongs to by its primary purpose: NDA, MSA, DPA, SOW, or other. A hybrid document still has exactly one document type.
_Avoid_: Contract type, category

**Clean document**:
An intake document whose substance is all of one document type. The counterpart of a hybrid document.
_Avoid_: Pure document, simple document, single-type document

**Hybrid document**:
An intake document whose substance spans more than one document type, such as an MSA with built-in confidentiality terms. The counterpart of a clean document.

**Ingredient**:
A piece of another document type's substance, such as a confidentiality section or a DPA schedule, that the intake generator adds to a base document to make it a hybrid document. The hybrid keeps its base document's type, so at least one of its ingredients is of a different type. A clean document has none.
_Avoid_: Plant, add-on

**Ambiguity**:
Whether an intake document is a clean document or a hybrid document. The triage gold labels carry it, and the eval reports accuracy by it. Not how hard a document is to classify.
_Avoid_: Difficulty, complexity

**Document-level label**:
An intake document's gold document type and ambiguity read as one label, such as `msa (hybrid)`. The triage review sheet shows it as each row's answer key. An eval's `documentLabel` function gives it.

**Intake desk**:
The firm's intake function, which lists intake documents, reads one, and routes one to its queue. Part of the translation layer. The code calls it `IntakeDesk`.
_Avoid_: Intake system, intake API, the firm's intake

**Queue**:
The team destination an intake document is routed to for handling.
_Avoid_: Inbox, bucket
