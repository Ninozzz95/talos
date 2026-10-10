import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { bustaContesto } from '../../../src/http-app.mjs';
import { MOTORE_SPENTO_PER_LA_CONVERSAZIONE } from '../../../src/context-desktop-service.mjs';

/*
 * ⭐ F5 (onda 2 della fase F2), 24/09/2026 — LA COMPATTAZIONE CHE SI VEDE E SI PUÒ FARE SUL LEGACY.
 *
 * Sul 4174 il motore acceso è il legacy dell'adapter desktop (ricognizione §1.1) e il trial è spento
 * per costruzione (`config.mjs:501`). Prima di questa corsia «Compatta» apriva SOLO il dialogo del
 * trial (`app.js` `compactSession`), che rispondeva «non è ancora attivo»; la rotta legacy
 * `POST /api/v1/sessions/:id/compact` non era chiamata da nessuno (`grep -rn "/compact" frontend/src`
 * = solo commenti); l'errore di finestra piena consigliava proprio quel pulsante (`errori.js:332`).
 *
 * ⛔ Banco: il webServer di `playwright.config.mjs` sulla 4176 (store isolato, custodia chiavi in
 *   memoria). Mai il 4174. Le rotte che SCRIVONO (`/compact`, `/compaction/:at/undo`) sono
 *   intercettate con `page.route`: si conta, non si compatta davvero. Il flusso SSE è una fixture col
 *   contratto dichiarato dal brief F5 (`RAPPORTO-F5-UI.md` §1): finché il rapporto F3 non esiste, è
 *   quello. `GET /context` invece arriva al server VERO della 4176, che senza trial risponde
 *   `CTX_NOT_ENABLED`: la scelta legacy/trial è provata contro il comportamento reale.
 * ⛔ `locale: 'it-IT'`: senza, Playwright negozia `en-US` e le frasi escono in inglese
 *   (`context-compactor.spec.mjs`, testata, 18/09/2026).
 */
test.use({ locale: 'it-IT' });

const MODELLO = 'z-ai/glm-5.3-flash';
const HARNESS = fileURLToPath(new URL('../../../', import.meta.url));
const FOTO = resolve(HARNESS, 'frontend/artifacts/compattazione-legacy');
const VIEWPORT = [[1920, 1080], [2560, 1440]];

const AT = '2026-09-24T07:00:00.000Z';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
function sse(eventi) { return `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`; }
/* 26/09: la misura del contesto è l'ULTIMA chiamata (`consumo-fornitore`, come il server vero ne scrive una per chiamata);
   `/usage` è il cumulativo del giro e non misura il contesto (difetto dell'owner del 26/09, `avviso-soglia-misura.spec.mjs`). */
function giro(seq = 1, consegna = 'Sistema i test del progetto', prompt = 52_000) {
  return [
    { type: 'RunStarted', _sequenza: seq, input: { consegna } },
    { type: 'CUSTOM', name: 'consumo-fornitore', _sequenza: seq + 0.5, value: { tipo: 'consumo-fornitore', provider: 'openrouter', model: MODELLO, usage: { prompt_tokens: prompt, completion_tokens: 200, total_tokens: prompt + 200 }, esito: 'completato' } },
    { type: 'TextMessageContent', _sequenza: seq + 1, messageId: `m${seq}`, delta: 'Ho letto la cartella dei test e sistemato i due file rossi.' },
    { type: 'TextMessageEnd', _sequenza: seq + 2, messageId: `m${seq}` },
    { type: 'StateDelta', _sequenza: seq + 3, delta: [{ path: '/usage', value: { prompt_tokens: prompt, completion_tokens: 200, cached_tokens: 0, giri: 1 } }] },
    { type: 'RunFinished', _sequenza: seq + 4 },
  ];
}
/* ⛔ 24/09/2026, 12:35 — le fixture sono le forme FUSE di F3 (`a8cdcc616`, `session-registry.mjs:3084, :3098-3112, :5210-5214,
   :7779`): `tokenPrima` all'inizio, `at` al primo livello alla fine (nessun `record`, nessun riassunto nell'evento),
   l'annullo è `fase:'annullata'` sullo stesso evento, il journal porta `riparato:true|false`. */
const INIZIO = { type: 'CUSTOM', name: 'talos.compattazione', _sequenza: 20, value: { fase: 'inizio', tokenPrima: 184_000, soglia: 150_000, motivo: 'background', coveredThrough: 40, at: AT } };
const FINE = { type: 'CUSTOM', name: 'talos.compattazione', _sequenza: 21, value: { fase: 'fine', compattato: true, tokenPrima: 184_000, tokenDopo: 41_000, misura: 'stima', coveredThrough: 40, at: AT, modello: MODELLO, motivo: 'background' } };
const FINE_FALLITA = { type: 'CUSTOM', name: 'talos.compattazione', _sequenza: 21, value: { fase: 'fine', compattato: false, motivo: 'errore: HTTP 500 dal fornitore', at: AT } };
const ANNULLATA = { type: 'CUSTOM', name: 'talos.compattazione', _sequenza: 22, value: { fase: 'annullata', at: AT, coveredThrough: 40 } };
const RIPARATO = { type: 'CUSTOM', name: 'talos.journal-riparato', _sequenza: 2, value: { riparato: true, completata: true, righeScartate: 3, byteScartati: 812, backup: 'C:\\Users\\prova\\.sessions-store\\cl-riparato.jsonl.bak' } };
const RIPARATO_FALLITO = { type: 'CUSTOM', name: 'talos.journal-riparato', _sequenza: 2, value: { riparato: false, completata: false, righeScartate: 0, byteScartati: 0, backup: null, errore: 'EPERM: operation not permitted, rename' } };

