# P4 infrastructure failures

This log continues `experiments/P3/FAILURES.md` and `experiments/P3/GATE_SUMMARY.md` (F1–F16). These are infrastructure errors, not agent errors, and are left out of each issue's metrics.

| ID | Conversation(s) | Entry, time (UTC) | Error | Recovery | Effect |
|---|---|---|---|---|---|
| F17 | #12097 (CI, #45) and #12079 (EXP-09, #46), one shared outage | #12097 12150; #12079 12151 (2026-11-02) | Claude Code upstream error on each branch's first model call | manual resume message from #52 | none: no work had started |
| F18 | #12469 (EXP-09 arm A, #46) | 12542 (2026-11-02) | Claude Code upstream error on the branch's first model call | manual resume by #52 | none: no answer had been given |
| F19 | #12079 (EXP-09 closeout, #46) | 13341 and 13351 (2026-11-02, about 13:12 UTC) | Claude Code upstream error after a bash step (closeout PR #53 created); the automatic retry failed too | manual resume by #52; state checked first (PR #53 open, CI green) | none: no step repeated |
