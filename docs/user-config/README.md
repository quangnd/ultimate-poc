# User-level Ultimate config (M3 mirror)

Versioned copy of the files that go into `~/.ultimate/` on the operator's machine. The repo is the reviewed source and the rollback reference; `~/.ultimate/` is the working copy. Approved by the PO on 2026-11-04 (M3, selective response-style migration).

## Files

| Mirror file | Target | Purpose |
|---|---|---|
| `AGENTS.md` | `~/.ultimate/AGENTS.md` | User instructions: response style (selected from `~/.pi/agent/AGENTS.md`) and 5 workflow lines |
| `skills/blind-qa/SKILL.md` | `~/.ultimate/skills/blind-qa/SKILL.md` | Generic blind QA (OBSERVED) |
| `skills/evidence-closeout/SKILL.md` | `~/.ultimate/skills/evidence-closeout/SKILL.md` | Generic issue closeout (VALIDATED n=1) |
| `skills/gate-memories/SKILL.md` | `~/.ultimate/skills/gate-memories/SKILL.md` | Gate memory coverage rule (PARTIAL) |

Nothing else under `~/.ultimate/` changes: `settings.json`, `model-families.json`, `agents/worker.md`, `trust.json` and the state files stay as they are. `~/.pi/agent/AGENTS.md` and the Ultimate clone are not touched.

## How the scopes interact

- **Instructions.** Ultimate loads `~/.ultimate/AGENTS.md` as the user context file, then the project's `AGENTS.md` (`loadProjectContextFiles({ cwd, agentDir: ~/.ultimate })`, used by `extensions/prompt/server.ts`). Both apply.
- **Skills.** Override order is clone -> user -> project (`server/skills.ts`); a later scope wins by name. In this project the project copies of `blind-qa` and `gate-memories` override the user copies, as intended. `evidence-closeout` has its own name, and its description defers to a project closeout skill (here `issue-closeout`). In other projects all three user skills apply.
- **Deliberate overlap.** Two workflow lines (no `rg` or GNU `timeout`; `git push`, `gh pr create`, `gh pr merge` as separate bounded steps) also appear in this project's `AGENTS.md` "Shell and integration". They are kept at user level, worded generically, because other projects need them too. In this project they say the same thing twice; they do not conflict.

## Selection from `~/.pi/agent/AGENTS.md`

Kept (condensed): direct answer first; plain language; no per-option matrix; one framing; the necessary-detail rule; usable draft when inputs are missing; one strong example; depth only when warranted; no em/en dashes or spaced hyphens; no preambles or slop intros; "->" for arrows.

Dropped:
- **"About me"** (job title, employer, industry): not needed for tone; the style rules carry it.
- **"Be direct and opinionated, call out trade-offs"**: Ultimate's system prompt already says "Be concise and direct. Surface the risks and tradeoffs that matter, and recommend one option" (duplicate).
- **"Avoid AI-style phrasing"**: vague; covered by the concrete no-preamble and no-slop-intro rules.
- **"Lead with the recommendation"** and **"be as short as the answer allows"**: duplicates of the same system-prompt line ("recommend one option", "Be concise and direct"). Only the parts it lacks stay: no per-option matrix, and never so short that a follow-up is needed.

Reworded to avoid conflicts:
- **Missing inputs.** The Pi rule says the first line must be the artifact. It is limited to texts and drafts, because Ultimate's prompt tells agents to investigate and wait for a go before changing code when a request is a question.
- **Small tasks.** The planned line "one coding agent plus a cross-family reviewer for small tasks" was dropped: Ultimate routes a small, clear change to a coordinator that does it itself "with no epic, workers or review" (`agents/ultimate.md`), so a user-level mandate would conflict. Where a project wants that review (this one: AGENTS.md "Workflow" step 5, coordinator overlay "Default flow"), the project's own instructions say so. Only the blind QA scope rule remains.
- **Formats.** Ultimate's coordinator and @ultimate instructions require fixed formats (assessments, a `Decisions:` block, question cards). A last style line says those formats take precedence, so the "no per-option breakdown" rule cannot fight them.

## Backup, copy, rollback

Backup before copying (date as of M3):

```bash
tar czf ~/ultimate-user-backup-20261104.tgz -C ~ --exclude=.ultimate/projects .ultimate
( cd ~ && find .ultimate -path .ultimate/projects -prune -o -type f -print0 | xargs -0 shasum -a 256 ) > ~/ultimate-user-backup-20261104.sha256
```

Copy from a checkout of the merged mirror:

```bash
mkdir -p ~/.ultimate/skills
cp docs/user-config/AGENTS.md ~/.ultimate/AGENTS.md
cp -R docs/user-config/skills/blind-qa docs/user-config/skills/evidence-closeout docs/user-config/skills/gate-memories ~/.ultimate/skills/
```

Rollback (no restart needed; instructions and skills reload on the next turn):

```bash
# neither ~/.ultimate/AGENTS.md nor ~/.ultimate/skills/ existed before M3 (check: tar tzf on the backup lists neither)
rm ~/.ultimate/AGENTS.md
rm -r ~/.ultimate/skills/blind-qa ~/.ultimate/skills/evidence-closeout ~/.ultimate/skills/gate-memories
rmdir ~/.ultimate/skills   # fails, harmlessly, if other skills were added since
```

To recover a single pre-existing file (for example the deleted stray `exp09-closeout.md`), extract only that member: `tar xzf ~/ultimate-user-backup-20261104.tgz -C ~ .ultimate/exp09-closeout.md`. Never extract the whole tarball over live state.

## Validation

```bash
# mirror matches the copies
for f in AGENTS.md skills/blind-qa/SKILL.md skills/evidence-closeout/SKILL.md skills/gate-memories/SKILL.md; do
  cmp docs/user-config/$f ~/.ultimate/$f && echo "ok $f"; done
# pre-existing files unchanged
( cd ~ && shasum -c ~/ultimate-user-backup-20261104.sha256 )
# no project specifics in the generic files
grep -rnE "Release Readiness|rrl|PROJECT_STATUS|tools/metrics|5273|5274|npm run test:e2e" docs/user-config/skills docs/user-config/AGENTS.md
```

Then check in codemode: skill loading with `diagnostics: []` (this project: project `blind-qa`/`gate-memories` win, user `evidence-closeout` loads; a project with no `.ultimate/skills`: all three user skills load), `ultimate.agents()` with `errors: []`, `replaced: []` and `worker` on the `coding` family, and that `~/.ultimate/AGENTS.md` appears among the context files. Results go to `VALIDATION.md`.