async function apri(page, id, eventi, { conclusa = false } = {}) {
  await page.route(`**/api/v1/sessions/${id}/events`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse([...eventi, CONFINE]) }));
  /* C1 (10/10/2026): col motore di serie il server ha SEMPRE il servizio del contesto, e una sessione che non conosce (questa è
     una fixture) riceve 404. Una conversazione legacy VERA riceve 503 `CTX_NOT_ENABLED` (`context-desktop-service.mjs`): la
     fixture riceve quella, costruita dalla funzione del server (`bustaContesto`) col messaggio del servizio, non a mano. */
  const legacyVera = (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 503, json: bustaContesto('CTX_NOT_ENABLED', MOTORE_SPENTO_PER_LA_CONVERSAZIONE, () => new Date().toISOString()) })
    : route.fallback());
  await page.route(`**/api/v1/sessions/${id}/context`, legacyVera);
  await page.route(`**/api/v1/sessions/${id}/context/*`, legacyVera);
  if (!page.url().startsWith('http')) {
    await page.goto('/');
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  }
  await page.evaluate(({ id, MODELLO, conclusa }) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Prova della compattazione', MODELLO, { conclusa, modello: MODELLO });
  }, { id, MODELLO, conclusa });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
}
async function eventi(page, lista) {
  await page.evaluate((lista) => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
  }, lista);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}
/** Conta le POST su una rotta e risponde con un ritardo: due clic ravvicinati devono fare UNA chiamata. */
async function contaPost(page, glob, risposta, { ritardoMs = 300 } = {}) {
  const chiamate = [];
  await page.route(glob, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    chiamate.push(route.request().url());
    await new Promise((ok) => setTimeout(ok, ritardoMs));
    await route.fulfill({ json: risposta });
  });
  return chiamate;
}
/* CTX-WINDOW-01: la soglia arriva da `GET /sessions/:id/compaction-policy`, non dal catalogo. Le fixture legacy
   rappresentano una finestra da 200.000 con soglia 0,75 (150.000) e avviso a 120.000: la dichiarano invece di
   lasciare che l'istanza di prova risponda col fallback prudenziale. */
async function policyFixture(page, glob) {
  await page.route(glob, (route) => route.fulfill({ json: {
    ok: true, data: { windowTokens: 200_000, triggerTokens: 150_000, warningTokens: 120_000,
      emergencyTokens: 180_000, source: 'route-minimum', modelId: MODELLO, inProgress: false }, meta: {},
  } }));
}
/* ⛔ Un errore JavaScript in pagina è un difetto anche quando la prova sembra passare (`nessun-errore-a-runtime`,
   11/09): qui si raccoglie e si pretende vuoto a ogni prova — il flusso SSE inghiotte le eccezioni di `handleRealEvent`. */
const erroriPagina = [];
test.beforeEach(({ page }) => { erroriPagina.length = 0; page.on('pageerror', (e) => erroriPagina.push(String(e?.message || e))); });
test.afterEach(() => { expect(erroriPagina, 'nessun errore JavaScript in pagina').toEqual([]); });
const separatore = (page) => page.locator('#conversation [data-compattazione-riga]');
const barra = (page) => page.locator('#conversation [data-compattazione-barra]');

/*
 * ⛔ 24/09/2026 sera — RISCRITTA per ordine dell'owner. Si chiamava «CTX-UI-COMPACT-FALLS-BACK-TO-LEGACY» e pretendeva che il
 *   bottone «Context Manager» COMPATTASSE SUBITO col trial spento: sul 4174 un clic ha sostituito la storia della sessione
 *   del Desktop dell'owner (48 messaggi → 3) senza una finestra né una conferma. Owner: «il click su context manager prima
 *   apriva una modale adesso fa compatta e basta»; alla domanda: «Apre sempre la finestra». Ora il bottone GUARDA; compatta
 *   solo «Compatta ora» → «Sì, compatta» dentro la finestra. `GET /context` arriva al server VERO della 4176 (trial spento
 *   ⇒ `CTX_NOT_ENABLED`), le POST sono contate: zero all'apertura, zero con «Annulla», una sola con due clic ravvicinati.
 */
