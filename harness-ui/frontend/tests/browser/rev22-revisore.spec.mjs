import { expect, test } from '@playwright/test';
import { bustaContesto } from '../../../src/http-app.mjs';
import { MOTORE_SPENTO_PER_LA_CONVERSAZIONE } from '../../../src/context-desktop-service.mjs';

/*
 * Revisione avversaria del Blocco 22 (01/11/2026). Le REV22-R* sono nate rosse sui difetti del rapporto, sull'ultima asserzione; le REV22-V* sono controlli. Dopo le cure devono
 * essere verdi tutte. ⛔ DA ESEGUIRE: scritte con la campagna di Performance accesa, nessuna è ancora girata su un browser.
 * Nessuna scrittura vera: ogni non-GET si ferma e si conta.
 */
test.use({ locale: 'it-IT' });

const MODELLO = 'z-ai/glm-5.3-flash';
const AT = '2026-09-24T07:00:00.000Z';
const AT_MODELLO = '2026-09-24T07:05:00.000Z';
const LAVORO = 'job-ctx-1';
const SCELTO = { ruolo: 'scelto', modello: MODELLO, stato: 'pronto', origine: 'scelta' };
const RISERVA = { ruolo: 'riserva', modello: 'qwen/qwen3.7-flash', stato: 'pronto', origine: 'scelta' };
const SENZA = { ruolo: 'senza-modello', modello: null, stato: 'pronto' };
const BASE = { motore: 'engine', modelloDelRiassunto: MODELLO, riservaDelRiassunto: 'qwen/qwen3.7-flash', catena: [SCELTO, RISERVA, SENZA] };
const MODELLI = [{ id: MODELLO, provider: 'z-ai', nome: 'GLM 5.3 Flash' }, { id: 'qwen/qwen3.7-flash', provider: 'qwen', nome: 'Qwen 3.7 Flash' }, { id: 'openai/gpt-5.4', provider: 'openai', nome: 'GPT-5.4' }];
const INUTILIZZABILE = { ...BASE, catena: [{ ...SCELTO, stato: 'inutilizzabile', motivo: 'senza-chiave' }, RISERVA, SENZA] };

