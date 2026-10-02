import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/*
 * ⭐ PO-10 passo 2 (02/10/2026) — le schede AGENTE del Terminale, di punta a punta nella app vera.
 * Decisioni dell'owner (memoria `decisione-owner-po-10-schede-agente-sola-lettura-28-09`): una scheda per giro, i comandi
 * in fila ($ comando, uscita, esito), niente tastiera, compare SENZA rubare la scheda attiva, si chiude (e torna solo con un
 * comando nuovo del suo giro), i «!» della persona non ci vanno, il pallino finito verde o rosso, il piede dice il vero.
 * Flusso finto come `ask-ricevuta.spec.mjs`; ogni non-GET si ferma e si conta; e le WebSocket delle shell NON arrivano al
 * server (routeWebSocket senza `connectToServer`): su questo banco nessuna PTY si apre davvero.
 */
test.use({ locale: 'it-IT' }); // le parole della scheda sono quelle della app in italiano

const sse = (eventi) => 'retry: 3600000\n' + [...eventi, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
const evento = (page, e) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, e);
const avvio = { type: 'RunStarted', input: { consegna: 'prova' }, contesto: { cartella: 'C:\\p' } };
const comando = (id, cmd, contenuto, { uscita = 0 } = {}) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell' },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando: cmd }) },
  ...(contenuto === null ? [] : [{ type: 'ToolCallResult', toolCallId: id, content: `exit ${uscita} [sandbox: none]\n${contenuto}`, cwd: 'C:\\p' }]),
];

/* Per la revisione avversaria: con TALOS_PROVA_DIST_LOCALE la pagina prende app.js e styles.css dal `dist` LOCALE (nel
   browser della prova, niente scritture sul server), così un codice rotto apposta si prova contro le API del 4174 senza
   consegnarlo. Senza la variabile la prova guarda ciò che il 4174 serve davvero. */
const DIST = new URL('../../dist/', import.meta.url);
async function apri(page, sid, { replay = [], conclusa = false } = {}) {
  if (process.env.TALOS_PROVA_DIST_LOCALE) {
    for (const file of ['app.js', 'styles.css']) await page.route(`**/${file}`, (route) => route.fulfill({ path: fileURLToPath(new URL(file, DIST)) }));
  }
  await page.routeWebSocket('**/api/v1/terminal/ws**', () => { /* nessuna connessione al server: nessuna shell vera */ });
  await page.route(`**/api/v1/sessions/${sid}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse(replay) }));
  await page.route(`**/api/v1/sessions/${sid}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route(`**/api/v1/sessions/${sid}/terminals`, (route) => route.request().method() === 'GET'
    ? route.fulfill({ json: { ok: true, data: { items: [{ terminalId: sid, cartella: 'C:\\p', origine: 'prima-scheda' }] } } })
    : route.abort());
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET') { scritture.push(r.method() + ' ' + r.url()); return route.abort(); }
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([s, c]) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Schede agente', 'z-ai/glm-5.3-flash', { conclusa: c }), [sid, conclusa]);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return scritture;
}

const linguette = (page) => page.evaluate(() => [...document.querySelectorAll('#schermoTerminale .talos-terminal__tabs [role=tab]')].map((b) => ({
  testo: b.textContent.trim(), attiva: b.getAttribute('aria-selected') === 'true', pallino: b.querySelector('.talos-dot')?.className ?? '' })));
/* il testo che la xterm della scheda mostra, letto dal suo buffer (col renderer WebGL non c'è nel DOM) */
const schermo = (page, id) => page.evaluate((id) => {
  const term = window.__talosHarnessUiRuntime.statoTerminale().schede.get(id)?.term;
  if (!term) return null;
  const b = term.buffer.active; const righe = [];
  for (let i = 0; i < b.length; i++) righe.push(b.getLine(i)?.translateToString(true) ?? '');
  return righe.join('\n').replace(/\n+$/u, '');
}, id);

test('PO10-SCHEDA-AGENTE: compare senza rubare la scheda, si legge, non si scrive, dice com’è finita', async ({ page }) => {
  const scritture = await apri(page, 'po10-vivo');
  await evento(page, avvio);
  await page.keyboard.press('Control+Backquote');
  await expect(page.locator('#schermoTerminale .talos-terminal__tabs [role=tab]').first()).toBeVisible();
  for (const e of comando('a1', 'npm test', null)) await evento(page, e);
  await evento(page, { type: 'ToolCallOutput', toolCallId: 'a1', delta: 'riga 1\n' });
  await expect.poll(() => linguette(page)).toEqual([
    expect.objectContaining({ attiva: true }),
    { testo: 'agente · giro 1', attiva: false, pallino: 'talos-dot talos-dot--live' },
  ]);
  expect((await linguette(page))[0].testo).toMatch(/^tu · /u);
  // la persona la sceglie: si legge
  await page.locator('#schermoTerminale [role=tab]', { hasText: 'agente · giro 1' }).click();
  await expect.poll(() => schermo(page, 'agente-giro-1')).toBe('$ npm test\nriga 1');
  await expect(page.locator('#schermoTerminale .talos-terminal__foot')).toContainText("Lanciata dall'agente al giro 1");
  await expect(page.locator('#schermoTerminale .talos-terminal__foot')).toContainText('in corso');
  // non si scrive: la tastiera non arriva a niente
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.statoTerminale().schede.get('agente-giro-1').term.options.disableStdin)).toBe(true);
  await page.keyboard.type('rm -rf /');
  await page.keyboard.press('Enter');
  expect(await schermo(page, 'agente-giro-1')).toBe('$ npm test\nriga 1');
  // arriva l'esito: l'uscita vera prende il posto di quella viva, senza la testata, con la riga d'esito
  await evento(page, { type: 'ToolCallResult', toolCallId: 'a1', content: 'exit 0 [sandbox: none]\ntutti verdi\n', cwd: 'C:\\p' });
  /* la durata c'è solo quando è misurata (dal server, o fra due arrivi oltre la risoluzione): qui può esserci o no */
  await expect.poll(() => schermo(page, 'agente-giro-1')).toMatch(/^\$ npm test\ntutti verdi\n— Riuscito · su Windows, senza isolamento( · [\d.]+ m?s)?$/u);
  await expect.poll(async () => (await linguette(page))[1].pallino).toBe('talos-dot talos-dot--success');
  await expect(page.locator('#schermoTerminale .talos-terminal__foot')).toContainText('conclusa');
  // un secondo comando del giro che fallisce: la scheda diventa rossa e lo dice
  for (const e of comando('a2', 'npm run lint', 'errore: 3 problemi', { uscita: 1 })) await evento(page, e);
  await expect.poll(async () => (await linguette(page))[1].pallino).toBe('talos-dot talos-dot--danger');
  await expect(page.locator('#schermoTerminale .talos-terminal__foot')).toContainText('con errori');
  await expect.poll(() => schermo(page, 'agente-giro-1')).toContain('$ npm run lint\nerrore: 3 problemi\n— Non riuscito · codice 1');
  // un «!» della persona non va nelle schede agente
  await evento(page, { type: 'ComandoUtenteIniziato', comando: 'ping -n 1 127.0.0.1', contesto: { cartella: 'C:\\p' } });
  for (const e of comando('io', 'ping -n 1 127.0.0.1', 'pong')) await evento(page, e);
  await evento(page, { type: 'ComandoUtenteFinito' });
  await page.waitForTimeout(200);
  expect((await linguette(page)).map((l) => l.testo).filter((t) => t.startsWith('agente'))).toEqual(['agente · giro 1']);
  expect(await schermo(page, 'agente-giro-1')).not.toContain('ping');
  expect(scritture).toEqual([]);
});