test('CTX-UI-WINDOW-ALWAYS-OPENS — col trial spento il bottone apre la finestra; compatta solo dopo la conferma, una POST sola', async ({ page }) => {
  const chiamate = await contaPost(page, '**/api/v1/sessions/cl-legacy/compact', { ok: true, data: { compattato: true }, meta: {} }, { ritardoMs: 1200 });
  const mutazioniTrial = [];
  page.on('request', (r) => { if (/\/context(\/|$)/.test(new URL(r.url()).pathname) && r.method() !== 'GET') mutazioniTrial.push(r.url()); });
  await page.route('**/api/v1/models*', (route) => route.fulfill({ json: { ok: true, data: { modelli: [{ id: MODELLO, nome: 'GLM 5.3 Flash', provider: 'openrouter', contextLength: 200_000 }] }, meta: {} } }));
  await policyFixture(page, '**/api/v1/sessions/cl-legacy/compaction-policy');
  await apri(page, 'cl-legacy', giro(), { conclusa: true });
  const finestra = page.locator('#veloContesto');
  await page.locator('#compactSessionBtn').click();
  await expect(finestra, 'il bottone apre la finestra').toBeVisible();
  await expect(finestra).toHaveAttribute('data-context-modo', 'legacy');
  /* C1 (owner 10/10/2026, Context Manager rifatto): la frase lunga del «modo semplice» è diventata la riga sopra le schede, e le
     schede del motore non ci sono; i numeri dell'avviso sono nella testata, sul limite che agisce, e la barra ha la tacca. */
  await expect(finestra.locator('[data-context-legacy-note]')).toBeVisible();
  await expect(finestra.locator('[data-context-tab]:not([hidden])')).toHaveCount(2);
  await expect(finestra.locator('[data-context-headline]'), 'gli stessi numeri dell’avviso (solo prompt_tokens dell’ultima richiesta)').toHaveText('52k di 150k · 34,7%');
  await expect(finestra.locator('[data-context-measurement]')).toContainText('150k');
  await expect(finestra.locator('[data-context-gauge]')).toBeVisible();
  await expect(barra(page), 'aprire la finestra non compatta').toHaveCount(0);
  expect(chiamate, 'aprire la finestra: zero POST').toEqual([]);
  // verso contrario: «Compatta ora» chiede, «Annulla» non fa niente
  await finestra.locator('[data-context-start]').click();
  const conferma = finestra.locator('[data-context-conferma-legacy]');
  await expect(conferma).toContainText('Compattare adesso la conversazione?');
  await expect(conferma.getByRole('button', { name: 'Sì, compatta' })).toBeFocused();
  await expect(finestra.locator('[data-context-start]'), 'mentre chiede, «Compatta ora» non si ripete').toBeDisabled();
  await conferma.getByRole('button', { name: 'Annulla' }).click();
  await expect(conferma).toHaveCount(0);
  await expect(finestra.locator('[data-context-start]')).toBeFocused();
  expect(chiamate, 'Annulla: zero POST').toEqual([]);
  // la conferma vera
  await finestra.locator('[data-context-start]').click();
  await conferma.getByRole('button', { name: 'Sì, compatta' }).click();
  await expect(finestra.locator('[data-context-job]'), 'lo stato si vede DENTRO la finestra').toHaveText('Riassumo la conversazione…');
  await expect(finestra.locator('[data-context-progress-bar]')).toBeVisible();
  await expect(finestra.locator('[data-context-progress-bar]')).not.toHaveAttribute('value', /.*/);
  await expect(finestra.locator('[data-context-start]'), 'in volo: niente seconda richiesta').toBeDisabled();
  await expect(barra(page), 'e anche in chat').toContainText('Riassumo la conversazione');
  await expect(finestra.locator('[data-context-job]')).toHaveText('Conversazione riassunta. La misura si aggiorna alla prossima risposta.');
  await expect(finestra.locator('[data-context-progress-bar]')).toBeHidden();
  await expect(barra(page)).toHaveCount(0);
  await expect(separatore(page), 'esito: una riga persistente in chat').toContainText('Conversazione riassunta');
  expect(chiamate, 'una POST sola').toHaveLength(1);
  expect(mutazioniTrial, 'col trial spento il trial non si tocca').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(finestra).toBeHidden();
  // la palette («Gestione del contesto») guarda anch'essa: apre la finestra, nessuna POST in più
  await page.evaluate(() => window.__talosHarnessUiRuntime.executeCommand('compact'));
  await expect(finestra).toBeVisible();
  await expect(finestra.locator('[data-context-conferma-legacy]'), 'riaperta, la conferma di prima non c’è più').toHaveCount(0);
  // C1 (10/10/2026): a riposo la riga del lavoro non c'è (owner: «non troppo affollata»); l'esito di prima non si spaccia per attuale
  await expect(finestra.locator('[data-context-job]'), 'riaperta, l’esito di prima non si spaccia per attuale').toBeHidden();
  expect(chiamate).toHaveLength(1);
  await page.keyboard.press('Escape');
});

/* ⛔ 24/09/2026 sera, foto `01-finestra-*` del giro vero sul 4174: il misuratore usciva VERDE (colore di serie di `<meter>`).
   Si misura il pixel del riempimento contro l'accento risolto del tema, e il verso contrario: non è verde. */
