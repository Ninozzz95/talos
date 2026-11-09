import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { modelloDelPiano, ragionamentoDelPiano } from '../../../src/chatgpt-rotte.mjs';
import { filoRagionamentoDiretti, livelliRagionamentoDiretti } from '../../../src/model-destination.mjs';

/*
 * FE-047 — l'interruttore della modalità veloce nel compositore del PC (owner 31/10/2026, strada A del fulmine 01/11).
 * Il catalogo finto nasce dalla funzione vera del server (`modelloDelPiano`), dai campi che OpenAI manda; la scrittura di `/settings` ripete
 * `aggiornaImpostazioni` (`session-registry.mjs`): spegne da sola su un modello senza fascia, e un cambio che non cambia niente
 * NON fa avanzare la versione. Ogni altra scrittura si ferma e si conta. Nessuna chiamata a un modello.
 * ⛔ Due forme con lo stesso nome: sui modelli `fasciaVeloce` è `{ id, descrizione }`, sulle sessioni è vero o falso.
 */
const FOTO = process.env.TALOS_FOTO_VELOCE || path.resolve(fileURLToPath(new URL('../../artifacts/modalita-veloce/', import.meta.url)));
const fascia = (description) => [{ id: 'priority', name: 'Fast', description }];
const grezzo = (slug, extra = {}) => ({ slug, display_name: slug, visibility: 'list', context_window: 272000, input_modalities: ['text'],
  supported_reasoning_levels: ['low', 'medium', 'high', 'xhigh'], default_reasoning_level: 'medium', ...extra });
const PIANO = [
  grezzo('gpt-6-luna', { service_tiers: fascia('1.5x speed') }),
  grezzo('gpt-6.1-sol', { service_tiers: fascia('2x speed, increased usage') }),
  grezzo('gpt-5.6-terra', { service_tiers: fascia('1.5x speed, increased usage') }),
  grezzo('gpt-7-nuovo', { service_tiers: fascia('3x speed, brand new') }),
  grezzo('gpt-5-senza'),
].map(modelloDelPiano);
const LUNA = 'chatgpt:gpt-6-luna', SOL = 'chatgpt:gpt-6.1-sol', TERRA = 'chatgpt:gpt-5.6-terra', NUOVO = 'chatgpt:gpt-7-nuovo', SENZA = 'chatgpt:gpt-5-senza', GLM = 'z-ai/glm-5.3-flash';
const COSTO = { it: 'OpenAI dichiara limiti consumati 2,5 volte più in fretta.', en: 'OpenAI states that limits are used up 2.5 times faster.' };
const AVVISO = { it: 'Modalità veloce spenta: questo modello non la supporta.', en: 'Fast mode off: this model does not support it.' };
const RAGIONAMENTO_PIANO = ragionamentoDelPiano(PIANO);

const sessione = (sessionId, modello, extra = {}) => ({ sessionId, taskId: 'libero:default', nome: sessionId, avviataAlle: '2026-11-01T07:00:00.000Z', conclusa: true,
  modello, modelId: modello, provider: 'cloud', fasciaVeloce: false, versioneImpostazioni: 1, ...extra });
const istantanea = (s) => ({ modello: s.modello, modelId: s.modello, provider: 'cloud', runtimeId: null, modelloPlanner: null, reasoning: s.reasoning ?? null,
  fasciaVeloce: s.fasciaVeloce === true, permessi: 'Workspace write', permessiPerAttrezzo: {}, modalitaOperativa: 'normale', fallbackProviders: [],
  doveGiranoIComandi: null, comandiNellaConversazione: false, nome: s.nome, versione: s.versioneImpostazioni });
const fasciaDi = (id) => PIANO.find((m) => m.id === id)?.fasciaVeloce ?? null;

