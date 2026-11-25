import { expect, test } from '@playwright/test';

import { CONFINE, attendiFineStoria } from './aiuto-confine.mjs';

/*
 * Righe 223-224, giro unico (giudice v2624/v2627; revisori A RA-01..03 e B B-04/B-05, 23/11/2026): D1 chiudeva la finestra «Nuova
 *   sessione», ma le altre porte di una chat nuova spedivano ancora `state.*`, cioè la chat aperta — Accesso pieno compreso. E un cambio
 *   a mano di UN campo salvava come predefinito tutto lo stato della chat aperta.
 * Ogni prova apre A in Accesso pieno + Piano + shell «sempre», poi passa da una porta e legge il POST del primo invio, non la pillola.
 * ⛔ Ogni richiesta non-GET si ferma, tranne la nascita della chat (`/sessions/custom`), servita qui. `/projects` dice UN progetto.
 */
test.use({ locale: 'it-IT' });
const CHIAVE = 'talos.harness.desktop.settings.v1';
const MODELLO = 'z-ai/glm-5.3-flash';
const A = { permessi: 'Full access', modalitaOperativa: 'piano', permessiPerAttrezzo: { shell: 'sempre' } };
const flusso = (eventi) => `retry: 3600000\n${[...eventi.map((e, i) => ({ ...e, _sequenza: i + 1 })), CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;

async function prepara(page) {
  const nascite = [];
  if (process.env.R224_DIAGNOSI) { page.on('pageerror', (e) => console.log('PAGEERROR', e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('CONSOLE', m.text().slice(0, 200)); }); page.on('request', (r) => { if (r.url().includes('/api/v1/') && !r.url().includes('/events')) console.log('REQ', r.method(), r.url()); }); }
  await page.route('**/api/v1/**', (route) => (route.request().method() === 'GET' ? route.fallback() : route.abort()));
  await page.route('**/api/v1/projects*', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'p-r224', nome: 'progetto' }] }) }) : route.fallback()));
  /* in Accesso pieno il primo invio chiede prima la fiducia nella cartella (decisioni 173/189/196): qui è già data, così il POST si legge */
  await page.route('**/api/v1/folder-trust*', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fidata: true }) }) : route.fallback()));
  await page.route('**/api/v1/sessions/custom', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    nascite.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: `r224-nata-${nascite.length}` }) });
  });
  await page.route('**/api/v1/sessions/r22*/events*', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: flusso([{ type: 'RunStarted', input: { consegna: 'ciao' }, contesto: { modello: MODELLO } }, { type: 'RunFinished' }]) }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime?.porteChatNuova);
  if (process.env.R224_DIAGNOSI) console.log('PROGETTI', await page.evaluate(() => fetch('/api/v1/projects').then((r) => r.text())));
  const predefinito = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')?.chat ?? {}, CHIAVE);
  await page.evaluate(([m, a]) => window.__talosHarnessUiRuntime.passaASessione('r224-a', 'r224-a', 'Chat A', m, { conclusa: true, modello: m, ...a }), [MODELLO, A]);
  await attendiFineStoria(page);
  return { nascite, predefinito };
}
async function primoInvio(page, nascite, fai) {
  const prima = nascite.length;
  await fai();
  await expect.poll(() => nascite.length, { timeout: 10_000 }).toBe(prima + 1);
  return nascite.at(-1);
}
const nonDiA = (corpo, predefinito) => {
  expect(corpo.permessi, 'il primo invio non porta l\'Accesso pieno della chat aperta').not.toBe('Full access');
  if (predefinito.permissions) expect(corpo.permessi, 'porta il predefinito salvato').toBe(predefinito.permissions);
  expect(corpo.modalitaOperativa ?? 'normale', 'né il suo Piano').not.toBe('piano');
  expect(corpo.permessiPerAttrezzo?.shell, 'né la sua shell «sempre»').toBeUndefined();
};
const invia = (page, testo) => page.evaluate((t) => window.__talosHarnessUiRuntime.submitPrompt(t), testo);

test('R224-PORTA-RADICE — «Usa come radice» nasce dal predefinito', async ({ page }) => {
  const { nascite, predefinito } = await prepara(page);
  const corpo = await primoInvio(page, nascite, async () => {
    await page.evaluate(() => window.__talosHarnessUiRuntime.porteChatNuova.avviaComeNuovaRadice('C:/T/finto-r223-025/progetto', 'progetto'));
    await invia(page, 'ciao');
  });
  nonDiA(corpo, predefinito);
});

test('R224-PORTA-RICERCA — «Nuova ricerca» nasce dal predefinito', async ({ page }) => {
  const { nascite, predefinito } = await prepara(page);
  /* la ricerca nasce nel progetto della conversazione aperta (`progettoDellaConversazioneAperta`), come nella prova RA-02 del revisore A */
  await page.evaluate(() => { window.__talosHarnessUiRuntime.realSessionState.cartellaBase = 'C:/T/finto-r223-025/progetto'; });
  const corpo = await primoInvio(page, nascite, () => page.evaluate(() => window.__talosHarnessUiRuntime.porteChatNuova.avviaRicercaDallaSezione({ domanda: 'una domanda', profondita: 'rapida' })));
  nonDiA(corpo, predefinito);
});
/* «Un solo progetto» (`avviaSessioneImplicitaSeUnaSolaCartella`): con la pagina finta il primo invio non parte (misurato tre volte, causa
   non trovata): la sua porta la tiene la prova sul sorgente `tests/unit/r224-porte-dal-predefinito.test.mjs`. */

test('R224-PORTA-PENDENTE (B-04) — una chat in attesa spedisce i permessi con cui è nata, anche col /goal', async ({ page }) => {
  const { nascite } = await prepara(page);
  for (const testo of ['ciao', '/goal finisci il compito']) {
    await page.evaluate((m) => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaLibera: 'C:/T/finto-r223-025/progetto', nomeCartella: 'progetto', modello: m, permessi: 'Read only' }), MODELLO);
    const corpo = await primoInvio(page, nascite, () => invia(page, testo));
    expect(corpo.permessi, `${testo}: i permessi della chat in attesa`).toBe('Read only');
    expect(corpo.modalitaOperativa ?? 'normale', `${testo}: non il Piano della chat aperta`).not.toBe('piano');
    await page.evaluate(([m, a]) => window.__talosHarnessUiRuntime.passaASessione('r224-a', 'r224-a', 'Chat A', m, { conclusa: true, modello: m, ...a }), [MODELLO, A]);
    await attendiFineStoria(page);
  }
});

test('R224-PORTA-CIELO — il cielo (anche come «Nuova sessione») propone il predefinito, non l\'accesso della chat aperta', async ({ page }) => {
  const { predefinito } = await prepara(page);
  const iniziale = await page.evaluate(() => window.__talosHarnessUiRuntime.porteChatNuova.inizialeDelCielo());
  expect(iniziale.accesso).not.toBe('Full access');
  if (predefinito.permissions) expect(iniziale.accesso).toBe(predefinito.permissions);
});

test('R224-B05 — un cambio a mano del SOLO modo non salva il permesso della chat aperta', async ({ page }) => {
  const { predefinito } = await prepara(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime.executeCommand('permissions'));
  const modo = page.locator('[data-work-mode-select]').first();
  await modo.waitFor({ timeout: 10_000 });
  await modo.selectOption('normale');
  await page.evaluate(() => new Promise((fatto) => setTimeout(fatto, 300)));
  const salvato = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')?.chat ?? {}, CHIAVE);
  expect(salvato.permissions, 'il permesso salvato non è quello della chat aperta').not.toBe('Full access');
  if (predefinito.permissions) expect(salvato.permissions).toBe(predefinito.permissions);
  expect(salvato.permessiPerAttrezzo?.shell, 'né la sua shell «sempre»').toBeUndefined();
});

/* Desktop, mutante MD1 (23/11/2026, sopravvissuto alle prove dell'autore): il salvataggio di UN campo deve tenere gli ALTRI campi già
   salvati a mano. Col predefinito di serie la prova sopra non lo vede (il campo perso torna al valore di serie, che è lo stesso). */
test('R224-B05-TIENE — un cambio a mano del SOLO modo tiene il permesso, il modello e gli attrezzi salvati prima a mano', async ({ page }) => {
  const SALVATO = { permissions: 'Read only', model: MODELLO, permessiPerAttrezzo: { scrivi: 'chiedi' } };
  await page.addInitScript(([k, s]) => {
    if (sessionStorage.getItem('r224-seminato')) return;
    sessionStorage.setItem('r224-seminato', '1');
    const d = JSON.parse(localStorage.getItem(k) || '{}');
    d.chat = { ...(d.chat || {}), ...s };
    localStorage.setItem(k, JSON.stringify(d));
  }, [CHIAVE, SALVATO]);
  const { predefinito } = await prepara(page);
  expect(predefinito.permissions, 'premessa: il predefinito seminato è stato letto').toBe('Read only');
  await page.evaluate(() => window.__talosHarnessUiRuntime.executeCommand('permissions'));
  const modo = page.locator('[data-work-mode-select]').first();
  await modo.waitFor({ timeout: 10_000 });
  await modo.selectOption('normale');
  await page.evaluate(() => new Promise((fatto) => setTimeout(fatto, 300)));
  const salvato = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}')?.chat ?? {}, CHIAVE);
  expect(salvato.modalitaOperativa, 'premessa: il modo scelto a mano è salvato').toBe('normale');
  expect(salvato.permissions, 'il permesso salvato prima resta').toBe('Read only');
  expect(salvato.model, 'il modello salvato prima resta').toBe(MODELLO);
  expect(salvato.permessiPerAttrezzo, 'gli attrezzi salvati prima restano').toEqual({ scrivi: 'chiedi' });
});

/* Le foto per il Tester e per l'occhio (solo con `R223_FOTO`): chat nuova dalla radice e dal cielo, partendo da A in Accesso pieno. */
for (const tema of ['light', 'dark']) {
  test(`R224-FOTO-${tema} — radice e cielo dopo una chat in Accesso pieno`, async ({ page }) => {
    test.skip(!process.env.R223_FOTO, 'solo per le foto');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await prepara(page);
    const tinta = (t) => page.evaluate((x) => { if (x === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme'); }, t);
    await tinta(tema);
    await page.evaluate(() => window.__talosHarnessUiRuntime.porteChatNuova.avviaComeNuovaRadice('C:/T/finto-r223-025/progetto', 'progetto'));
    await tinta(tema);
    await page.screenshot({ path: `${process.env.R223_FOTO}/r224-radice-${tema}.png` });
    await page.evaluate(([m, a]) => window.__talosHarnessUiRuntime.passaASessione('r224-a', 'r224-a', 'Chat A', m, { conclusa: true, modello: m, ...a }), [MODELLO, A]);
    await attendiFineStoria(page);
    await page.evaluate(() => { const k = 'talos.harness.desktop.settings.v1'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.appearance = { ...(d.appearance || {}), newSessionView: 'sky' }; localStorage.setItem(k, JSON.stringify(d)); });
    await tinta(tema);
    await page.evaluate(() => window.__talosHarnessUiRuntime.executeCommand('new'));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${process.env.R223_FOTO}/r224-cielo-${tema}.png` });
  });
}
