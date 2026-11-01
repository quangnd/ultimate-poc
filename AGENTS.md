# Agent Operating Contract

Read in order: README.md, docs/PRD.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, state/PROJECT_STATUS.md, then the relevant task specification. Never assume a feature exists merely because Ultimate advertises it: verify installed version and record evidence in docs/CAPABILITY_MATRIX.md.

## Mission
Build Release Readiness Lab, a small deterministic release dependency tracker, **using Ultimate itself**, and evaluate Ultimate as the development/orchestration environment, not as the product being built.

## Source of truth
- GitHub Issues: planned tasks, status, acceptance criteria and ownership.
- Git + PR: code, review, final changes and approval.
- docs/: stable requirements, architecture, decisions and protocols.
- state/PROJECT_STATUS.md: short human-readable checkpoint (not a competing task database).
- experiments/: raw anonymized, non-secret observations and scorecards.
- Ultimate conversation/task state: runtime context only; recoverable convenience, not the sole record.
- No silent completion claim: mark done only with evidence and acceptance criteria.

## Workflow
1. Read status, choose one small issue and write a short plan.
2. Check version/capability, dependencies and expected evidence.
3. Implement in an isolated branch, with test-first where practical.
4. Run tests and record results; do not fabricate performance metrics.
5. Have a separate reviewer assess tests, scope and security (a subagent if supported).
6. Update the issue/PR and state checkpoint with exact commit, result, blockers and next action.
7. Stop at phase gate for human decision.

## Delegation
Coordinator owns priorities and integration. Builder may edit scoped files. QA independently writes/runs tests. Reviewer reviews read-only by default. Researcher checks documentation and version support. Delegates must return: objective, changed files, evidence, unresolved risks and links. No parallel writes to shared state or same files; coordinator serializes merges.

## Safety and scope
Public repo: only synthetic release data. Never commit secrets, tokens, company tickets, logs or customer data. No destructive commands, production deployments, credential changes, new paid services, or dependency upgrades without human approval. Self-modifying tools/skills/extensions require a proposed diff, isolated test, rollback instructions and explicit approval before adoption. Stop if permission scope is unclear.

## Quality bar
Functional correctness precedes agent cleverness. Keep changes minimal. Every issue has observable AC and a reproducible verification. Document unsupported features as NOT AVAILABLE, not FAIL. Distinguish infrastructure errors from agent errors. Use consistent experiment IDs.
