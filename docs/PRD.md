# Product Requirements: Release Readiness Lab

## Purpose
Create a deliberately modest local web application to determine whether Ultimate improves real software delivery over a plain Pi workflow. The application is the test fixture; Ultimate is the subject of evaluation.

## Audience and environment
One local operator on a Mac, synthetic data only. No corporate systems, Jira integration, authentication, external accounts or cloud deployment required.

## Product scope
Manage a release with workstreams (FW, SPS, Security, App, QA), tasks, explicit dependencies and readiness gates. Show a dashboard, forecast and blocking path. Import/export a synthetic JSON fixture. Persist locally. UI must remain usable after restart.

### Stories and acceptance criteria
**US-01 Bootstrap:** Given a fresh clone, when documented setup is followed, the app starts locally, unit tests run, and fixture loads without manual code edits.

**US-02 Workstreams and tasks:** Operator can create, edit and view items with id, title, stream, owner role, status, estimate days and target date. Invalid negative estimates and missing IDs are rejected visibly.

**US-03 Dependencies:** Operator can add/remove finish-to-start task links. Unknown predecessor and dependency cycles must be rejected. A blocked task displays its blocking predecessors.

**US-04 Forecast:** Given fixed synthetic estimates and dependencies, a deterministic scheduler computes earliest working-day finishes. For v1 use one capacity unit per stream, Monday-Friday, no holidays, no partial-day units. Show assumptions in UI. Identical input yields identical output.

**US-05 Readiness:** A release is ready only if all mandatory gates (FW integrated, security verified, app integration, QA complete) are completed and no blocking task remains. UI explains reasons for NOT READY.

**US-06 Overview:** Dashboard shows overall readiness, tasks by stream/status, blockers, critical blockers and forecast versus target. Clearly label calculated forecasts as estimates, not commitments.

**US-07 Durable app data:** Closing/restarting the app preserves task edits using local storage/database. Export/import round trip preserves validated content. Do not confuse application persistence with Ultimate agent execution durability.

**US-08 Quality:** Automated unit tests cover scheduler, cycle detection, gates and import validation; integration tests cover key API/logic paths; one browser E2E verifies edit -> reload -> persisted data.

## Non-goals
No real PM master plan, Jira sync, calendar integration, workforce optimizer, ML forecasts or production-grade auth. Prefer a minimal TypeScript app (Vite + React with a small Node service/SQLite only if needed); agent must document trade-off before adding frameworks.

## Fixture
Synthetic sample with at least 5 streams, 20 tasks, 2 cross-stream dependency chains, one cycle-rejection case, and one scenario where firmware delay changes forecast. Dates and owners must be fictional.

## Product done
All US-01..08 pass, build reproducible and README includes commands. Functionality alone does NOT establish Ultimate evaluation success: see EVALUATION.md.
