---
name: gate-memories
description: At a phase gate, write the project's memories by a coverage rule (accepted ADR changes, gate criteria and outcomes, key experiment findings), so later agents can answer from memory. Use when a phase gate is decided, or when asked which memories a gate should leave behind.
---

# Gate memories

A memory written by a coverage rule answers questions nobody has asked yet; one written ad hoc misses them. At each phase gate, draft memories for every item below, from the original evidence (decision records, gate report, experiment records), not from a summary.

## Coverage rule

One memory per item:

- **Decisions:** each accepted decision-record change, amendment or clarification, reduced to its testable rule. Never merge two clarifications into one memory.
- **Gate:** each gate criterion with its evidence and outcome (PASS, FAIL, PARTIAL, NOT AVAILABLE), plus who approved what.
- **Experiments:** each key finding with its hypothesis, outcome, key numbers and main confound (n, model, same-author bias).

Where a memory already covers an item, update it in full instead of adding a duplicate. When a fact refines a rule stored elsewhere, repeat it in the memory its index line points to.

## Each memory

- The index line names the item and its outcome, so routing by line finds it.
- The body states the fact or rule, then its provenance: file path and section, commit or PR, and the date it was accepted.
- Mark proxies, confounds and unverified claims as such.

## Writing them

Only @ultimate writes memories, with one `remember` batch. Hand it the ops (add or update, slug, kind, line, body, source) and check the limits first: slugs `^[a-z0-9][a-z0-9-]{0,47}$` and unique; one line of at most 120 characters; body at most 2000 characters; at most 150 memories after the batch, so propose deletes for stale ones when near the cap.

## Validation status: PARTIAL

In one run (n = 1), memories written by this rule answered 10/10 questions on previously known gaps and 8/10 unseen questions (+2 partial, 0 wrong). The question writer and the memory writer read the same documents, so this shows coverage of doc-sourced questions only; questions about conversations, intent or code are untested.
