# Ultimate Capability Verification Matrix

These are hypotheses to test, not verified guarantees. Update using installed version and evidence.

Version under test: Ultimate clone `d0a2e17` on Pi / Pi Durable 1.4.0 (docs/ENVIRONMENT.md). Doc references are
paths in the Ultimate clone (`~/Projects/ultimate`) at that commit. "P0 smoke" is a cheap, read-only observation
made on 2026-11-01 by the P0 branch (conversation #215); it never counts as an experiment PASS.

Status rule used in P0: **PARTIAL** = the feature was observed working in a P0 smoke check, but the experiment's pass
condition has not been run; **UNVERIFIED** = only documented ("documented in X"), not observed. No row is PASS
before its experiment runs with the evidence standard of docs/EVALUATION.md.

| Capability | Expected or hypothesized | Ultimate 1.4.0 feature | Doc reference (clone) | P0 smoke observation | Test | Status |
|---|---|---|---|---|---|---|
| Browser chat / model selection | Web workspace | Web UI on loopback; composer model picker + thinking level; model families per agent role | `extensions/models/README.md:1`; `README.md` | UI served at `127.0.0.1:4747`; `models.families` action lists 6 families; each conversation's `pi.agent` shows its model and thinking (ENVIRONMENT.md). Model picker UI not clicked. | P0 smoke; EXP-08 | PARTIAL |
| Conversation branching | Distinct work contexts | Lineage: forest of conversation trees; root tally; branches with own prompt and workspace | `extensions/lineage/README.md:1-18`; `AGENTS.md:7` ("How work is organised") | This work runs as branch #215 of root #1 (lineage branched at #1/211), in its own worktree and git branch `ultimate/4e9fbc-215`. | EXP-01 | PARTIAL |
| Durable execution | Resume interrupted work | Pi Durable tasks (every turn/tool call a durable task, resume from checkpoint); durable scheduler for automations; lander resumes after crash | `README.md:16`; `AGENTS.md:53` (layers and reloads); `extensions/automations/README.md:17`; `extensions/workspaces/README.md:192` (lander resumes after crash) | `ultimate.taskGraph()` lists live durable tasks (`board.delivery`, `pi.generation`, `ultimate.subagent-reporter`). No interruption or restart was attempted. Documented in README/AGENTS only for recovery. | EXP-02 | UNVERIFIED |
| Tasks, plans, documents | Organize work | `plan` extension: epics/tasks ledger with acceptance criteria and status; `tasks` panel; extension documents | `extensions/plan/README.md:1`; `extensions/tasks/README.md:1` | Epic E1 created in #215 with binary acceptance criteria via the `plan` tool; it appears in the coordinator's prompt. Cross-session resume not tested. | EXP-04 | PARTIAL |
| Subagents / delegation | Specialized concurrent work | `subagent` tool (start/message/wait/stop/land), agent definitions with model families, worktree isolation for workers | `extensions/subagents/README.md:1`; `AGENTS.md` | #215 started scout #413 (`openai-codex/gpt-6-luna` low) and worker #436 (`github-copilot/claude-sonnet-5.5` xhigh, own worktree) concurrently; models proven by `pi.agent` + trace rows. Sub-feature: a per-run model/thinking override in the `subagent` tool is NOT AVAILABLE (model comes only from the agent definition's family; root #52, EXP-00 worker trace #381). | EXP-03, EXP-07 | PARTIAL |
| Project context/memory | Reuse past decisions | Project memory on the root (`remember`/`memory` tools); memory brief for new branches; `recall`; dream consolidation | `extensions/lineage/README.md:79-103`; `extensions/dream/README.md:1-26` | Branch #215 started with root #1's memory index (8 memories) and read 5 in full with `memory {read}`. Dream automations A1/A2 exist; no dream observed. | EXP-01 | PARTIAL |
| Custom surfaces / extensions | Create status panel | Extensions with server/web facets: panels, status-line items, renderers, full surfaces; project-local in `.ultimate/extensions/`; live reload | `extensions/README.md:1-13`; `skills/write-extension/SKILL.md` | 47 built-in extensions enabled, 8 disabled (`ultimate.extensions()`); no project extension built. Documented only. | EXP-05 | UNVERIFIED |
| Self-modifying workflow | Propose safe improvements | Agents may edit `.ultimate/` agents/skills/extensions (hot reload), `self.restart` for core; second `instance` for isolated testing; dream proposes memory/tool changes | `AGENTS.md:53` (reload layers); `extensions/self/README.md:1-5`; `extensions/instance/README.md`; `extensions/dream/README.md` | Not exercised (forbidden in P0 without approval). Documented only. | EXP-06 | UNVERIFIED |
| Auditability | Track actions, outputs, cost | `debug` trace (service/action/tool/model calls with trace ids), `pi.usage` per model tokens + USD, durable event log, commit trailer `Ultimate-Conversation: <id>`, lander log | `extensions/debug/README.md:5-11`; `extensions/status-line/README.md:7`; `extensions/coding-tools/README.md` | `ultimate.trace({conversation})` returned model rows per provider/model; `pi.usage` returned tokens and USD per model for #52, #215, #413, #436; `tools/metrics/` extracts them (experiments/EXP-00/instrumentation-check.md). USD is a list-price proxy (subscriptions). | EXP-01..08 | PARTIAL |

## P3 results (2026-11-02, coordinator #52; the P0 rows above are kept as history)

| Capability | P3 status | Evidence | Limitation |
|---|---|---|---|
| Browser chat / model selection | PARTIAL | Used throughout; models proven per conversation (ENVIRONMENT.md, TOKEN_ANALYSIS.md) | No per-run subagent model override (NOT AVAILABLE, p0-findings); EXP-08 not run |
| Conversation branching | PARTIAL | Every issue ran as its own branch with its own worktree (P1–P3 logs) | EXP-01 proper pending the PO's questions |
| Durable execution | **PASS** | experiments/EXP-02: host restart mid-worker, resumed in ~28 s, byte-identical files, no duplicate commits | n=1; 16 failed calls / 3 rate-limit pauses recovered without repeated effects (FAILURES.md), 2 of the pauses needed a manual Play |
| Tasks, plans, documents | **PASS** | experiments/EXP-04: plan epic tracked #32 through a restart and agreed with GitHub | GitHub alone does not show per-unit ownership |
| Subagents / delegation | **PASS** | experiments/EXP-03 and DREAM_VALIDATION.md (#41): builder + blind QA + reviewer, separate trails, no conflicting writes | Fixed E2E ports collided across worktrees (F8) until Dream #2 |
| Project context/memory | PARTIAL | EXP-01 early probe 10/10 (self-authored); branches start from the memory index | Workers get no memory index and never called `memory` (EXP-06); EXP-01 proper pending |
| Custom surfaces / extensions | **PASS** (built, not adopted) | experiments/EXP-05: read-only panel, isolated instance, screenshot after reload, reviewer approved; PR #34 | No documented API to read GitHub issues (NOT AVAILABLE); no type-check for project extensions; adoption awaits the PO |
| Self-modifying workflow | PARTIAL | EXP-06 pass condition met (rule with scope/evidence, no unapproved change); Dream → 13 PO-approved changes, 6 VALIDATED (DREAM_VALIDATION.md, P3/GATE_SUMMARY.md) | EXP-06 showed no transfer of a memory rule to workers |
| Auditability | **PASS** | `ultimate.trace`, `pi.usage`, `ultimate.search` reproduced every metric and the failure re-count (FAILURES.md) | Trace keeps the newest 1000 rows / ~7 days; USD is a list-price proxy |

Allowed status: UNVERIFIED, PASS, PARTIAL, FAIL, NOT AVAILABLE. Record version, limitation and direct proof. Distinguish framework advertised behavior from POC implementation.

Limitations of the P0 smoke column: it was made by Ultimate agents observing Ultimate (self-assessment); the
independent reviewer checks the claims against the cited APIs, but each row still needs its EXP run.
