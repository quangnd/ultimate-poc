# POC Knowledge Pack

What the POC learned that is worth carrying forward, where each lesson lives, and what was left out on purpose. Approved scope: PO (Quang), 2026-11-04 (M1). Evidence base: `docs/FINAL_REPORT.md`; rules for using these lessons are in `docs/OPERATING_PROFILE.md`.

Status tags as in the profile: VALIDATED, OBSERVED, PARTIAL, UNVERIFIED (applied, no recurrence to test it), PO DECISION.

**Scope** marks whether a lesson applies to any project (**generic**) or only to Release Readiness Lab (**project-specific**: its npm commands, E2E ports 5273/5274 and `WEB_PORT`/`API_PORT`, `state/PROJECT_STATUS.md`, `tools/metrics`).

**Homes**
- **Project skill / overlay**: `.ultimate/skills/*` or `.ultimate/agents/coordinator.md` in this repo (changed by M2, not by this PR).
- **Generic user skill (M3, deferred)**: a project-agnostic copy in `~/.ultimate/skills/`; not created until the PO approves M3.
- **AGENTS.md**: the project's operating contract.
- **Doc only**: recorded here or in the profile; nothing loads it into an agent.

## Lessons

| # | Lesson | Scope | Status | Evidence | Limitation | Home |
|---|---|---|---|---|---|---|
| 1 | Small, well-defined tasks: one coding agent + a cross-family reviewer + lander/CI; no full orchestration | generic | PO DECISION; OBSERVED | EXP-07 (3.6× cost, 2.9× time, same 12/12); EXP-10 (22/22 both arms, +7% cost) | n=1 each; tasks 1–9 min of build work; benefit on larger tasks untested | doc only (profile §1); project overlay (M2) |
| 2 | One issue per coordinator branch | generic | OBSERVED | P2 64.06M tokens for 5 issues vs 2.64M (EXP-03) and 1.30M (#41) for one | Not A/B-tested; different issue sizes | project overlay; generic user skill (M3, deferred) |
| 3 | Review and QA findings go back to the builder; wait by ending the turn or `notify`, never codemode polling; fresh coordinator after >1 h; compact only as a fallback | generic | OBSERVED | EXP-03 (~15 extra calls from polling); TOKEN_ANALYSIS.md | No controlled test of each rule | project overlay |
| 4 | Ask workers to report each check's exit code | generic | OBSERVED (proposed fix, not tested) | EXP-12: extra calls traced to "judge recorded exit codes only" | n=2×1, within model variance | project overlay (M2) |
| 5 | An independent cross-family reviewer on every change | generic | OBSERVED (consistent across P1–P4) | Caught every real code defect builders and QA missed (P1 D1/D2, EXP-08 task 3, EXP-10) | Reviewer reads records/code; cannot prove absence of defects | doc only (profile §2) |
| 6 | Blind QA from the base SHA, briefed from acceptance criteria only, with mutation checks; only for stateful, concurrency or data-integrity work | generic | OBSERVED | EXP-03 found 2 gaps the reviewer missed; EXP-08 67–74% of tokens, found nothing | n=1 positive | project skill `blind-qa`; generic user skill (M3, deferred) |
| 7 | Put rules workers need in briefs, skills or AGENTS.md, not memory | generic | OBSERVED (n=1) | EXP-06: workers get no memory index; a memory rule did not transfer, skill changes did | n=1 each | doc only; AGENTS.md "Delegation" |
| 8 | Docs are the source of truth, memory the index | generic | OBSERVED | EXP-09: memory-only 5/10, memory + docs 10/10 | n=1 per arm | doc only (profile §5) |
| 9 | Gate memories by a coverage rule (ADR changes, gate criteria and outcomes, key findings with n and confound, provenance) | generic | **PARTIAL** | EXP-11: known gaps 10/10; unseen questions 8/10 + 2 partial (H2 FAIL against 9/10) | Question writer and memory writer read the same docs; generalisation unproven | project skill `gate-memories` (M2); generic user skill (M3, deferred) |
| 10 | Evidence closeout: cutoff, scope and n stated; tokens and cost reported separately; checkpoint consistent | generic rule, **project-specific** procedure (`state/PROJECT_STATUS.md`, `tools/metrics`) | VALIDATED (n=1, Dream #9) | GATE_SUMMARY.md: #41 closed with the skill, PROJECT_STATUS consistent afterwards; EXP-12 cost split (cache writes 82–84% of cost) | One closeout; general effectiveness untested | project skill `issue-closeout`; generic user skill (M3, deferred) |
| 11 | Per-worktree E2E ports via `WEB_PORT`/`API_PORT` | **project-specific** (ports 5273/5274 default) | VALIDATED (6/6) | DREAM_VALIDATION.md (Dream #2); F8 collision before | One machine | project skill `rrl-e2e` |
| 12 | After a restart, free an E2E port only after the 4-way ownership check (command, port, cwd, orphan) | **project-specific** (Vite/npm commands, lander ports) | PO DECISION; UNVERIFIED as behaviour | FOLLOWUP_C.md; upstream HazAT/ultimate#68 | No recurrence since | project skill `rrl-e2e` |
| 13 | Lander runs real checks and refuses failing work; no lander push, merges via `gh pr merge`; landed checkpoints must reach GitHub | generic rule, **project-specific** check list | VALIDATED (P1 proof, n=1); OBSERVED (#64, #70) | p1-lander-proof; LANDER_STRATEGY.md | One refusal proof | AGENTS.md / `.ultimate/settings.json` (unchanged) |
| 14 | `git push`, `gh pr create`, `gh pr merge` as separate bounded steps; check state before retry | generic | UNVERIFIED (Dream #5, no recurrence) | AGENTS.md "Shell and integration" | No incident to test it | AGENTS.md (already present) |
| 15 | No `rg`, no GNU `timeout` on this Mac: use `grep -rn`/`find` and the tool's timeout | machine-specific | PARTIAL (Dream #1 re-count: 44/13 → 1/2 failures) | GATE_SUMMARY.md "#1 portable-shell re-count" | Reduced, not eliminated: 3 failures with the rule present; ~1 h window; this Mac only | AGENTS.md (already present) |
| 16 | Start the host with `--network-family-autoselection-attempt-timeout=2000` | machine-specific | VALIDATED (24 h, one machine) | NETWORK_FIX.md §7: 0/448 vs 25/1036 relay errors | Bursty baseline, network differs by day; `restart` tool does not apply it | doc only (profile §6); launch note in M3 (deferred) |
| 17 | Trust counts only after the setup card | generic | OBSERVED (P1, n=1) | `experiments/P1/LOG.md` "Lander" | No repeat case | doc only (profile §6) |
| 18 | Keep 429 recovery attended | generic | PO DECISION | 15.2 h of waits over 4 windows | Costs operator time | doc only (profile §6) |
| 19 | JS `Date` maps years 0000–0099 to the 1900s; use civil math or `setUTCFullYear` | generic | OBSERVED | EXP-06 rule `js-date-low-years` | Did not transfer to workers via memory (EXP-06) | doc only; candidate for a brief or AGENTS.md |
| 20 | Dream proposals are candidates; PO approves; validate before calling them improvements | generic | PO DECISION | 13 approved, 6 validated, 5 stand (#7 not reproduced in EXP-12) | One Dream run | doc only (profile §5) |

## Excluded

Left out on purpose; the records stay in `experiments/` as evidence.

**POC experiment procedures** (needed only to evaluate Ultimate, not to work with it):
- hidden test suites written before the arms (EXP-00, EXP-08, EXP-10, EXP-12);
- A/B arms and their matching rules (plain Pi vs Ultimate, overlay arm O vs L);
- hand-started previews for controlled runs (EXP-12 method 1a);
- `tools/metrics` as a reporting process (the closeout skill may still use it in this repo);
- the `poc-status` panel (EXP-05 PASS as an extensibility test, not adopted; retired by M2).

**Rules EXP-12 found no saving from** (n=2×1, H1 FAIL):
- "judge recorded exit codes only": the extra coordinator calls were traced to it; replaced by lesson 4;
- "run tests yourself at most 2 times per issue": the built-in coordinator already stayed within test limits unprompted.

**Not claimed:** the coordinator overlay (v1 or the M2 v2) saving tokens or cost. Dream #7's "halved tokens" (n=1, confounded by task size) was not reproduced under control in EXP-12; v2 is rule hygiene, unvalidated as a saving.

**Memory-only facts:** any fact that exists only as a memory and not in `docs/` or `experiments/` (EXP-09).

## Clone upgrade compatibility checklist

No upgrade is planned. The clone is `d0a2e17` (Pi / Pi Durable 1.4.0), 122 commits behind upstream on 2026-11-04, including the Pi Durable 1.5.0 changes. Before any upgrade:

**Before**
- Back up `~/.ultimate/projects/ultimate-poc-*/state.sqlite`; Pi Durable 1.5.0 may migrate storage.
- Record the current clone SHA for rollback.
- Upgrade with no branches open.

**Check after the upgrade**
- **Overlay and agent format:** project overlays (`addTools: []` + `family`) still parse. Upstream removed the `subagent: false` field and lets `subagent start` create agents on the fly; neither is used here. `ultimate.agents()` reports `errors: []` and `replaced: []`.
- **Skill scopes:** the clone → user → project override order and the trust gate are unchanged (`server/skills.ts`).
- **Settings keys:** `lander.checks`, `isolates.worktree.setup` and `instance.model` still work; re-test whether `instance.model` can now be set per worktree (NOT AVAILABLE in `d0a2e17`).
- **APIs the docs rely on:** `ultimate.trace`, `doc('pi.usage')`, `ultimate.search` / `entries`.
- **Network flag:** start with the flag, re-run `experiments/P4/net-probe.mjs`.
- **Lander proof:** a deliberately failing commit must be refused.
- **CI** green on `main`.
- **One small issue end to end** on the default path (a).
- **No `relay failure` errors** over the first 100 calls.

**Rollback:** check out the recorded SHA, restore the storage backup, restart with the network flag.
