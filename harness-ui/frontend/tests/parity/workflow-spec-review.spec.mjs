import { expect, test } from '@playwright/test';

import {
  WORKFLOW_SPEC_REVIEW_VIEWPORTS,
  WORKFLOW_SPEC_SCENE_NAMES,
} from '../../lab/workflow-spec.js';

const expectedViewport = new Map(WORKFLOW_SPEC_REVIEW_VIEWPORTS.map((entry) => [entry.name, entry]));

test('WF0A-LIVE-01 espone 23 sessioni Workflow navigabili nel server di prova', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) errors.push(`console-${message.type()}: ${message.text()}`);
  });
  page.on('requestfailed', (request) => errors.push(`request: ${request.method()} ${request.url()}`));

  const theme = testInfo.project.name.endsWith('-dark') ? 'dark' : 'light';
  await page.goto(`/?componente=WorkflowSpec&scena=workflow-plan-clean&tema=${theme}`);
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-workflow-spec-scene', 'workflow-plan-clean');

  const sessions = page.locator('[data-workflow-review-session]');
  await expect(sessions).toHaveCount(WORKFLOW_SPEC_SCENE_NAMES.length);
  await expect(page.locator('[data-workflow-review-session="workflow-plan-clean"]')).toHaveAttribute('aria-current', 'true');

  await page.locator('[data-workflow-review-session="workflow-human-single"]').click();
  await expect(page).toHaveURL(new RegExp(`scena=workflow-human-single.*tema=${theme}`));
  await expect(page.locator('html')).toHaveAttribute('data-workflow-spec-scene', 'workflow-human-single');
  await expect(page.locator('[data-workflow-review-session="workflow-human-single"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-wf-human-gate]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('WF0A-LIVE-02 applica viewport e tema esatti senza overflow orizzontale', async ({ page }, testInfo) => {
  const [viewportName, theme] = testInfo.project.name.split('-');
  const expected = expectedViewport.get(viewportName);
  expect(expected, `progetto inatteso ${testInfo.project.name}`).toBeTruthy();

  await page.goto(`/?componente=WorkflowSpec&scena=workflow-graph-5000-clustered&tema=${theme}`);
  await expect(page.locator('html')).toHaveAttribute('data-visual-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-workflow-review-theme', theme);
  expect(page.viewportSize()).toEqual({ width: expected.width, height: expected.height });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-wf-graph] .wf-cluster')).toHaveCount(6);
});