async function apri(page, { sessioni = [sessione('a', LUNA)], lingua = 'it', modo = 'dark', collegato = true, catalogo = PIANO, settingsRotto = false, extraModelli = {}, eventiDopo = () => [] } = {}) {
  const stato = { impostazioni: [], avvii: [], avviiTask: [], scritture: [], sessioni: new Map(sessioni.map((s) => [s.sessionId, s])) };
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (!sessionStorage.getItem('prova-preparata')) { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } })); sessionStorage.setItem('prova-preparata', 'si'); }
  }, { colorMode: modo, uiLanguage: lingua });
  await page.route('**/api/**', (rotta) => {
    const r = rotta.request();
    if (r.method() === 'GET') return rotta.fallback();
    stato.scritture.push(`${r.method()} ${new URL(r.url()).pathname}`);
    return rotta.abort();
  });
  await page.route('**/api/v1/sessions', (route) => {
    if (route.request().method() === 'POST') {
      const corpo = route.request().postDataJSON();
      stato.avviiTask.push(corpo);
      const nuova = sessione(`task-${stato.avviiTask.length}`, corpo.modello, { fasciaVeloce: corpo.fasciaVeloce === true });
      stato.sessioni.set(nuova.sessionId, nuova);
      return route.fulfill({ json: { ok: true, data: { sessionId: nuova.sessionId } } });
    }
    if (stato.elencoInViaggio) return undefined; // la rilettura dell'elenco non torna: vale solo ciò che la pagina ha già in mano
    return route.fulfill({ json: { ok: true, data: { items: [...stato.sessioni.values()] } } });
  });
  await page.route('**/api/v1/sessions/*/events*', (route) => {
    const dopo = eventiDopo(stato, decodeURIComponent(new URL(route.request().url()).pathname.split('/')[4]));
    return route.fulfill({ contentType: 'text/event-stream',
      body: `retry: 3600000\n${[{ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, ...dopo].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
  });
  await page.route('**/api/v1/auth/chatgpt/stato', (route) => route.fulfill({ json: { ok: true, data: { collegato, pianoAbilitato: collegato, email: 'prova@example.invalid' } } }));
  await page.route('**/api/v1/providers', (route) => route.fulfill({ json: { ok: true, data: { items: [] } } }));
  await page.route('**/api/v1/providers/chatgpt/models', (route) => (collegato
    ? route.fulfill({ json: { ok: true, data: { provider: 'chatgpt', modelli: catalogo } } })
    : route.fulfill({ status: 409, json: { ok: false, error: { code: 'CHATGPT_NON_COLLEGATO' } } })));
  await page.route('**/api/v1/models*', (route) => route.fulfill({ json: { ok: true, data: { modelli: [{ id: GLM, provider: 'z-ai', nome: 'GLM 5.3 Flash', reasoning: { supportedEfforts: ['high', 'low'], defaultEffort: 'high' } }], daCache: true,
    livelliDiretti: { ...livelliRagionamentoDiretti(), chatgpt: RAGIONAMENTO_PIANO.livelli }, filoDiretti: { ...filoRagionamentoDiretti(), chatgpt: RAGIONAMENTO_PIANO.filo }, filoCatalogo: {}, ...extraModelli } } }));
  await page.route('**/api/v1/sessions/*/settings', (route) => {
    const sid = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[4]);
    const patch = route.request().postDataJSON();
    stato.impostazioni.push({ sid, patch });
    if (settingsRotto) return route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL' } } });
    const s = stato.sessioni.get(sid);
    const modello = 'modello' in patch ? patch.modello : s.modello;
    let veloce = 'fasciaVeloce' in patch ? patch.fasciaVeloce === true : s.fasciaVeloce === true;
    if (veloce && !fasciaDi(modello)) veloce = false;
    if (modello !== s.modello || veloce !== s.fasciaVeloce || 'reasoning' in patch) {
      Object.assign(s, { modello, modelId: modello, fasciaVeloce: veloce, versioneImpostazioni: s.versioneImpostazioni + 1, ...('reasoning' in patch ? { reasoning: patch.reasoning } : {}) });
    }
    return route.fulfill({ json: { ok: true, data: { updated: true, istantanea: istantanea(s) } } });
  });
  await page.route('**/api/v1/sessions/custom', (route) => {
    const corpo = route.request().postDataJSON();
    stato.avvii.push(corpo);
    const nuova = sessione(`nuova-${stato.avvii.length}`, corpo.modello, { fasciaVeloce: corpo.fasciaVeloce === true && Boolean(fasciaDi(corpo.modello)) });
    stato.sessioni.set(nuova.sessionId, nuova);
    return route.fulfill({ json: { ok: true, data: { sessionId: nuova.sessionId } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  return stato;
}

const MENU = '#menuRagionamento';
const riga = (page) => page.locator(`${MENU} #veloceToggle`);
const nota = (page) => page.locator(`${MENU} #veloceNota`);
const chip = (page) => page.locator('#schermoChat [data-open-sheet="model"]');
const fulmine = (page) => chip(page).locator('.talos-chip__veloce');
const avviso = (page, lingua = 'it') => page.locator('.talos-toast', { hasText: AVVISO[lingua] });
const apriSessione = (page, id) => page.locator(`[data-real-session-id="${id}"]`).click();
const chatInAttesa = (page, modello = LUNA) => page.evaluate((m) => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'p1', nomeCartella: 'prova', modello: m }), modello);
async function apriMenu(page) {
  if (!(await page.locator(MENU).count())) await page.locator('#pillRagionamento').click();
  await expect(page.locator(MENU)).toBeVisible();
}
async function chiudiMenu(page) { if (await page.locator(MENU).count()) await page.keyboard.press('Escape'); await expect(page.locator(MENU)).toHaveCount(0); }
async function accendi(page) {
  await apriMenu(page);
  await expect(riga(page)).toBeVisible();
  await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
  await riga(page).click();
  await expect(riga(page), 'il menu resta aperto e si vede cambiare').toHaveAttribute('aria-checked', 'true');
  await chiudiMenu(page);
}
async function cambiaModello(page, modello, { fonte = 'chatgpt' } = {}) {
  await chip(page).click();
  await page.locator(`#veloModello [data-picker-source="${fonte}"]`).click();
  await page.locator(`#veloModello .model-picker-option[data-model-value="${modello}"]`).click();
  await page.locator('#veloModello .talos-dialog__footer [data-chiudi="veloModello"]').click();
  await expect(page.locator('#veloModello')).toBeHidden();
}
async function invia(page, testo) {
  await page.locator('#composerInput').fill(testo);
  await page.locator('#composerInput').press('Enter');
}

for (const lingua of ['it', 'en']) {
  test(`VELOCE-01 (${lingua}) — la riga c'è solo dove il catalogo dichiara la fascia, spenta di serie, con la frase del costo`, async ({ page }) => {
    const stato = await apri(page, { lingua, sessioni: [sessione('a', LUNA), sessione('b', SENZA), sessione('c', GLM)] });
    await apriSessione(page, 'a');
    await apriMenu(page);
    await expect(riga(page)).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
    await expect(riga(page)).toHaveText(lingua === 'it' ? 'Modalità veloce' : 'Fast mode');
    await expect(riga(page)).toHaveAttribute('aria-describedby', 'veloceNota');
    await expect(nota(page)).toContainText(COSTO[lingua]);
    await expect(page.locator(`${MENU} [role="menuitemcheckbox"]`)).toHaveCount(2);
    await expect(page.locator(`${MENU} [role="menuitemcheckbox"]`).last(), 'sotto «Mostra ragionamento», come nel bozzetto').toHaveId('veloceToggle');
    await chiudiMenu(page);
    await expect(fulmine(page)).toBeHidden();
    for (const id of ['b', 'c']) {
      await apriSessione(page, id);
      await apriMenu(page);
      await expect(page.locator(`${MENU} #showReasoningToggle`)).toBeVisible();
      await expect(riga(page), `${id}: il catalogo non la dichiara`).toHaveCount(0);
      await expect(nota(page)).toHaveCount(0);
      await chiudiMenu(page);
    }
    expect(stato.impostazioni).toEqual([]);
    expect(stato.scritture).toEqual([]);
  });
}

test('VELOCE-02 — senza account collegato la riga non c\'è e niente chiede il catalogo del piano', async ({ page }) => {
  const letture = [];
  page.on('request', (r) => { if (r.url().includes('/providers/chatgpt/models')) letture.push(r.url()); });
  await apri(page, { collegato: false });
  await apriSessione(page, 'a');
  await apriMenu(page);
  await expect(page.locator(`${MENU} #showReasoningToggle`)).toBeVisible();
  await expect(riga(page)).toHaveCount(0);
  expect(letture).toEqual([]);
});

for (const lingua of ['it', 'en']) {
  test(`VELOCE-03 (${lingua}) — chat già avviata: accendere e spegnere passano dalle impostazioni della sessione, e si vede il fulmine`, async ({ page }) => {
    const stato = await apri(page, { lingua });
    await apriSessione(page, 'a');
    await expect(chip(page)).toHaveAttribute('title', new RegExp(`${LUNA}$`, 'u'));
    const prima = await chip(page).getAttribute('title');
    await accendi(page);
    await expect.poll(() => stato.impostazioni).toEqual([{ sid: 'a', patch: { fasciaVeloce: true } }]);
    await expect.poll(() => stato.sessioni.get('a').fasciaVeloce).toBe(true);
    await expect(fulmine(page)).toBeVisible();
    await expect(chip(page)).toHaveAttribute('title', lingua === 'it' ? `Modalità veloce chiesta. ${COSTO.it}` : `Fast mode requested. ${COSTO.en}`);
    await expect(chip(page), 'nessuna parola sul chip').not.toContainText(lingua === 'it' ? 'Veloce' : 'Fast');
    await expect(chip(page).locator(':scope > [data-via-del-modello="chatgpt"]'), 'il logo resta').toHaveCount(1);
    await expect(chip(page).locator(':scope > [data-via-del-modello="chatgpt"]'), 'e la fotografia delle impostazioni non gli scrive dentro il nome').toHaveText('O');
    await expect(chip(page).locator('.talos-chip__label')).toHaveText('gpt-6-luna');
    await apriMenu(page);
    await riga(page).click();
    await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
    await chiudiMenu(page);
    await expect.poll(() => stato.impostazioni.at(-1)).toEqual({ sid: 'a', patch: { fasciaVeloce: false } });
    await expect.poll(() => stato.sessioni.get('a').fasciaVeloce).toBe(false);
    await expect(fulmine(page)).toBeHidden();
    await expect(chip(page)).toHaveAttribute('title', prima);
    expect(stato.scritture).toEqual([]);
  });
}

test('VELOCE-04 — il fulmine è quello deciso: 13 px, colore d\'accento, pieno, dopo il nome, e non cede mai', async ({ page }) => {
  await apri(page);
  await apriSessione(page, 'a');
  await accendi(page);
  const misura = await fulmine(page).evaluate((nodo) => {
    const svg = nodo.querySelector('svg'); const s = getComputedStyle(svg); const r = svg.getBoundingClientRect();
    const prova = document.createElement('i'); prova.style.color = 'var(--talos-accent)'; document.body.append(prova);
    const accento = getComputedStyle(prova).color; prova.remove();
    const etichetta = nodo.parentElement.querySelector('.talos-chip__label');
    return { larga: r.width, alta: r.height, colore: s.color, riempimento: s.fill, accento, flex: getComputedStyle(nodo).flexShrink, dopoIlNome: Boolean(etichetta.compareDocumentPosition(nodo) & Node.DOCUMENT_POSITION_FOLLOWING), usa: svg.querySelector('use').getAttribute('href') };
  });
  expect(misura.larga).toBe(13);
  expect(misura.alta).toBe(13);
  expect(misura.colore).toBe(misura.accento);
  expect(misura.riempimento).toBe(misura.accento);
  expect(misura.flex).toBe('0');
  expect(misura.dopoIlNome).toBe(true);
  expect(misura.usa).toBe('#i-bolt');
});

for (const larga of [1024, 1280, 1440, 1920]) {
  test(`VELOCE-05 — a ${larga}: una riga sola, il fulmine intero, il nome può cedere fino a 2 caratteri solo da accesa`, async ({ page }) => {
    await page.setViewportSize({ width: larga, height: 900 });
    await apri(page);
    await apriSessione(page, 'a');
    const etichetta = chip(page).locator('.talos-chip__label');
    const minimo = () => etichetta.evaluate((n) => Number.parseFloat(getComputedStyle(n).minWidth));
    const spento = await minimo();
    await accendi(page);
    await expect(fulmine(page)).toBeVisible();
    expect(await minimo(), 'da accesa il nome può cedere di più').toBeLessThan(spento);
    const m = await page.evaluate(() => {
      const barra = document.querySelector('#schermoChat .talos-composer__bar');
      const pezzi = [...barra.children].filter((x) => !x.hidden && x.getClientRects().length);
      const c = document.querySelector('#schermoChat [data-open-sheet="model"]'); const f = c.querySelector('.talos-chip__veloce svg').getBoundingClientRect(); const r = c.getBoundingClientRect();
      return { righe: new Set(pezzi.map((x) => Math.round(x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2))).size, trabocca: barra.scrollWidth > barra.clientWidth + 1, fulmineDentro: f.right <= r.right + 0.5 && f.left >= r.left - 0.5, larga: f.width };
    });
    expect(m).toEqual({ righe: 1, trabocca: false, fulmineDentro: true, larga: 13 });
  });
}

for (const lingua of ['it', 'en']) {
  test(`VELOCE-06 (${lingua}) — cambiando a un modello senza fascia si spegne anche sul server, avvisa, e tornando indietro resta spenta`, async ({ page }) => {
    const stato = await apri(page, { lingua });
    await apriSessione(page, 'a');
    await accendi(page);
    await expect.poll(() => stato.sessioni.get('a').fasciaVeloce).toBe(true);
    await cambiaModello(page, SENZA);
    await expect.poll(() => stato.sessioni.get('a').modello).toBe(SENZA);
    await expect(avviso(page, lingua), 'un avviso, uno solo').toHaveCount(1);
    await expect(fulmine(page)).toBeHidden();
    expect(stato.sessioni.get('a').fasciaVeloce, 'sul server è spenta').toBe(false);
    await cambiaModello(page, LUNA);
    await expect.poll(() => stato.sessioni.get('a').modello).toBe(LUNA);
    await apriMenu(page);
    await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
    await chiudiMenu(page);
    await expect(fulmine(page)).toBeHidden();
    expect(stato.sessioni.get('a').fasciaVeloce).toBe(false);
    expect(stato.impostazioni.filter((v) => v.patch.fasciaVeloce === true), 'nessuno la riaccende').toHaveLength(1);
  });
}

test('VELOCE-07 — fra due modelli con la fascia resta accesa, e nessun avviso', async ({ page }) => {
  const stato = await apri(page);
  await apriSessione(page, 'a');
  await accendi(page);
  await cambiaModello(page, SOL);
  await expect.poll(() => stato.sessioni.get('a').modello).toBe(SOL);
  await expect(fulmine(page)).toBeVisible();
  expect(stato.sessioni.get('a').fasciaVeloce).toBe(true);
  await expect(avviso(page)).toHaveCount(0);
});

test('VELOCE-08 — fuori dal piano: anche un modello di OpenRouter la spegne', async ({ page }) => {
  const stato = await apri(page);
  await apriSessione(page, 'a');
  await accendi(page);
  await expect.poll(() => stato.sessioni.get('a').fasciaVeloce).toBe(true);
  await cambiaModello(page, GLM, { fonte: 'openrouter' });
  await expect.poll(() => stato.sessioni.get('a').modello).toBe(GLM);
  await expect(avviso(page)).toHaveCount(1);
  expect(stato.sessioni.get('a').fasciaVeloce).toBe(false);
  await expect(fulmine(page)).toBeHidden();
});

test('VELOCE-09 — chat in attesa: accesa parte nel corpo vero del primo invio; una chat nuova parte spenta e il corpo non la porta', async ({ page }) => {
  const stato = await apri(page, { sessioni: [] });
  await chatInAttesa(page);
  await accendi(page);
  await invia(page, 'primo messaggio');
  await expect.poll(() => stato.avvii.length).toBe(1);
  expect(stato.avvii[0].fasciaVeloce).toBe(true);
  expect(stato.avvii[0].modello).toBe(LUNA);
  await expect(fulmine(page), 'la chat nata resta accesa').toBeVisible();
  expect(stato.impostazioni).toEqual([]);

  await chatInAttesa(page);
  await expect(fulmine(page), 'una chat nuova parte spenta').toBeHidden();
  await apriMenu(page);
  await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
  await chiudiMenu(page);
  await invia(page, 'secondo messaggio');
  await expect.poll(() => stato.avvii.length).toBe(2);
  expect(stato.avvii[1].fasciaVeloce === true, 'spenta non parte').toBe(false);
});

test('VELOCE-10 — chat in attesa: accesa e poi cambiata con un modello senza fascia non parte, e avvisa', async ({ page }) => {
  const stato = await apri(page, { sessioni: [] });
  await chatInAttesa(page);
  await accendi(page);
  await cambiaModello(page, SENZA);
  await expect(avviso(page)).toHaveCount(1);
  await expect(fulmine(page)).toBeHidden();
  await invia(page, 'primo');
  await expect.poll(() => stato.avvii.length).toBe(1);
  expect(stato.avvii[0].fasciaVeloce === true).toBe(false);
});

test('VELOCE-11 — chat in attesa spenta dopo averla accesa: il primo invio non la porta (verso contrario)', async ({ page }) => {
  const stato = await apri(page, { sessioni: [] });
  await chatInAttesa(page);
  await accendi(page);
  await apriMenu(page);
  await riga(page).click();
  await chiudiMenu(page);
  await invia(page, 'primo');
  await expect.poll(() => stato.avvii.length).toBe(1);
  expect(stato.avvii[0].fasciaVeloce === true).toBe(false);
});

test('VELOCE-12 — riaprendo si legge dalla riga di GET /sessions: accesa su una, spenta sull\'altra, avanti e indietro, senza avvisi', async ({ page }) => {
  const stato = await apri(page, { sessioni: [sessione('a', LUNA, { fasciaVeloce: true }), sessione('b', LUNA)] });
  await apriSessione(page, 'a');
  await expect(fulmine(page)).toBeVisible();
  await apriSessione(page, 'b');
  await expect(fulmine(page)).toBeHidden();
  await apriMenu(page);
  await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
  await chiudiMenu(page);
  await apriSessione(page, 'a');
  await expect(fulmine(page)).toBeVisible();
  await apriMenu(page);
  await expect(riga(page)).toHaveAttribute('aria-checked', 'true');
  await expect(avviso(page)).toHaveCount(0);
  expect(stato.impostazioni).toEqual([]);
});

test('VELOCE-13 — non si salva: ricaricando, la scelta di una chat in attesa non torna e le preferenze non la portano', async ({ page }) => {
  await apri(page, { sessioni: [] });
  await chatInAttesa(page);
  await accendi(page);
  const salvato = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(salvato).not.toMatch(/veloce|fastMode/iu);
  await page.reload();
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(fulmine(page)).toBeHidden();
});

test('VELOCE-14 — se il server la rifiuta con la stessa versione, lo schermo non resta acceso e lo dice', async ({ page }) => {
  /* il catalogo del client dice sì, quello del server (`fasciaDi`) no: `gpt-9-sparito` c'è solo nel primo */
  const stato = await apri(page, { sessioni: [sessione('a', 'chatgpt:gpt-9-sparito')], catalogo: [...PIANO, modelloDelPiano(grezzo('gpt-9-sparito', { service_tiers: fascia('1.5x speed') }))] });
  await apriSessione(page, 'a');
  await apriMenu(page);
  await riga(page).click();
  await expect.poll(() => stato.impostazioni.length).toBe(1);
  await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
  await chiudiMenu(page);
  await expect(fulmine(page)).toBeHidden();
  await expect(avviso(page)).toHaveCount(1);
  await apriSessione(page, 'a');
  await apriMenu(page);
  await expect(riga(page), 'riaprendola non torna accesa').toHaveAttribute('aria-checked', 'false');
  await chiudiMenu(page);
  await expect(fulmine(page)).toBeHidden();
});

test('VELOCE-15 — una scrittura rifiutata riporta l\'interruttore com\'era', async ({ page }) => {
  const stato = await apri(page, { settingsRotto: true });
  await apriSessione(page, 'a');
  await apriMenu(page);
  await riga(page).click();
  await expect.poll(() => stato.impostazioni.length).toBe(1);
  await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
  await chiudiMenu(page);
  await expect(fulmine(page)).toBeHidden();
});

/* la pillola sparisce quando nessun livello parte davvero (come in `pillola-sforzo`): la mappa del filo dice `null` per tutti */
const senzaPillola = (id) => { const slug = id.slice('chatgpt:'.length); return { livelliDiretti: { chatgpt: { [slug]: ['low'] } }, filoDiretti: { chatgpt: { [slug]: { low: null, medium: null, high: null } } } }; };

test('VELOCE-16 — senza pillola la riga sta nel riquadro «Modello», con la frase del costo, nei due versi', async ({ page }) => {
  const stato = await apri(page, { extraModelli: senzaPillola(LUNA) });
  await apriSessione(page, 'a');
  await expect(page.locator('#pillRagionamento')).toBeHidden();
  await chip(page).click();
  const riquadro = page.locator('#veloModello');
  const interruttore = riquadro.locator('#veloceToggle');
  await expect(interruttore).toBeVisible();
  await expect(riquadro.locator('#showReasoningToggle')).toBeVisible();
  await expect(riquadro.locator('#veloceNota')).toContainText(COSTO.it);
  await expect(interruttore).not.toBeChecked();
  await interruttore.check();
  await expect.poll(() => stato.impostazioni).toEqual([{ sid: 'a', patch: { fasciaVeloce: true } }]);
  await expect(fulmine(page)).toBeAttached();
  await interruttore.uncheck();
  await expect.poll(() => stato.impostazioni.at(-1)).toEqual({ sid: 'a', patch: { fasciaVeloce: false } });
});

test('VELOCE-17 — senza pillola e senza fascia nel riquadro non c\'è la riga', async ({ page }) => {
  await apri(page, { sessioni: [sessione('b', SENZA)], extraModelli: senzaPillola(SENZA) });
  await apriSessione(page, 'b');
  await expect(page.locator('#pillRagionamento')).toBeHidden();
  await chip(page).click();
  await expect(page.locator('#veloModello #showReasoningToggle')).toBeVisible();
  await expect(page.locator('#veloModello #veloceToggle')).toHaveCount(0);
});

const SERVIZIO = [
  [LUNA, { it: 'Il servizio dice: 1,5× più veloce.', en: 'The service says: 1.5x speed.' }],
  [SOL, { it: 'Il servizio dice: 2× più veloce, con più consumo.', en: 'The service says: 2x speed, increased usage.' }],
  [TERRA, { it: 'Il servizio dice: 1,5× più veloce, con più consumo.', en: 'The service says: 1.5x speed, increased usage.' }],
];
for (const lingua of ['it', 'en']) {
  test(`VELOCE-18 (${lingua}) — la riga del servizio è la traduzione del testo ricevuto; testo sconosciuto: nessuna riga, e la frase del costo resta`, async ({ page }) => {
    await apri(page, { lingua, sessioni: [...SERVIZIO.map(([m], i) => sessione(`s${i}`, m)), sessione('n', NUOVO)] });
    for (const [i, [, testo]] of SERVIZIO.entries()) {
      await apriSessione(page, `s${i}`);
      await apriMenu(page);
      await expect(nota(page)).toHaveText(`${COSTO[lingua]} ${testo[lingua]}`);
      await chiudiMenu(page);
    }
    await apriSessione(page, 'n');
    await apriMenu(page);
    await expect(riga(page)).toBeVisible();
    await expect(nota(page)).toHaveText(COSTO[lingua]);
  });
}

test('VELOCE-19 — dalla tastiera: si raggiunge con le frecce, Spazio la accende nei due versi, il menu resta aperto col fuoco sulla riga', async ({ page }) => {
  const stato = await apri(page);
  await apriSessione(page, 'a');
  await expect(page.locator('#pillRagionamento')).toBeVisible();
  await page.locator('#pillRagionamento').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(MENU)).toBeVisible();
  await expect(riga(page), 'l\'ultima voce').toBeFocused();
  await page.keyboard.press('Space');
  await expect(riga(page)).toHaveAttribute('aria-checked', 'true');
  await expect(riga(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
  await expect(riga(page)).toBeFocused();
  await expect.poll(() => stato.impostazioni.map((v) => v.patch.fasciaVeloce)).toEqual([true, false]);
});

test('VELOCE-20 — lasciando una chat accesa per una sessione nuova, la scelta muore con lei: né a schermo né nel corpo', async ({ page }) => {
  const stato = await apri(page);
  await apriSessione(page, 'a');
  await accendi(page);
  await expect.poll(() => stato.sessioni.get('a').fasciaVeloce).toBe(true);
  await page.evaluate(() => window.__talosHarnessUiRuntime.startRealSession({ id: 'task-prova' }));
  await expect.poll(() => stato.avviiTask.length).toBe(1);
  expect(stato.avviiTask[0].fasciaVeloce === true, 'una sessione nuova parte spenta').toBe(false);
  await expect(fulmine(page)).toBeHidden();
});

test('VELOCE-27 (revisione del Blocco 21, R19) — accesa e riaperta dalla barra prima che l\'elenco si rilegga: il fulmine resta', async ({ page }) => {
  const stato = await apri(page, { sessioni: [sessione('a', LUNA), sessione('b', GLM)] });
  await apriSessione(page, 'a');
  await accendi(page);
  await expect.poll(() => stato.sessioni.get('a').fasciaVeloce).toBe(true);
  stato.elencoInViaggio = true;
  await apriSessione(page, 'a');
  await expect(fulmine(page), 'sulla stessa sessione').toBeVisible();
  await apriSessione(page, 'b');
  await expect(fulmine(page)).toBeHidden();
  await apriSessione(page, 'a');
  await expect(fulmine(page), 'tornando da un\'altra sessione').toBeVisible();
  await apriMenu(page);
  await expect(riga(page)).toHaveAttribute('aria-checked', 'true');
});

test('VELOCE-29 (R3) — il foglio della nuova sessione con un modello senza supporto non spegne la sessione che si lascia', async ({ page }) => {
  await page.route('**/api/v1/workspace-browser**', (route) => route.fulfill({ json: { ok: true, data: { root: 'C:\\', path: 'C:\\', parent: null, items: [], recommended: [{ label: 'prova', path: 'C:\\prova', kind: 'project', projectId: 'default' }] } } }));
  const stato = await apri(page, { sessioni: [sessione('a', LUNA, { fasciaVeloce: true })] });
  await apriSessione(page, 'a');
  await expect(fulmine(page)).toBeVisible();
  await page.locator('#newSessionBtn').click();
  // 07/11/2026 (curatore, rossa del treno M): b8b35b08c (Tester 04/11 20:16, S4; 05/11) — il pulsante del selettore in «Nuova sessione»
  // dice il nome umano del modello (`nomeModelloUmano`: senza il prefisso `chatgpt:`), non più l'id grezzo; l'id resta nel valore scelto.
  await page.locator('#sheetDialog').getByRole('button', { name: 'gpt-6-luna', exact: true }).click();
  await page.locator('[data-picker-source="chatgpt"]:visible').first().click();
  await page.locator(`.model-picker-option[data-model-value="${SENZA}"]:visible`).first().click();
  await page.locator('#workspaceChooserSubmit').click();
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  expect(stato.impostazioni.filter((x) => x.sid === 'a' && 'fasciaVeloce' in x.patch), 'nessuna scrittura sulla sessione vecchia').toEqual([]);
  await expect(avviso(page), 'nessun avviso: quella sessione non ha cambiato modello').toHaveCount(0);
  expect(stato.sessioni.get('a').fasciaVeloce).toBe(true);
});

test('VELOCE-28 (R18) — un catalogo che non si legge non toglie la riga per dieci minuti: si rilegge entro un minuto', async ({ page }) => {
  await page.clock.install();
  let letture = 0;
  await apri(page);
  await page.route('**/api/v1/providers/chatgpt/models', (route) => { letture += 1; return letture === 1 ? route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL' } } }) : route.fulfill({ json: { ok: true, data: { provider: 'chatgpt', modelli: PIANO } } }); });
  await apriSessione(page, 'a');
  await apriMenu(page);
  await expect.poll(() => letture).toBeGreaterThan(0);
  await expect(riga(page)).toHaveCount(0);
  await chiudiMenu(page);
  await page.clock.fastForward(31_000);
  await apriSessione(page, 'a'); // la pillola si ridisegna e il catalogo si rilegge
  await expect.poll(() => letture).toBeGreaterThan(1);
  await apriMenu(page);
  await expect(riga(page)).toBeVisible();
});

test('VELOCE-22 — a 1920 lo spazio del fulmine lo paga il nome del modello: il permesso resta scritto; spenta, la barra torna com\'era', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page);
  await apriSessione(page, 'a');
  const barra = page.locator('#schermoChat .talos-composer__bar');
  const nomeIntero = () => chip(page).locator('.talos-chip__label').evaluate((n) => { const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect().width <= n.getBoundingClientRect().width + 1 / 64; });
  const scala = () => barra.getAttribute('data-scala');
  const permesso = () => page.locator('#schermoChat .talos-composer__bar [data-open-sheet="permissions"] .talos-chip__label').evaluate((n) => { const r = document.createRange(); r.selectNodeContents(n); return { sparito: getComputedStyle(n).position === 'absolute', intero: r.getBoundingClientRect().width <= n.getBoundingClientRect().width + 1 / 64 }; });
  await expect.poll(nomeIntero).toBe(true);
  const prima = await scala();
  await accendi(page);
  await expect(fulmine(page)).toBeVisible();
  await expect.poll(scala, 'accendere non cambia la scala').toBe(prima);
  expect(await permesso(), 'il nome del permesso resta intero').toEqual({ sparito: false, intero: true });
  const tagli = await page.evaluate(() => [...document.querySelectorAll('#schermoChat .talos-composer__bar .talos-chip__label')].filter((n) => n.getClientRects().length && getComputedStyle(n).position !== 'absolute').map((n) => { const r = document.createRange(); r.selectNodeContents(n); return { modello: Boolean(n.closest('[data-open-sheet="model"]')), taglio: r.getBoundingClientRect().width - n.getBoundingClientRect().width }; }));
  expect(tagli.filter((x) => !x.modello && x.taglio > 1 / 64), 'nessun\'altra pillola paga il fulmine').toEqual([]);
  await apriMenu(page);
  await riga(page).click();
  await chiudiMenu(page);
  await expect(fulmine(page)).toBeHidden();
  await expect.poll(scala, 'spenta, torna la scala di prima').toBe(prima);
});

test('VELOCE-23 — due chat in attesa di fila: la seconda parte spenta anche se la prima non è mai nata', async ({ page }) => {
  const stato = await apri(page, { sessioni: [] });
  await chatInAttesa(page);
  await accendi(page);
  await expect(fulmine(page)).toBeVisible();
  await chatInAttesa(page);
  await expect(fulmine(page)).toBeHidden();
  await invia(page, 'primo');
  await expect.poll(() => stato.avvii.length).toBe(1);
  expect(stato.avvii[0].fasciaVeloce === true).toBe(false);
});

test('VELOCE-24 — accesa e catalogo non leggibile: ciò che è acceso si può spegnere, e la spesa non resta senza interruttore', async ({ page }) => {
  const stato = await apri(page, { collegato: false, sessioni: [sessione('a', LUNA, { fasciaVeloce: true })] });
  await apriSessione(page, 'a');
  await expect(fulmine(page)).toBeVisible();
  await apriMenu(page);
  await expect(riga(page)).toHaveAttribute('aria-checked', 'true');
  await expect(nota(page)).toHaveText(COSTO.it);
  await riga(page).click();
  await expect(riga(page), 'spenta e senza catalogo la riga se ne va').toHaveCount(0);
  await expect(page.locator(`${MENU} #showReasoningToggle`), 'il fuoco resta nel menu').toBeFocused();
  await expect.poll(() => stato.impostazioni).toEqual([{ sid: 'a', patch: { fasciaVeloce: false } }]);
  await chiudiMenu(page);
  await expect(fulmine(page)).toBeHidden();
});

test('VELOCE-25 — chat in attesa accesa e avvio di un compito: la scelta a vista parte nel corpo', async ({ page }) => {
  const stato = await apri(page, { sessioni: [] });
  await chatInAttesa(page);
  await accendi(page);
  await page.evaluate(() => window.__talosHarnessUiRuntime.startRealSession({ id: 'task-prova' }));
  await expect.poll(() => stato.avviiTask.length).toBe(1);
  expect(stato.avviiTask[0].fasciaVeloce).toBe(true);
});

test('VELOCE-26 — spenta da un altro dispositivo: lo schermo la segue subito, la riga dell\'elenco pure, e nessun avviso (il modello è lo stesso)', async ({ page }) => {
  await apri(page, {
    sessioni: [sessione('a', LUNA, { fasciaVeloce: true })],
    eventiDopo: (stato, sid) => {
      if (stato.spentaDalDispositivo) return [];
      stato.spentaDalDispositivo = true;
      stato.elencoInViaggio = true; // la fotografia arriva prima della rilettura dell'elenco
      const s = stato.sessioni.get(sid);
      Object.assign(s, { fasciaVeloce: false, versioneImpostazioni: 7 }); // il server cambia, come dopo una scrittura dell'altro dispositivo
      return [{ type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa: 'normale', permessi: 'Workspace write', motivo: 'impostazioni', origine: { tipo: 'dispositivo', dispositivoId: 'd1' }, istantanea: istantanea(s) } }];
    },
  });
  await apriSessione(page, 'a');
  await expect(fulmine(page)).toBeHidden();
  await apriSessione(page, 'a');
  await apriMenu(page);
  await expect(riga(page), 'riaprendo dalla riga dell\'elenco resta spenta').toHaveAttribute('aria-checked', 'false');
  await expect(avviso(page)).toHaveCount(0);
});

/* 03/11 sera: VELOCE-26 era rossa una volta su ~20 sotto carico (corsa `dopo-1` delle prove veloci). Causa: una rilettura dell'elenco partita
   PRIMA della fotografia arrivava DOPO, e la riga dell'elenco riprendeva le impostazioni vecchie (versione 1 sopra la 7). Qui l'ordine è forzato. */
test('VELOCE-26b — una rilettura dell\'elenco più vecchia della fotografia non riaccende la riga', async ({ page }) => {
  const stato = await apri(page, {
    sessioni: [sessione('a', LUNA, { fasciaVeloce: true })],
    eventiDopo: (st, sid) => {
      if (st.spentaDalDispositivo) return [];
      st.spentaDalDispositivo = true;
      const s = st.sessioni.get(sid);
      st.elencoVecchio = [{ ...s }]; // ciò che una lettura partita prima del cambio avrebbe in mano
      Object.assign(s, { fasciaVeloce: false, versioneImpostazioni: 7 });
      return [{ type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa: 'normale', permessi: 'Workspace write', motivo: 'impostazioni', origine: { tipo: 'dispositivo', dispositivoId: 'd1' }, istantanea: istantanea(s) } }];
    },
  });
  await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET' && stato.elencoVecchio
    ? route.fulfill({ json: { ok: true, data: { items: stato.elencoVecchio } } })
    : route.fallback()));
  await apriSessione(page, 'a');
  await expect(fulmine(page)).toBeHidden();
  await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  await apriSessione(page, 'a');
  await apriMenu(page);
  await expect(riga(page), 'la riga dell\'elenco resta sulla fotografia nuova').toHaveAttribute('aria-checked', 'false');
  await expect(fulmine(page)).toBeHidden();
});

