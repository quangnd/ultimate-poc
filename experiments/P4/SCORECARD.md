# P4 final scorecard (issue #49)

This file scores Ultimate as the development and orchestration environment of this POC, not the Release Readiness Lab app. It follows the "Scoring" and "Evidence standard" sections of `docs/EVALUATION.md`.

Written 2026-11-02 by coordinator #15503. Evidence cutoff: commit `e0f7c1f`, which adds `experiments/P4/FAULT_INJECTION.md`.

## How it was scored

Two scorers, blind to each other:
- **Scorer A:** coordinator #15503, `claude-code/claude-opus-5-5`.
  - It ran the P4 fault injection, so it is not independent of the system under test.
  - Its scores were written before scorer B's answer arrived: `~/p4-fault-15503/opus-scores.md` (outside the repo), 17:28:47Z, sha-256 `8ec4eda1…a0ef0a`.
- **Scorer B:** reviewer #16007, `openai-codex/gpt-6.1-sol`.
  - Read-only. It read only repo files at `e0f7c1f`, was told not to open this file, and was given no memory, conversation history or other agents' answers.
  - Its answer arrived after A's file was written.
  - Brief: the 7 dimensions and weights, the decision gate, and the anchors 0 absent/broken, 1 major failures, 2 works with significant friction, 3 adequate with notable limits, 4 works well with minor limits, 5 excellent.

N/A stays N/A, and coverage is the sum of the weights of the scored dimensions. Neither scorer used N/A.

## Scores

| Dimension | Weight | A (Opus) | B (GPT) | Reconciled |
|---|---|---|---|---|
| Developer UX | 15% | 3.0 | 3.0 | **3.0** |
| Persistence/recovery | 20% | 4.0 | 3.5 | **4.0** |
| Orchestration | 15% | 3.5 | 3.5 | **3.5** |
| Context retrieval | 15% | 2.5 | 3.0 | **2.5** |
| Self-improvement | 10% | 3.0 | 3.5 | **3.5** |
| Extensibility | 10% | 4.0 | 4.0 | **4.0** |
| Reliability/quality | 15% | 3.5 | 3.0 | **3.0** |
| **Weighted /5** | | **3.375** | **3.325** | **3.35** |
| Coverage | | 100% | 100% | 100% |
| Gate | | selectively reuse | selectively reuse | **selectively reuse** |

**Agreement:**
- Exact on 3 of 7 dimensions, and within 0.5 on 7 of 7.
- The weighted scores differ by 0.05.
- Both reach the same gate outcome, and neither found a severe safety or data-loss defect in Ultimate.
- Each of the four disagreements is half a point, two in each direction. Agreement is not attributable to one scorer anchoring the other.

## Evidence and reconciliation per dimension

**Developer UX: 3.0 (agreed).**
- **Works:**
  - The web UI, branches, cards and the plan ledger made the owner, the task and the evidence visible (EXP-04, PASS).
- **Friction:**
  - Trust needed the setup card. A chat statement did not count, so it took two prompts (`experiments/P1/LOG.md` "Lander").
  - No per-run model override for subagents (NOT AVAILABLE, EXP-00).
  - GitHub shows no per-task owner (EXP-04).
  - 14 of 29 provider incidents needed a deliberate resume, 5 of them by the human for 429s (FAULT_INJECTION B).
  - On small tasks plain Pi was about 2.2× faster (EXP-08, model-confounded).

**Persistence/recovery: 4.0 (A 4.0, B 3.5).**
- **Works:**
  - EXP-02: a host restart mid-worker resumed in ~28 s, with byte-identical files and no duplicate commit.
  - EXP-04: the plan survived a restart.
  - P4: the lander resumed an interrupted submission 4.8 s after the new core started and reused the three memoized checks.
  - The same effect accounting holds across 3 restarts and 29 provider incidents:
    - nothing lost and nothing duplicated (no repeated PR, commit, landing or push);
    - 29 of 29 incidents recovered (FAULT_INJECTION A and B).
- **Limits:**
  - 2 of 2 restarts with an E2E in flight left an orphaned Vite server. In P4 it blocked the landing until a manual kill and resubmit.
  - Recovery often needs an input from an agent or the human.
- **Reconciled at A's 4.0.** The dimension's core question, no lost committed edit and no duplicate write (EVALUATION.md EXP-02), was met every time it was observed, including during integration.
  - The orphan failed closed. It is a process-cleanup defect, scored under reliability.
  - The manual resumes are counted under UX and reliability rather than penalised twice.
  - B's concern is real and stays recorded as the top open defect (decision c1).

