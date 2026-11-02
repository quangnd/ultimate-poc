import { defineConfig, devices } from '@playwright/test'

/** A port from the environment: unset means the default, anything but an integer from 1 to 65535 is an error. */
function portFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const port = /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!(port >= 1 && port <= 65535)) throw new Error(`${name} must be an integer from 1 to 65535, got "${raw}"`)
  return port
}

// The defaults differ from `npm run dev` / `npm run server` (5173 / 5174), so a run never meets a dev setup that is up,
// and are the pair the lander uses. Two runs at once (worktrees side by side) each need their own pair:
// `WEB_PORT=5373 API_PORT=5374 npm run test:e2e`. Playwright's worker processes read the same environment, so they agree.
export const WEB_PORT = portFromEnv('WEB_PORT', 5273)
/** The API is not a `webServer`: each test starts it itself (a fresh data dir, restartable), see e2e/api.ts. */
export const API_PORT = portFromEnv('API_PORT', 5274)
if (WEB_PORT === API_PORT) throw new Error(`WEB_PORT and API_PORT must differ, both are ${WEB_PORT}`)

export default defineConfig({
  testDir: 'e2e',
  // One flow at a time: the tests share one API port (the dev server's proxy points at it), so they cannot run in parallel.
  fullyParallel: false,
  workers: 1,
  // No retries: a flaky pass must not hide (the lander already reruns a failing check once and reports it as flaky).
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${WEB_PORT}`,
    // `port`, not `url`: a holder that accepts connections but never replies would make a `url` check wait for minutes.
    port: WEB_PORT,
    env: { API_PORT: String(API_PORT) },
    reuseExistingServer: false,
  },
})