const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const sse = (eventi) => `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;
const giro = (seq = 1, consegna = 'Sistema i test del progetto', risposta = 'Ho letto la cartella dei test.') => [
  { type: 'RunStarted', _sequenza: seq, input: { consegna } },
  { type: 'TextMessageContent', _sequenza: seq + 1, messageId: `m${seq}`, delta: risposta },
  { type: 'TextMessageEnd', _sequenza: seq + 2, messageId: `m${seq}` },
  { type: 'RunFinished', _sequenza: seq + 4 },
];
const FINE = { type: 'CUSTOM', name: 'talos.compattazione', _sequenza: 21, value: { fase: 'fine', compattato: true, tokenPrima: 184_000, tokenDopo: 41_000, misura: 'stima', coveredThrough: 40, at: AT, modello: MODELLO, motivo: 'background' } };
const FINE_RAPIDA_MOTORE = { ...FINE, value: { ...FINE.value, ripiego: true, ragione: 'in-arrivo', at: AT, lavoroDelMotore: LAVORO } };
const delMotore = (sessionId, extra) => ({ type: 'CUSTOM', name: 'talos.context', _sequenza: 30, value: { schema: 'talos.context.event.v1', id: `ev-${extra.kind}-${sessionId}`, sessionId, jobId: LAVORO, createdAt: AT_MODELLO, ...extra } });
const AVVISO = { type: 'CUSTOM', name: 'talos.riassunto-modello-inutilizzabile', _sequenza: 20, value: { schema: 'talos.riassunto-modello-inutilizzabile.v1', at: AT, modello: MODELLO, motivo: 'senza-chiave', scelto: 'persona', ruolo: 'scelto' } };

async function fermaLeScritture(page, permesse = []) {
  const fermate = [];
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' || permesse.some((p) => r.request().url().includes(p)) ? r.fallback() : (fermate.push(r.request().url()), r.abort())));
  return fermate;
}

async function apriSessione(page, id, eventi) {
  await fermaLeScritture(page);
  await page.route(`**/api/v1/sessions/${id}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse([...eventi, CONFINE]) }));
  const legacyVera = (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 503, json: bustaContesto('CTX_NOT_ENABLED', MOTORE_SPENTO_PER_LA_CONVERSAZIONE, () => new Date().toISOString()) })
    : route.fallback());
  await page.route(`**/api/v1/sessions/${id}/context`, legacyVera);
  await page.route(`**/api/v1/sessions/${id}/context/*`, legacyVera);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(({ id, MODELLO }) => { window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Prova', MODELLO, { conclusa: true, modello: MODELLO }); }, { id, MODELLO });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
}

async function apriCarta(page, { get = BASE, risposteGet = null, post = null, ritardoGet = 0, altriModelli = [] } = {}) {
  const scritte = []; let letture = 0;
  await fermaLeScritture(page, ['/api/v1/context-settings']);
  await page.route('**/api/v1/models*', (r) => r.fulfill({ json: { ok: true, data: { modelli: [...MODELLI, ...altriModelli] } } }));
  await page.route('**/api/v1/auth/chatgpt/stato', (r) => r.fulfill({ json: { ok: true, data: { collegato: false, pianoAbilitato: false } } }));
  const stato = { get };
  await page.route('**/api/v1/context-settings', async (r) => {
    if (r.request().method() === 'GET') {
      letture += 1;
      const quale = risposteGet?.(letture);
      const fotografia = stato.get;
      if (ritardoGet) await new Promise((ok) => setTimeout(ok, ritardoGet(letture)));
      if (quale === 500) return r.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL' } } });
      return r.fulfill({ json: { ok: true, data: fotografia } });
    }
    const corpo = JSON.parse(r.request().postData() || '{}');
    scritte.push(corpo);
    if (post === 400) return r.fulfill({ status: 400, json: { ok: false, error: { code: 'QUERY_INVALID' } } });
    stato.get = { ...stato.get, ...corpo };
    return r.fulfill({ json: { ok: true, data: stato.get } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.evaluate(() => document.querySelector('[data-vaia="impostazioni"], [data-view="settings"]')?.click());
  await page.locator('#setting-tab-memoria').click();
  const carta = page.locator('[data-settings-card="memoria-compattazione"]');
  await expect(carta).toBeVisible();
  return { carta, scritte, letture: () => letture, stato };
}

test('REV22-V1 — riaprendo la scheda la catena si rilegge (controllo)', async ({ page }) => {
  const { carta, letture, stato } = await apriCarta(page);
  await expect(carta.locator('[data-compattazione-catena]')).toContainText('GLM 5.3 Flash');
  const prima = letture();
  stato.get = { ...BASE, catena: [{ ...SCELTO, stato: 'inutilizzabile', motivo: 'senza-chiave' }, RISERVA, SENZA] };
  await page.locator('#setting-tab-tools').click();
  await page.locator('#setting-tab-memoria').click();
  await expect.poll(letture).toBeGreaterThan(prima);
  await expect(carta.locator('[data-compattazione-avviso-testo]')).toHaveText('Manca la chiave per GLM 5.3 Flash.');
});

test('REV22-V2 — salto dalla chat a Impostazioni già aperte: Avanzate aperto e menu aperto (controllo)', async ({ page }) => {
  const { carta } = await apriCarta(page, { get: INUTILIZZABILE });
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"]')).toBeHidden();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('talos:apri-scelta-compattazione', { detail: { scelta: 'riserva' } })));
  await expect(carta.locator('[data-setting-row="riservaDelRiassunto"]')).toBeVisible();
  await expect(page.locator('.calm-option', { hasText: 'Nessuno' }).first()).toBeVisible();
});

test('REV22-V3 — un modello ostile resta testo, nella carta e nella riga (controllo)', async ({ page }) => {
  const ostile = 'autore/<img src=x onerror=window.__pwn=1>';
  const { carta } = await apriCarta(page, { get: { ...BASE, modelloDelRiassunto: ostile, catena: [{ ...SCELTO, modello: ostile, stato: 'inutilizzabile', motivo: 'non-trovato' }, SENZA] } });
  await expect(carta.locator('[data-compattazione-avviso-testo]')).toContainText('<img');
  await carta.locator('[data-compattazione-avanzate]').click();
  expect(await page.evaluate(() => [window.__pwn, document.querySelectorAll('[data-settings-card="memoria-compattazione"] img').length])).toEqual([null, 0].map((v, i) => (i === 0 ? undefined : v)));
});

test('REV22-R1 — il menu offre anche i fornitori diretti, come il selettore della chat', async ({ page }) => {
  await page.route('**/api/v1/providers', (r) => r.fulfill({ json: { ok: true, data: { items: [{ id: 'anthropic', keyConfigured: true }] } } }));
  let chieste = 0;
  await page.route('**/api/v1/providers/anthropic/models', (r) => { chieste += 1; return r.fulfill({ json: { ok: true, data: { modelli: [{ id: 'anthropic:claude-sonnet-5', provider: 'anthropic', nome: 'Claude Sonnet 5' }] } } }); });
  const { carta } = await apriCarta(page);
  await carta.locator('[data-compattazione-avanzate]').click();
  await page.locator('[data-setting-row="modelloDelRiassunto"] .calm-select').click();
  await expect(page.locator('.calm-option', { hasText: 'GPT-5.4' }).first()).toBeVisible(); // premessa: il catalogo OpenRouter c'è
  await expect(page.locator('.calm-option', { hasText: 'Anthropic · Claude Sonnet 5' })).toHaveCount(1, { timeout: 2000 });
  expect(chieste).toBeGreaterThan(0);
});

/* Treno 02/11/2026 (terza corsa): la carta chiedeva tutti i cataloghi all'avvio di ogni finestra, e i due fornitori senza chiave (LM Studio spento, «esterno» non configurato)
   lasciavano due errori in console a chiunque. */
test('REV22-R1b — aprendo l\'app la carta non chiede nessun catalogo; aprendo «Memoria» sì', async ({ page }) => {
  const chieste = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^\/api\/v1\/providers\/[^/]+\/models$/u.test(u.pathname)) chieste.push(u.pathname); });
  const errori = [];
  page.on('console', (m) => { if (m.type() === 'error' && /Failed to load resource/u.test(m.text())) errori.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForLoadState('networkidle');
  expect(chieste).toEqual([]);
  expect(errori).toEqual([]);
  await page.evaluate(() => document.querySelector('[data-vaia="impostazioni"], [data-view="settings"]')?.click());
  await page.locator('#setting-tab-memoria').click();
  await expect.poll(() => chieste.length, 'aprendo «Memoria» i cataloghi si leggono').toBeGreaterThan(0);
});

test('REV22-R2 — un id del catalogo con la tilde parte intero', async ({ page }) => {
  /* la rotta qui la risponde la prova: che il server lo accetti lo dice REV22-H in `tests/rev22-forma-tilde.test.mjs`. Prima questa prova pretendeva un esito verde da una risposta 400 finta */
  const { carta, scritte } = await apriCarta(page, { altriModelli: [{ id: '~deepseek/deepseek-v4-flash-latest', provider: 'deepseek', nome: 'DeepSeek V4 Flash (latest)' }] });
  await carta.locator('[data-compattazione-avanzate]').click();
  await page.locator('[data-setting-row="modelloDelRiassunto"] .calm-select').click();
  await page.locator('.calm-option', { hasText: 'DeepSeek V4 Flash (latest)' }).first().click();
  await expect.poll(() => scritte.length).toBe(1);
  expect(scritte[0]).toEqual({ modelloDelRiassunto: '~deepseek/deepseek-v4-flash-latest' });
  await expect(carta.locator('[data-compattazione-errore]')).toBeHidden();
});

test('REV22-R3 — doppio clic su «Scegli un altro»: il menu resta aperto', async ({ page }) => {
  const { carta } = await apriCarta(page, { get: INUTILIZZABILE });
  await carta.locator('[data-compattazione-scegli]').dblclick();
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"]')).toBeVisible(); // premessa
  await page.waitForTimeout(200);
  await expect(page.locator('.calm-listbox')).toBeVisible();
});

test('REV22-R4 — da tastiera: «Scegli un altro» apre il menu e le frecce lo muovono', async ({ page }) => {
  const { carta } = await apriCarta(page, { get: INUTILIZZABILE });
  await carta.locator('[data-compattazione-scegli]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.calm-listbox')).toBeVisible(); // premessa
  const prima = await page.locator('.calm-option.is-active').textContent();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.locator('.calm-option.is-active').textContent(), { timeout: 1500 }).not.toBe(prima);
});

test('REV22-R5 — una lettura partita prima del salvataggio non riporta indietro la scelta', async ({ page }) => {
  const { carta, scritte, letture } = await apriCarta(page, { ritardoGet: (n) => (n >= 3 ? 1200 : 0) });
  await carta.locator('[data-compattazione-avanzate]').click();
  const giaLette = letture();
  /* una lettura lenta in volo (la scheda riaperta): la riga dell'owner «riapertura» con un server sotto carico */
  await page.locator('#setting-tab-tools').click();
  await page.locator('#setting-tab-memoria').click();
  await expect.poll(letture).toBeGreaterThan(giaLette);
  await page.locator('[data-setting-row="modelloDelRiassunto"] .calm-select').click();
  await page.locator('.calm-option', { hasText: 'GPT-5.4' }).first().click();
  await expect.poll(() => scritte.length).toBe(1);
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"] .calm-select')).toContainText('GPT-5.4'); // premessa: la risposta del POST
  await page.waitForTimeout(1500);
  await expect(carta.locator('[data-setting-row="modelloDelRiassunto"] .calm-select')).toContainText('GPT-5.4');
});

test('REV22-R6 — una lettura fallita non fa sparire la carta senza una parola', async ({ page }) => {
  /* Treno 02/11/2026: la rotta si guasta DOPO che la carta si è letta, non alla terza lettura. La stessa rotta la legge anche il «Motore del contesto»
     (`motore-contesto.js`), quindi sono due letture all'avvio e due sulla scheda, e la terza cadeva già sul clic di `apriCarta`. */
  let guasta = false;
  const { carta } = await apriCarta(page, { risposteGet: () => (guasta ? 500 : null) });
  await expect(carta.locator('[data-compattazione-catena]')).toContainText('GLM 5.3 Flash');
  guasta = true;
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('talos:apri-scelta-compattazione', { detail: { scelta: 'modello' } })));
  await expect(page.locator('#setting-panel-memoria')).toBeVisible(); // premessa: si arriva lì
  await page.waitForTimeout(400);
  await expect(page.locator('[data-settings-card="memoria-compattazione"]')).toBeVisible();
  await expect(carta.locator('[data-compattazione-catena]')).toHaveText('Questa impostazione non è disponibile in questa istanza.');
  await expect(carta.locator('[data-compattazione-avanzate]')).toBeHidden();
});

