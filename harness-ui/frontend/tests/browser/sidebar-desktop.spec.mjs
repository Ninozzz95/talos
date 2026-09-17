import { test, expect } from '@playwright/test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSessionRegistry } from '../../../src/session-registry.mjs';
import { createHttpApp } from '../../../src/http-app.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';
import { fixtureRows, prepareSidebar } from '../fixtures/sidebar-fixture.mjs';

const row = (page, id) => page.locator(`[data-sidebar-id="${id}"]`);
const open = (page, id) => row(page, id).locator('.td-session-open');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

for (const size of [5, 50, 200, 1000]) test(`SIDEBAR-${size}: keyed updates preserve nodes, focus, scroll and open menu`, async ({ page }, info) => {
  const data = fixtureRows(size).map(s => ({ ...s, conclusa: true, inAttesaApprovazione: false, ultimoEsito: 'successo' }));
  const f = await prepareSidebar(page, { rows: data });
  await expect(page.locator('.td-session-live-row')).toHaveCount(size);
  await open(page, 'sidebar-2').focus();
  await page.evaluate(() => {
    window.__sidebarBefore = [...document.querySelectorAll('.td-session-live-row')];
    window.__sidebarMutations = [];
    window.__sidebarObserver = new MutationObserver(records => window.__sidebarMutations.push(...records.map(r => ({ type: r.type,
      addedRows: [...r.addedNodes].filter(n => n.matches?.('.td-session-live-row')).length,
      removedRows: [...r.removedNodes].filter(n => n.matches?.('.td-session-live-row')).length }))));
    window.__sidebarObserver.observe(document.querySelector('#realSessionsBlock'), { subtree: true, childList: true, attributes: true });
    window.__sidebarStarted = performance.now(); window.__sidebarScroll = document.querySelector('#sessionList').scrollTop;
  });
  const changed = { ...data[0], conclusa: false, attivitaSidebar: { ...data[0].attivitaSidebar, fase: 'risposta', risposte: 3 } };
  await f.delta([changed]); await expect(open(page, 'sidebar-0')).toContainText('risponde');
  await expect(open(page, 'sidebar-2')).toBeFocused();
  const result = await page.evaluate(() => {
    window.__sidebarObserver.disconnect();
    return { size: window.__sidebarBefore.length, durationMs: performance.now() - window.__sidebarStarted,
      sameNodes: window.__sidebarBefore.every(n => document.querySelector(`[data-sidebar-id="${n.dataset.sidebarId}"]`) === n),
      orderStable: window.__sidebarBefore.every((n, i) => document.querySelectorAll('.td-session-live-row')[i] === n),
      addedRows: window.__sidebarMutations.reduce((n, r) => n + r.addedRows, 0), removedRows: window.__sidebarMutations.reduce((n, r) => n + r.removedRows, 0),
      scrollDelta: document.querySelector('#sessionList').scrollTop - window.__sidebarScroll };
  });
  expect(result.sameNodes).toBe(true); expect(result.orderStable).toBe(true);
  expect(result.addedRows).toBe(0); expect(result.removedRows).toBe(0); expect(Math.abs(result.scrollDelta)).toBeLessThanOrEqual(1);
  await info.attach('incremental-render.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('.td-sidebar-menu')).toBeVisible();
  await f.delta([{ ...data[1], nome: 'Aggiornamento remoto mentre il menu è aperto' }]);
  await expect(page.locator('.td-sidebar-menu')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(row(page, 'sidebar-2').locator('.td-session-menu')).toBeFocused();
  expect(f.errors).toEqual([]);
});

test('SIDEBAR search filters complete rows and retains parent context across updates', async ({ page }) => {
  const data = fixtureRows(3).map((s, i) => ({ ...s, nome: i === 1 ? 'Auth service' : i === 0 ? 'Progetto principale' : 'Altro', padreId: i === 1 ? 'sidebar-0' : null }));
  const f = await prepareSidebar(page, { rows: data });
  await page.locator('#sessionSearch').fill('auth');
  await expect(row(page, 'sidebar-0')).toBeVisible(); await expect(row(page, 'sidebar-1')).toBeVisible();
  await expect(row(page, 'sidebar-2')).toBeHidden(); await expect(row(page, 'sidebar-2').locator('.td-session-menu')).toBeHidden();
  await f.delta([{ ...data[2], nome: 'Auth aggiunta da un’altra finestra' }]); await expect(row(page, 'sidebar-2')).toBeVisible();
  await page.locator('#sessionSearch').fill('nessuna corrispondenza'); await expect(page.locator('.td-sidebar-empty')).toContainText('Nessuna sessione corrisponde');
  await expect(page.locator('.td-session-live-row:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostra tutte', exact: true }).click(); await expect(page.locator('.td-session-live-row:visible')).toHaveCount(3);
  expect(f.errors).toEqual([]);
});

test('SIDEBAR checkbox siblings, keyboard, selection and removal do not activate another session', async ({ page }) => {
  const f = await prepareSidebar(page);
  await open(page, 'sidebar-0').focus(); await page.keyboard.press('ArrowDown'); await expect(open(page, 'sidebar-1')).toBeFocused();
  await page.keyboard.press('Home'); await expect(open(page, 'sidebar-0')).toBeFocused();
  await page.keyboard.press('End'); await expect(open(page, 'sidebar-4')).toBeFocused();
  await page.locator('#sessionSelectionToggle').click();
  const checkbox = row(page, 'sidebar-2').locator('input[type="checkbox"]'); await checkbox.check();
  await expect(checkbox).toBeChecked(); await expect(page.locator('#sessionSelectionCount')).toHaveText('1 selezionata');
  expect(await checkbox.evaluate(e => e.closest('button'))).toBeNull();
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBeFalsy();
  await expect(row(page, 'sidebar-2').locator('.td-session-menu')).toBeHidden();
  await checkbox.focus(); await f.delta([], ['sidebar-2']); await expect(row(page, 'sidebar-2')).toHaveCount(0);
  await expect(page.locator('#sessionSelectionCount')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  expect(f.errors).toEqual([]);
});

test('SIDEBAR pin, filter and unread preferences persist; keyboard menu restores focus', async ({ page }) => {
  const f = await prepareSidebar(page);
  await open(page, 'sidebar-2').focus(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Apri', exact: true })).toBeFocused();
  await page.getByRole('menuitem', { name: 'Fissa in questa sidebar', exact: true }).click();
  await expect(row(page, 'sidebar-2')).toHaveAttribute('data-pinned', 'true');
  await expect(row(page, 'sidebar-2').locator('.td-session-menu')).toBeFocused();
  await page.getByRole('combobox', { name: 'Filtra sessioni' }).selectOption('fissate');
  await expect(page.locator('.td-session-live-row:visible')).toHaveCount(1);
  await page.reload(); await page.locator('[data-sidebar-connection="live"]').waitFor();
  await expect(page.getByRole('combobox', { name: 'Filtra sessioni' })).toHaveValue('fissate');
  await expect(row(page, 'sidebar-2')).toHaveAttribute('data-pinned', 'true');
  await page.getByRole('combobox', { name: 'Filtra sessioni' }).selectOption('tutte');
  await f.delta([{ ...f.rows[3], attivitaSidebar: { ...f.rows[3].attivitaSidebar, risposte: 4 } }]);
  await expect(row(page, 'sidebar-3').locator('.td-session-metric')).toHaveText('2 nuove');
  await open(page, 'sidebar-3').click(); await expect(row(page, 'sidebar-3')).toHaveAttribute('data-current', 'true');
  await expect(row(page, 'sidebar-3')).not.toHaveAttribute('data-unread', 'true');
  expect(f.errors).toEqual([]);
});

test('SIDEBAR realtime filtering waits for the user to leave the row', async ({ page }) => {
  const f = await prepareSidebar(page); await page.getByRole('combobox', { name: 'Filtra sessioni' }).selectOption('attive');
  await open(page, 'sidebar-0').hover();
  await f.delta([{ ...f.rows[0], conclusa: true, ultimoEsito: 'successo', attivitaSidebar: { ...f.rows[0].attivitaSidebar, fase: null } }]);
  await expect(open(page, 'sidebar-0')).toContainText('conclusa'); await expect(row(page, 'sidebar-0')).toBeVisible();
  await page.mouse.move(700, 400); await expect(row(page, 'sidebar-0')).toBeHidden();
});

test('SIDEBAR offline/reconnect preserves visible facts and requires a fresh snapshot', async ({ page }) => {
  const f = await prepareSidebar(page);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.td-sidebar-connection')).toHaveText('Offline'); await expect(page.locator('.td-session-live-row')).toHaveCount(5);
  await expect(open(page, 'sidebar-0')).toHaveAttribute('aria-label', /^Dati non aggiornati/);
  const animations = await page.locator('.td-session-status .i').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).animationName));
  expect(animations.every(a => a === 'none')).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.td-sidebar-connection')).toHaveText('Live'); await expect(open(page, 'sidebar-0')).not.toHaveAttribute('aria-label', /^Dati non aggiornati/);
  expect(await page.evaluate(() => window.__sidebarTest.data.streams.filter(s => !s.closed).length)).toBe(1);
  await page.evaluate(() => window.__talosHarnessDestroy());
  expect(await page.evaluate(() => window.__sidebarTest.data.streams.filter(s => !s.closed).length)).toBe(0);
  expect(f.errors).toEqual([]);
});

test('SIDEBAR loading, error, empty and partial data remain distinct', async ({ page }) => {
  await prepareSidebar(page, { rows: [], live: false, restError: true });
  await expect(page.locator('.td-sidebar-empty')).toContainText('Impossibile caricare');
  await expect(page.locator('#realSessionsBlock')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => window.__sidebarTest.snapshot([]));
  await expect(page.locator('.td-sidebar-empty')).toContainText('Nessuna sessione ancora');
  await page.evaluate(() => window.__sidebarTest.snapshot([{ sessionId: 'partial', nome: 'Dato parziale' }]));
  await expect(open(page, 'partial')).toContainText('stato non disponibile');
  await expect(open(page, 'partial')).not.toContainText('0 giri');
});

for (const mode of ['dark', 'light']) for (const [width, height] of [[1440, 900], [1024, 600], [1920, 1080], [900, 500]]) {
  test(`SIDEBAR layout ${mode} ${width}x${height}: theme, overflow, collapse and resize`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const data = fixtureRows(50); data[0].nome = 'Una sessione con un nome molto lungo che deve restare leggibile nel suggerimento senza coprire azioni e contatori';
    const f = await prepareSidebar(page, { rows: data, mode });
    const sidebar = page.locator('#sessionsPanel');
    await expect(sidebar).toBeVisible();
    const overflow = await sidebar.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, bottom: el.getBoundingClientRect().bottom,
      footer: el.querySelector('.talos-sidebar__foot').getBoundingClientRect().bottom }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1); expect(overflow.footer).toBeLessThanOrEqual(height + 1);
    const resize = sidebar.locator('[data-ridimensiona="sidebar"]');
    await resize.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(276);
    await sidebar.screenshot({ path: info.outputPath(`sidebar-${mode}-${width}x${height}.png`) });
    await page.locator('#sessionsCollapseBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'icone');
    await expect(sidebar.locator('.td-sidebar-compact-status')).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Impostazioni (Ctrl ,)', exact: true })).toBeVisible();
    const doctor = sidebar.getByRole('button', { name: 'Doctor', exact: true }); await doctor.focus(); await expect(doctor).toBeFocused();
    await sidebar.screenshot({ path: info.outputPath(`sidebar-collapsed-${mode}-${width}x${height}.png`) });
    await page.reload(); await page.locator('[data-sidebar-connection="live"]').waitFor();
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'icone');
    await page.locator('.td-sidebar-compact-status').click(); await expect(page.locator('#sessionSearch')).toBeFocused();
    expect(f.errors).toEqual([]);
  });
}

