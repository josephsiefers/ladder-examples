# UC3: NDA review (future: needs grilling)

**Rung:** prompt chaining at the top level, with sectioning (parallelization) in the middle and code gates on both sides. **UC3b** adds voting on indemnity and limitation of liability, but only if the eval justifies it.

## Discovery card (from the lesson)

- **O:** free up associates; cut NDA turnaround from 3 days to 1.
- **P:** an associate reads the contract → compares it clause by clause against the playbook (15 clause types) → redlines → a partner spot-checks.
- **D:** about 300 contracts a week. A playbook of standard positions exists, and two years of redlined contracts.
- **Q:** missing a non-standard indemnity or liability clause is serious; wording style is cosmetic. Associates sign off on every redline.
- **C:** the output is a redline. (Word tracked changes are out of scope; we produce a simplified redline.)

## Justification sentence

> "I'd start with a short chain where the clause checks run in parallel, because the playbook already splits the work into 15 independent clause types, and two years of redlines let us test each check on its own. I'd add voting on indemnity and liability only if evals show those checks missing deviations."

## Agreed design (to be refined)

```
Contract in → Split & label (LLM: tag passages by substance, multi-tag allowed)
  → Missing-clause gate (code: 15 types minus found)
  → 15 clause checks in parallel (each given its playbook entry; returns a verdict)
  → Assemble redline (code: JSON redline → HTML render)
  → Associate checkpoint (CLI accept/reject; escalate to partner)
```

- Playbook: 15 NDA clause types: definition of confidential information, exclusions, permitted purpose, disclosure to representatives, compelled disclosure, standard of care, term & survival, return/destruction, no licence / IP, no warranty, remedies / injunctive relief, **indemnity**, **limitation of liability**, non-solicitation, governing law & jurisdiction. Each entry has a standard position, a fallback position, and a limit.
- Verdicts: acceptable · acceptable under fallback (margin note, no edit) · deviates (minimal edit with playbook citation) · beyond limit / missing (flagged; missing clauses get standard wording inserted).
- Contracts are Markdown with paragraph IDs. The redline is JSON (paragraph ID, old text, new text, verdict, comment, citation), rendered to a single HTML file by code.
- `fileRedlineForReview` goes through the translation layer.
- Candidate slices (to be confirmed when grilled): split & label + missing-clause gate · parallel clause checks · redline + associate checkpoint, with an edit-size eval against associate edits that becomes UC4's evidence · voting.

## UC3b: voting, and the anti-pattern demo

- Voting on indemnity and liability only, behind `--voting`.
- `--baseline=strawman` uses a deliberately weakened clause-check prompt, **labelled as an anti-pattern**.
- The README shows three rows: honest single check / strawman single check / voting, under "How a rigged eval makes a climb look justified". If the honest eval doesn't justify voting, say so.

## Planted issues (to be added to the clause-variant library)

An indemnity hidden under "Miscellaneous" (tests labelling by substance, not heading) · a missing clause type · a variant acceptable under fallback (should get a note, no edit) · purely cosmetic rewording that should **not** be flagged · deviations with gold minimal edits from an associate.

## Open questions

1. Plant spec shape for clause deviations, and how it extends UC1's corpus (new NDAs or new variants of the same 20?).
2. Gold labels: a verdict per clause type plus the associate's minimal edit, and how that edit is authored so it is credible.
3. Voting design: same prompt sampled 3 times, or 3 different prompts (the lesson's claims example uses different prompts)? What counts as disagreement, and where does it go?
4. Should the "confirm missing" extra call ("does anything here function as an indemnity?") be its own step or part of the gate?
5. Associate checkpoint UX in the CLI: per edit or per contract? What does the associate see?
6. The HTML redline render: exact layout, and how comments and citations appear.
7. Strawman prompt: how weak, and how to keep it clearly quarantined in code.
8. Human spot-check of the clause-variant library (deviation variants), using the same review-sheet approach as UC1.
9. Ticket sizing against the ~150k-token smart zone.