test('CTX-UI-METER-IN-PALETTE — il misuratore della finestra si riempie con l’accento del tema, non col verde di serie', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/api/v1/models*', (route) => route.fulfill({ json: { ok: true, data: { modelli: [{ id: MODELLO, nome: 'GLM 5.3 Flash', provider: 'openrouter', contextLength: 200_000 }] }, meta: {} } }));
  const pieno = giro(1, undefined, 130_000);
  await policyFixture(page, '**/api/v1/sessions/cl-misuratore/compaction-policy');
  await apri(page, 'cl-misuratore', pieno, { conclusa: true });
  await page.locator('#compactSessionBtn').click();
  // C1 (10/10/2026): il misuratore nativo è diventato la barra della panoramica; la regola resta: colori del tema, mai il verde di serie
  const meter = page.locator('#veloContesto [data-context-gauge]');
  await expect(meter).toBeVisible();
  // la finestra entra con un'animazione: il pixel si legge a movimento finito (prima si leggeva l'accento mescolato allo sfondo)
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((x) => x.finished.catch(() => null))), new Promise((ok) => setTimeout(ok, 3000))]));
  /* ⛔ 24/09 notte: con Forge (tema di serie) l'accento calcolato arriva come `color(srgb 0.4388 0.3176 0.1451)`, non `rgb(…)`:
     la prima versione leggeva le cifre e dava «0,438824,0». Si leggono le due forme. */
  const accento = await page.evaluate(() => {
    const d = document.createElement('div'); d.style.background = 'var(--talos-accent)'; document.body.append(d);
    const c = getComputedStyle(d).backgroundColor; d.remove();
    const srgb = c.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    return srgb ? srgb.slice(1, 4).map((v) => Math.round(Number(v) * 255)) : c.match(/[\d.]+/g).slice(0, 3).map(Number);
  });
  const box = await meter.boundingBox();
  const png = PNG.sync.read(await page.screenshot());
  expect([png.width, png.height]).toEqual([1920, 1080]);
  const x = Math.floor(box.x + box.width * 0.2), y = Math.floor(box.y + box.height / 2), i = (png.width * y + x) * 4;
  const pixel = [png.data[i], png.data[i + 1], png.data[i + 2]];
  const distanza = Math.hypot(pixel[0] - accento[0], pixel[1] - accento[1], pixel[2] - accento[2]);
  expect(distanza, `pixel ${pixel} contro accento ${accento}`).toBeLessThan(30);
  expect(pixel[1] > pixel[0] + 30, `non verde: ${pixel}`).toBe(false);
  await page.keyboard.press('Escape');
});

test('CTX-UI-WINDOW-ERROR-SAID — un rifiuto del server si legge nella finestra, con le sue parole, e la finestra resta usabile', async ({ page }) => {
  await page.route('**/api/v1/sessions/cl-rifiuto/compact', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 409, json: { ok: false, error: { code: 'SESSION_NOT_READY', message: 'La sessione è ancora in corso: aspetta che concluda prima di compattarla' } } })
    : route.fallback());
  await apri(page, 'cl-rifiuto', giro(), { conclusa: true });
  const finestra = page.locator('#veloContesto');
  await page.locator('#compactSessionBtn').click();
  await expect(finestra).toHaveAttribute('data-context-modo', 'legacy');
  await finestra.locator('[data-context-start]').click();
  await finestra.locator('[data-context-conferma-legacy]').getByRole('button', { name: 'Sì, compatta' }).click();
  await expect(finestra.locator('[data-context-job]')).toHaveText('Conversazione non riassunta.');
  await expect(finestra.locator('[data-context-job-error]')).toHaveText('La sessione è ancora in corso: aspetta che concluda prima di compattarla');
  await expect(finestra.locator('[data-context-start]')).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('CTX-UI-WINDOW-FOLLOWS-SERVER — a finestra aperta, un riassunto partito dal server si vede anche lì, e si spegne alla fine', async ({ page }) => {
  await apri(page, 'cl-segue', giro());
  const finestra = page.locator('#veloContesto');
  await page.locator('#compactSessionBtn').click();
  await expect(finestra).toHaveAttribute('data-context-modo', 'legacy');
  await eventi(page, [INIZIO]);
  await expect(finestra.locator('[data-context-job]')).toHaveText('Riassumo la conversazione…');
  await expect(finestra.locator('[data-context-start]')).toBeDisabled();
  await eventi(page, [FINE]);
  await expect(finestra.locator('[data-context-job]')).toHaveText('Nessuna compattazione in corso.');
  await expect(finestra.locator('[data-context-start]')).toBeEnabled();
  await page.keyboard.press('Escape');
});

/*
 * ⛔ 24/09/2026 sera — «si è bloccato così», «non ho visto una barra di progresso». Col movimento ridotto (acceso in Windows
 *   sull'owner) la barra aveva `animation: none`: ferma. Decisione owner del 02/09: un indicatore di stato si CALMA, non si
 *   congela. Si misura l'animazione (`getAnimations`) E i pixel: il binario del motore copriva il gradiente.
 */
for (const moto of ['reduce', 'no-preference']) {
  test(`CTX-UI-BAR-CALM-NOT-FROZEN-${moto} — la barra del riassunto si muove (${moto === 'reduce' ? '3,2 s col movimento ridotto' : '1,6 s'}) e si vede muoversi`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: moto });
    await apri(page, `cl-moto-${moto}`, [...giro(), INIZIO]);
    const progress = barra(page).locator('progress');
    await expect(progress).toBeVisible();
    const animazioni = await progress.evaluate((el) => el.getAnimations().map((a) => ({ stato: a.playState, durata: a.effect?.getTiming?.().duration })));
    expect(animazioni, 'una animazione, in corsa').toEqual([{ stato: 'running', durata: moto === 'reduce' ? 3200 : 1600 }]);
    const box = await progress.boundingBox();
    const primo = PNG.sync.read(await page.screenshot({ animations: 'allow' }));
    await page.waitForTimeout(500);
    const secondo = PNG.sync.read(await page.screenshot({ animations: 'allow' }));
    expect([primo.width, primo.height, secondo.width, secondo.height]).toEqual([1920, 1080, 1920, 1080]);
    let differenza = 0;
    const minX = Math.max(0, Math.floor(box.x)), maxX = Math.min(primo.width, Math.ceil(box.x + box.width));
    const minY = Math.max(0, Math.floor(box.y)), maxY = Math.min(primo.height, Math.ceil(box.y + box.height));
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const i = (primo.width * y + x) * 4;
      differenza += Math.abs(primo.data[i] - secondo.data[i]) + Math.abs(primo.data[i + 1] - secondo.data[i + 1]) + Math.abs(primo.data[i + 2] - secondo.data[i + 2]);
    }
    expect(differenza, 'a schermo cambia: il gradiente si vede scorrere').toBeGreaterThan(0);
  });
}

