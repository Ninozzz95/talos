import { test, expect } from '@playwright/test';

/*
 * ⭐ B1 (bugfixer, 09/10/2026 sera) — IN UNA CHAT LUNGA IL CODICE SI COLORA QUANDO SI VEDE, NON DURANTE LA RIGIOCATA.
 *   Profilo CPU del ritorno su una chat di 300 giri con codice (banco «PESANTE» sulla 4176, sessione vera del server): ~480 ms
 *   su ~1,8 s erano Prism + `innerHTML` di blocchi che la finestra della rigiocata (BUG-24) stacca subito dopo. Con la cura il
 *   ritorno è sceso da 1.914/1.819 a 1.382/1.364 ms e i task lunghi da ~900 ms a 0-57 ms. Come Hermes
 *   (`apps/desktop/src/components/chat/shiki-block.tsx:8-26`): testo subito, colore per ciò che è montato.
 * Scene rigiocate dal server finto: ogni richiesta non-GET si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const MODELLO = 'prova/modello-senza-catalogo';
const GIRI = 60;
const codice = (n) => Array.from({ length: 6 }, (_, i) => `const passo${n}_${i} = (x) => x * ${i} + ${n};`).join('\n');
const giro = (n) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${n}`, input: { consegna: `Domanda ${n} con codice`, ...(n > 1 ? { seguito: true } : {}) } },
  { type: 'TextMessageStart', messageId: `m-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `m-${n}`, delta: `Risposta ${n}, ecco il codice:\n\n\`\`\`js\n${codice(n)}\n\`\`\`\n\n${'parola '.repeat(40)}fine.` },
  { type: 'TextMessageEnd', messageId: `m-${n}` },
  { type: 'RunFinished', threadId: 't', runId: `r-${n}` },
];
const EVENTI = Array.from({ length: GIRI }, (_, i) => giro(i + 1)).flat().map((e, i) => ({ ...e, _sequenza: i + 1 }));

async function apri(page, tema) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const m = new URL(req.url()).pathname.match(/\/api\/v1\/sessions\/b1-codice-[a-z0-9]+\/(events|metrics)$/);
    if (m) {
      if (m[1] === 'metrics') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...EVENTI, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime && globalThis.Prism?.highlight);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  // quante volte Prism colora durante la rigiocata: la misura che distingue «colorare tutto» da «colorare il montato»
  await page.evaluate(() => { const vero = globalThis.Prism.highlight; globalThis.__colorazioni = 0; globalThis.Prism.highlight = (...a) => { globalThis.__colorazioni += 1; return vero.apply(globalThis.Prism, a); }; });
  return contatore;
}

const blocchi = (page) => page.evaluate(() => {
  const tutti = [...document.querySelectorAll('#conversation .code-block')];
  return {
    montati: tutti.length,
    colorati: tutti.filter((b) => /language-/.test(b.querySelector('code')?.className || '')).length,
    inAttesa: tutti.filter((b) => b.dataset.evidenziazione === 'in-attesa').length,
    colorazioni: globalThis.__colorazioni,
    turni: document.querySelectorAll('#conversation > .talos-turn').length,
  };
});

for (const tema of ['dark', 'light']) {
  test(`B1-CODICE-RIGIOCATA (${tema}) — dopo la rigiocata il codice montato è colorato, quello staccato si colora al «Mostra precedenti»`, async ({ page }) => {
    const c = await apri(page, tema);
    await page.evaluate(({ modello }) => {
      window.__talosHarnessUiRuntime.passaASessione('b1-codice-a1', 'workspace', 'Codice lungo', modello, { conclusa: true, modello });
    }, { modello: MODELLO });
    await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
    await expect(page.locator('#conversation')).toContainText(`Risposta ${GIRI},`, { timeout: 10_000 });
    const dopo = await blocchi(page);
    expect(dopo.turni, 'premessa: la finestra ha smontato dei giri').toBeLessThan(GIRI * 2);
    expect(dopo.montati, 'premessa: ci sono blocchi montati').toBeGreaterThan(0);
    expect(dopo.colorati, 'ogni blocco montato è colorato').toBe(dopo.montati);
    expect(dopo.inAttesa, 'nessun blocco montato resta in attesa').toBe(0);
    expect(dopo.colorazioni, 'Prism ha colorato solo ciò che è montato, non i 60 blocchi della rigiocata').toBeLessThanOrEqual(dopo.montati);
    await page.locator('.talos-mostra-precedenti').click();
    await expect.poll(async () => (await blocchi(page)).montati).toBeGreaterThan(dopo.montati);
    const precedenti = await blocchi(page);
    expect(precedenti.colorati, 'i blocchi che tornano si colorano').toBe(precedenti.montati);
    expect(precedenti.inAttesa).toBe(0);
    await page.locator('#conversation .code-block').first().scrollIntoViewIfNeeded();
    await expect(page.locator('#conversation .code-block').first().locator('code .token').first()).toBeVisible();
    expect(c.nonGet).toBe(0);
  });
}

test('B1-COMPATTAZIONI-RIGIOCATA — le compattazioni rigiocate non leggono la soglia una per una: la legge una volta il confine', async ({ page }) => {
  // B1 (09/10/2026 sera): sulla chat di 300 giri ogni `talos.compattazione` di inizio forzava l'avviso di soglia, cioè una lettura
  // HTTP di `/compaction-policy` per compattazione (286); il confine `talos.fine-rigiocata` la fa già, forzata, una volta sola.
  const AT = '2026-10-09T18:00:00.000Z';
  const conCompattazione = (n) => [
    ...giro(n).slice(0, 1),
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', tokenPrima: 184_000, soglia: 150_000, motivo: 'background', coveredThrough: 40, at: AT } },
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 184_000, tokenDopo: 41_000, misura: 'stima', coveredThrough: 40, at: AT, modello: MODELLO, motivo: 'background' } },
    ...giro(n).slice(1),
  ];
  const eventi = Array.from({ length: 30 }, (_, i) => conCompattazione(i + 1)).flat().map((e, i) => ({ ...e, _sequenza: i + 1 }));
  const letture = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/v1/sessions/b1-comp-a1/events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    if (p === '/api/v1/sessions/b1-comp-a1/compaction-policy') { letture.push(Date.now()); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { soglia: 150_000, finestra: 200_000 }, meta: { schema: 'talos.harness-ui.api.v1' } }) }); }
    if (req.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((modello) => window.__talosHarnessUiRuntime.passaASessione('b1-comp-a1', 'workspace', 'Compattazioni', modello, { conclusa: true, modello }), MODELLO);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
  await expect(page.locator('#conversation')).toContainText('Risposta 30,', { timeout: 10_000 });
  await page.waitForTimeout(500);
  expect(letture.length, 'premessa: il confine la legge').toBeGreaterThan(0);
  expect(letture.length, '30 compattazioni rigiocate non sono 30 letture').toBeLessThanOrEqual(3);
});

test('B1-LETTORE-IN-RIGIOCATA — il lettore di file colora subito anche mentre la chat rigioca: il rinvio è solo dei messaggi', async ({ page }) => {
  // Review del desktop (09/10/2026 sera, Y1): il rinvio valeva per OGNI blocco, ma il confine colora solo la colonna della chat;
  // un file aperto durante una rigiocata (o una riconnessione, che rimette `inRigiocata`) restava grigio «in attesa».
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/sessions/b1-lettore-*/events*', () => { /* aperto e muto: la rigiocata non finisce */ });
  await page.route('**/api/v1/sessions/b1-lettore-*/tree?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: [{ nome: 'calcolo.mjs', cartella: false }] } }) }));
  await page.route('**/api/v1/sessions/b1-lettore-*/file?*', (r) => r.fulfill({ contentType: 'application/octet-stream', body: 'export const somma = (a, b) => a + b;\nexport function doppio(x) { return x * 2; }\n' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime && globalThis.Prism?.highlight);
  await page.evaluate((modello) => window.__talosHarnessUiRuntime.passaASessione('b1-lettore-a1', 'workspace', 'Lettore', modello, { conclusa: false, modello }), MODELLO);
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata), 'premessa: la rigiocata è in corso').toBe(true);
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="file"]').click();
  await page.locator('#alberoFile .ft-row', { hasText: 'calcolo.mjs' }).click({ button: 'right' }); // come LETTORE-03: menu dell'albero, «Apri»
  await page.getByRole('menuitem', { name: 'Apri', exact: true }).click();
  const blocco = page.locator('#railFileLettore .code-block').first();
  await expect(blocco).toBeVisible({ timeout: 10_000 });
  await expect(blocco.locator('code')).toHaveClass(/language-/u);
  await expect(blocco).not.toHaveAttribute('data-evidenziazione', 'in-attesa');
});

