# ADR-001: Application stack and local storage

- Date: 2026-11-01
- Status: Accepted (Product Owner, 2026-11-01, P0 gate)
- Deciders: Product Owner (approval), coordinator (proposal)
- Related: docs/PRD.md (US-01, US-07, US-08), docs/ARCHITECTURE.md, ADR-002

## Context

Release Readiness Lab is a test fixture for evaluating Ultimate, not a product. It must be small, deterministic,
reproducible from a fresh clone (US-01), keep edits across restarts (US-07) and be covered by unit, integration and
one browser E2E test (US-08). The PRD prefers "minimal TypeScript (Vite + React with a small Node service/SQLite only
if needed)" and says the agent must document trade-offs before adding frameworks. Every dependency added later is a
change that needs human approval (AGENTS.md "Safety and scope"), so this ADR also fixes the dependency list.

Environment (docs/ENVIRONMENT.md): macOS 26.6 on Apple M1, Node 26.7, npm 12.2.1. No package manager other than npm is
assumed.

## Decision

1. **Language and build:** TypeScript (strict), one npm package at the repo root, ES modules. Vite builds and serves
   the browser UI; React renders it.
2. **Pure domain core:** `src/domain/` holds plain TypeScript functions for model validation, dependency-graph
   validation (unknown predecessor, cycles), the scheduler and readiness (ADR-002). No I/O, no clock reads, no
   randomness, no React imports. The domain receives all inputs (including the project start date) as arguments.
3. **Persistence: a JSON document file with atomic write**, behind a small adapter (`src/server/store.ts`):
   - One file `data/release.json` (git-ignored), holding `{ schemaVersion: 1, release, workstreams, tasks }`.
   - Write = serialize, write to `release.json.tmp` in the same directory, `fsync`, `rename` over the target
     (POSIX-atomic on APFS). A crash leaves either the old or the new file, never a partial one.
   - Every load validates with the same domain validator as import (US-07 round trip); an invalid file is refused with a
     visible error, never silently repaired.
   - Single writer: requests are serialized in-process; no concurrent writers are supported (one local operator).
4. **Loopback API: yes, a minimal one.** A browser cannot write a file on disk by itself, and `localStorage` would
   make the "restart preserves data" test depend on one browser profile and make export/import the only way to inspect
   data. A tiny Node HTTP server (`node:http`, no framework) bound to `127.0.0.1` only exposes:
   `GET /api/release`, `PUT /api/release` (full validated document), `POST /api/import`, `GET /api/export`.
   In development Vite proxies `/api` to it; in the E2E test one npm script starts both.
5. **Tests:** Vitest for unit (domain) and integration (store + HTTP handlers, run against a temp directory);
   Playwright (Chromium only) for the single US-08 browser E2E: edit → reload → data persisted.
6. **Explicit dependency list (approval of this ADR approves exactly these, latest stable at install time,
   pinned in `package-lock.json`):**

   | Package | Kind | Why |
   |---|---|---|
   | `typescript` | dev | type checking (`tsc --noEmit`) |
   | `vite` | dev | dev server and build |
   | `@vitejs/plugin-react` | dev | JSX/React refresh for Vite |
   | `react`, `react-dom` | runtime | UI |
   | `@types/react`, `@types/react-dom`, `@types/node` | dev | types |
   | `vitest` | dev | unit + integration tests |
   | `@playwright/test` | dev | E2E (plus `npx playwright install chromium`, a browser download) |
   | `tsx` | dev | run the TypeScript loopback server without a separate build step |

   Not included: any router, state library, CSS framework, ORM, date library (dates are `YYYY-MM-DD` strings with
   UTC arithmetic in the domain), validation library (hand-written validators, they are the code under test), or
   server framework. Adding any of these requires a new ADR or an amendment approved by the Product Owner.

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **JSON file + atomic rename** (chosen) | zero native deps; human-readable; diffable; same format as import/export; trivial backup | whole-file rewrite on every save (fine at ~20–200 tasks); no concurrent writers; no queries | Chosen: data is tiny and single-user |
| SQLite (`better-sqlite3` or `node:sqlite`) | transactional; durable; scales; concurrent readers | `better-sqlite3` is a native build (node-gyp on M1, ties to Node ABI); `node:sqlite` availability/stability in Node 26 not verified here; schema + mapping layer adds code; export still needs JSON | Rejected for v1; revisit if data or concurrency grows |
| Browser `localStorage` / IndexedDB, no server | no server at all | data tied to one browser profile; E2E persistence test depends on profile handling; on-disk inspection impossible | Rejected |
| Full-stack framework (Next.js, Remix) | batteries included | far more dependencies and conventions than the fixture needs; confounds A/B tasks | Rejected |
| Jest instead of Vitest | widespread | extra config for ESM/TS; Vitest shares Vite config | Rejected |

## Consequences

- `npm install && npm test && npm run dev` is the expected US-01 path; exact commands go into README in P1/P2.
- The scheduler and readiness logic are testable without a browser or server (P1 gate).
- Playwright needs a one-time Chromium download; this is part of the approved list but is a network action at setup.
- The loopback server must never bind to `0.0.0.0`; a test asserts the bind address.
- Persistence and Ultimate's agent durability are different things (PRD US-07); experiments must not conflate them.
- Future checks for the Ultimate lander are `npm run typecheck`, `npm test`, `npm run test:e2e`
  (docs/LANDER_STRATEGY.md).

## Evidence

- Requirements: docs/PRD.md US-01, US-07, US-08 and "Non-goals"; docs/ARCHITECTURE.md "Persistence adapter" and "API".
- Environment versions: docs/ENVIRONMENT.md (Node 26.7, npm 12.2.1, Apple M1).
- No prototype was built in P0 (no product code allowed); the atomic-rename and loopback claims are design intent,
  to be proven by the P1/P2 tests listed above.

## Amendment 1 (2026-11-02, accepted by the Product Owner at the P2 gate)

Implementation divergence, recorded without changing the agreed test objectives. Decision point 37 says "in the E2E
test one npm script starts both". In P2 (#22, PR #27) the single command is still `npm run test:e2e`, but Playwright's
`webServer` starts only Vite; the test starts the API itself as a child process, because it must kill and restart it to
prove persistence across an app restart (US-07). The objectives are unchanged: edit, reload, restart, and the data is
still persisted, run twice with a fresh store, and run by the lander. Evidence: experiments/P2/LOG.md, reviewer #6253/#6329.

## Review trigger

Revisit when: data exceeds ~1 MB or ~1,000 tasks; a second concurrent writer or user is required; a dependency
outside the list above is proposed; or an E2E/persistence test shows a lost or partial write.
