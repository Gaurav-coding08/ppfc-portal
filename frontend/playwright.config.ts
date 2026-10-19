import { defineConfig, devices } from '@playwright/test';

// E2E smoke suite (feature 18 Part C). It drives a *running* stack with the
// seeded data — it does not start servers itself:
//   docker compose --profile app up -d --build   → http://localhost:8080 (default)
//   or the dev servers (npm run dev in backend/ and frontend/) with
//   E2E_BASE_URL=http://localhost:5173
// Both serve the SPA and proxy /api to the backend on the same origin, so the
// httpOnly session cookie works exactly as it does for a real user.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',
  // The journeys write to the shared dev database (new projects, costs, CR
  // decisions), so they run one at a time in a fixed order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The app formats dates and money for the UAE locale; pin the browser to
    // it so text assertions don't depend on the machine running the suite.
    locale: 'en-AE',
    timezoneId: 'Asia/Dubai',
  },
  projects: [
    // Logs in once per role and saves the session cookie (see auth.setup.ts).
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