for (const mode of ['dark', 'light']) test(`SIDEBAR a11y ${mode}: no nested controls, accessible names, contrast and reduced motion`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: mode });
  const f = await prepareSidebar(page, { mode });
  await page.locator('#sessionSelectionToggle').click();
  await page.evaluate(await readFile(resolve(import.meta.dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8'));
  const audit = await page.evaluate(async () => {
    const result = await window.axe.run(document.querySelector('#sessionsPanel'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return { violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: result.incomplete.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), passes: result.passes.length };
  });
  await info.attach('accessibility.json', { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
  expect(audit.violations).toEqual([]);
  expect(await page.locator('.td-session-status .i').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).animationName === 'none'))).toBe(true);
  await expect(page.locator('#sessionsPanel button input')).toHaveCount(0);
  // axe deliberately requests review for aria-controls on popup triggers. Verify
  // the real target and keyboard round trip rather than dropping that finding.
  const unresolved = await page.locator('#sessionsPanel [aria-controls]').evaluateAll(nodes =>
    nodes.flatMap(node => node.getAttribute('aria-controls').split(/\s+/).filter(id => !document.getElementById(id))));
  expect(unresolved).toEqual([]);
  const bell = page.locator('#notificationsBtn');
  await bell.focus(); await page.keyboard.press('Enter');
  await expect(bell).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#pannelloNotifiche')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pannelloNotifiche')).toBeHidden();
  await expect(bell).toBeFocused();
  await expect(bell).toHaveAttribute('aria-expanded', 'false');
  expect(f.errors).toEqual([]);
});

test('SIDEBAR real HTTP: two windows observe unopened sessions, activity, counts, rename, removal and reconnection', async ({ browser }, info) => {
  const temp = await mkdtemp(join(tmpdir(), 'talos-sidebar-browser-'));
  const emitters = new Map(), finishes = new Map(); let id = 0;
  const registry = createSessionRegistry({ modello: 'test/model', chiave: 'TEST-ONLY-NOT-A-CREDENTIAL', cartellaStore: null,
    preparaEsecuzioneFn: taskId => ({ cartella: temp, task: { id: taskId, consegna: 'Test-only fixture; no provider invocation' } }),
    randomUUIDFn: () => `realtime-${++id}`, guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: input => {
      emitters.set(input.task.id, input.onEvento); input.onEvento({ type: 'RunStarted' });
      return new Promise(resolve => finishes.set(input.task.id, resolve));
    },
  });
  const server = createServer(createHttpApp({ sessionRegistry: registry,
    staticHandler: createStaticHandler(resolve(import.meta.dirname, '../../dist')),
    cartellaNote: join(temp, 'notes'), cartellaAttivita: join(temp, 'tasks'), cartellaMemoria: join(temp, 'memory') }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { if (window === window.top) localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })); });
  const a = await context.newPage(), b = await context.newPage();
  try {
    await Promise.all([a.goto(url), b.goto(url)]);
    await expect(a.locator('.td-sidebar-connection')).toHaveText('Live'); await expect(b.locator('.td-sidebar-connection')).toHaveText('Live');
    const first = registry.avvia('alpha'); const second = registry.avvia('beta');
    await expect(a.locator('.td-session-live-row')).toHaveCount(2); await expect(b.locator('.td-session-live-row')).toHaveCount(2);
    emitters.get('beta')({ type: 'ReasoningMessageStart', messageId: 'r' });
    await expect(open(a, second.sessionId)).toContainText('ragiona'); await expect(open(b, second.sessionId)).toContainText('ragiona');
    expect(await a.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBeFalsy();
    emitters.get('beta')({ type: 'ToolCallStart', toolCallId: 't', toolCallName: 'shell' });
    await expect(open(b, second.sessionId)).toContainText('Terminale');
    emitters.get('beta')({ type: 'ToolCallResult', toolCallId: 't', content: 'not streamed in the sidebar' });
    emitters.get('beta')({ type: 'StateDelta', delta: [{ path: '/usage', value: { giri: 3 } }] });
    emitters.get('beta')({ type: 'TextMessageStart', messageId: 'm', role: 'assistant' });
    emitters.get('beta')({ type: 'TextMessageEnd', messageId: 'm' });
    await expect(row(b, second.sessionId).locator('.td-session-metric')).toHaveText('1 nuova');
    emitters.get('alpha')({ type: 'RunError', code: 'fermato' }); finishes.get('alpha')({ ok: true });
    await expect(open(a, first.sessionId)).toContainText('fermata');
    const rename = await context.request.post(`${url}api/v1/sessions/${second.sessionId}/rename`, { data: { nome: 'Nome aggiornato da un’altra finestra' } });
    expect(rename.ok()).toBe(true); await expect(open(a, second.sessionId)).toContainText('Nome aggiornato');
    await registry.elimina(first.sessionId); await expect(row(a, first.sessionId)).toHaveCount(0); await expect(row(b, first.sessionId)).toHaveCount(0);
    await context.setOffline(true); await expect(b.locator('.td-sidebar-connection')).toHaveText('Offline');
    registry.avvia('gamma'); await context.setOffline(false);
    await expect(b.locator('.td-sidebar-connection')).toHaveText('Live'); await expect(b.locator('.td-session-live-row')).toHaveCount(2);
    await b.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 12_000 });
    await b.locator('#sessionsPanel').screenshot({ path: info.outputPath('two-window-real-http.png') });
  } finally {
    for (const finish of finishes.values()) finish({ ok: true });
    await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test('SIDEBAR resource counts refresh after a completed tool without the old 15-second delay', async ({ page }) => {
  let notes = 1, reads = 0;
  await page.route(/\/api\/v1\/sessions\/[^/]+\/notes$/, route => {
    reads++;
    return route.fulfill({ json: { ok: true, data: { note: Array.from({ length: notes }, (_, i) => ({ id: `n${i}`, titolo: 'Nota', contenuto: '' })) }, meta: {} } });
  });
  const f = await prepareSidebar(page);
  await open(page, 'sidebar-2').click();
  const count = page.locator('#sessionsPanel [data-vaia="note"] .talos-nav-item__count');
  await expect(count).toHaveText('1');
  const before = reads;
  notes = 3;
  await f.delta([], [], true);
  await expect(count).toHaveText('3', { timeout: 5000 });
  expect(reads).toBeGreaterThan(before);
  const after = reads;
  await f.delta([{ ...f.rows[0], attivitaSidebar: { ...f.rows[0].attivitaSidebar, fase: 'risposta' } }]);
  await frames(page); expect(reads).toBe(after);
  expect(f.errors).toEqual([]);
});

test('SIDEBAR tooltip is available at first hover and follows operational updates', async ({ page }) => {
  const f = await prepareSidebar(page);
  await open(page, 'sidebar-0').focus();
  await expect(page.locator('#talosTip')).toBeVisible();
  await expect(page.locator('#talosTip')).toContainText('3 chiamate a strumenti');
  await f.delta([{ ...f.rows[0], attivitaSidebar: { ...f.rows[0].attivitaSidebar, chiamate: 4 } }]);
  await expect(page.locator('#talosTip')).toContainText('4 chiamate a strumenti');
  await page.keyboard.press('Escape'); await expect(page.locator('#talosTip')).toBeHidden();
  await page.locator('#sessionsCollapseBtn').click();
  const note = page.locator('#sessionsPanel [data-vaia="note"]');
  await note.hover(); await expect(page.locator('#talosTip')).toContainText('Note');
  await note.click(); await expect(note).toHaveAttribute('aria-current', 'page');
  expect(f.errors).toEqual([]);
});

test('SIDEBAR resize clamps to existing bounds, resets and releases pointer capture', async ({ page }) => {
  await prepareSidebar(page);
  const sidebar = page.locator('#sessionsPanel'), resize = sidebar.locator('[data-ridimensiona="sidebar"]');
  await resize.focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(220);
  for (let i = 0; i < 35; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(420);
  await resize.dblclick(); await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(276);
  const box = await resize.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + box.height / 2);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
  await expect(resize).not.toHaveClass(/dragging/); await page.mouse.up();
  const width = (await sidebar.boundingBox()).width; await page.mouse.move(650, 200);
  expect((await sidebar.boundingBox()).width).toBe(width);
});
