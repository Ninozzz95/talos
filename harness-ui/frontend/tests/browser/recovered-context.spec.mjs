import { test, expect } from '@playwright/test';

// Production UI with controlled replay events; this does not exercise inference.
for (const theme of ['dark', 'light']) test(`RETRY08-UI ${theme}: rebuilt context is disclosed once and survives replay`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
  await page.addInitScript(mode => {
    if (window === window.top) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1, appearance: { colorMode: mode, uiLanguage: 'it', interfaceMotion: false },
    }));
  }, theme);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/sessions/retry08-*/events', () => {});
  const open = async id => {
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached' });
    await page.evaluate(id => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Ripresa della conversazione', 'test/model', { conclusa: true, modello: 'test/model' }), id);
  };
  const replay = async () => page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const notice = { type: 'StateDelta', _sequenza: 2, delta: [{ op: 'add', path: '/recuperoCronologia', value: { versioneGiro: 2, contestoRicostruito: true } }] };
    for (const event of [
      { type: 'RunStarted', _sequenza: 1, input: { consegna: 'continua da dove eri rimasto' } }, notice, notice,
      { type: 'RunFinished', _sequenza: 3 }, { type: 'CUSTOM', name: 'talos.fine-rigiocata' },
    ]) runtime.handleRealEvent(event, runtime.realSessionState.generation);
  });
  await page.goto('/'); await open('retry08-legacy'); await replay();
  const note = page.locator('.real-session-status').filter({ hasText: 'Contesto ricostruito' });
  await expect(note).toHaveCount(1); await expect(note).toBeVisible();
  await expect(note).toContainText('fonti attuali');
  await expect(note).toContainText('messaggi precedenti sono conservati');
  await page.reload(); await open('retry08-legacy'); await replay();
  await expect(note).toHaveCount(1); await expect(note).toBeVisible();
  await open('retry08-other'); await expect(note).toHaveCount(0);
  await open('retry08-legacy'); await replay(); await expect(note).toHaveCount(1);
  const box = await note.boundingBox();
  expect(box.width).toBeGreaterThan(100);
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(1920);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(1080);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`recovered-context-${theme}-1080p.png`) });
});