test('REV22-R7 — strada del motore: la riserva che migliora la rapida firma la riga', async ({ page }) => {
  const id = 'rev22-motore';
  const versione = delMotore(id, { kind: 'context.version.committed', versionId: 'ver-1', payload: { coveredThrough: 40, provenienza: { riassuntoDi: 'qwen/qwen3.7-flash', dallaRiserva: true, nonDisponibile: { modello: MODELLO, stato: 'bloccato', motivo: 'rete' } } } });
  await apriSessione(page, id, [...giro(), FINE_RAPIDA_MOTORE, versione]);
  const riga = page.locator('#conversation [data-compattazione-riga]').first();
  await expect(riga).toHaveCount(1); // premessa: una riga sola
  await expect(riga).toContainText('Compattazione di Qwen3.7 Flash (riserva)', { timeout: 2000 }); // 68ebab480 (revisione d'uso 04/11, reperto 11)
});

test('REV22-R8 — un finoAlle fuori dal calendario sul disco non toglie la riga dalla storia', async ({ page }) => {
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  const id = 'rev22-oltre';
  await apriSessione(page, id, [...giro(), { ...FINE, value: { ...FINE.value, dallaRiserva: true, riassuntoDi: 'qwen/qwen3.7-flash', nonDisponibile: { modello: MODELLO, stato: 'bloccato', motivo: 'limite', finoAlle: 1e20 } } }, ...giro(30, 'Secondo giro', 'Risposta del secondo giro.')]);
  await expect(page.locator('#conversation')).toContainText('Risposta del secondo giro.');
  await expect(page.locator('#conversation [data-compattazione-riga]')).toContainText('Compattazione di Qwen3.7 Flash (riserva)', { timeout: 2000 }); // 68ebab480 (revisione d'uso 04/11, reperto 11)
  expect(errori).toEqual([]);
});

