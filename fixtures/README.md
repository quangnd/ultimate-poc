# Fixtures

Synthetic, fictional data for the "Aurora Kiosk 2.0" release; both files are `ReleaseDocument`s (`src/domain/types.ts`).

- **`release.json`:** start Mon 2027-01-04 (day 0), target Fri 2027-02-12 (day 29). 24 tasks: 4 done, 5 in progress, 15 todo.
- **Streams:** FW 6 tasks, SPS 4, Security 5, App 5, QA 4.
- **Gates** (0-day): `fw-integrated` FW-06, `security-verified` SEC-05, `app-integration` APP-05, `qa-complete` QA-04.
- **Cross-stream chains:** FW-04 → SPS-04 → SEC-04 → SEC-05; FW-06 → APP-03 → APP-05 → QA-03 → QA-04.
- **`cycle-variant.json`:** `release.json` plus one link: FW-05 gains predecessor SEC-04, so FW-05 → SEC-04 → SEC-03 → FW-05 (each task depends on the next).

## Firmware-delay scenario

Raise FW-03 (display timing fix) `estimateDays` from 5 to 8 (+3). Projected release finish by the ADR-002 §5 algorithm, day 0 = Mon 2027-01-04:

- **Baseline:** day 27 = Wed 2027-02-10, 2 working days before target.
- **Delayed:** day 30 = Mon 2027-02-15, 1 working day after target.

FW-03 is on the chain FW-02 → FW-03 → FW-04 → FW-05 → SEC-03 → SEC-04 → SEC-05 → QA-03 → QA-04. Each task starts the day after its
predecessor finishes (done tasks finish at −1; a 0-day gate finishes at its earliest − 1, shown as `fin`), so there is no slack to absorb the change:

| start–finish day | FW-02 | FW-03 | FW-04 | FW-05 | SEC-03 | SEC-04 | SEC-05 | QA-03 | QA-04 |
|---|---|---|---|---|---|---|---|---|---|
| Baseline | 0–2 | 3–7 | 8–11 | 12–13 | 14–17 | 18–22 | fin 22 | 23–27 | fin 27 |
| Delayed | 0–2 | 3–10 | 11–14 | 15–16 | 17–20 | 21–25 | fin 25 | 26–30 | fin 30 |

Other branches finish earlier and never bind QA-03 (baseline → delayed finish): SPS-04 14 → 17, APP-05 16 → 19, QA-02 17 → 20.
