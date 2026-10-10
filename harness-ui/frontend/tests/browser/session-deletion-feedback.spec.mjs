import {test, expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtempSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createHttpApp} from '../../../src/http-app.mjs';
import {createSessionRegistry} from '../../../src/session-registry.mjs';
import {createProcessOutputStore} from '../../../src/process-output-store.mjs';
import {avviaSessione} from '../../../src/agent-service.mjs';
import {talosLavora} from '../../../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

test.use({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
const key = 'talos.session-deletion-feedback.v1';

async function fixture({failure = true, journalFailure = false} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-feedback19-')), cartellaStore = join(root, 'sessions'), databasePath = join(root, 'output.sqlite');
  const script = join(root, 'producer.cjs'); writeFileSync(script, "process.stdout.write('output19');");
  const command = `"${process.execPath}" "${script}"`;
  const store = await createProcessOutputStore({databasePath, maxOutputBytes: 100_000});
  const registry = createSessionRegistry({cartellaStore, modello: 'fixture19', chiave: 'fixture19',
    ...(journalFailure ? {eliminaSessionePersistitaFn: async () => {throw Object.assign(new Error('Fixture journal denied'), {code: 'SESSION_STORE_DELETE_FAILED'});}} : {}),
    guardaWorkspaceFn: () => () => {}, processOutputStoreFn: () => store,
    preparaEsecuzioneFn: id => ({cartella: root, task: {id, consegna: 'Verifica locale della cancellazione.'}, comandoProva: command}),
    avviaSessioneFn: input => avviaSessione({...input, cartella: root, livelloAccesso: 'completo',
      contestoDelProgettoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
      talosLavoraFn: args => {let call = 0; return talosLavora({...args, onDelta: undefined, _giriMassimiInterno: 3,
        ambienteComandiFn: () => ({dove: 'windows', revisione: 0}), fetchDiRete: async () => {
          const message = call++ === 0 ? {role: 'assistant', content: '', tool_calls: [{id: 'tool19', type: 'function', function: {name: 'prova', arguments: '{}'}}]} : {role: 'assistant', content: 'Verifica conclusa.'};
          return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
        },
      });},
    }),
  });
  const {sessionId} = registry.avvia('fixture19'); await registry.attendiAssestamento(sessionId);
  const db = new DatabaseSync(databasePath);
  expect(db.prepare('SELECT count(*) AS n FROM output_chunks').get().n).toBeGreaterThan(0);
  if (failure) db.exec("CREATE TRIGGER deny19 BEFORE DELETE ON output_captures BEGIN SELECT RAISE(ABORT,'fixture19'); END;");
  let deletes = 0;
  const app = createHttpApp({staticHandler: () => {}, token: 'test19', sessionRegistry: registry});
  const server = createServer((req,res) => {if (req.url.endsWith('/delete')) deletes++; return app(req,res);});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {sessionId, root, registry, store, db, journal: join(cartellaStore, `${sessionId}.jsonl`), get deletes() {return deletes;},
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections(); await new Promise(r => server.close(r));
      await registry.chiudi(); await store.close(); db.close();
      const child = relative(resolve(tmpdir()), resolve(root)); expect(Boolean(child && !child.startsWith('..') && !isAbsolute(child))).toBe(true);
      await rimuoviCartellaDiProvaAttesa(root);
    },
  };
}

async function open(page, f, {theme = 'dark', denied = false, active = true} = {}) {
  await page.context().addCookies([{name: 'talos_token', value: 'test19', url: f.base, httpOnly: true, sameSite: 'Strict'}]);
  await page.addInitScript(({theme, denied}) => {
    if (window !== window.top) return;
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({version: 1, appearance: {colorMode: theme, uiLanguage: 'it', interfaceMotion: false}}));
    if (denied) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k,v) {if (k === 'talos.session-deletion-feedback.v1') throw new DOMException('Denied', 'QuotaExceededError'); return original.call(this,k,v);};
    }
  }, {theme, denied});
  await page.route('**/api/v1/sessions**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/v1/sessions' || url.pathname.startsWith(`/api/v1/sessions/${f.sessionId}/`)) {
      /* La guardia d'origine (859f842cd) accetta una scrittura solo dalla finestra servita da QUEL server: la richiesta inoltrata
         porta l'Origin della fixture, come se la pagina venisse da lei (la pagina vera sta sul server di prova, un'altra porta). */
      const headers = {...req.headers(), origin: f.base};
      if (req.method() === 'POST' && url.pathname.endsWith('/delete')) {
        const response = await route.fetch({url: f.base + url.pathname + url.search, headers});
        f.deleteResponse = await response.json();
        return route.fulfill({response, json: f.deleteResponse});
      }
      return route.continue({url: f.base + url.pathname + url.search, headers});
    }
    return route.fallback();
  });
  await page.goto('/'); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({state: 'detached'});
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  if (active) {
    const metadata = f.registry.elenca().find(r => r.sessionId === f.sessionId);
    await page.evaluate(s => window.__talosHarnessUiRuntime.passaASessione(s.sessionId, s.taskId, s.nome, s.modello, s), metadata);
    await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  }
  await page.locator(`[data-real-session-id="${f.sessionId}"]`).click({button: 'right'});
  await page.locator('.session-actions-menu').getByRole('menuitem', {name: 'Elimina', exact: true}).click();
  await expect(page.locator('#veloEliminaSessione')).toBeVisible();
}
const notice = page => page.locator(`[data-toast-chiave="${key}"]:not([data-uscita])`);

