A read-only right-panel tab, "POC status", showing the evaluation's current phase, issues per phase, test counts, defects and the tokens/cost proxy from committed repo files.

- `server.ts` exports one action, `status` (no arguments). It reads `state/PROJECT_STATUS.md` (the `Current phase:` and
  `Updated:` lines), counts the `| D<n> |` rows of every `experiments/*/LOG.md` by their severity column, and returns
  `experiments/EXP-05/status.json` (issues, tests, tokens, each with its source). It never writes and makes no network
  or GitHub calls. Agents can call it with `ultimate.action('poc-status', 'status')`.
- `web.tsx` adds the panel (`panels`), a ⌘K command `Show POC status` (`poc-status.open`), and reads the action with
  `useAction`; the ↻ button reads the files again.
- `status.json` is maintained by hand with the logs; the panel shows its date.

Rollback: delete `.ultimate/extensions/poc-status/` (and optionally `experiments/EXP-05/status.json`). No other file,
setting or state depends on it.
