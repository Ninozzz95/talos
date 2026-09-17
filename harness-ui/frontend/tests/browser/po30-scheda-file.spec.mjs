/*
 * ⛔⛔ PO-30, fetta 1 (owner 17/09/2026: «il laboratorio file agenti VA implementato») — la scheda «File» della colonna
 * destra col disegno del laboratorio della PR #33, sui dati VERI: la rotta dell'albero e gli eventi di scrittura sono quelli
 * del prodotto; finti sono solo i NOMI dei file che la rotta restituisce.
 *
 * Le prove misurano ciò che si VEDE (rettangoli, testo a schermo) e asseriscono la propria premessa: senza albero
 * disegnato o senza file scritti passerebbero su una scena vuota.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'po30-scheda-file');
const ALBERO = {
  '': [{ nome: 'src', cartella: true }, { nome: 'tests', cartella: true }, { nome: 'README.md', cartella: false }, { nome: 'package.json', cartella: false }],
  src: [{ nome: 'registro.mjs', cartella: false }, { nome: 'rotte.mjs', cartella: false }],
  tests: [{ nome: 'registro.test.mjs', cartella: false }],
};

async function scena(page, { larghezza = 1440, altezza = 900, tema = 'dark' } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* finestra privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/po30-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/po30-*/tree?*', (r) => {
    const percorso = new URL(r.request().url()).searchParams.get('percorso') || '';
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: ALBERO[percorso] ?? [] } }) });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('po30-uno', 'workspace', 'PO30', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9001, input: { consegna: 'Sistema il registro' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'StateDelta', _sequenza: 9002, delta: [{ op: 'replace', path: '/file/src/registro.mjs', value: 'uno\ndue\ntre\n', prima: 'uno\nvecchia\n' }] }, g);
    r.handleRealEvent({ type: 'StateDelta', _sequenza: 9003, delta: [{ op: 'add', path: '/file/tests/registro.test.mjs', value: 'prova\n' }] }, g);
  });
  /* A 1024 la colonna dei dettagli nasce chiusa: si apre col suo comando, come fa una persona. */
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="file"]').click();
  await expect(page.locator('#alberoFile .ft-node').first(), 'la scena non si è formata: l’albero non è stato disegnato').toBeVisible({ timeout: 10_000 });
}

test('PO30-FILE-01 — la testata porta il NOME della cartella e due soli comandi; i cinque di prima stanno nei due menu e funzionano', async ({ page }) => {
  await scena(page);
  await expect(page.locator('#alberoNomeRadice')).toHaveText('talos-prova');
  const affiancati = await page.locator('.talos-file-head > button:visible').count();
  expect(affiancati, 'più di due azioni affiancate non si mettono').toBe(2);
  for (const id of ['fileTreeNewFile', 'fileTreeNewFolder', 'fileTreeRefresh', 'fileTreeCollapse', 'fileTreeUp']) await expect(page.locator(`#${id}`), `${id} non deve stare a vista: sta nel suo menu`).toBeHidden();

  await page.locator('#fileTreeAdd').click();
  await expect(page.locator('#fileTreeNewFile')).toBeVisible();
  await expect(page.locator('#fileTreeNewFolder')).toBeVisible();
  const m = await page.evaluate(() => { const b = document.querySelector('#fileTreeAdd').getBoundingClientRect(); const menu = document.querySelector('#menuFileNuovo').getBoundingClientRect(); return { sotto: Math.round(menu.top - b.bottom), dentro: menu.right <= window.innerWidth && menu.left >= 0, largo: Math.round(menu.width) }; });
  console.log(`MISURA-PO30 menu = ${JSON.stringify(m)}`);
  expect(m.sotto, 'il menu si àncora sotto il suo pulsante, non al centro della finestra').toBeGreaterThanOrEqual(0);
  expect(m.sotto).toBeLessThan(24);
  expect(m.dentro, 'il menu sta dentro la finestra').toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menuFileNuovo'), 'Esc chiude il MENU').toBeHidden();
  await expect(page.locator('#veloFermaGiro'), '⛔ Esc su un menu aperto non deve chiedere di fermare il giro').toBeHidden();

  /* Un comando dal menu «⋯» lavora davvero: «Chiudi tutte le cartelle» dopo averne aperta una. */
  await page.locator('#alberoFile .ft-row-folder', { hasText: 'src' }).click();
  await expect(page.locator('#alberoFile .ft-node', { hasText: 'rotte.mjs' }).first()).toBeVisible();
  await page.locator('#fileTreeMore').click();
  await page.locator('#fileTreeCollapse').click();
  await expect(page.locator('#menuFileAltro'), 'scelta la voce, il menu si chiude').toBeHidden();
  await expect(page.locator('#alberoFile .ft-row', { hasText: 'rotte.mjs' })).toHaveCount(0);
});

