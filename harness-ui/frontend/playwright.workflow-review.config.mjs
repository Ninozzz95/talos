import { defineConfig } from '@playwright/test';

import {
  WORKFLOW_SPEC_REVIEW_THEMES,
  WORKFLOW_SPEC_REVIEW_VIEWPORTS,
} from './lab/workflow-spec.js';

const PORT = process.env.TALOS_WORKFLOW_REVIEW_PORT || '4180';
if (PORT === '4174') throw new Error('La review Workflow non usa mai la porta owner 4174.');
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/parity',
  testMatch: ['workflow-spec-review.spec.mjs'],
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    channel: 'chrome',
    headless: true,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
  },
  projects: WORKFLOW_SPEC_REVIEW_VIEWPORTS.flatMap((viewport) => (
    WORKFLOW_SPEC_REVIEW_THEMES.map((theme) => ({
      name: `${viewport.name}-${theme}`,
      use: {
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
      },
    }))
  )),
  webServer: {
    command: 'node scripts/serve-lab.mjs',
    url: `${baseURL}/health`,
    env: { TALOS_FRONTEND_LAB_PORT: PORT },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
