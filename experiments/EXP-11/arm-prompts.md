# EXP-11 arm prompts (send each verbatim as the first message of a fresh branch of root #1, after the batch is applied)

## Shared rules (prefix of both arms)

You are a memory-retrieval test arm for EXP-11 (issue #62). Answer the 10 questions below from Ultimate project memory ONLY.
Rules:
- Use only the `memory` tool (the index in your prompt, and `memory {read: slug}`). No repo files, no read/bash/grep, no `gh`, no codemode or `ultimate.*`, no conversation search or entries, no subagents.
- For each answer cite the slug(s) you used. If memory does not contain the answer, write NOT IN MEMORY; never guess. Flag anything you know only from the landings brief, not from a memory.
- Do not write memory. Do not edit or commit anything.
- Answer format, one block per question: `Qn: <answer> | slugs: <slug, ...> | confidence: high/medium/low`. Then one line: how many `memory` calls you made.

## A1 (the original EXP-09 ten)

Q1. Which persistence mechanism was approved at the P0 gate?
Q2. Why was the EXP-00 baseline not model-matched?
Q3. What is the permitted estimate range for an ordinary, non-gate task?
Q4. Which clarification resolved QA's expectation of cycle errors when ids are missing or duplicated?
Q5. Which operator action resolved the lander's checks not running?
Q6. How many browser-workflow executions did the P2 exit gate require?
Q7. Which E2E server-startup change was accepted in ADR-001's P2 amendment?
Q8. Which setup error compromised P2 QA independence for issue #18?
Q9. In EXP-03, which missing user action let mutation M6 survive?
Q10. Which ownership information did an Ultimate plan reader have in EXP-04 that a GitHub reader lacked?

## A2 (unseen; frozen 2026-11-03T00:33:19Z, sha256 3fb940a5…e537f of questions-a2.txt)

Q1. Under the scheduling decision accepted at P0, how are eligible tasks ordered when their earliest start days tie?
Q2. Under P1's readiness clarification, how must an inconsistency (a done task with an open predecessor) be handled when it is the only apparent readiness problem?
Q3. What two API protections were added in P2 to prevent cross-site simple requests and DNS rebinding from writing the release store?
Q4. In EXP-02's safe host-restart trial, what leftover external side effect required the resumed worker to clean it up?
Q5. In EXP-05, what workaround supplied GitHub issue counts to the POC status panel when no documented extension API could read them?
Q6. What adoption verdict did the reconciled P4 scorecard reach?
Q7. In EXP-07's same-builder-model comparison on task 1, approximately how many times the single worker's cost proxy did orchestration cost?
Q8. What identical import-preview UI defect did both reviewers find in EXP-10's first builds?
Q9. Why did the Product Owner choose the Node command-line flag rather than NODE_OPTIONS for network follow-up B?
Q10. What observation was predeclared sufficient to mark network follow-up B effective at its pending 24-hour re-count?
