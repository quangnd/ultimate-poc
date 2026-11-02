import { defineConfig, devices } from '@playwright/test'

// Both ports differ from `npm run dev` / `npm run server` (5173 / 5174), so a run never meets a dev setup that is up.
export const WEB_PORT = 5273
/** The API is not a `webServer`: each test starts it itself (a fresh data dir, restartable), see e2e/api.ts. */
export const API_PORT = 5274

export default defineConfig({
  testDir: 'e2e',
  // One flow at a time: the API port is fixed because the dev server's proxy needs it.
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
    url: `http://127.0.0.1:${WEB_PORT}`,
    env: { API_PORT: String(API_PORT) },
    reuseExistingServer: false,
  },
})
