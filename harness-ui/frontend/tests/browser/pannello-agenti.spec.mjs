/*
 * PANNELLO DI DESTRA v2 — la scheda AGENTI nell'app vera (owner 29/10/2026: «Approvato, mi raccomando prevedi tutti gli Edge cases»).
 * Le figlie arrivano dalla rotta vera `GET …/children` (finta solo nel contenuto, con la forma di `snapshotFiglio`) e dagli eventi
 * `talos.agenti`; ogni richiesta che scrive passa da `page.route` e si CONTA. Ogni prova asserisce la sua premessa e dice cosa la fa
 * diventare rossa. Casi limite coperti qui: vuoto, uno, tantissimi (pagine), nome lunghissimo e con markup, 900×600 e 1920×1080,
 * chiaro e scuro, inglese, ricaricamento con pieghe ricordate e storage rotto, cambio di sessione, tastiera, conferma nella riga
 * con l'agente che finisce mentre è aperta, «Rispondi» con la carta smontata, movimento ridotto.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'pannello-agenti');
const MIN = 60_000;
const ID = 'pnag-uno';
const ora = Date.now();
const iso = (fa) => new Date(ora - fa).toISOString();
const figlia = (id, sopra = {}) => ({
  sessionId: id, padreId: ID, nome: `Agente ${id}`, taskCorto: `compito di ${id}`, task: `Compito: fai la parte ${id} del lavoro`, modello: 'z-ai/glm-5.3-flash',
  permessi: 'workspace-write', conclusa: false, interrotta: false, esitoDelega: null, avviataAlle: iso(5 * MIN), ultimaAttivitaAlle: iso(0.3 * MIN), collisioni: [],
  attivita: { chiamate: 3, attrezzoCorrente: 'leggi', bersaglioCorrente: 'src/a.js', file: [{ percorso: 'src/a.js', letto: true }], fileTagliati: 0, passi: [] },
  ...sopra,
});
const BASE = [
  figlia('pnag-lavora'),
  figlia('pnag-aspetta', { approvalPendingCount: 1, inAttesaApprovazione: true }),
  figlia('pnag-fallita', { conclusa: true, esitoDelega: 'fallito', ultimoEsito: 'errore', conclusaAlle: iso(1 * MIN), riassuntoDelega: 'Il test non passa: manca il file di prova.' }),
  figlia('pnag-finita', { conclusa: true, esitoDelega: 'riuscito', ultimoEsito: 'successo', conclusaAlle: iso(2 * MIN) }),
];

async function scena(page, { figlie = BASE, larghezza = 1440, altezza = 900, tema = 'dark', lingua = 'it', pendente = null, storageRotto = false, sessione = ID } = {}) {
  const scritture = [];
  const corpiStop = [];
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode, lingua, storageRotto }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: lingua } })); } catch { /* */ }
    if (storageRotto) {
      const vero = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (String(k).includes('pannello')) throw new DOMException('pieno', 'QuotaExceededError'); return vero.call(this, k, v); };
      const leggi = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) { if (String(k).includes('pannello')) throw new DOMException('negato', 'SecurityError'); return leggi.call(this, k); };
    }
  }, { colorMode: tema, lingua, storageRotto });
  await page.route('**/api/v1/sessions/pnag-*/events*', () => { /* aperto e muto */ });
  await page.route(`**/api/v1/sessions/${sessione}/children`, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: figlie } }) }));
  await page.route('**/api/v1/sessions/pnag-*/pending', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { pending: pendente } }) }));
  await page.route('**/api/v1/sessions/pnag-*/stop', (r) => { scritture.push(r.request().url()); corpiStop.push(r.request().postDataJSON()); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }); });
  await page.route('**/api/v1/sessions/pnag-*/delegation/*', (r) => { scritture.push(r.request().url()); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) }); });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'PNAG', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9301, input: { consegna: 'Dividi il lavoro' }, contesto: { cartella: 'C:\\progetti\\talos prova', modello: 'glm-5.3-flash' } }, g);
  }, sessione);
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="agenti"]').click();
  return { scritture, corpiStop };
}
const scheda = (page) => page.locator('#railAgenti');
const riga = (page, id) => page.locator(`#railAgenti .pn-riga[data-chiave="${id}"]`);
const manda = (page, a) => page.evaluate(({ a, id }) => {
  const r = window.__talosHarnessUiRuntime;
  r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: id, parentId: id, childId: a.sessionId, reason: a.conclusa ? 'completed' : 'created', agent: { ...a, padreId: id } } }, r.realSessionState.generation);
}, { a, id: ID });