test('CTX-UI-COMPACT-TRIAL-KEEPS-DIALOG (verso contrario) — col trial acceso resta il dialogo e zero POST legacy', async ({ page }) => {
  const chiamate = await contaPost(page, '**/api/v1/sessions/cl-trial/compact', { ok: true, data: { compattato: true }, meta: {} });
  await page.route('**/api/v1/sessions/cl-trial/context', (route) => route.fulfill({ json: { sessionId: 'cl-trial', revision: 1, stateRevision: 1, jobs: [], settings: { auto: true }, facts: [], capabilities: { compact: true }, activeVersion: null } }));
  await page.route('**/api/v1/sessions/cl-trial/context/versions', (route) => route.fulfill({ json: { versions: [] } }));
  await apri(page, 'cl-trial', giro());
  await page.locator('#compactSessionBtn').click();
  await expect(page.locator('#veloContesto')).toBeVisible();
  await expect(page.locator('[data-context-start]')).toBeEnabled();
  expect(chiamate).toEqual([]);
  await page.keyboard.press('Escape');
});

test('CTX-UI-WARNING-BEFORE-THRESHOLD — sopra 0,8 della soglia compare l’avviso sopra il composer; sotto, niente', async ({ page }) => {
  await page.route('**/api/v1/models*', (route) => route.fulfill({ json: { ok: true, data: { modelli: [{ id: MODELLO, nome: 'GLM 5.3 Flash', provider: 'openrouter', contextLength: 200_000 }] }, meta: {} } }));
  const pieno = giro(1, undefined, 130_000);
  await policyFixture(page, '**/api/v1/sessions/cl-quasi-pieno/compaction-policy');
  await policyFixture(page, '**/api/v1/sessions/cl-leggera/compaction-policy');
  await apri(page, 'cl-quasi-pieno', pieno);
  const avviso = page.locator('#avvisoContesto');
  await expect(avviso).toBeVisible();
  await expect(avviso).toContainText('soglia prudenziale della route');
  await expect(avviso).toContainText('130.000');
  await expect(avviso.getByRole('button', { name: 'Compatta ora' })).toHaveCount(1);
  await expect(avviso.getByRole('button'), 'una sola azione più la chiusura').toHaveCount(2);
  await avriChiudi(page);
  // verso contrario: una conversazione piccola non avvisa
  await apri(page, 'cl-leggera', giro());
  await expect(page.locator('#avvisoContesto')).toBeHidden();
});

test('CTX-WINDOW-UI — la policy verificata del server evita il falso avviso a 164k', async ({ page }) => {
  await page.route('**/api/v1/sessions/cl-finestra-verificata/compaction-policy', (route) => route.fulfill({ json: {
    ok: true, data: { windowTokens: 1_000_000, triggerTokens: 750_000, warningTokens: 600_000,
      emergencyTokens: 900_000, source: 'route-minimum', modelId: MODELLO, inProgress: false }, meta: {},
  } }));
  await apri(page, 'cl-finestra-verificata', giro(1, undefined, 163_901));
  await expect(page.locator('#avvisoContesto')).toBeHidden();
  await eventi(page, giro(10, undefined, 650_000));
  await expect(page.locator('#avvisoContesto')).toBeVisible();
  await expect(page.locator('#avvisoContesto')).toContainText('soglia prudenziale della route');
  await expect(page.locator('#avvisoContesto')).toContainText('650.000');
});
/* 29/09: come Hermes (`turn_context_compaction.py:89-100`) la finestra si rilegge al confine di turno, senza push: dopo il refresh
   in background dell'adapter la policy passa da `fallback` a `route-minimum` e il RunFinished successivo deve portarla in UI. */
test('CTX-UI-POLICY-REREAD — dopo il refresh della route il confine di turno rilegge la policy e la soglia cambia', async ({ page }) => {
  let routeVerificata = false;
  await page.route('**/api/v1/sessions/cl-rilettura/compaction-policy', (route) => route.fulfill({ json: {
    ok: true, meta: {}, data: routeVerificata
      ? { windowTokens: 262_144, triggerTokens: 196_608, warningTokens: 157_286, emergencyTokens: 235_929, source: 'route-minimum', modelId: MODELLO, inProgress: false }
      : { windowTokens: null, triggerTokens: 200_000, warningTokens: 160_000, emergencyTokens: 240_000, source: 'fallback', modelId: MODELLO, inProgress: false },
  } }));
  await apri(page, 'cl-rilettura', giro(1, undefined, 158_000));
  await expect(page.locator('#avvisoContesto'), '158.000 è sotto l’avviso del fallback (160.000)').toBeHidden();
  routeVerificata = true;
  await eventi(page, giro(10, undefined, 158_000));
  await expect(page.locator('#avvisoContesto'), '158.000 supera l’avviso della route verificata (157.286)').toBeVisible();
  await expect(page.locator('#avvisoContesto')).toContainText('soglia prudenziale della route');
  await expect(page.locator('#avvisoContesto')).toContainText('158.000');
});
async function avriChiudi(page) { await page.locator('#avvisoContesto [data-avviso-contesto="chiudi"]').click(); await expect(page.locator('#avvisoContesto')).toBeHidden(); }

