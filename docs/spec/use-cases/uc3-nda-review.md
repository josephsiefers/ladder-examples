# UC3: NDA review

**Rung:** prompt chaining at the top level, with sectioning (parallelization) in the middle and code gates on both sides. **UC3b** adds voting on indemnity and limitation of liability, but only if the eval justifies it.

## Discovery card

- **O (Outcome):** free up associates; cut NDA turnaround from 3 days to 1.
- **P (Process):** an associate reads the contract → compares it clause by clause against the playbook (15 clause types) → redlines → a partner spot-checks.
- **D (Data):** about 300 contracts a week. A playbook of standard positions exists, and two years of redlined contracts.
- **Q (Quality):** missing a non-standard indemnity or liability clause is serious; wording style is cosmetic. Associates sign off on every redline.
- **C (Constraints):** the output is a redline. Word tracked changes are out of scope; we produce a simplified redline.

## Justification sentence

> "I'd start with a short chain where the clause checks run in parallel, because the playbook already splits the work into 15 independent clause types, and two years of redlines let us test each check on its own. I'd add voting on indemnity and liability only if evals show those checks missing deviations."

## Scope

- **Mutual NDAs only.** The playbook is written for mutual NDAs, where each party is both discloser and recipient, so its positions don't depend on which side the client is on. One-way NDA review is out of scope.
- UC3 reads contracts by ID. Consuming UC2's `nda-review` queue is out of scope; that queue stays a stub.
- `claude-haiku-5-5` for every step. Moving any step to Sonnet would be an eval-driven change, recorded as an upgrade trigger.

## Design

```
Contract in
  → Clause map        (LLM: paragraphs per clause type, by substance; multi-type allowed)
  → ID gate           (code: every paragraph ID exists in the contract)
  → Missing gate      (code: required clause types with no paragraphs → missing)
  → 15 clause checks in parallel  (LLM: one per present clause type → verdict + edits)
  → Assemble redline  (code: citations, word diffs, insertions for missing clauses)
  → Associate checkpoint (CLI: accept / reject / escalate per redline entry)
  → fileRedline       (translation layer: JSON + HTML + partner queue)
```

### Playbook

Firm data, at `data/firm/playbook/nda/<clause-type>.json`, one file per clause type, read through `core/documents` (`readPlaybook`). The 15 clause-type IDs are defined once in `src/core`, shared by the use case and the generator.

The 15 clause types: definition of confidential information, exclusions, permitted purpose, disclosure to representatives, compelled disclosure, standard of care, term & survival, return/destruction, no licence / IP, no warranty, remedies / injunctive relief, **indemnity**, **limitation of liability**, non-solicitation, governing law & jurisdiction. (`general` boilerplate is not a playbook type.)

Each entry has:

| Field | Shape |
|---|---|
| `standardPosition` | plain-language statement |
| `fallbackPosition` | plain-language statement |
| `limit` | plain-language statement |
| `required` | boolean. **Optional:** non-solicitation, indemnity. All others are required. |
| `standardWording` | paragraphs inserted when a required clause is missing |
| `thresholds` | term & survival and governing law only: structured values the generator derives gold from (see Metadata-driven verdicts). The prompt shows only the prose; a unit test checks that prose and thresholds agree. |

### Clause map

The first LLM step sees **every** paragraph, including section 1, and returns, for each clause type, the IDs of the paragraphs whose substance is that type. A paragraph may appear under several types, or under none. Code then rejects any ID not in the contract (a schema error).

**Missing gate:** a required clause type with no paragraphs gets the verdict `missing`. An optional type with no paragraphs is `acceptable`, with no redline entry.

There is no "confirm missing" re-check in the first build. Its upgrade trigger is under Upgrade triggers.

### Clause checks (sectioning)

