import { test, expect } from '@playwright/test';

/*
 * Difetto (5) delle foto di Ask e del Piano (24/09 sera, foto `foto-orb-stop*`, sparite con la pulizia di TEMP del 25/09):
 * dopo lo Stop, con una conversazione CORTA, la conversazione scorreva in su e tagliava o nascondeva il messaggio della
 * persona, con spazio vuoto sotto. Riprodotto qui dal vivo: un messaggio, TALOS che ragiona, lo Stop col testo VERO del
 * motore (`RunError` «⛔ interrotto su richiesta.», `talosHarness.mjs:11057-11061`; l'interfaccia lo riconosce dal testo,
 * `components/errori.js:136-174`). Misurato il 26/09 prima della cura: la nota dello Stop (184 px) portava la coda sotto la
 * metà della vista e lo scrittore del seguito saliva di 120 px a 1440 e 170 a 1024: il messaggio della persona usciva
 * dall'alto, sotto restavano 282-332 px vuoti.
 * Cura (owner 26/09, opzione C): la riserva sotto la conversazione vale quanto il contenuto SUPERA la vista, fino a metà
 * vista (`aggiornaSpazioCodaConversazione`). AL CONTRARIO: su una conversazione LUNGA la regola del 06/09 («coda a metà
 * pagina») resta com'era — dopo lo Stop la coda sta a metà.
 * ⛔ Le misure stanno sulla VISTA che scorre (`.talos-conversation`), non sulla colonna: la colonna si muove con lo scroll,
 *   e misurarla dava verde a difetto presente.
 * Server di prova (porta 4176): ogni richiesta non-GET si ferma e si conta.
 */
const SESSIONE = 'stop-corta';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;
const PARAGRAFO = (n) => `Paragrafo ${n}: la conversazione conserva la cronologia e il testo continua per qualche riga, così la colonna cresce davvero.\n\n`;

async function preparaPagina(page, larghezza, altezza) {
  const contatore = { nonGet: 0 };
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
  });
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Stop corta', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  return contatore;
}

const manda = (page, eventi) => page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent(e, r.realSessionState.generation); }, eventi);

/** Un giro che ragiona e viene fermato: la forma del difetto. */
async function giroFermato(page, seq) {
  await manda(page, [
    { type: 'RunStarted', threadId: 't', runId: `r${seq}`, input: { consegna: 'Spiegami in breve cosa fa il file dei test' }, _sequenza: seq },
    { type: 'ReasoningMessageStart', messageId: `rg${seq}`, _sequenza: seq + 1 },
    { type: 'ReasoningMessageContent', messageId: `rg${seq}`, delta: 'Leggo il file e cerco i casi principali.', _sequenza: seq + 2 },
  ]);
  await page.waitForTimeout(1200);
  await manda(page, [{ type: 'RunError', message: '⛔ interrotto su richiesta.', code: 'fermato', _sequenza: seq + 3 }]);
  await page.waitForTimeout(1500); // le animazioni d'uscita e ogni riallineamento
}

const misura = (page) => page.evaluate(() => {
  const scorrevole = document.querySelector('.talos-conversation');
  const colonna = document.querySelector('#conversation');
  const vista = scorrevole.getBoundingClientRect();
  const u = [...colonna.querySelectorAll('.talos-message--user')].at(-1).getBoundingClientRect();
  const ultimo = colonna.lastElementChild.getBoundingClientRect();
  return {
    scrollTop: Math.round(scorrevole.scrollTop), clientHeight: scorrevole.clientHeight,
    // l'altezza VERA del contenuto (senza la riserva): il fondo dell'ultimo turno, in coordinate della colonna
    contenuto: Math.round(ultimo.bottom - vista.top + scorrevole.scrollTop),
    riserva: parseFloat(getComputedStyle(colonna).paddingBottom) || 0,
    utenteTop: Math.round(u.top - vista.top), utenteBottom: Math.round(u.bottom - vista.top),
    codaNellaVista: Math.round(ultimo.bottom - vista.top),
  };
});

/* La riserva segue il contenuto anche FUORI da un giro: la persona apre il ragionamento di un giro già fermato e la
   conversazione supera la vista. Nessuno chiede uno scroll (niente giro, niente finestra che cambia): se la riserva la
   ricalcolasse solo lo scrittore del seguito, resterebbe quella di prima. */
