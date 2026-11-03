# Follow-up C: restart-orphaned E2E processes (2026-11-03)

Approved by the PO on 2026-11-03 (P4 gate, follow-up C). Lightweight flow: coordinator (@ultimate #52), cross-family reviewer (#18928, GPT-6.1 Sol), PO review, CI.

## Defect (evidence)
- experiments/P4/FAULT_INJECTION.md attempt 2: a host restart during the lander's E2E check left `npm run dev --port 5273` (re-parented to pid 1) and its child `vite` holding 127.0.0.1:5273. The resumed check failed twice ("already used") and the landing was refused until a manual kill and resubmit. EXP-02 showed the same class once before: 2 of 2 restarts with an E2E in flight.
- Root cause: Ultimate's restart does not stop the process groups of running checks or interrupted tool calls.

## Changes
1. **Upstream report:** https://github.com/HazAT/ultimate/issues/68 (reproduction, timeline, expected behaviour, possible fix: per-check process groups killed on resume).
2. **Local skill:** one bullet in `.ultimate/skills/rrl-e2e/SKILL.md` (PR #65, merge `ee888c7`): find the port holder, walk up the process chain, and stop it only when command, port, working directory (lander checkout or worktree) and orphan status (the `npm run dev` parent's parent is 1) all match. If anything is ambiguous, stop nothing, report and ask the user.

## Review history (PR #65)
| Round | Reviewer | Verdict | Finding |
|---|---|---|---|
| 1 | #18928 (GPT-6.1 Sol) | REQUEST CHANGES | no rule to tell an orphan from a live run; `lsof` contradicted the bullet above |
| 2 | #18928 | REQUEST CHANGES | its own round-1 rule (holder's ppid = 1) would have missed the recorded orphan: `vite` has an `npm` parent; the `npm` process has ppid 1 |
| PO | Quang | REQUEST CHANGES | ppid 1 alone is not proof: also verify command, port and cwd; remove the literal kill example; if ambiguous, ask |
| 3 | #18928 | APPROVE at d8f8d0e | the recorded case passes all four checks; a live run's process cannot be stopped by following the text |
| PO | Quang | APPROVE at d8f8d0e | the scope is limited to the skill |

CI `test`: SUCCESS on d8f8d0e.

## Outcome
- **Upstream report:** DONE. The fix is upstream's; not verified here.
- **Local recovery note:** UNVERIFIED as behaviour. No restart with an E2E in flight has happened since. The rule is checked against the recorded case only.
- **Lesson:** a reviewer's own suggested fix was wrong in round 1, and the next round caught it against recorded evidence. The PO's safety review added the ownership checks the model reviewer had not asked for.
