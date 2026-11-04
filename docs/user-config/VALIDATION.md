# M3 validation (2026-11-04)

The user-level files were copied into `~/.ultimate/` after the PO approved the copy, for the text as merged in PR #74 (head `4e910f2`, CI run 41822750336 green on that commit, merge `bc1cfe1`). Everything below was run on the operator's Mac after the copy, at about 11:41 UTC.

## Result

| Check | Result | Evidence |
|---|---|---|
| Approved text equals merged text | PASS | `cmp` of `docs/user-config/AGENTS.md` at `bc1cfe1` vs `4e910f2`: identical |
| Copies match the merged mirror | PASS | sha256 of each `~/.ultimate` copy equals `git show bc1cfe1:docs/user-config/<file>` (table below) |
| Only new paths created | PASS | before the copy `~/.ultimate/AGENTS.md` and `~/.ultimate/skills/` did not exist (`ls`: No such file or directory) |
| Pre-existing files unchanged | PASS, with one runtime file | `shasum -c`: 6 OK; `exp09-closeout.md` missing (deleted on purpose); `tailscale.json` changed (see note) |
| Skills, this project | PASS | project `blind-qa` and `gate-memories` override the user copies; user `evidence-closeout` loads; `diagnostics: []` |
| Skills, project without `.ultimate/skills` (`/tmp`) | PASS | all 3 user skills load; `diagnostics: []` |
| Agents | PASS | `ultimate.agents()`: `errors: []`, `replaced: []`, `projectSetup: trusted`; `worker` overlay `~/.ultimate/agents/worker.md` (`family: coding`) still applied |
| Instruction pickup | PASS | `loadProjectContextFiles({ cwd, agentDir: ~/.ultimate })` lists `~/.ultimate/AGENTS.md` first, then the project `AGENTS.md`; for `/tmp`, only the user file. The running host also showed it in the coordinator's prompt on its next turn |
| Duplicates and conflicts | PASS | only the 2 deliberate overlaps (below) |
| Rollback possible | PASS | `tar tzf` lists all 8 backed-up files, exit 0; rollback commands below, not executed |

Not touched: `~/.pi/agent/AGENTS.md`, the Ultimate clone, `settings.json`, `model-families.json`, `agents/worker.md`.

**Note on `tailscale.json`.** Its checksum changed 5 s after the copy (18:41:23 local time vs the copy at 18:41:18). Ultimate's tailscale extension rewrites this port registry at runtime (`extensions/tailscale/server.ts`, `registryPath`), and the file keeps the same structure (`{ ports }`). The M3 steps did not write it. It is runtime state, not user configuration.

## Copied files

| Target | sha256 |
|---|---|
| `~/.ultimate/AGENTS.md` | `2d20e488d3ddeec457334d06d2811c4e65472a3443361334aed2a5b5b0583212` |
| `~/.ultimate/skills/blind-qa/SKILL.md` | `768dbdba0630fed35bafbccad386ebd58a53c93f119110bfe1c3359006f50322` |
| `~/.ultimate/skills/evidence-closeout/SKILL.md` | `893197c05843018f62fb397e9ddd3cb55ef41e3c32143764be9d187e37d97eaf` |
| `~/.ultimate/skills/gate-memories/SKILL.md` | `be7b1ceb169ebbe83d5544cb32e84387e4a004c93b37b4af675701f4251e43fd` |

## Backup

- `~/ultimate-user-backup-20261104.tgz` (3146 bytes): `trust.json`, `onboarding.json`, `settings.json`, `exp09-closeout.md`, `model-families.json`, `agents/worker.md`, `tailscale.json`, `tailscale.json.lock.db`; `projects/` excluded.
- `~/ultimate-user-backup-20261104.sha256`: the same 8 files.

## Stray file `exp09-closeout.md`

Compared with the closing comment on #46 (`gh issue view 46 --json comments`): identical apart from one trailing newline. `experiments/EXP-09/RUN-20261102-01.md` is the run record it cites. Nothing was missing from the repo or GitHub, so no docs PR was needed. Deleted; the tarball keeps a copy.

## Skill loading (`server/skills.ts` `projectSkills`)

```text
/Users/mun/Projects/ultimate-poc:
  adopt-ultimate-setup, how-ultimate-works, integrate-ultimate, ui-preview-round, verify-ui, write-extension [clone]
  evidence-closeout [user]
  blind-qa [project] overrides ~/.ultimate/skills/blind-qa/SKILL.md
  gate-memories [project] overrides ~/.ultimate/skills/gate-memories/SKILL.md
  issue-closeout, rrl-e2e [project]
  diagnostics: []
/tmp:
  6 clone skills; blind-qa, evidence-closeout, gate-memories [user]
  diagnostics: []
```

## Overlap with this project's `AGENTS.md`

| User line | Project line | Verdict |
|---|---|---|
| No `rg`, no GNU `timeout`: `grep -rn`, `find`, the bash tool's timeout | "Shell and integration" line 1 | deliberate (README); same rule, the project line adds "keep compound commands short" |
| `git push`, `gh pr create`, `gh pr merge` as separate bounded steps; check state before retry | "Shell and integration" line 2 | deliberate (README); same rule, the project line adds the exact state commands |

The other lines have no counterpart in the project AGENTS.md. Blind QA scope, token/cost reporting and the host flag are user-level only. Workflow step 5 (separate reviewer) stays project-only; the user file has no review rule (dropped in review, README "Small tasks").

## Rollback (not executed)

```bash
rm ~/.ultimate/AGENTS.md
rm -r ~/.ultimate/skills/blind-qa ~/.ultimate/skills/evidence-closeout ~/.ultimate/skills/gate-memories
rmdir ~/.ultimate/skills
# a single pre-M3 file, e.g. the stray record:
tar xzf ~/ultimate-user-backup-20261104.tgz -C ~ .ultimate/exp09-closeout.md
```

No restart is needed; instructions and skills reload on the next turn.