test('PNAG-01 — la scheda v2: «Richiede attenzione» in cima con il perché, poi In corso, poi Terminati; niente card classiche', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  await scena(page);
  await expect(riga(page, 'pnag-lavora'), 'premessa: le figlie sono arrivate alla scheda').toBeVisible({ timeout: 10_000 });
  const sezioni = await scheda(page).locator('.pn-sezione').evaluateAll((n) => n.map((s) => s.dataset.sezione));
  expect(sezioni.slice(0, 3)).toEqual(['attenzione', 'lavoro', 'fine']);
  await expect(scheda(page).locator('[data-sezione="attenzione"] .pn-riga')).toHaveCount(2);
  await expect(riga(page, 'pnag-fallita')).toContainText('manca il file di prova');
  await expect(scheda(page).locator('.talos-agenti-stati, .talos-agenti-icona'), 'la vista classica non resta sotto la nuova').toHaveCount(0);
  await expect(scheda(page).locator('[data-c="AgentRow"]'), 'ogni riga v2 porta il nome di componente di oggi').toHaveCount(await scheda(page).locator('.pn-riga').count());
  await expect(page.locator('#railTabs [data-rail="agenti"] .talos-tabs__count'), 'gli agenti VIVI: in corso e in attesa (owner 29/10 sera)').toHaveText('2');
  await expect(page.locator('#railTabs [data-rail="agenti"] .pn-contatore__punto'), 'in più il pallino: qualcuno aspetta o è da guardare').toHaveCount(1);
  expect(errori).toEqual([]);
});

test('PNAG-02 — «Ferma» si conferma NELLA riga (decisione owner 2): Annulla non scrive niente, Conferma scrive una volta e la riga lo dice', async ({ page }) => {
  const { scritture, corpiStop } = await scena(page);
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  await riga(page, 'pnag-lavora').hover(); // il «⋯» compare al passaggio (o col fuoco), come nelle righe di oggi
  await riga(page, 'pnag-lavora').locator('[data-controllo="menu-riga"]').click();
  await page.locator('.ft-actions-menu [role="menuitem"]', { hasText: /Ferma/u }).last().click();
  const conferma = riga(page, 'pnag-lavora').locator('.pn-conferma');
  await expect(conferma, 'la conferma sta nella riga').toBeVisible();
  await expect(page.locator('.talos-dialog:visible, [role="dialog"]:visible'), 'nessuna modale').toHaveCount(0);
  await conferma.locator('[data-controllo="conferma-no"]').click();
  await expect(conferma).toHaveCount(0);
  expect(scritture, 'Annulla non ferma niente (M-11)').toEqual([]);
  await riga(page, 'pnag-lavora').hover(); // il «⋯» compare al passaggio (o col fuoco), come nelle righe di oggi
  await riga(page, 'pnag-lavora').locator('[data-controllo="menu-riga"]').click();
  await page.locator('.ft-actions-menu [role="menuitem"]', { hasText: /Ferma/u }).last().click();
  await riga(page, 'pnag-lavora').locator('[data-controllo="conferma-si"]').click();
  await expect(riga(page, 'pnag-lavora').locator('.pn-esito'), 'l’esito sta nella riga').toContainText(/Fermato|Lo fermo/u);
  expect(scritture.filter((u) => u.endsWith('/pnag-lavora/stop'))).toHaveLength(1);
  /* ⛔ coordinatore 29/10 sera: fermare UN agente ferma anche i suoi discendenti (come stop_child del modello); con `{}` le nipoti
     continuerebbero a lavorare e a pagare */
  expect(corpiStop, 'il corpo dello stop ferma il ramo intero').toEqual([{ figlie: 'tutte' }]);
});

