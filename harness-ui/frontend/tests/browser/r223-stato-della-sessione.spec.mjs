import { expect, test } from '@playwright/test';

import { CONFINE, attendiFineStoria } from './aiuto-confine.mjs';

/*
 * Righe 223-224 (owner 22/11/2026, 16:56): «Se inizio una nuova sessione non rimane altro di un'altra sessione […] deve essere legata a
 *   QUELLA sessione». Nata dalla 223: al primo messaggio di una chat nuova il modello parlava di una scheda del Browser che la persona
 *   non aveva aperto lì (la pagina della chat di prima viaggiava in `paginaBrowser`).
 * Le prove, nei due versi:
 *   R223-01  la pagina di A non va col primo messaggio di B; tornando ad A torna la SUA pagina.
 *   R223-02  AL CONTRARIO: la pagina aperta nella chat in attesa va col suo primo messaggio (il primo invio non cambia chat).
 *   R224-03  P2-P8: lo stato della pagina legato ad A non resta nella chat nuova.
 *   R224-D1  aprire una chat in Accesso pieno non lo rende il predefinito della chat nuova; AL CONTRARIO un cambio a mano sì.
 * ⛔ Ogni richiesta che non è GET si ferma, tranne la nascita della chat (`/sessions/custom`), servita qui: nessun giro vero.
 */
