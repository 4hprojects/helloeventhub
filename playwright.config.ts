import { defineConfig, devices } from '@playwright/test';

// E2E runs against an already running, built server (see e2e/README section in docs/TESTING.md).
// PW_CHROMIUM_PATH lets you use a locally available Chromium when Playwright can't install one.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3210',
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'], launchOptions: { executablePath } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } }, testMatch: /(admin|a11y)\.spec\.ts/ },
  ],
});
