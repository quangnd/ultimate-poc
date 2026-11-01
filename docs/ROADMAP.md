# Roadmap and Phase Gates

Estimates are *effort targets*, not calendar commitments. Work sequentially through gates; do not begin all features simultaneously.

| Phase | Scope | Target effort | Exit gate |
|---|---|---:|---|
| P0 | Environment, Ultimate version, supported features, baseline task, instrumentation | 2-3 h | Setup reproducible; baseline documented |
| P1 | Data model, fixture, dependency validation, scheduler, readiness tests | 4-6 h | Domain AC tests green |
| P2 | Local web UI, edit workflow, persistence, E2E | 4-6 h | US-01..08 verified |
| P3 | Ultimate native feature trials: conversations, branches, durability, agents, plans/tasks, memory, custom surface | 4-6 h | Each capability has evidence or NOT AVAILABLE |
| P4 | Controlled A/B tasks, fault injection, quality review and final decision | 3-5 h | Scorecard and go/no-go complete |

Target approximately 17-26 h. Reduce scope, not evidence quality, if time constrained.

## P0 gate
Record Mac and tool versions, model/provider, extension settings, cost availability, permissions. Confirm Ultimate functionality from UI and documentation. Execute one baseline coding task in plain Pi and one in Ultimate using equal acceptance criteria and equivalent model where possible.

## P1 gate
Tests: missing predecessors, cycle rejection, cross-stream chain, deterministic forecast, readiness false and true. Reviewer confirms no invented assumptions.

## P2 gate
Browser workflow completed twice, no data loss after app restart; synthetic import/export pass; UI communicates assumptions.

## P3 gate
Run EXP-01..06 defined in docs/EVALUATION.md with evidence. Features absent in this version receive NOT AVAILABLE and replacement plan, not retrofitted implementation.

## P4 gate
Compare at least 3 matched tasks in both environments, record effort, interventions, quality, cost proxies, recovery and regression rate; conclude adopt / selectively reuse / defer.

## Execution ownership and autonomy
Human approves phase objectives and reviews gate evidence. Coordinator runs all within-phase execution, including issue planning, task assignment, implementation, tests, review, routine fixes and progress updates. Reviewer and QA should be independent of the implementation where the environment supports it. No repeated human approvals for ordinary within-phase work. At a gate, coordinator must provide a concise summary and explicit next-phase recommendation; wait for phase approval. This is a supervised agent workflow, not a guarantee of background or unattended execution.