for (const theme of ['dark','light']) test(`OUTPUT19-REAL-${theme}: partial cleanup survives active-session reload and is explicitly acknowledged`, async ({page}, testInfo) => {
  const f = await fixture(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await open(page, f, {theme});
    await page.locator('#eliminaSessioneConferma').click();
    await expect(notice(page)).toBeVisible();
    expect(f.deleteResponse.data.outputCleanup.state).toBe('pending');
    await expect(notice(page)).toContainText('Alcuni output non sono stati rimossi');
    await expect(notice(page).getByRole('alert')).toContainText('Al momento della cancellazione');
    expect(existsSync(f.journal)).toBe(false); expect(f.deletes).toBe(1);
    expect((await f.store.listSessionDeletions({})).items).toHaveLength(1);
    await page.reload(); await page.locator('#talosAvvio').waitFor({state: 'detached'}); await expect(notice(page)).toBeVisible();
    const geometry = await notice(page).evaluate(el => {
      const r = el.getBoundingClientRect(), button = el.querySelector('[data-toast-chiudi]'), b = button.getBoundingClientRect();
      return {visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        overflow: el.scrollWidth > el.clientWidth, hit: button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};
    });
    expect(geometry).toEqual({visible:true,overflow:false,hit:true});
    const path = testInfo.outputPath(`cleanup-${theme}-1920x1080.png`); await page.screenshot({path});
    await notice(page).getByRole('button', {name: 'Ho letto'}).focus(); await page.keyboard.press('Enter');
    await expect(notice(page)).toHaveCount(0); await page.reload(); await expect(notice(page)).toHaveCount(0);
    expect(f.deletes).toBe(1); expect(errors).toEqual([]);
  } finally {await page.close(); await f.close();}
});

test('OUTPUT19-DENIED: storage failure delays reload until the warning is read', async ({page}) => {
  const f = await fixture();
  try {
    await open(page, f, {denied:true}); await page.evaluate(() => {window.__samePage19 = true;});
    await page.locator('#eliminaSessioneConferma').click(); await expect(notice(page)).toBeVisible();
    expect(await page.evaluate(() => window.__samePage19)).toBe(true); expect(f.deletes).toBe(1);
    await notice(page).getByRole('button', {name: 'Ho letto'}).click();
    await page.waitForFunction(() => window.__samePage19 !== true); expect(f.deletes).toBe(1);
  } finally {await page.close(); await f.close();}
});

test('OUTPUT19-COMPLETE: successful cleanup removes bytes and adds no partial warning', async ({page}) => {
  const f = await fixture({failure:false});
  try {
    await open(page, f, {active:false}); await page.locator('#eliminaSessioneConferma').click();
    await expect(page.locator('#veloEliminaSessione')).toBeHidden(); await expect(notice(page)).toHaveCount(0);
    expect(f.db.prepare('SELECT count(*) AS n FROM output_chunks').get().n).toBe(0); expect(f.deletes).toBe(1);
  } finally {await page.close(); await f.close();}
});

test('OUTPUT19-ERROR: journal refusal stays visible and preserves the session and bytes', async ({page}) => {
  const f = await fixture({journalFailure:true});
  try {
    await open(page, f); await page.locator('#eliminaSessioneConferma').click();
    await expect(page.locator('#veloEliminaSessione')).toBeVisible();
    await expect(page.locator('#eliminaSessioneConferma')).toBeEnabled();
    await expect(page.locator('#veloEliminaSessione')).toContainText('Eliminazione non riuscita');
    await expect(notice(page)).toHaveCount(0);
    expect(existsSync(f.journal)).toBe(true); expect(f.db.prepare('SELECT count(*) AS n FROM output_chunks').get().n).toBeGreaterThan(0);
    expect((await f.store.listSessionDeletions({})).items).toHaveLength(0); expect(f.deletes).toBe(1);
  } finally {await page.close(); await f.close();}
});

test('OUTPUT19-NARROW: mixed warning stays readable and dismissible at 390px without screenshots', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(k => {if (window === window.top) sessionStorage.setItem(k, JSON.stringify({schema:k,output:true,workflow:true}));}, key);
  await page.goto('/'); await page.locator('#talosAvvio').waitFor({state:'detached'});
  await expect(notice(page)).toContainText('automazioni'); await expect(notice(page)).toContainText('output');
  const fits = await notice(page).evaluate(el => {const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth;});
  expect(fits).toBe(true);
  await notice(page).getByRole('button',{name:'Ho letto'}).click(); await expect(notice(page)).toHaveCount(0);
});