**Orchestration: 3.5 (agreed).**
- **Works:**
  - EXP-03 PASS: builder, blind QA and reviewer had separate trails and no conflicting writes. Blind QA found gaps the reviewer missed.
  - Independent reviewers found all P1-severity P2 defects; none reached main (`experiments/P2/LOG.md`). In P1 they found both real code defects (D1, D2) that builder and QA missed.
  - EXP-08 task 3: the reviewer caught a medium defect that the hidden suite and blind QA both missed.
- **Costs:**
  - EXP-07 (same model): orchestration cost 3.6× the cost proxy and 2.9× the wall time of a single worker, with no quality gain on task 1.
  - In P2 the coordinator used 79% of tokens (`experiments/P3/TOKEN_ANALYSIS.md`).
  - Fixed E2E ports collided across worktrees (F8).
  - A QA independence setup error occurred in P2.

**Context retrieval: 2.5 (A 2.5, B 3.0).**
- EXP-09 (blind): memory alone answered 5 of 10, a FAIL against the 90% bar. All misses were true gaps; there was no hallucination.
- Memory plus repo docs answered 10 of 10, and the docs supplied 9 of those answers.
- Workers get no memory index and never called `memory` (EXP-06).
- `ultimate.search` and `ultimate.entries` reliably reproduced every metric and the failure re-count (FAILURES.md, FAULT_INJECTION B). This is retrieval of runtime history, and it works well.
- **Reconciled at A's 2.5.** The 10/10 comes from the repo's docs, which are the POC's own discipline, not an Ultimate feature. The Ultimate feature under test, project memory, failed its own pass condition. The runtime-history search keeps it from going lower.

**Self-improvement: 3.5 (A 3.0, B 3.5).**
- **Works:**
  - 13 Dream proposals were PO-approved, and 6 were VALIDATED (`experiments/P3/GATE_SUMMARY.md`, `DREAM_VALIDATION.md`). Examples:
    - the lean coordinator overlay halved tokens (2.64M→1.30M, n=1, confounded);
    - port isolation fixed F8;
    - the portable-shell rule cut `rg`/`timeout` failures from 44/13 to 1/2.
  - No unapproved self-modification occurred (EXP-06).
- **Limits:**
  - EXP-06 showed no transfer of a memory rule to a worker (PARTIAL).
- **Reconciled at B's 3.5.** The validated skill and overlay changes are measured behaviour changes. A had weighted the EXP-06 non-transfer too heavily against them.

**Extensibility: 4.0 (agreed).**
- **Works:**
  - EXP-05 PASS: a read-only project panel built against documented APIs, tested in an isolated instance, correct after reload, and reviewer-approved.
  - Project skills, agents and overlays (`blind-qa`, the coordinator overlay, `rrl-e2e`) were added and used in daily work.
- **Limits:**
  - No documented API to read GitHub issues (NOT AVAILABLE).
  - No type-check for project extensions.
  - The panel is not adopted.

**Reliability/quality: 3.0 (A 3.5, B 3.0).**
- **Works:**
  - No known defect reached main in P1–P4.
  - EXP-08: every arm passed 34/34 hidden tests first time, with zero interventions.
  - The lander refused a deliberately failing check (P1 proof) and the restart-orphaned run (P4).
- **Limits:**
  - 36 failed model calls: 28 relay `AggregateError`, 5 × 429, and 3 others.
  - 15.2 h of 429 waits.
  - The orphan defect.
  - Quality was equal to plain Pi, not better (EXP-08).
- **Reconciled at B's 3.0.** The failure rate and the manual work around it are material to the operator, even though every incident failed safely.

## Decision gate

Reconciled 3.35/5 with 100% coverage, and no severe safety or data-loss defect observed. That falls in the 3.0–3.99 band: **selectively reuse**.

The thresholds are provisional (EVALUATION.md). The score sits mid-band, so a ±0.5 change on any single dimension does not move the outcome.

## What to reuse, and what not

**Reuse:**
- **An independent reviewer on a different model family.** It found every P1-severity P2 defect, both P1 code defects and the EXP-08 task-3 defect. It is cheap: $0.03–0.16 per round in P2.
- **Blind QA from acceptance criteria (the `blind-qa` skill) for risky or stateful changes.** EXP-03: it found gaps the reviewer missed.
  - Not for small, well-specified tasks: it was 67–74% of the tokens in EXP-08 and found nothing there.
- **The lander with real checks**, which refuses failing work (P1 proof) and resumes after a restart (P4).
- **Durable execution and worktree isolation.** No lost or duplicated effect in any observed failure.
- **Project skills and overlays, `ultimate.search`/`entries`, and `pi.usage` for audit and metrics.**
- **Dream-style proposals with PO approval and validation.**