test.use({ locale: 'it-IT' });
const CHIAVE = 'talos.harness.desktop.settings.v1';
const MODELLO = 'z-ai/glm-5.3-flash';
const flusso = (eventi) => `retry: 3600000\n${[...eventi.map((e, i) => ({ ...e, _sequenza: i + 1 })), CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;

async function prepara(page) {
  const nascite = [];
  await page.route('**/api/v1/**', (route) => (route.request().method() === 'GET' ? route.fallback() : route.abort()));
  await page.route('**/api/v1/sessions/custom', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    nascite.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: `r223-nata-${nascite.length}` }) });
  });
  await page.route('**/api/v1/sessions/r223-*/events*', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: flusso([{ type: 'RunStarted', input: { consegna: 'ciao' }, contesto: { modello: MODELLO } }, { type: 'RunFinished' }]) }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  return nascite;
}
const apriA = async (page, impostazioni = {}) => {
  await page.evaluate(([m, imp]) => window.__talosHarnessUiRuntime.passaASessione('r223-a', 'r223-a', 'Chat A', m, { conclusa: true, modello: m, ...imp }), [MODELLO, impostazioni]);
  await attendiFineStoria(page);
};
const paginaNellaChat = (page, url) => page.evaluate((u) => {
  const rs = window.__talosHarnessUiRuntime.realSessionState;
  rs.browserVive.push({ id: 'viva-r223', tipo: 'viva', origine: 'tu', url: u, titolo: 'Pagina finta', quando: new Date().toISOString(), stato: 'pronta', viaVista: 'cornice' });
  rs.browserAttiva = 'viva-r223';
}, url);
const vediIlBrowser = async (page) => {
  await page.locator('header, .topbar, body').getByRole('tab', { name: 'Browser', exact: true }).or(page.getByRole('button', { name: 'Browser', exact: true })).first().click();
  await page.locator('#schermoBrowser').waitFor({ state: 'visible', timeout: 5_000 });
};
/* Le foto per l'occhio (e per il cancello del commit): solo se `R223_FOTO` dice dove. */
const foto = async (page, nome) => { if (process.env.R223_FOTO) await page.screenshot({ path: `${process.env.R223_FOTO}/r223-${nome}.png` }); };
const chatNuova = (page) => page.evaluate((m) => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaLibera: 'C:/T/finto-r223-025/progetto', nomeCartella: 'progetto', modello: m, permessi: 'Workspace write' }), MODELLO);
async function primoMessaggio(page, nascite) {
  const prima = nascite.length;
  await page.evaluate(() => window.__talosHarnessUiRuntime.submitPrompt('ciao'));
  await expect.poll(() => nascite.length, { timeout: 10_000 }).toBe(prima + 1);
  return nascite.at(-1);
}

test('R223-01 — la pagina del Browser di A non va col primo messaggio di B, e torna con A', async ({ page }) => {
  const nascite = await prepara(page);
  await apriA(page);
  await paginaNellaChat(page, 'http://127.0.0.1:4601/pagina-a.html');
  await chatNuova(page);
  await vediIlBrowser(page);
  await expect(page.locator('#browserSchede [data-browser-id="viva-r223"]'), 'la striscia del Browser della chat nuova non mostra la pagina di A').toHaveCount(0);
  await foto(page, '01a-chat-nuova-browser');
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.browserVive.length), 'la chat nuova non ha le schede di A').toBe(0);
  const corpo = await primoMessaggio(page, nascite);
  expect(corpo.paginaBrowser, 'il primo messaggio della chat nuova non porta la pagina di A').toBeNull();
  await apriA(page);
  const tornata = await page.evaluate(() => { const rs = window.__talosHarnessUiRuntime.realSessionState; return { url: rs.browserVive.map((x) => x.url), attiva: rs.browserAttiva }; });
  expect(tornata, 'tornando ad A torna la SUA pagina').toEqual({ url: ['http://127.0.0.1:4601/pagina-a.html'], attiva: 'viva-r223' });
  await vediIlBrowser(page);
  await expect(page.locator('#browserSchede [data-browser-id="viva-r223"]'), 'la striscia del Browser di A la mostra').toHaveCount(1);
  await foto(page, '01b-chat-a-tornata-browser');
});

test('R223-02 AL CONTRARIO — la pagina aperta nella chat in attesa va col suo primo messaggio', async ({ page }) => {
  const nascite = await prepara(page);
  await chatNuova(page);
  await paginaNellaChat(page, 'http://127.0.0.1:4601/pagina-b.html');
  const corpo = await primoMessaggio(page, nascite);
  expect(corpo.paginaBrowser?.url).toBe('http://127.0.0.1:4601/pagina-b.html');
});

const salvato = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')?.chat?.permissions ?? null, CHIAVE);
const permessoDellaFinestraNuova = async (page) => {
  await page.evaluate(() => window.__talosHarnessUiRuntime.openRealTaskSheet());
  const scelto = page.locator('[data-workspace-permission][aria-pressed="true"]');
  await scelto.first().waitFor({ timeout: 10_000 });
  const valore = await scelto.first().getAttribute('data-workspace-permission');
  await scelto.first().scrollIntoViewIfNeeded();
  await foto(page, `d1-finestra-nuova-${valore.replace(/\s+/gu, '-')}`);
  await page.keyboard.press('Escape');
  return valore;
};

test('R224-D1 — aprire una chat in Accesso pieno non la rende il predefinito della chat nuova', async ({ page }) => {
  await prepara(page);
  const predefinito = await salvato(page);
  await apriA(page, { permessi: 'Full access', modalitaOperativa: 'piano' });
  expect(await salvato(page), 'aprire A non scrive il predefinito').not.toBe('Full access');
  expect(await salvato(page)).toBe(predefinito);
  expect(await permessoDellaFinestraNuova(page), 'la finestra della chat nuova parte dal predefinito').not.toBe('Full access');
});

test('R224-D1 AL CONTRARIO — un cambio a mano del selettore resta il predefinito', async ({ page }) => {
  await prepara(page);
  await apriA(page, { permessi: 'Full access' });
  await page.evaluate(() => window.__talosHarnessUiRuntime.executeCommand('permissions'));
  await page.locator('[data-permission-choice="Read only"]').first().click();
  await expect.poll(() => salvato(page)).toBe('Read only');
  expect(await permessoDellaFinestraNuova(page)).toBe('Read only');
});

test('R224-03 — lo stato della pagina legato ad A (P2-P8) non resta nella chat nuova', async ({ page }) => {
  await prepara(page);
  await apriA(page);
  await page.evaluate(() => {
    const rs = window.__talosHarnessUiRuntime.realSessionState;
    rs.browserRichiesta = { requestId: 'r-a', url: 'http://127.0.0.1:4601/x' };
    rs.rileggiDopoIlGiro = 'r223-a';
    rs.serverLocali = new Map([[4602, { porta: 4602, stato: 'pronto' }]]);
    rs.permessiDelGiro = 'Full access';
    rs.statoDaRiprendere = { tipo: 'fermato' };
    rs.toolCallNomi = new Map([['t-a', 'shell']]);
    rs.comandiNellaConversazione = true; rs.doveGiranoIComandi = 'altrove';
  });
  await chatNuova(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime.syncRunComposerState());
  await foto(page, '03-chat-nuova-riprendi');
  const b = await page.evaluate(() => {
    const rs = window.__talosHarnessUiRuntime.realSessionState;
    return { richiesta: rs.browserRichiesta, rileggi: rs.rileggiDopoIlGiro, server: rs.serverLocali.size, permessi: rs.permessiDelGiro ?? null,
      riprendi: rs.statoDaRiprendere ?? null, attrezzi: rs.toolCallNomi.size, comandi: rs.comandiNellaConversazione === true, dove: rs.doveGiranoIComandi ?? null };
  });
  expect(b).toEqual({ richiesta: null, rileggi: null, server: 0, permessi: null, riprendi: null, attrezzi: 0, comandi: false, dove: null });
});