test('PO30-FILE-02 — la lettera di stato: «M» e «A», col significato intero per chi passa sopra o ascolta', async ({ page }) => {
  await scena(page);
  await page.locator('#alberoFile .ft-row-folder', { hasText: 'src' }).click();
  await page.locator('#alberoFile .ft-row-folder', { hasText: 'tests' }).click();
  const stato = (nome) => page.locator('#alberoFile .ft-row', { hasText: nome }).locator('.talos-file-row__state');
  await expect(stato('registro.mjs')).toHaveText('M');
  await expect(stato('registro.mjs')).toHaveAttribute('aria-label', 'Modificato in questa sessione');
  await expect(stato('registro.test.mjs')).toHaveText('A');
  await expect(stato('registro.test.mjs')).toHaveAttribute('title', 'Creato in questa sessione');
  await expect(stato('rotte.mjs'), 'un file non toccato non porta nessuna lettera').toHaveCount(0);
  const alta = await page.locator('#alberoFile .ft-row', { hasText: 'rotte.mjs' }).evaluate((n) => Math.round(n.getBoundingClientRect().height));
  expect(alta, 'la riga del laboratorio è alta 36 px').toBe(36);
});

test('PO30-FILE-03 — le viste: «Modificati in questa sessione» elenca i file veri, li conta giusti, e una riga apre il file', async ({ page }) => {
  await scena(page);
  await expect(page.locator('#fileConteggio')).toHaveText('2 a vista');
  await page.locator('#alberoFile .ft-row-folder', { hasText: 'src' }).click();
  await expect(page.locator('#fileConteggio'), 'il conteggio segue l’albero: aperta «src» i file a vista sono quattro').toHaveText('4 a vista');
  await page.locator('#fileVista').click();
  await page.getByRole('menuitem', { name: 'Modificati in questa sessione' }).click();
  await expect(page.locator('#fileVistaNome')).toHaveText('Modificati in questa sessione');
  await expect(page.locator('#alberoFile')).toBeHidden();
  await expect(page.locator('#fileModificati')).toBeVisible();
  await expect(page.locator('#fileConteggio')).toHaveText('2 file');
  const righe = await page.locator('#fileModificati .talos-kv__k').allTextContents();
  expect(righe.sort()).toEqual(['src/registro.mjs', 'tests/registro.test.mjs']);
  await expect(page.locator('#fileTreeFilter'), 'la ricerca lavora sull’albero: fuori dall’albero non si offre').toBeHidden();

  let chiesto = null;
  await page.route('**/api/v1/sessions/po30-*/tree/file?*', (r) => { chiesto = new URL(r.request().url()).searchParams.get('percorso'); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { contenuto: 'uno\n', troncato: false } }) }); });
  await page.locator('#fileModificati .talos-kv', { hasText: 'src/registro.mjs' }).click();
  await expect.poll(() => chiesto, { message: 'il clic sulla riga deve aprire QUEL file' }).toBe('src/registro.mjs');

  await page.keyboard.press('Escape');
  await page.locator('#railTabs [data-rail="file"]').click();
  await page.locator('#fileVista').click();
  await page.getByRole('menuitem', { name: 'Tutti i file' }).click();
  await expect(page.locator('#alberoFile')).toBeVisible();
  await expect(page.locator('#fileTreeFilter')).toBeVisible();
});

for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
  for (const tema of ['dark', 'light']) {
    test(`PO30-FILE-FOTO ${larghezza}x${altezza} ${tema}`, async ({ page }) => {
      await scena(page, { larghezza, altezza, tema });
      await page.locator('#alberoFile .ft-row-folder', { hasText: 'src' }).click();
      await page.locator('#alberoFile .ft-row-folder', { hasText: 'tests' }).click();
      await page.waitForTimeout(300);
      mkdirSync(FOTO, { recursive: true });
      await page.screenshot({ path: join(FOTO, `file-${larghezza}x${altezza}-${tema}.png`) });
      const sfonda = await page.evaluate(() => { const p = document.querySelector('#railFile'); return p.scrollWidth > p.clientWidth + 1; });
      expect(sfonda, 'la scheda File non sfonda la colonna in larghezza').toBe(false);
    });
  }
}