One check per clause type present, all run in parallel. Each sees **only its playbook entry plus the paragraphs the clause map gave it**. (Known gap: a check doesn't see terms defined in other clauses. The standard wording keeps such terms self-explanatory; the README says so.)

Output: `{verdict, rationale, comment, edits: [{paragraphId, newText}]}`. Each edit is a **whole replacement paragraph**. The model never writes the citation or the diff.

### Verdicts and redline actions

| Verdict | Decided by | Redline action |
|---|---|---|
| `acceptable` | clause check (or missing gate, for an optional type) | none |
| `fallback` | clause check | margin note citing the fallback position, no edit |
| `deviates` | clause check | minimal edit restoring the standard position |
| `beyond-limit` | clause check | edit restoring the standard position; defaults to escalation |
| `missing` | missing gate | `standardWording` inserted; defaults to escalation |

### Assemble redline (code)

- The citation is filled in by code: clause type plus `standard | fallback | limit`.
- A word-level diff (the `diff` package's `diffWords`, wrapped once in `src/core` as `wordDiff`: ops plus a changed-word count) is computed against the original paragraph.
- An insertion for a missing clause has no paragraph ID and is placed at the end of the body, before Signatures.
- The redline is JSON. Each **redline entry** has: clause type, verdict, paragraph ID (or insertion), old text, new text, comment, citation, decision. Under `--voting` it also records the vote split.

### Associate checkpoint

One CLI session per contract:
- **Header:** contract, counts by verdict, number of escalations.
- **Entries:** the CLI steps through every redline entry, showing its clause type, verdict, word diff, comment and citation, and asks **accept / reject / escalate**. `beyond-limit` and `missing` default to escalate. Reject asks for an optional reason. The associate never edits text in the CLI.
- `--auto-approve` accepts every entry and keeps the default escalations.

### fileRedline (translation layer)

The checkpoint runs first; then `fileRedline(contractId, reviewedRedline, html)` writes:
- `out/firm/redlines/<contractId>.json`: entries plus decisions;
- `out/firm/redlines/<contractId>.html`;
- one line per escalated entry appended to `out/firm/partner-queue.jsonl`.

### HTML redline

One self-contained file with inline CSS and no JavaScript, rendered by the use case. `fileRedline` only persists it.
- **Header:** title, counts by verdict, counts by decision, and escalations, each linked to its paragraph.
- **Body:** the contract in order, keeping headings and paragraph IDs. An edited paragraph shows its word diff inline (`<del>`/`<ins>`). Beside it, a margin note shows the verdict badge, comment, citation (e.g. *Playbook: Limitation of liability, limit*), decision, and reject reason if any. Fallback entries show the margin note only.
- **Insertions:** at the end of the body, before Signatures, marked as inserted.

## UC3b: voting, and the anti-pattern demo

### Voting (`--voting`)

- Indemnity and limitation of liability only. The **same prompt is sampled 3 times** (sample indices 0–2).
- **Most severe verdict wins:** acceptable < fallback < deviates < beyond-limit. The edit and comment come from the lowest-index sample with that verdict.
- A split vote is recorded on the redline entry ("2 of 3 checks: deviates") and shown at the checkpoint. It does **not** force an escalation.
- The eval reports the false-flag cost of "most severe wins" next to its recall gain.
- Voting the same prompt can fix only *inconsistent* misses. The README says that any *consistent* misses that remain would need different prompts (the lesson's claims example) or a better prompt, not more samples.

### Strawman baseline (`--baseline=strawman`), labelled as an anti-pattern

- The strawman check gets **only the standard position**: no fallback, no limit, and no instruction to judge by substance. It is weak in believable ways: it over-flags fallbacks and under-calls beyond-limit.
- It lives in its own file, with a header comment calling it an anti-pattern. Name it so Stryker's `prompts.ts` exclusion covers it.
- Only `npm run eval -- review --baseline=strawman` reaches it, never `ladder review`. Its report row is titled **"Strawman single check (anti-pattern)"**.
- The README section **"How a rigged eval makes a climb look justified"** shows three rows: honest single check, strawman single check, voting. It names the justified comparison (voting vs honest) and the rigged one (voting vs strawman). If the honest eval doesn't justify voting, it says so.

## Datasets

### Review corpus

- **24 generated mutual NDAs**, `nda-rev-01..24` (14 dev, 10 test), in `data/firm/contracts/`. Gold and plant specs go in `data/evals/review/{smoke,dev,test,plants}/`.
- Built by UC1's assembler from an extended plant spec. **UC1's 20 NDAs stay byte-identical**, so its gold, review sheet and cache are untouched.
- The plant spec gains a `clauses` field. For each clause type it can pick a variant, mark the type missing, or set a placement (`in-miscellaneous`: the clause's paragraphs go inside the `standard-miscellaneous` section, with no heading of their own). Unplanted types use standard variants, as today.
- **Smoke:** 2 hand-written mutual NDAs with hand-labelled gold. One is all-standard; the other has a hidden indemnity, an LoL beyond-limit, a cosmetic rewording and a missing required clause.

### Clause-variant library: answer key by construction

Every non-standard variant carries its own gold:

```json
"deviates-uncapped": {
  "heading": "Indemnity",
  "paragraphs": ["…deviating text…"],
  "verdict": "deviates",
  "goldEdit": ["…the associate's minimal fix, one per paragraph…"]
}
```

- Fallback and cosmetic variants carry `verdict` and no `goldEdit`. Standard variants are implicitly `acceptable`.
- **Gold-edit rule:** change the fewest words that restore the standard position; never rephrase untouched sentences.
- The gold clause map follows from where each variant's paragraphs land, including the hidden placement.
- The playbook and the variants are written together, each variant against the entry it tests.

### Plant catalogue

| Clause type | Variants |
|---|---|
| Indemnity | `deviates` ×2, `beyond-limit`, `fallback`, `cosmetic`; hidden in Miscellaneous (standard *or* deviating text); missing (optional type, so gold is `acceptable`) |
| Limitation of liability | `deviates` ×2, `beyond-limit`, `fallback`, `cosmetic`; missing |
| Exclusions, representatives, compelled disclosure, return/destruction, permitted purpose | `deviates`, `fallback`, `cosmetic` each |
| Term & survival, governing law | metadata-driven (below) |
| Remaining 6 | standard only; required ones may be planted missing |

### Metadata-driven verdicts

Term & survival and governing law already state UC1's planted values, so their gold verdicts come from the plant by rule, using the playbook's `thresholds`:

| | acceptable | fallback | deviates | beyond-limit |
|---|---|---|---|---|
| Survival period | indefinite, or ≥ 36 months | 24–35 months | 12–23 months | < 12 months, or not stated |
| Governing law | England & Wales | New York, Delaware | California, Ontario, Singapore, other | not stated |

The gold edit is the same paragraph re-rendered with the standard value: survival "three (3) years", law England & Wales. UC1's "survival looks like term" plant is a trap for this check as well.

### Coverage minimums (enforced by the generator)

- Every indemnity and LoL **needs-action** option (deviates ×2, beyond-limit, hidden-deviating): ≥ 2× in dev, ≥ 1× in test.
- Every other non-standard option (fallback, cosmetic, hidden-standard, missing, the 5 other types' variants): ≥ 1× in dev, ≥ 1× in test.
- Metadata-driven verdicts: each of the 4 verdicts ≥ 1× per split for each of the two types.
- Each contract has 2–5 non-standard clauses, except 2 all-standard controls per split.

### Answer-key review sheet

There is one row per non-standard library variant, not per case, because gold follows from the library. Each row shows the clause type, the playbook entry (standard / fallback / limit), the variant text, the gold verdict, and the gold edit as a word diff. Rows where the model and gold disagree in the first dev eval sort first. Metadata-driven verdicts get one row per rule outcome. As with UC1, this is a reading check, not a legal one, done by a human.

## Scoring

The chain is evaluated step by step; gold for each step follows from the plant spec.

1. **Clause map:** per clause type, precision and recall of paragraph IDs. The hidden-in-Miscellaneous plants are reported on their own.
2. **Missing gate:** false-missing rate and missed-missing rate.
3. **Verdicts:** a 5×5 confusion matrix, plus:
   - **needs-action recall** (gold `deviates | beyond-limit | missing` → predicted any of those three), overall and for indemnity + LoL separately;
   - **escalation recall** (gold `beyond-limit | missing` → predicted `beyond-limit | missing`);
   - **false-flag rate** on cosmetic and standard clauses;
   - **fallback handling:** fallback variants that got `fallback` and no edit.
4. **Edit size:** for each correctly flagged `deviates` entry, the words changed (`wordDiff` insertions + deletions) by the model vs by the gold edit, reported as a median ratio. There is **no pass/fail**; this is UC4's evidence, and UC4 decides what "materially larger" means.
5. Cost and latency per contract.

For each indemnity and LoL needs-action case, the report also shows its **hit count across runs (k/3)**. Misses are split into **inconsistent** (1–2 of 3) and **consistent** (0 of 3).

## Upgrade triggers

- **Voting (UC3b):** fires if **any** planted indemnity or LoL needs-action case is missed in **any** of the 3 dev runs. The k/3 breakdown shows which misses voting can fix.
- **Confirm-missing step:** fires if the false-missing rate on dev hidden-clause plants is above zero (mean of 3 runs). It would be its own LLM step after the gate ("does anything here function as an indemnity?"), so the gate stays pure code.

## Interfaces

- `npm run ladder -- review <contractId> [--auto-approve] [--voting]`: the full chain, the checkpoint and `fileRedline`.
- `npm run eval -- review --split <s> [--runs N] [--voting] [--baseline=strawman]`: the chain up to the assembled redline, then scoring. The checkpoint and filing are not part of the eval.

## Shared infrastructure UC3 needs

- **A global in-flight cap in `core/llm`** (default 8, configurable). The eval runner's case concurrency (4) times 15 parallel checks would otherwise put about 60 calls in flight.
- **`wordDiff` in `src/core`**, wrapping the `diff` package, used by the use case and the review sheet.
- **The clause-type list in `src/core`**, read by the use case and the generator.

## Tickets

Parent: [#49](https://github.com/josephsiefers/ladder-examples/issues/49). Tickets are not yet written; they will be sliced from this spec as sub-issues of #49.