test('PO10-CHIUSA: una scheda agente chiusa non torna da sola; torna con un comando nuovo del suo giro', async ({ page }) => {
  const scritture = await apri(page, 'po10-chiusa');
  await evento(page, avvio);
  await page.keyboard.press('Control+Backquote');
  for (const e of comando('a1', 'git status', 'pulito')) await evento(page, e);
  const agente = page.locator('#schermoTerminale [role=tab]', { hasText: 'agente · giro 1' });
  await expect(agente).toHaveCount(1);
  await agente.click({ button: 'right' });
  const voci = await page.locator('#menuSchedaTerminale [role=menuitem]').allTextContents();
  expect(voci).not.toContain('Rinomina');
  await page.locator('#menuSchedaTerminale [role=menuitem]', { hasText: /^Chiudi$/u }).click();
  await expect(agente).toHaveCount(0);
  // un evento qualunque ridisegna le schede: quella chiusa non deve tornare da sola
  await evento(page, { type: 'RunFinished' });
  await page.waitForTimeout(200);
  await expect(agente).toHaveCount(0);
  for (const e of comando('a2', 'git diff', 'nessuna modifica')) await evento(page, e);
  await expect(agente).toHaveCount(1);
  expect(scritture).toEqual([], 'chiudere una scheda agente non chiede niente al server');
});

test('PO10-RIAPERTURA: riaprendo la sessione la scheda si ricostruisce dall’esito salvato', async ({ page }) => {
  const storia = [{ ...avvio, _sequenza: 1 }, ...comando('a1', 'npm test', 'tutti verdi').map((e, i) => ({ ...e, _sequenza: i + 2 })), { type: 'RunFinished', _sequenza: 9 }];
  const scritture = await apri(page, 'po10-storia', { replay: storia, conclusa: true });
  await page.keyboard.press('Control+Backquote');
  const agente = page.locator('#schermoTerminale [role=tab]', { hasText: 'agente · giro 1' });
  await expect(agente).toHaveCount(1);
  await agente.click();
  await expect.poll(() => schermo(page, 'agente-giro-1')).toMatch(/^\$ npm test\ntutti verdi\n— Riuscito · su Windows, senza isolamento( · [\d.]+ m?s)?$/u);
  expect(scritture).toEqual([]);
});