test('B1-SEGMENTI-RIGIOCATA — il riassunto dei segmenti di attività si calcola per i segmenti che si vedono, non a ogni evento rigiocato', async ({ page }) => {
  // B1 parte 2 (09/10/2026 sera): banco «come glm» (300 giri, ragionamento + 5 chiamate): `aggiornaRiassuntoSegmento` → `aggiorna`
  // 1,2 s su ~3,3 del ritorno, ricalcolato a ogni evento per segmenti che la finestra stacca. Ora: al confine i montati, al
  // «Mostra precedenti» quelli che tornano.
  const conAttivita = (n) => [
    { type: 'RunStarted', threadId: 't', runId: `s-${n}`, input: { consegna: `Passo ${n}: leggi tre file`, ...(n > 1 ? { seguito: true } : {}) } },
    { type: 'ReasoningMessageStart', messageId: `r-${n}` }, { type: 'ReasoningMessageContent', messageId: `r-${n}`, delta: `Penso al passo ${n}.` }, { type: 'ReasoningMessageEnd', messageId: `r-${n}` },
    ...[0, 1, 2].flatMap((k) => [
      { type: 'ToolCallStart', toolCallId: `c-${n}-${k}`, toolCallName: 'leggi' },
      { type: 'ToolCallArgs', toolCallId: `c-${n}-${k}`, delta: JSON.stringify({ percorso: `src/file-${k}.ts` }) },
      { type: 'ToolCallResult', toolCallId: `c-${n}-${k}`, content: `contenuto ${n}.${k}` },
    ]),
    { type: 'TextMessageStart', messageId: `m-${n}`, role: 'assistant' }, { type: 'TextMessageContent', messageId: `m-${n}`, delta: `Fatto il passo ${n}.` }, { type: 'TextMessageEnd', messageId: `m-${n}` },
    { type: 'RunFinished', threadId: 't', runId: `s-${n}` },
  ];
  const eventi = Array.from({ length: 60 }, (_, i) => conAttivita(i + 1)).flat().map((e, i) => ({ ...e, _sequenza: i + 1 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/v1/sessions/b1-seg-a1/events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    if (req.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  const prima = await page.evaluate(() => window.__talosHarnessUiRuntime.riassuntiSegmentoCalcolati());
  await page.evaluate((modello) => window.__talosHarnessUiRuntime.passaASessione('b1-seg-a1', 'workspace', 'Segmenti', modello, { conclusa: true, modello }), MODELLO);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
  await expect(page.locator('#conversation')).toContainText('Fatto il passo 60.', { timeout: 10_000 });
  const segmenti = () => page.evaluate(() => [...document.querySelectorAll('#conversation .talos-activity--segment')].map((s) => s.querySelector('.talos-activity__descrizione')?.textContent?.trim() ?? ''));
  const montati = await segmenti();
  const calcolati = (await page.evaluate(() => window.__talosHarnessUiRuntime.riassuntiSegmentoCalcolati())) - prima;
  expect(montati.length, 'premessa: ci sono segmenti montati').toBeGreaterThan(0);
  expect(montati.every((d) => d.length > 0), `ogni segmento montato ha il suo riassunto: ${JSON.stringify(montati)}`).toBe(true);
  expect(calcolati, `calcoli del riassunto (${calcolati}) per ${montati.length} segmenti montati: non uno per evento rigiocato`).toBeLessThanOrEqual(montati.length * 2 + 2);
  await page.locator('.talos-mostra-precedenti').click();
  await expect.poll(async () => (await segmenti()).length).toBeGreaterThan(montati.length);
  const dopo = await segmenti();
  expect(dopo.every((d) => d.length > 0), 'i segmenti che tornano hanno il loro riassunto').toBe(true);
});

test('B1-SEPARATORI-FINESTRA — i separatori di compattazione se ne vanno col turno che li segue, e tornano davanti a lui', async ({ page }) => {
  // B1 parte 3 (09/10/2026 notte): sul banco «come glm» la colonna teneva 280 separatori («Conversazione riassunta») ammucchiati
  // in cima sopra 8 turni montati, mai smontati — 10.080 px — e il conteggio dei turni li scorreva a ogni evento (590 ms).
  const AT = '2026-10-09T18:00:00.000Z';
  const giroConSeparatore = (n) => [
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', tokenPrima: 184_000, soglia: 150_000, motivo: 'background', coveredThrough: n, at: `${AT}#${n}` } },
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 184_000, tokenDopo: 41_000, misura: 'stima', coveredThrough: n, at: `${AT}#${n}`, modello: MODELLO, motivo: 'background' } },
    ...giro(n),
  ];
  const eventi = Array.from({ length: 40 }, (_, i) => giroConSeparatore(i + 1)).flat().map((e, i) => ({ ...e, _sequenza: i + 1 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/v1/sessions/b1-sep-a1/events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    if (req.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((modello) => window.__talosHarnessUiRuntime.passaASessione('b1-sep-a1', 'workspace', 'Separatori', modello, { conclusa: true, modello }), MODELLO);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
  await expect(page.locator('#conversation')).toContainText('Risposta 40,', { timeout: 10_000 });
  const forma = () => page.evaluate(() => [...document.querySelector('#conversation').children].map((n) => (n.classList.contains('talos-turn') ? 'T' : n.classList.contains('talos-context-separator') ? 'S' : '?')).join(''));
  const dopo = await forma();
  expect(dopo.length, `premessa: la finestra ha smontato dei giri (${dopo})`).toBeLessThan(40 * 3);
  expect(dopo.startsWith('S'), `nessun separatore resta in cima, davanti al primo turno montato: ${dopo}`).toBe(false);
  expect((dopo.match(/S/gu) ?? []).length, `separatori montati ≤ turni montati: ${dopo}`).toBeLessThanOrEqual((dopo.match(/T/gu) ?? []).length);
  await page.locator('.talos-mostra-precedenti').click();
  await expect.poll(async () => (await forma()).length).toBeGreaterThan(dopo.length);
  const rimontata = await forma();
  expect((rimontata.match(/S/gu) ?? []).length, 'i separatori tornano con i loro turni').toBeGreaterThan((dopo.match(/S/gu) ?? []).length);
  expect(rimontata.endsWith(dopo), `la parte già montata resta com'era, la pagina si aggiunge sopra: ${rimontata}`).toBe(true);
  expect(/SS/u.test(rimontata), `mai due separatori di fila fuori posto: ${rimontata}`).toBe(false);
});

// Da aggiungere in coda a tests/browser/b1-codice-rigiocata.spec.mjs (usa giro, MODELLO, CONFINE della spec)
/* REVISIONE B1 parte 3 (sessione desktop, 10/10): un evento successivo della STESSA compattazione (qui l'annullo) arriva nella
   storia dopo che il suo separatore è stato staccato con il turno. Il separatore deve restare UNO, non rinascere in fondo. */
test("B1-SEP-REV-01 — l'annullo di una compattazione il cui separatore è già staccato non crea un doppione", async ({ page }) => {
  const AT = '2026-10-09T18:00:00.000Z#1';
  const eventi = [
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', tokenPrima: 184_000, soglia: 150_000, motivo: 'background', coveredThrough: 1, at: AT } },
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, tokenPrima: 184_000, tokenDopo: 41_000, misura: 'stima', coveredThrough: 1, at: AT, modello: MODELLO, motivo: 'background', annullabile: true } },
    ...Array.from({ length: 40 }, (_, i) => giro(i + 1)).flat(),
    { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'annullata', at: AT, coveredThrough: 1 } },
  ].map((e, i) => ({ ...e, _sequenza: i + 1 }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/v1/sessions/b1-sep-rev/events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000
${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}

`).join('')}` });
    if (req.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((modello) => window.__talosHarnessUiRuntime.passaASessione('b1-sep-rev', 'workspace', 'Annullo', modello, { conclusa: true, modello }), MODELLO);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
  const forma = () => page.evaluate(() => [...document.querySelector('#conversation').children].map((n) => (n.classList.contains('talos-turn') ? 'T' : n.classList.contains('talos-context-separator') ? 'S' : '?')).join(''));
  expect((await forma()).startsWith('T'), `premessa: il primo turno (e il suo separatore) è stato staccato: ${await forma()}`).toBe(true);
  for (let i = 0; i < 20 && await page.locator('.talos-mostra-precedenti').count(); i++) await page.locator('.talos-mostra-precedenti').click();
  const separatori = await page.locator('#conversation .talos-context-separator').count();
  expect(separatori, `una compattazione, un separatore: ${await forma()}`).toBe(1);
});