**Do not reuse as is:**
- **Full coordinator → builder → QA → reviewer orchestration on small tasks.** EXP-07: 3.6× the cost and 2.9× the time of a single worker, with no gain. Use a single worker plus a reviewer instead.
- **Long-lived coordinators.** The P2 coordinator took 79% of tokens, almost all cache reads. One issue per branch fixed it (EXP-03, #41).
- **Project memory as the only context source.** It answered 5 of 10 without docs.
- **Unattended 429 recovery.** Auto-Play is off by default, and the human waited 15.2 h.

## Main confounds

- **Model mismatch in EXP-08.** Pi ran Opus 5.5 medium; Ultimate's workers ran Sonnet 5.5 xhigh and its reviewer GPT-6.1. Only EXP-07 is same-model, and that is n = 1.
- **Small tasks.** EXP-08 build work took 1–3 min, against a target of 5–20 min. Orchestration overhead dominates at that size and may pay off, or not, on larger or vaguer tasks.
- **n.** Most experiments ran once: EXP-02, EXP-06, EXP-07, EXP-09 per arm, the Dream validations, and one in-window restart.
- **Self-grading.** Ultimate agents designed, ran and recorded almost every experiment, and scorer A ran the fault injection.
  - Scorer B is a different model family with repo-only access. It still reads records Ultimate agents wrote, so it can check consistency but cannot independently reproduce them.
  - The PO's own review is the remaining check.
- **List-price cost proxies.** All USD figures are list prices on subscription providers (Claude Code, Copilot, Codex), not invoices. Token totals are dominated by cache reads.
- **One machine and network.** The relay failures are specific to this Mac's IPv6 setup (FAILURES.md root cause). They lower the reliability score, but they may not generalise.

## Open decisions for the PO (gate package inputs)

**(a) EXP-09 memory-gap fix.**
- Evidence: memory-only recall 5/10, all 5 misses true gaps (`experiments/EXP-09/RUN-20261102-01.md`).
- The proposal: at each gate, write one memory per accepted ADR change, gate criterion and experiment finding, then re-run the same 10 questions.
- **Pick: approve.**
  - It is cheap: about 10 memories and one re-run of about $1 list price.
  - It tests whether the 2.5 on context retrieval is a content gap or a design limit.
  - Rollback: delete the added memories.

**(b) Relay remediation `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000` on the host.**
- Evidence:
  - 28 of 36 failed calls are this one root cause;
  - the 2000 ms probe passed 3 of 3, against 14 of 15 at the 500 ms default (`experiments/P4/FAILURES.md`);
  - each incident cost about 1 min, and most needed a resume.
- Validation: re-run the 15-connect probe under the setting, then count new `relay failure AggregateError` entries over a comparable period against the 28 here.
- Rollback: remove the variable and restart the host.
- **Pick: approve.** It is a machine-level setting with no code change and an exact rollback. It would remove the largest source of manual resumes.

**(c) Raised by this scorecard:**
1. **Orphaned check processes after a host restart.** 2 of 2 restarts with an E2E in flight left Vite running; in P4 this blocked a landing.
   - **Pick:** report it upstream to Ultimate with FAULT_INJECTION A as the reproduction.
   - Locally, add one line to the `rrl-e2e` skill: after a restart, check port 5273 and free it before resubmitting.
   - Do not change Playwright's `reuseExistingServer`, which would hide real collisions.
2. **Auto-Play for 429 pauses.** The human waited 15.2 h over 4 windows.
   - **Pick:** enable `autoPlay` at 30 min for the next phase, if unattended continuation within an approved phase is acceptable to the PO. Otherwise keep it off and accept the waits.
3. **Default delivery flow.** **Pick:** for small, well-specified issues, use a single worker plus a cross-family reviewer. Keep blind QA for stateful or concurrency work. Evidence: EXP-07, EXP-03, EXP-08.
4. **Scope of further evaluation.** **Pick:** if the PO wants to raise confidence beyond "selectively reuse", run one larger task (≥20 min of build work) with model-matched arms. This is the main confound left.

## Record inconsistencies found by scorer B

- `experiments/P2/LOG.md`: the severities sum to 16 for 15 defects. Not corrected here; it does not change any score.
- `experiments/P4/FAILURES.md` F22 says the automatic retry failed. The entries show that the watchdog retry was followed by success one minute later (FAULT_INJECTION B). The row is kept as written and this note records the difference.
- `state/PROJECT_STATUS.md` cited F1–F24 and three 429 pauses. This PR updates it to F1–F29 and four windows. F29 is a relay stop of this coordinator after the cutoff, and it is not in the totals.