test('CTX-UI-DURING-STATE — a fase:inizio la barra parte per il legacy, altezza fissa; a fase:fine sparisce e resta la riga', async ({ page }) => {
  await apri(page, 'cl-durante', [...giro(), INIZIO]);
  await expect(barra(page)).toBeVisible();
  await expect(barra(page)).toContainText('Riassumo la conversazione');
  await expect(page.locator('#avvisoContesto'), 'mentre il server riassume, «Compatta ora» non si offre').toBeHidden();
  await expect(barra(page).locator('progress')).not.toHaveAttribute('value', /.*/);
  const prima = await barra(page).boundingBox();
  await page.waitForTimeout(700);
  const dopo = await barra(page).boundingBox();
  expect(dopo.height, 'nessun salto: la barra non cambia altezza mentre lavora').toBe(prima.height);
  await eventi(page, [FINE]);
  await expect(barra(page)).toHaveCount(0);
  await expect(separatore(page)).toHaveCount(1);
  await expect(separatore(page)).toContainText('Conversazione riassunta · 184.000 → 41.000 token');
});

test('CTX-UI-SEPARATOR-SURVIVES-RELOAD-LEGACY — la riga «X → Y token» si ricostruisce dagli eventi rigiocati, una sola', async ({ page }) => {
  await apri(page, 'cl-riga', [...giro(), INIZIO, FINE, ...giro(30, 'E adesso la suite lenta')]);
  await expect(separatore(page)).toHaveCount(1);
  await expect(separatore(page)).toContainText('184.000 → 41.000 token');
  // il separatore sta NEL PUNTO della conversazione: dopo il primo turno, prima del secondo
  const ordine = await page.evaluate(() => [...document.querySelectorAll('#conversation > *')].map((n) => n.dataset.compattazioneLegacy !== undefined ? 'riga' : (n.dataset.turno || n.className.split(' ')[0])));
  expect(ordine.indexOf('riga')).toBeGreaterThan(0);
  expect(ordine.indexOf('riga')).toBeLessThan(ordine.length - 1);
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await apri(page, 'cl-riga', [...giro(), INIZIO, FINE, ...giro(30, 'E adesso la suite lenta')]);
  await expect(separatore(page)).toHaveCount(1);
  await expect(separatore(page)).toContainText('184.000 → 41.000 token');
  // una riconnessione SSE rimanda lo stesso evento: la riga resta una (chiave = `at` del record)
  await eventi(page, [FINE]);
  await expect(separatore(page)).toHaveCount(1);
  // il menu «⋯» porta Annulla; fuori dal menu niente. «Mostra cosa è stato riassunto» NON c'è: il riassunto non viaggia
  // nell'evento fuso (`session-registry.mjs:3111`), e non si inventa — dichiarato nel rapporto §6.
  await expect(separatore(page).getByRole('button', { name: /Annulla/ })).toHaveCount(0);
  await separatore(page).locator('[data-compattazione-menu]').click();
  const menu = page.locator('[role="menu"].talos-menu-azioni');
  await expect(menu.getByRole('menuitem', { name: 'Annulla il riassunto' })).toHaveCount(1);
  await expect(menu.getByRole('menuitem', { name: 'Mostra cosa è stato riassunto' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('CTX-UI-UNDO-CALLS-ROUTE-ONCE — Annulla chiama la rotta una volta sola e la riga diventa «Riassunto annullato»', async ({ page }) => {
  const chiamate = await contaPost(page, `**/api/v1/sessions/cl-annulla/compaction/${encodeURIComponent(AT)}/undo`, { ok: true, data: { annullata: true }, meta: {} }, { ritardoMs: 1500 });
  await apri(page, 'cl-annulla', [...giro(), INIZIO, FINE]);
  await separatore(page).locator('[data-compattazione-menu]').click();
  await page.locator('[role="menu"].talos-menu-azioni').getByRole('menuitem', { name: 'Annulla il riassunto' }).click();
  // in volo: il menu non offre più l'annullo (l'unica guardia è lo stato della riga: M3b la rompe e questo diventa rosso)
  await separatore(page).locator('[data-compattazione-menu]').click();
  await expect(page.locator('[role="menu"].talos-menu-azioni').getByRole('menuitem', { name: 'Annulla il riassunto' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(separatore(page)).toContainText('Riassunto annullato');
  expect(chiamate).toHaveLength(1);
  // l'evento del server arriva dopo: la riga resta una, e dice la stessa cosa
  await eventi(page, [ANNULLATA]);
  await expect(separatore(page)).toHaveCount(1);
  await expect(separatore(page)).toContainText('Riassunto annullato');
  await expect(separatore(page).locator('[data-compattazione-menu]'), 'niente più azioni su un riassunto annullato').toHaveCount(0);
});

test('CTX-UI-OVERFLOW-ACTION-WORKS — l’errore «contesto pieno» porta un pulsante che compatta davvero', async ({ page }) => {
  const chiamate = await contaPost(page, '**/api/v1/sessions/cl-pieno/compact', { ok: true, data: { compattato: true }, meta: {} });
  await apri(page, 'cl-pieno', [
    { type: 'RunStarted', _sequenza: 1, input: { consegna: 'Continua' } },
    { type: 'RunError', _sequenza: 2, code: 'internal-error', message: 'HTTP 400 dopo 4 tentativi: {"error":{"code":400,"message":"request (17993 tokens) exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error"}}' },
  ], { conclusa: true });
  const nota = page.locator('#conversation .real-session-status').last();
  await expect(nota).toContainText('non entra nella finestra');
  await nota.getByRole('button', { name: 'Compatta ora' }).click();
  await expect(separatore(page)).toContainText('Conversazione riassunta');
  expect(chiamate).toHaveLength(1);
});

test('CTX-UI-REPAIR-NOTICE-PERSISTENT — il journal riparato è una riga in chat, con il percorso della copia, e sopravvive alla ricarica', async ({ page }) => {
  const flusso = [{ type: 'RunStarted', _sequenza: 1, input: { consegna: 'Riprendi' } }, RIPARATO, ...giro(3).slice(1)];
  await apri(page, 'cl-riparato', flusso);
  const riga = page.locator('#conversation [data-journal-riparato]');
  await expect(riga).toHaveCount(1);
  await expect(riga).toContainText('Conversazione recuperata dopo un’interruzione: 3 righe scartate');
  // a metà turno la nota entra NEL turno TALOS: un turno della persona e uno di TALOS, non un giro fantasma (foto 6 della prima corsa)
  await expect(page.locator('#conversation > .talos-turn')).toHaveCount(2);
  await expect(page.locator('#conversation .talos-turn-spine__n')).toHaveCount(2);
  await expect(page.locator('.talos-toast-region [data-journal-riparato], .toast [data-journal-riparato]'), 'mai un toast che sparisce').toHaveCount(0);
  await riga.getByRole('button', { name: 'Dove sta la copia' }).click();
  await expect(riga.locator('code')).toHaveText('C:\\Users\\prova\\.sessions-store\\cl-riparato.jsonl.bak');
  await page.reload();
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await apri(page, 'cl-riparato', flusso);
  await expect(page.locator('#conversation [data-journal-riparato]')).toHaveCount(1);
});

test('CTX-UI-REPAIR-FAILED-HONEST — una riparazione NON riuscita (`riparato:false`) lo dice, con l’errore, e non parla di «recuperata»', async ({ page }) => {
  await apri(page, 'cl-riparato-ko', [{ type: 'RunStarted', _sequenza: 1, input: { consegna: 'Riprendi' } }, RIPARATO_FALLITO, ...giro(3).slice(1)]);
  const riga = page.locator('#conversation [data-journal-riparato]');
  await expect(riga).toHaveCount(1);
  await expect(riga).toContainText('non è riuscita');
  await expect(riga).toContainText('EPERM: operation not permitted, rename');
  await expect(riga).not.toContainText('recuperata dopo');
  await expect(riga.getByRole('button', { name: 'Dove sta la copia' }), 'senza copia, niente pulsante').toHaveCount(0);
});

test('CTX-UI-JOURNAL-GAP-NOTICE — un buco nel salvataggio (owner 26/09): la nota dice fino a che giro è tornata e cosa è stato lasciato da parte', async ({ page }) => {
  const BUCO = { type: 'CUSTOM', name: 'talos.journal-riparato', _sequenza: 2, value: { riparato: true, completata: true, righeScartate: 2, byteScartati: null, backup: null, buco: { recuperataFinoAlGiro: 7, deltaScartati: 2 } } };
  await apri(page, 'cl-buco', [{ type: 'RunStarted', _sequenza: 1, input: { consegna: 'Riprendi' } }, BUCO, ...giro(3).slice(1)]);
  const riga = page.locator('#conversation [data-journal-riparato]');
  await expect(riga).toHaveCount(1);
  await expect(riga).toContainText('Conversazione recuperata fino al giro 7');
  await expect(riga).toContainText('2 parti successive sono state lasciate da parte');
  await expect(riga).toContainText('Il file originale non è stato modificato');
  await expect(riga, 'non è una coda spezzata: niente «righe scartate in fondo al file»').not.toContainText('in fondo al file');
});

/*
 * ⛔ 24/09/2026 (review avversaria su F3+F5) — LA BARRA SI RICONCILIA. Un «inizio» senza il suo «fine» teneva accesa la barra
 *   per sempre: dopo un riavvio a metà sintesi (il registro ora chiude con `motivo:'interrotta'` al ripristino) e dentro un giro
 *   finito in errore (Hermes: `reconcileSessionCompacting(sessionId, 'terminal')`, clone 65ad529).
 */
test('CTX-UI-BAR-RECONCILED-ON-ERROR — un giro finito in ERRORE spegne la barra rimasta accesa: nessuno manderà il suo «fine»', async ({ page }) => {
  const inTurno = giro().slice(0, 3); // RunStarted + testo, niente RunFinished
  await apri(page, 'cl-barra-errore', [...inTurno,
    { type: 'CUSTOM', name: 'talos.compattazione', _sequenza: 10, value: { fase: 'inizio', giro: 3, tokenPrima: 184_000, soglia: 150_000, motivo: 'emergenza' } },
    { type: 'RunError', _sequenza: 11, message: 'Il fornitore ha chiuso la connessione.' }]);
  await expect(page.locator('#conversation')).toContainText('Ho letto la cartella dei test');
  await expect(barra(page)).toHaveCount(0);
});

test('CTX-UI-BAR-CLOSED-BY-RESTORE — la chiusura «interrotta» del ripristino spegne la barra e lo dice a parole, senza Annulla', async ({ page }) => {
  await apri(page, 'cl-barra-interrotta', [...giro(), INIZIO,
    { type: 'CUSTOM', name: 'talos.compattazione', _sequenza: 21, value: { fase: 'fine', compattato: false, motivo: 'interrotta', at: AT } }]);
  await expect(separatore(page)).toContainText('il server si è fermato mentre riassumeva');
  await expect(barra(page)).toHaveCount(0);
  await expect(separatore(page).locator('[data-compattazione-menu]')).toHaveCount(0);
});

test('CTX-UI-COMPACTION-FAILED-ROW — una compattazione fallita con «errore: <testo>» mostra la frase umana e il dettaglio, senza Annulla', async ({ page }) => {
  await apri(page, 'cl-fallita', [...giro(), INIZIO, FINE_FALLITA]);
  await expect(barra(page)).toHaveCount(0);
  await expect(separatore(page)).toHaveCount(1);
  await expect(separatore(page)).toContainText('Conversazione non riassunta · il fornitore ha risposto con un errore (HTTP 500 dal fornitore)');
  await expect(separatore(page).locator('[data-compattazione-menu]')).toHaveCount(0);
});

for (const modo of ['dark', 'light']) {
  test(`CTX-UI-FOTO-${modo} — ogni stato nei viewport almeno 1080p, tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, async ({ page }) => {
    test.setTimeout(120_000);
    await mkdir(FOTO, { recursive: true });
    /* ⛔ Il copione d'avvio gira in OGNI documento, anche negli iframe con `sandbox="allow-scripts"` senza
       `allow-same-origin` (l'HTML fidato della chat, `app.js:12002`): lì `localStorage` LANCIA («The document is
       sandboxed…») e il cancello `pageerror` di questa spec lo prendeva per un errore del prodotto — misurato
       nella catena 4, 2 prove su 2, tre corse su tre. Il tema si scrive solo nel documento principale.
       `ragionamento-compresso.spec.mjs:26` e altre 13 spec hanno lo stesso copione senza guardia, ma non hanno
       il cancello. */
    await page.addInitScript((colorMode) => { if (window.top !== window) return; try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* documento senza deposito: il tema lo dà `emulateMedia` */ } }, modo);
    await page.emulateMedia({ colorScheme: modo });
    await page.route('**/api/v1/models*', (route) => route.fulfill({ json: { ok: true, data: { modelli: [{ id: MODELLO, nome: 'GLM 5.3 Flash', provider: 'openrouter', contextLength: 200_000 }] }, meta: {} } }));
    await contaPost(page, '**/api/v1/sessions/foto-*/compact', { ok: true, data: { compattato: true }, meta: {} }, { ritardoMs: 100 });
    await contaPost(page, '**/api/v1/sessions/foto-*/compaction/*/undo', { ok: true, data: { annullata: true }, meta: {} }, { ritardoMs: 100 });
    const foto = async (nome) => { for (const [w, h] of VIEWPORT) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150); await page.screenshot({ path: join(FOTO, `${nome}-${modo}-${w}x${h}.png`), fullPage: false }); } };
    const pieno = giro(1, undefined, 130_000);
    await policyFixture(page, '**/api/v1/sessions/foto-*/compaction-policy');
    await apri(page, `foto-${modo}-avviso`, pieno);
    await expect(page.locator('#avvisoContesto')).toBeVisible();
    await foto('1-avviso');
    await apri(page, `foto-${modo}-durante`, [...giro(), INIZIO]);
    await expect(barra(page)).toBeVisible();
    await foto('2-durante');
    await eventi(page, [FINE]);
    await expect(separatore(page)).toBeVisible();
    await foto('3-dopo');
    for (const [w, h] of VIEWPORT) {
      await page.setViewportSize({ width: w, height: h });
      await separatore(page).locator('[data-compattazione-menu]').click();
      const bordo = await page.locator('[role="menu"].talos-menu-azioni').boundingBox();
      expect(bordo.x + bordo.width, `il menu «⋯» resta dentro lo schermo a ${w} (foto 3b della prima corsa: usciva)`).toBeLessThanOrEqual(w);
      await page.screenshot({ path: join(FOTO, `3b-menu-${modo}-${w}x${h}.png`) });
      await page.keyboard.press('Escape');
    }
    await eventi(page, [ANNULLATA]);
    await expect(separatore(page)).toContainText('Riassunto annullato');
    await foto('4-annullato');
    await apri(page, `foto-${modo}-errore`, [
      { type: 'RunStarted', _sequenza: 1, input: { consegna: 'Continua' } },
      { type: 'RunError', _sequenza: 2, code: 'internal-error', message: 'HTTP 400 dopo 4 tentativi: {"error":{"code":400,"message":"request (17993 tokens) exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error"}}' },
    ], { conclusa: true });
    await expect(page.locator('#conversation .real-session-status').last().getByRole('button', { name: 'Compatta ora' })).toBeVisible();
    await foto('5-errore');
    await apri(page, `foto-${modo}-riparato`, [{ type: 'RunStarted', _sequenza: 1, input: { consegna: 'Riprendi' } }, RIPARATO, ...giro(3).slice(1)]);
    await page.locator('#conversation [data-journal-riparato]').getByRole('button', { name: 'Dove sta la copia' }).click();
    await foto('6-riparato');
  });
}