test('VELOCE-21 — il puntatore evidenzia la riga intera, sul pezzo che si clicca', async ({ page }) => {
  await apri(page);
  await apriSessione(page, 'a');
  await apriMenu(page);
  const fondo = () => riga(page).evaluate((n) => getComputedStyle(n).backgroundColor);
  await page.locator(`${MENU} .talos-pillola-ragionamento__testa`).hover();
  const prima = await fondo();
  await riga(page).hover();
  await expect.poll(fondo).not.toBe(prima);
});

for (const modo of ['light', 'dark']) {
  test.describe(`foto · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });
    test(`VELOCE-FOTO (${modo}) — menu spento e acceso, chip acceso, avviso del cambio di modello`, async ({ page }) => {
      await mkdir(FOTO, { recursive: true });
      const scatta = async (nome) => writeFile(path.join(FOTO, `${nome}-${modo}.png`), await page.screenshot());
      await apri(page, { modo });
      await apriSessione(page, 'a');
      await apriMenu(page);
      await expect(riga(page)).toHaveAttribute('aria-checked', 'false');
      await scatta('menu-spento');
      await riga(page).click();
      await expect(riga(page)).toHaveAttribute('aria-checked', 'true');
      await scatta('menu-acceso');
      await chiudiMenu(page);
      await expect(fulmine(page)).toBeVisible();
      await scatta('chip-acceso');
      await cambiaModello(page, SENZA);
      await expect(avviso(page)).toBeVisible();
      await scatta('avviso-cambio-modello');
    });
  });
}