test('REV22-R9 — l\'avviso sta sotto la riga coi numeri, come il bozzetto, nell\'ordine vero del server', async ({ page }) => {
  const id = 'rev22-ordine';
  await apriSessione(page, id, [...giro(), AVVISO, { ...FINE, value: { ...FINE.value, dallaRiserva: true, riassuntoDi: 'qwen/qwen3.7-flash', nonDisponibile: { modello: MODELLO, stato: 'inutilizzabile', motivo: 'senza-chiave' } } }]);
  const avviso = page.locator('[data-compattazione-inutilizzabile]');
  const numeri = page.locator('#conversation [data-compattazione-riga]');
  await expect(avviso).toHaveCount(1); await expect(numeri).toHaveCount(1); // premessa
  const avvisoDopo = await page.evaluate(() => {
    const a = document.querySelector('[data-compattazione-inutilizzabile]'), n = document.querySelector('#conversation [data-compattazione-riga]');
    return Boolean(n.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(avvisoDopo).toBe(true);
});

test('REV22-R10 — lo stesso ordine sulla strada del motore, e la riga firmata col suo perché', async ({ page }) => {
  const id = 'rev22-ordine-motore';
  const versione = delMotore(id, { kind: 'context.version.committed', versionId: 'ver-1', payload: { coveredThrough: 40, provenienza: { riassuntoDi: 'qwen/qwen3.7-flash', dallaRiserva: true, nonDisponibile: { modello: MODELLO, stato: 'inutilizzabile', motivo: 'senza-chiave' } } } });
  await apriSessione(page, id, [...giro(), AVVISO, versione]);
  const riga = page.locator('#conversation [data-context-separator]');
  await expect(riga).toContainText('Compattazione di Qwen3.7 Flash (riserva)'); // 68ebab480 (revisione d'uso 04/11, reperto 11)
  await expect(riga.locator('span').first()).toHaveAttribute('title', /riserva/u);
  const avvisoDopo = await page.evaluate(() => {
    const a = document.querySelector('[data-compattazione-inutilizzabile]'), n = document.querySelector('#conversation [data-context-separator]');
    return Boolean(n.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(avvisoDopo).toBe(true);
});

test('REV22-R11 — un limite di un altro giorno dice il giorno, sulla carta', async ({ page }) => {
  const { carta } = await apriCarta(page, { get: { ...BASE, catena: [{ ...SCELTO, stato: 'bloccato', motivo: 'limite', diAccount: true, finoAlle: Date.now() + 3 * 86_400_000 }, RISERVA, SENZA] } });
  await expect(carta.locator('[data-compattazione-catena]')).toContainText(/in attesa fino alle \d\d:\d\d di \p{L}+ \d+ \p{L}+, limite del piano/u);
});
