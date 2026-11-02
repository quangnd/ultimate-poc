# Ultimate POC: Release Readiness Lab

**Purpose:** Evaluate Ultimate (Pi + Pi Durable) while building a small, deterministic local release-readiness web application on a personal Mac.

This is a **framework evaluation**, not a business-product launch. Success requires both product acceptance tests and independent evidence that Ultimate is useful compared with plain Pi. All data is synthetic because this is a public repository.

## Start here

1. Read [AGENTS.md](AGENTS.md) for agent operating rules.
2. Read [docs/START_HERE.md](docs/START_HERE.md) for the first session in Ultimate.
3. Read [docs/PRD.md](docs/PRD.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/EVALUATION.md](docs/EVALUATION.md).
4. Check [state/PROJECT_STATUS.md](state/PROJECT_STATUS.md) before doing any work.
5. Verify actual features in [docs/CAPABILITY_MATRIX.md](docs/CAPABILITY_MATRIX.md).

## Document map

| Path | Purpose |
|---|---|
| AGENTS.md | global agent coordination, guardrails, DoD |
| docs/PRD.md | scope, requirements, acceptance criteria |
| docs/ARCHITECTURE.md | high-level boundaries and technical tradeoffs |
| docs/ROADMAP.md | phased work and human gates |
| docs/EVALUATION.md | experiments, A/B protocol, metrics and scoring |
| docs/CAPABILITY_MATRIX.md | installed capability evidence, not marketing |
| docs/decisions/ | accepted architecture decision records |
| state/PROJECT_STATUS.md | compact continuation checkpoint |
| experiments/ | individual run records and outcomes |
| src/, tests/, fixtures/ | application code, tests, synthetic data (created during implementation) |

## First task

Open the repo in Ultimate and paste the prompt in [docs/START_HERE.md](docs/START_HERE.md). Start at Phase P0. Do not jump directly into app development.

## Development

From a fresh clone. Developed and tested with Node 26.7 and npm 12.2.1 on macOS (see [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md));
other versions are not tested.

```bash
npm ci                             # install exact dependencies from package-lock.json
npx playwright install chromium    # once per machine: downloads the browser the E2E test drives

npm run server                     # the API on 127.0.0.1:5174; the release is stored in data/release.json
npm run dev                        # the web app on 127.0.0.1:5173 (second terminal)
```

Open <http://127.0.0.1:5173> and choose **Load the sample release**. The API reads `PORT` (default 5174) and `DATA_DIR`
(default `data`).

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest: domain, server and web unit/integration tests
npm run test:e2e    # Playwright (Chromium): load the sample, edit, save, reload, restart the API, export
```

The E2E test starts its own web server (port 5273) and API (port 5274) on a temporary data directory, so it needs
neither `npm run server` nor `npm run dev` running and never touches `data/`.

## Boundaries

No confidential company data, secrets, service credentials or destructive tests. No automatic modification of Pi/Ultimate extensions without review and explicit human approval.