test('PNAG-03 — l’agente finisce mentre la sua conferma «Ferma» è aperta: la conferma sparisce e la riga dice che aveva già finito', async ({ page }) => {
  const { scritture } = await scena(page);
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  await riga(page, 'pnag-lavora').hover(); // il «⋯» compare al passaggio (o col fuoco), come nelle righe di oggi
  await riga(page, 'pnag-lavora').locator('[data-controllo="menu-riga"]').click();
  await page.locator('.ft-actions-menu [role="menuitem"]', { hasText: /Ferma/u }).last().click();
  await expect(riga(page, 'pnag-lavora').locator('.pn-conferma')).toBeVisible();
  await manda(page, { ...BASE[0], conclusa: true, esitoDelega: 'riuscito', ultimoEsito: 'successo', conclusaAlle: new Date().toISOString() });
  await expect(riga(page, 'pnag-lavora').locator('.pn-conferma')).toHaveCount(0);
  await expect(riga(page, 'pnag-lavora').locator('.pn-esito')).toContainText('già finito');
  expect(scritture).toEqual([]);
});

test('PNAG-04 — «Rispondi» porta alla carta in chat; se nessuno aspetta più, lo dice invece di fingere', async ({ page }) => {
  await scena(page, { pendente: null });
  await expect(riga(page, 'pnag-aspetta')).toBeVisible({ timeout: 10_000 });
  await riga(page, 'pnag-aspetta').locator('[data-controllo="rispondi"]').click();
  await expect(riga(page, 'pnag-aspetta').locator('.pn-esito[role="alert"]')).toContainText('non è più aperta');
});

test('PNAG-04b — «Rispondi» con la carta non (più) montata: si rilegge da /pending, si monta, si porta in vista', async ({ page }) => {
  await scena(page, { pendente: { tipo: 'approvazione', requestId: 'req-pnag-1', azione: { tipo: 'shell', comando: 'npm test -- report' } } });
  await expect(riga(page, 'pnag-aspetta')).toBeVisible({ timeout: 10_000 });
  /* la carta può essere già montata dalla lettura di /children (C2-08): si toglie per provare il caso smontato dal rigioco */
  await page.evaluate(() => document.querySelectorAll('[data-figlia="pnag-aspetta"]').forEach((n) => n.remove()));
  await riga(page, 'pnag-aspetta').locator('[data-controllo="rispondi"]').click();
  await expect(riga(page, 'pnag-aspetta').locator('.pn-esito')).toContainText('nella chat');
  await expect(page.locator('[data-figlia="pnag-aspetta"]').first()).toBeInViewport();
  await expect(riga(page, 'pnag-aspetta'), 'il perché è il comando vero (A-07)').toContainText('npm test -- report');
});

test('PNAG-05 — «Riprova» nella riga del non riuscito: una scrittura, l’esito nella riga', async ({ page }) => {
  const { scritture } = await scena(page);
  await expect(riga(page, 'pnag-fallita')).toBeVisible({ timeout: 10_000 });
  await riga(page, 'pnag-fallita').locator('[data-controllo="riprova"]').click();
  await expect(riga(page, 'pnag-fallita').locator('.pn-esito')).toContainText(/Ripartito|ripartire/u);
  expect(scritture.filter((u) => u.endsWith('/delegation/retry'))).toHaveLength(1);
});

