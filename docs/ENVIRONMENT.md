# Environment (P0)

Recorded 2026-11-01 (machine time zone UTC+07:00; times below in UTC) by the P0 coordinator branch (Ultimate conversation #215).
Every value below was observed with the command or API named next to it. No credentials are printed; home paths are
written as `~` or `<home>`.

## Machine and tools

| Item | Value | Observed with |
|---|---|---|
| OS | macOS 26.6 (build 25G72) | `sw_vers` |
| CPU / RAM | Apple M1, 8 cores / 16 GB (17179869184 bytes) | `sysctl -n machdep.cpu.brand_string hw.memsize`; `ultimate.system().machine` |
| Node | v26.7.0 | `node -v`; `ultimate.system().process.node` |
| npm | 12.2.1 | `npm -v` |
| git | 2.56.0 | `git --version` |
| gh | 2.89.0 (2026-03-26) | `gh --version` |
| GitHub auth | gh token invalid (HTTP 401) at P0 start; `git push`/`gh` re-verified working later on 2026-11-01 by root (#52) | root conversation #52 note |

## Ultimate and Pi

| Item | Value | Observed with |
|---|---|---|
| Ultimate clone | `~/Projects/ultimate`, branch `main`, commit `d0a2e17b` (2026-11-01 09:22 +0100), clean | `git rev-parse --short HEAD`, `git status`; `ultimate.system().code` → `{sha: d0a2e17b, dirty: false, coreStale: false}` |
| Running build | build id `7c76ad001493`, generation 1, started 2026-11-01T12:09Z, UI on `127.0.0.1:4747` (loopback) | `ultimate.system().build/process` |
| Pi packages in Ultimate | `@earendil-works/pi-coding-agent`, `pi-ai`, `pi-durable`, `pi-codemode`, `pi-mcp` all **1.4.0**; `pi-claude-code` 0.1.0 | `node_modules/@earendil-works/*/package.json` in the clone |
| Plain Pi CLI (baseline) | `pi` **1.4.0** at `~/.local/bin/pi` | `which pi`, `pi --version` |
| Ultimate persistence | SQLite under `<home>/.ultimate/projects/ultimate-poc-<hash>/state.sqlite` (WAL) | `ultimate.system().persistence` |
| Project config | none: no `.ultimate/` in this repo (`project.config: false`), project setup `undecided`, no project agent overrides | `ultimate.system().project`, `ultimate.agents().projectSetup` |

### Provider readiness (plain Pi credential store, shared with Ultimate)

`pi auth check --provider <p> --no-refresh` (status only; no credentials printed):

| Provider | Status |
|---|---|
| anthropic (OAuth subscription) | ready |
| github-copilot (subscription) | ready |
| openai-codex (subscription) | ready |
| claude-code | `not_ready` in plain Pi. Ultimate uses it through its own `claude-code` extension, which uses the external Claude Code CLI login (see "Actual models" below: it answers in Ultimate) |

Consequence for the A/B baseline: plain Pi cannot use `claude-code/*`, so the **intended** control (p0-decisions) was
both arms on `anthropic/claude-opus-5-5` medium. **Actual** in EXP-00: arm A (plain Pi) ran `anthropic/claude-opus-5-5`
medium, arm B (Ultimate worker) ran `github-copilot/claude-sonnet-5.5` xhigh, because the `subagent` tool has no
per-run model override (see "Not recorded / limits"). The EXP-00 comparison is therefore **confounded** by model
(experiments/EXP-00/SUMMARY.md).

## Extensions (Ultimate d0a2e17, built-in, none project-local)

Observed with `ultimate.extensions()`:

- **Enabled (47):** workspaces, prompt, activity, agent, automations, browser, claude-code, codemode, coding-tools,
  context, debug, documents, dream, fast, goal, info, instance, keep-warm, lineage, mcp, messages, models, notices,
  onboarding, pause, plan, questions, recall, review, secrets, self, setup, side-chat, sidebar, sketch, splash,
  status, status-line, subagents, system, tasks, theme, todos, update, voice, watchdog, conversations.
- **Disabled (8):** classify, cloud, health, parallel, phase, sounds, tailscale, voice-live.
- Built-in automations present: A1 "Dream before compaction" (@ultimate context ≥ 70 %), A2 "Dream after a pause"
  (≥ 50 % after 8 h idle).

## Agent definitions and model families

Observed with `ultimate.agents()` (all nine definitions `source: builtin`, no errors) and
`ultimate.action('models','families')` (`from: project`):

| Family | Model | Thinking | Built-in? |
|---|---|---|---|
| default | claude-code/claude-opus-5-5 | medium | yes |
| review | openai-codex/gpt-6.1-sol | medium | yes |
| fast | openai-codex/gpt-6.1-sol | (unset) | yes |
| tiny | openai-codex/gpt-6-luna | low | yes |
| design | claude-code/claude-opus-5-5 | (unset) | yes |
| coding | github-copilot/claude-sonnet-5.5 | xhigh | **no (user-defined)** |

| Agent | Family | Isolation |
|---|---|---|
| ultimate, coordinator | default | none |
| reviewer | review | none |
| worker | coding | worktree |
| designer | design | worktree |
| scout, watcher, sketch | tiny | none |
| dream-pass | fast | none |

Feature pin: conversation summaries (titles, abstracts) are pinned to `github-copilot/claude-sonnet-5.5`
("user settings: summaryModel"). That is why every conversation's usage includes a small Sonnet share.

## Intended vs actual models

"Actual" is proven per conversation from Ultimate's own records, not from configuration: `ultimate.doc('pi.agent', id)`
(model and thinking level the conversation runs with), `ultimate.trace({conversation: id})` rows of `kind: 'model'`
(the provider/model that answered each call) and `ultimate.doc('pi.usage', id)` (tokens and cost per model).
Snapshot taken 2026-11-01 ~13:05Z while conversations were still running; counts grow afterwards.

| Role | Intended | Actual (config) | Proof: conversation → pi.agent / trace model rows | Deviation |
|---|---|---|---|---|
| Coordinator / @ultimate | claude-code/claude-opus-5-5 medium | same | #52 @ultimate: pi.agent `claude-code/claude-opus-5-5`, `medium`; 25 trace model rows on that model. #215 coordinator: pi.agent same, `medium`; trace rows `claude-code/claude-opus-5-5` | none |
| Worker | High thinking | github-copilot/claude-sonnet-5.5 **xhigh** | #436 worker: pi.agent `github-copilot/claude-sonnet-5.5`, `xhigh`; 19 trace model rows on that model | thinking xhigh instead of high, kept by user decision (p0-decisions 2b) |
| Reviewer | High thinking | openai-codex/gpt-6.1-sol **medium** | #1106 reviewer of this branch: pi.agent `openai-codex/gpt-6.1-sol`, `medium`; 17 trace model rows (`caller: agent`) on that model; pi.usage 648,341 tokens on it (+3,191 Sonnet summary tokens) | thinking medium instead of high, kept by user decision |
| Scout / watcher | openai-codex/gpt-6-luna low | same | #413 scout: pi.agent `openai-codex/gpt-6-luna`, `low`; 7 trace model rows on that model (the scout also reported "Returned model: openai-codex/gpt-6-luna") | none (watcher not run in P0) |
| Summaries | (not specified) | github-copilot/claude-sonnet-5.5 | small Sonnet entries in pi.usage of #52, #215, #413 | pinned in user settings |

## Cost accounting

`pi.usage` reports tokens and USD per model per conversation. All providers in use (claude-code / Anthropic OAuth,
GitHub Copilot, OpenAI Codex) are **subscriptions**, so the USD figure is a **list-price proxy**, not money spent.
Experiments report tokens as the primary measure and USD only labelled as proxy. `tools/metrics/` extracts both.

## Not recorded / limits

- **Per-run model override for subagents: NOT AVAILABLE.** The `subagent` tool takes `agent`, `task`, `background`,
  `fork`, `isolate`, but no model or thinking parameter. The model is chosen only by the agent definition's family
  (observed by root #52; the worker in EXP-00 ran `github-copilot/claude-sonnet-5.5` xhigh, trace of #381). Changing it
  means changing the family or the definition, which is shared Ultimate configuration (approval gate).

- The trace store's retention was not characterised in P0 (see tools/metrics/README.md for what was observed).
- Exact plain-Pi behaviour on `claude-code` was not explored beyond `not_ready`.