test('STOP-05c — aprire un ragionamento lungo dopo lo Stop ricalcola la riserva come vuole la regola (1440)', async ({ page }) => {
  const contatore = await preparaPagina(page, 1440, 900);
  await manda(page, [
    { type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'Spiegami in breve cosa fa il file dei test' }, _sequenza: 1 },
    { type: 'ReasoningMessageStart', messageId: 'rg1', _sequenza: 2 },
    { type: 'ReasoningMessageContent', messageId: 'rg1', delta: Array.from({ length: 40 }, (_, i) => PARAGRAFO(i + 1)).join(''), _sequenza: 3 },
  ]);
  await page.waitForTimeout(1200);
  await manda(page, [{ type: 'RunError', message: '⛔ interrotto su richiesta.', code: 'fermato', _sequenza: 4 }]);
  await page.waitForTimeout(1500);
  const chiusa = await misura(page);
  expect(chiusa.contenuto, 'premessa: a ragionamento chiuso la conversazione sta nella vista').toBeLessThanOrEqual(chiusa.clientHeight);
  expect(chiusa.riserva, 'e non ha riserva').toBe(0);
  await page.locator('#conversation').getByText(/Ha ragionato/u).first().click();
  await page.waitForTimeout(800);
  const aperta = await page.evaluate(() => {
    const s = document.querySelector('.talos-conversation');
    const riserva = parseFloat(getComputedStyle(document.querySelector('#conversation')).paddingBottom) || 0;
    return { naturale: s.scrollHeight - riserva, clientHeight: s.clientHeight, riserva };
  });
  console.log(`MISURA-STOP-05c ${JSON.stringify({ chiusa, aperta })}`);
  const attesa = Math.max(0, Math.min(Math.ceil(aperta.clientHeight / 2), Math.ceil(aperta.naturale - aperta.clientHeight)));
  expect(aperta.naturale, 'premessa: aperto, il ragionamento porta la conversazione oltre la vista').toBeGreaterThan(aperta.clientHeight);
  expect(aperta.riserva, `la riserva segue il contenuto: ${aperta.riserva} contro ${attesa}`).toBe(attesa);
  expect(contatore.nonGet).toBe(0);
});

for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
  test(`STOP-SHORT-05 — dopo lo Stop una conversazione corta non scorre: il messaggio della persona resta intero a schermo (${larghezza})`, async ({ page }) => {
    const contatore = await preparaPagina(page, larghezza, altezza);
    await giroFermato(page, 1);
    const m = await misura(page);
    console.log(`MISURA-STOP-05 corta ${larghezza} ${JSON.stringify(m)}`);
    await page.screenshot({ path: `artifacts/stop-conversazione-corta-${larghezza}.png` });
    expect(m.contenuto, 'la scena è davvero una conversazione CORTA: il contenuto sta nella vista').toBeLessThanOrEqual(m.clientHeight);
    expect(m.utenteTop, 'il messaggio della persona non esce dall\'alto').toBeGreaterThanOrEqual(0);
    expect(m.utenteBottom, 'e si vede intero').toBeLessThanOrEqual(m.clientHeight);
    expect(m.scrollTop, 'un contenuto che sta tutto nella vista non si scorre nel vuoto in coda').toBe(0);
    expect(m.riserva, 'e sotto non c\'è riserva da scorrere').toBe(0);
    expect(contatore.nonGet).toBe(0);
  });

  test(`STOP-LONG-05b — al contrario: su una conversazione lunga la coda resta a metà pagina (regola del 06/09) (${larghezza})`, async ({ page }) => {
    const contatore = await preparaPagina(page, larghezza, altezza);
    // tre risposte lunghe già concluse: il contenuto supera di molto una vista e mezza
    const storia = [{ type: 'RunStarted', threadId: 't', runId: 'r0', input: { consegna: 'Controlla i test del progetto' }, _sequenza: 10 }];
    for (let m = 0; m < 3; m += 1) {
      storia.push({ type: 'TextMessageContent', messageId: `pieno-${m}`, delta: Array.from({ length: 25 }, (_, i) => PARAGRAFO(m * 25 + i + 1)).join(''), _sequenza: 20 + m });
      storia.push({ type: 'TextMessageEnd', messageId: `pieno-${m}`, _sequenza: 30 + m });
    }
    storia.push({ type: 'RunFinished', outcome: { type: 'success' }, _sequenza: 40 });
    await manda(page, storia);
    await expect(page.locator('#conversation .is-streaming')).toHaveCount(0, { timeout: 20_000 });
    // la persona torna in fondo, come dopo aver mandato il messaggio
    await page.evaluate(() => { const s = document.querySelector('.talos-conversation'); s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(300);
    await giroFermato(page, 100);
    const m = await misura(page);
    console.log(`MISURA-STOP-05b lunga ${larghezza} ${JSON.stringify(m)}`);
    expect(m.contenuto, 'la scena è davvero LUNGA: oltre una vista e mezza').toBeGreaterThan(m.clientHeight * 1.5);
    expect(m.riserva, 'la riserva è mezza vista, come dal 06/09').toBe(Math.ceil(m.clientHeight / 2));
    expect(Math.abs(m.codaNellaVista - m.clientHeight / 2), `la coda sta a metà della vista (±40 px): ${m.codaNellaVista} su ${m.clientHeight}`).toBeLessThanOrEqual(40);
    expect(contatore.nonGet).toBe(0);
  });
}
