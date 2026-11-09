/*
 * Decision 399 (08/11/2026): «Open on the side» of a block in a REAL chat (turns drawn by `legacy/app.js` from the server events, the
 * right column renamed by the bridge `#inspectorSessione` → `#inspectorPanel`). Before the cure the side view never opened: `app.js`
 * looked the column up by the old name and `viste.js` fell back to the full screen. The opposite checks the judge asked for:
 *   - the full screen stays reachable, from the block menu «⋯» and from the side view;
 *   - the side view does not break the tabs of the column (context, files, git, agents, processes, aside) and closing it brings back
 *     the tab that was open before;
 *   - one click on a choice in the side view sends the choice once.
 * Guard: every non-GET request is STOPPED and counted; the only one that gets an answer is the message of this fake session.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { preparaCartellaFoto } from '../aiuto/cartella-foto.mjs';

const ID = 'chat-a-lato-399';
const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';
const IMPOSTAZIONI = (modoColore) => JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: modoColore }, chat: {}, workspaces: {} });
const SCELTE = 'root = Scelte("prossimo", "Prossimo passo", "Come vuoi procedere?", [{testo: "Continua"}, {testo: "Fermati qui"}])';
const RECINTO = `Ecco:\n\n\`\`\`talos-blocco\n${SCELTE}\n\`\`\`\n\nDimmi tu.`;
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const SCHEDE = ['contesto', 'file', 'github', 'agenti', 'processi', 'lato'];

const pezzi = (testo, n = 14) => { const fuori = []; for (let i = 0; i < testo.length; i += n) fuori.push(testo.slice(i, i + n)); return fuori; };
const turno = (i, testo) => [
  { type: 'RunStarted', threadId: ID, runId: `r${i}`, input: { consegna: `Domanda ${i}` } },
  { type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' },
  ...pezzi(testo).map((delta) => ({ type: 'TextMessageContent', messageId: `m${i}`, delta })),
  { type: 'TextMessageEnd', messageId: `m${i}` },
  { type: 'RunFinished', threadId: ID, runId: `r${i}`, outcome: { type: 'success' } },
];
const versione = (nome, messaggio) => ({ type: 'CUSTOM', name: 'talos.blocco.versione', value: { blocco: nome, versione: 1, sorgente: SCELTE, messaggio, posizione: 0, quando: '2026-11-08T00:00:00.000Z' } });
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);

async function prepara(page, modoColore) {
  page.inviati = [];
  page.percorsi = [];
  page.fermati = [];
  page.errori = [];
  page.on('pageerror', (e) => page.errori.push(String(e.message)));
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.fallback();
    if (new URL(req.url()).pathname.startsWith(`/api/v1/sessions/${ID}`)) {
      page.inviati.push(req.postDataJSON?.() ?? req.postData());
      page.percorsi.push(`${req.method()} ${new URL(req.url()).pathname}`);
      return route.fulfill({ json: { ok: true, data: {} } });
    }
    page.fermati.push(`${req.method()} ${req.url()}`);
    return route.abort();
  });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* stays pending: the test hands the events */ });
  await page.addInitScript(([chiave, valore]) => { try { localStorage.setItem(chiave, valore); } catch { /* no storage */ } }, [CHIAVE_IMPOSTAZIONI, IMPOSTAZIONI(modoColore)]);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'A lato', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
  }, ID);
  await manda(page, [...turno(1, RECINTO), versione('b1', 'm1'), CONFINE]);
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
  await expect(page.locator('#conversation .gu')).toHaveCount(1);
}

/* The chat scrolls by itself after a turn, and any scroll closes the block menu (`menu-del-blocco.js`, R-10): the menu is opened when the
   page has stopped moving (same scroll positions over two animation frames). */
async function fermo(page) {
  await expect.poll(() => page.evaluate(() => new Promise((fine) => {
    const posizioni = () => [...document.querySelectorAll('*')].filter((n) => n.scrollHeight > n.clientHeight).map((n) => n.scrollTop).join(',');
    const prima = posizioni();
    requestAnimationFrame(() => requestAnimationFrame(() => fine(posizioni() === prima)));
  })), { message: 'the page stops scrolling' }).toBe(true);
}
async function voceDelMenu(page, blocco, testo) {
  await blocco.scrollIntoViewIfNeeded();
  await fermo(page);
  await blocco.locator('button[aria-haspopup="menu"]').click();
  await page.locator('#menuDelBlocco [role="menuitem"]', { hasText: testo }).click();
}
const scheda = (page, nome) => page.locator(`#inspectorPanel [data-rail="${nome}"]`);
const schedaAperta = (page) => page.evaluate(() => {
  const tab = document.querySelector('#inspectorPanel [role="tab"][aria-selected="true"]');
  const pannello = tab && document.getElementById(tab.getAttribute('aria-controls'));
  return { rail: tab?.dataset.rail ?? null, pannelloVisibile: Boolean(pannello && !pannello.hidden && pannello.getClientRects().length) };
});

test.use({ viewport: { width: 1280, height: 860 } });

