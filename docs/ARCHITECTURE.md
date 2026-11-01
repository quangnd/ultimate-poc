# Architecture and Engineering Constraints

Proposed reference architecture; implementation choices need ADR before coding:
- Browser: simple dashboard, task editor, dependency visualization.
- Deterministic domain core: pure functions for graph validation, scheduling, readiness decisions. Unit-testable independent of UI.
- Persistence adapter: local JSON/SQLite with explicit schema version and atomic writes; select implementation at Phase 1.
- API: only if needed to keep persistence robust; loopback-only by default.
- Synthetic fixtures and test harness: fully committed and reproducible.
- Evaluator: experiment manifests and logs, kept separately from product code.

Do not make scheduling accuracy dependent on LLM responses. A 'critical blocker' is the blocker delaying the projected finish under the explicit simplistic capacity assumptions, not a mathematically proven critical path unless implemented.

## Agent boundaries
Ultimate runs the agent development process outside the app. Do not build an Ultimate clone or couple the product to its internal APIs. Optional Ultimate custom surfaces visualize evaluation metrics; absence of a supported API must be recorded and can be replaced by an ordinary web dashboard.

## Architecture decisions to record
ADR-001 stack/storage; ADR-002 scheduling semantics; ADR-003 optional Ultimate integration. Template in docs/decisions/README.md.