const molte = () => [...BASE, ...Array.from({ length: 27 }, (_, i) => figlia(`pnag-m${String(i).padStart(2, '0')}`, { nome: `Agente numero ${i}`, conclusa: true, esitoDelega: 'riuscito', ultimoEsito: 'successo', conclusaAlle: iso(MIN) }))];

for (const [larghezza, altezza, tema] of [[1920, 1080, 'light'], [1920, 1080, 'dark'], [900, 600, 'dark']]) {
  test(`PNAG-06 (${larghezza}×${altezza}, ${tema}) — 31 agenti: la colonna NON scorre, le pagine portano a tutti`, async ({ page }) => {
    await scena(page, { figlie: molte(), larghezza, altezza, tema });
    await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(400); // il ridisegno che si adatta allo spazio (ResizeObserver, un fotogramma)
    const m = await scheda(page).evaluate((n) => ({ alto: n.scrollHeight, vista: n.clientHeight }));
    expect(m.alto, `la colonna scorre: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.vista + 1);
    const barra = scheda(page).locator('[data-pager]').first();
    if (await barra.count()) {
      await expect(barra.locator('[role="status"]')).toContainText(/di \d+/u);
      await barra.locator('[data-controllo^="pagina-dopo"]').click();
      await expect(barra.locator('[data-controllo^="pagina-prima"]')).toBeEnabled();
    } else {
      /* a 900×600 la fisarmonica può ripiegare «Terminati»: il suo titolo resta col conto, e la pagina si apre col clic */
      await expect(scheda(page).locator('[data-sezione="fine"] .pn-sezione__comprimi')).toContainText('28');
    }
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `molte-${larghezza}x${altezza}-${tema}.png`) });
  });
}

test('PNAG-07 — un nome lunghissimo con markup ed emoji resta TESTO (D-10) e non allarga la colonna', async ({ page }) => {
  const nome = `${'Riscrivi il modulo dei report '.repeat(12)}<img src=x onerror="window.__xss=1"> 📊`;
  await scena(page, { figlie: [figlia('pnag-lungo', { nome, taskCorto: nome })] });
  await expect(riga(page, 'pnag-lungo')).toBeVisible({ timeout: 10_000 });
  await expect(scheda(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  const fuori = await scheda(page).evaluate((n) => { const r = n.getBoundingClientRect(); return [...n.querySelectorAll('.pn-riga *')].filter((x) => x.getBoundingClientRect().right > r.right + 1).length; });
  expect(fuori).toBe(0);
});

test('PNAG-08 — le pieghe si ricordano al ricaricamento; uno storage che lancia non rompe la scheda', async ({ page }) => {
  await scena(page);
  await expect(riga(page, 'pnag-finita')).toBeVisible({ timeout: 10_000 });
  await scheda(page).locator('[data-controllo="piega-sezione-fine"]').click();
  await expect(riga(page, 'pnag-finita')).toHaveCount(0);
  await page.reload();
  await scena(page);
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  await expect(scheda(page).locator('[data-controllo="piega-sezione-fine"]'), 'la piega si ricorda').toHaveAttribute('aria-expanded', 'false');
  const page2 = await page.context().newPage();
  const errori = []; page2.on('pageerror', (e) => errori.push(e.message));
  await scena(page2, { storageRotto: true });
  await expect(riga(page2, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  await scheda(page2).locator('[data-controllo="piega-sezione-fine"]').click();
  await expect(scheda(page2).locator('[data-controllo="piega-sezione-fine"]')).toHaveAttribute('aria-expanded', 'false');
  expect(errori, 'uno storage che lancia non diventa un errore a schermo').toEqual([]);
});

test('PNAG-09 — cambio di sessione e ritorno: niente righe aperte, conferme o ricerca della sessione di prima', async ({ page }) => {
  await scena(page);
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  await riga(page, 'pnag-lavora').click();
  await expect(riga(page, 'pnag-lavora')).toHaveAttribute('aria-expanded', 'true');
  await page.route('**/api/v1/sessions/pnag-due/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: [] } }) }));
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('pnag-due', 'workspace', 'PNAG2', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  });
  await expect(scheda(page).locator('.pn-riga'), 'le righe di prima non restano nella sessione nuova').toHaveCount(0);
  await expect(scheda(page).locator('.pn-vuoto')).toBeVisible();
  await expect(page.locator('#railTabs [data-rail="agenti"] .talos-tabs__count'), 'nemmeno il numero').toHaveCount(0);
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'PNAG', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  await expect(riga(page, 'pnag-lavora'), 'tornando, la riga non riappare aperta da un’altra visita').toHaveAttribute('aria-expanded', 'false');
});

test('PNAG-10 — tastiera: una sola riga nel Tab, frecce, Fine, Invio apre il dettaglio, Esc lo chiude', async ({ page }) => {
  await scena(page);
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  expect(await scheda(page).locator('.pn-riga[tabindex="0"]').count(), 'tabindex a rotazione (D-05)').toBe(1);
  await scheda(page).locator('.pn-riga[tabindex="0"]').focus();
  await page.keyboard.press('ArrowDown');
  const seconda = await page.evaluate(() => document.activeElement?.dataset?.chiave);
  expect(seconda).toBeTruthy();
  await page.keyboard.press('End');
  const ultima = await page.evaluate(() => document.activeElement?.dataset?.chiave);
  expect(ultima).not.toBe(seconda);
  await page.keyboard.press('Enter');
  await expect(page.locator(`#railAgenti .pn-riga[data-chiave="${ultima}"]`)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator(`#railAgenti .pn-riga[data-chiave="${ultima}"]`)).toHaveAttribute('aria-expanded', 'false');
});

test('PNAG-11 — nessun agente: una frase onesta e UN pulsante che scrive nel compositore (non parte da solo)', async ({ page }) => {
  const { scritture } = await scena(page, { figlie: [] });
  await expect(scheda(page).locator('.pn-vuoto')).toBeVisible({ timeout: 10_000 });
  await scheda(page).locator('[data-controllo="azione-vuoto"]').click();
  await expect(page.locator('#composerInput, textarea').first()).not.toHaveValue('');
  expect(scritture).toEqual([]);
});

test('PNAG-12 — in inglese: gli stati vengono dalle chiavi del prodotto (che dopo la candidata 20 dicono «In progress»), nessuna parola italiana', async ({ page }) => {
  await scena(page, { lingua: 'en' });
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  await expect(scheda(page).locator('[data-sezione="lavoro"] .pn-sezione__comprimi')).toContainText(/In progress|Running/u);
  const testo = await scheda(page).innerText();
  expect(testo).not.toMatch(/\b(In corso|Terminati|Richiede attenzione|Riprova|Rispondi)\b/u);
});

test('PNAG-13 — movimento ridotto: l’anello di chi lavora respira, non gira e non è fermo (K-07)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await scena(page);
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  /* l'anello è il ::after del segno: le sue animazioni si leggono dal documento (target = il segno, pseudoElement = ::after) */
  const nomi = await page.evaluate(() => document.getAnimations().filter((x) => x.effect?.target?.matches?.('#railAgenti .pn-riga[data-chiave="pnag-lavora"] .pn-segno[data-vivo]')).map((x) => x.animationName));
  expect(nomi.length, 'calmo, mai fermo').toBeGreaterThan(0);
  expect(nomi).not.toContain('pn-giro');
});

for (const tema of ['light', 'dark']) {
  test(`PNAG-FOTO (${tema}) — 1920×1080 con tanti dati: nessun elemento esce dalla colonna, zero errori`, async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
    await scena(page, { figlie: molte(), larghezza: 1920, altezza: 1080, tema });
    await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
    await riga(page, 'pnag-lavora').click();
    await page.waitForTimeout(400);
    const fuori = await scheda(page).evaluate((n) => { const r = n.getBoundingClientRect(); return [...n.querySelectorAll('*')].filter((x) => { const b = x.getBoundingClientRect(); return b.width && (b.right > r.right + 1 || b.left < r.left - 1); }).map((x) => `${x.tagName}.${x.className?.baseVal ?? x.className}`).slice(0, 8); });
    expect(fuori).toEqual([]);
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `agenti-${tema}-1920.png`) });
    expect(errori.filter((e) => !/favicon|net::ERR|Failed to load resource/u.test(e)), 'le rotte non finte del banco rispondono 404: non sono errori della scheda').toEqual([]);
  });
}