for (const modoColore of ['light', 'dark']) {
  test(`BLOCCHI-A-LATO-399 the side view opens in the right column; the full screen stays reachable from the menu and from the side view, ${modoColore}`, async ({ page }) => {
    await prepara(page, modoColore);
    const blocco = page.locator('#conversation .gu').first();
    /* the full screen from the menu «⋯», as before */
    await voceDelMenu(page, blocco, 'Tutto schermo');
    await expect(page.locator('.gu-schermo')).toBeVisible();
    await expect(page.locator('.gu-lato')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.gu-schermo')).toHaveCount(0);
    /* «Open on the side»: the side view, in the right column, and no full screen */
    await voceDelMenu(page, blocco, 'Apri a lato');
    const lato = page.locator('#inspectorPanel > .gu-lato');
    await expect(lato).toBeVisible();
    await expect(page.locator('.gu-schermo')).toHaveCount(0);
    const cartella = await preparaCartellaFoto('blocchi-a-lato');
    await page.screenshot({ path: join(cartella, `a-lato-${modoColore}.png`) });
    /* the full screen from the side view */
    await lato.locator('.gu-lato__testa button', { hasText: 'Tutto schermo' }).click();
    const schermo = page.locator('.gu-schermo');
    await expect(schermo).toBeVisible();
    /* and back to the side from the full screen: one side view, no full screen */
    await schermo.locator('.gu-schermo__testa button', { hasText: 'Apri a lato' }).click();
    await expect(page.locator('.gu-schermo')).toHaveCount(0);
    await expect(page.locator('.gu-lato')).toHaveCount(1);
    expect(page.inviati, 'opening views sends nothing').toEqual([]);
    expect(page.errori, 'no runtime error').toEqual([]);
  });

  test(`BLOCCHI-A-LATO-399 the side view leaves the six tabs of the column alone and closing it brings back the tab of before, ${modoColore}`, async ({ page }) => {
    await prepara(page, modoColore);
    await expect(scheda(page, 'file')).toBeVisible();
    await scheda(page, 'file').click();
    await expect.poll(() => schedaAperta(page)).toEqual({ rail: 'file', pannelloVisibile: true });
    await voceDelMenu(page, page.locator('#conversation .gu').first(), 'Apri a lato');
    const lato = page.locator('#inspectorPanel > .gu-lato');
    await expect(lato).toBeVisible();
    /* under the side view the tabs are still there, the selected one unchanged */
    for (const nome of SCHEDE) await expect(scheda(page, nome)).toHaveCount(1);
    expect((await schedaAperta(page)).rail).toBe('file');
    await lato.locator('.gu-lato__testa button', { hasText: 'Chiudi' }).click();
    await expect(page.locator('.gu-lato')).toHaveCount(0);
    expect(await schedaAperta(page), 'the tab of before is back').toEqual({ rail: 'file', pannelloVisibile: true });
    /* every tab still works after the side view */
    for (const nome of SCHEDE) {
      await scheda(page, nome).click();
      await expect.poll(() => schedaAperta(page), { message: `tab ${nome}` }).toEqual({ rail: nome, pannelloVisibile: true });
    }
    expect(page.errori, 'no runtime error').toEqual([]);
  });

  test(`BLOCCHI-A-LATO-399 one click on a choice in the side view sends it once, ${modoColore}`, async ({ page }) => {
    await prepara(page, modoColore);
    const blocco = page.locator('#conversation .gu').first();
    await voceDelMenu(page, blocco, 'Apri a lato');
    const lato = page.locator('#inspectorPanel > .gu-lato');
    await expect(lato).toBeVisible();
    const bolle = () => page.inviati.filter((c) => c?.bolla?.blocco).map((c) => c.bolla);
    await lato.locator('.gu-scelte button', { hasText: 'Continua' }).click();
    await expect.poll(() => bolle().length).toBe(1);
    expect(bolle()[0].blocco.chiave).toBe('nome:b1@m1#prossimo');
    /* the same block in line: chosen, locked; a second click there and one in the side view send nothing more */
    const inLinea = (testo) => blocco.locator('.gu-scelte button', { hasText: testo });
    await expect(inLinea('Continua')).toHaveAttribute('aria-pressed', 'true');
    await expect(inLinea('Fermati qui')).toHaveAttribute('aria-disabled', 'true');
    await inLinea('Fermati qui').click({ force: true, timeout: 1000 }).catch(() => {});
    await lato.locator('.gu-scelte button', { hasText: 'Continua' }).click({ force: true, timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(500);
    expect(bolle().length, 'one choice, one message').toBe(1);
    /* the message goes out with `messaggio` (`/resume` or `/queue`, `legacy/app.js`); other writes of the session are not a message */
    const messaggi = page.inviati.filter((c) => typeof c?.messaggio === 'string');
    expect(messaggi.length, `one message in all (${page.percorsi.join(' · ')})`).toBe(1);
    test.info().annotations.push({ type: 'session writes', description: page.percorsi.join(' · ') });
    expect(page.errori, 'no runtime error').toEqual([]);
  });
}