/*
 * Revisione D del passo 1 (29/10): il disegno si rifà al più DIECI volte per adattarsi allo spazio. Un caso che non converge si
 * provoca rendendo la colonna più bassa di una sola riga (la fisarmonica non basta e le misure non tornano mai): i giri restano 10.
 */
/* 30/10/2026, trovato fotografando il 4174: la testa diceva «Questa richiesta ·» e il vuoto, perché l'ora della richiesta arriva come
   testo ISO (run-dalle-deleghe.js:174) e la scheda la passava a chi vuole un numero. Prima della cura questa prova è rossa
   (ricevuto «Questa richiesta · »). */
test('PNAG-14 — la testa dice l\'ora della richiesta in corso: «Questa richiesta · HH:MM», mai il separatore davanti al vuoto', async ({ page }) => {
  await scena(page);
  await expect(riga(page, 'pnag-lavora'), 'premessa: le figlie sono arrivate alla scheda').toBeVisible({ timeout: 10_000 });
  await expect(scheda(page).locator('.pn-quando')).toHaveText(/^Questa richiesta · \d{2}[:.]\d{2}$/u);
});

test('PNAG-GIRI — il ridisegno che si adatta allo spazio fa al più dieci giri, anche quando non converge', async ({ page }) => {
  await scena(page, { figlie: molte(), larghezza: 1920, altezza: 1080 });
  await expect(riga(page, 'pnag-lavora')).toBeVisible({ timeout: 10_000 });
  const normale = await scheda(page).evaluate((n) => n.__pannello.giriUltimoDisegno);
  expect(normale).toBeGreaterThanOrEqual(1);
  expect(normale).toBeLessThanOrEqual(10);
  const strozzato = await scheda(page).evaluate((n) => { n.style.maxHeight = '40px'; n.style.height = '40px'; n.__pannello.ridisegna(); return n.__pannello.giriUltimoDisegno; });
  expect(strozzato, 'una colonna da 40 px non converge: il ciclo si ferma al tetto').toBeLessThanOrEqual(10);
});

test('PNAG-14 — owner 29/10 notte: «Che cosa ha riportato» anche nel dettaglio della riga (a un clic), in markdown; il fallito non lo ripete', async ({ page }) => {
  const figlie = BASE.map((f) => (f.sessionId === 'pnag-finita' ? { ...f, riassuntoDelega: '**Fatto**: aggiunto il test di `src/a.js`.' } : f));
  await scena(page, { figlie });
  await riga(page, 'pnag-fallita').click();
  await expect(riga(page, 'pnag-fallita')).toHaveAttribute('aria-expanded', 'true');
  await expect(scheda(page).locator('.pn-resoconto'), 'per chi è fallito il resoconto è già il motivo nella riga').toHaveCount(0);
  await riga(page, 'pnag-finita').click();
  await expect(riga(page, 'pnag-finita')).toHaveAttribute('aria-expanded', 'true');
  const resoconto = scheda(page).locator('.pn-resoconto');
  await expect(resoconto).toHaveCount(1);
  await expect(resoconto).toContainText('Che cosa ha riportato');
  await expect(resoconto.locator('strong')).toHaveText('Fatto');
});
