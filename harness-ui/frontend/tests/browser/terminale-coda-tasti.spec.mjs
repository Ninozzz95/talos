import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ 18/10/2026 — I TASTI SCRITTI PRIMA DELL'AGGANCIO DEL TERMINALE (owner: «Cura nella 0.1.32»; «solo nella stessa shell»).
 *   `app.js` buttava i tasti finché la connessione non era aperta; sulla CI pubblica R01-GUSCIO cadeva 2 volte su 3 dalla 0.1.31.
 *   Cura: `creaCodaTasti` + lo svuotamento all'evento `agganciato`, come VS Code `_preLaunchInputQueue`.
 * Questa prova è la sonda della revisione del bugfixer (18/10) con le asserzioni: le prove di unità provano solo la coda, e
 *   togliendo lo svuotamento in `app.js` restavano verdi. Qui la connessione del terminale passa da `routeWebSocket`, che la
 *   ritarda, la fa cadere o riscrive il suo `agganciato`, e si contano i comandi che arrivano davvero alla shell e ciò che stampa.
 */
const pulisci = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/gu, '').replace(/\x1b\][^\x07]*\x07/gu, '');
const byteDi = (m) => (typeof m === 'string' ? Buffer.from(m, 'utf8') : Buffer.from(m));

/**
 * Apre la vista Terminale con la connessione che passa da qui. `trattieni` tiene fermo ciò che il server manda sulla PRIMA
 * connessione (cioè il suo `agganciato`) finché la prova non chiama `traccia.rilascia()`: i tasti scritti nel frattempo cadono
 * per forza prima dell'aggancio, qualunque sia la velocità della macchina (con un ritardo a tempo non era detto: misurato 18/10);
 * `riprendiFalso` riscrive l'`agganciato` delle connessioni dopo la prima in `ripreso:false` (una shell NUOVA, senza dover far
 * ripartire il server: si prova il ramo del client, non il registro delle PTY).
 */
async function prepara(page, { trattieni = false, riprendiFalso = false } = {}) {
  const fermi = [];
  let fermo = trattieni;
  const traccia = { dalServer: '', alServer: [], aperture: 0, controlli: [], rotte: [], rilascia: () => { fermo = false; for (const f of fermi.splice(0)) f(); } };
  await page.routeWebSocket(/\/api\/v1\/terminal\/ws/u, async (ws) => {
    traccia.aperture += 1;
    const n = traccia.aperture;
    traccia.rotte.push(ws);
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      const b = byteDi(m);
      if (b[0] === 0) traccia.alServer.push({ n, testo: b.subarray(1).toString('utf8') });
      server.send(m);
    });
    server.onMessage(function dalServer(m) {
      if (fermo && n === 1) { fermi.push(() => dalServer(m)); return; }
      const b = byteDi(m);
      if (b[0] === 0) { traccia.dalServer += b.subarray(1).toString('utf8'); ws.send(m); return; }
      let c = null;
      try { c = JSON.parse(b.subarray(1).toString('utf8')); } catch { /* controllo storto: passa com'è */ }
      if (c && riprendiFalso && n > 1 && c.evento === 'agganciato') {
        c.ripreso = false;
        traccia.controlli.push({ n, ...c });
        ws.send(Buffer.concat([Buffer.from([1]), Buffer.from(JSON.stringify(c), 'utf8')]));
        return;
      }
      if (c) traccia.controlli.push({ n, ...c });
      ws.send(m);
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  /* la vista Terminale: senza una sessione è lì che il server dà la scheda della finestra (dalla 0.1.31), come nella sonda del bugfixer */
  await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
  await page.locator('[data-mode="terminal"]').first().click();
  /* per ruolo e non `:visible`: prima dell'aggancio il campo nascosto della xterm c'è ed è attivo, ma non ha ancora misure */
  const tastiera = page.getByRole('textbox', { name: 'Terminal input' }).first();
  await tastiera.waitFor({ state: 'attached', timeout: 15_000 });
  return { traccia, tastiera };
}
const tuttoInviato = (traccia) => traccia.alServer.map((f) => f.testo).join('');
const inviati = (traccia, testo) => tuttoInviato(traccia).split(testo).length - 1;
const stampato = (traccia, riga) => new RegExp(`(^|\\n)${riga}\\r?\\n`, 'u').test(pulisci(traccia.dalServer));
const agganciato = (traccia, n) => traccia.controlli.find((c) => c.n === n && c.evento === 'agganciato');
async function scrivi(page, tastiera, riga) { await tastiera.focus(); await page.keyboard.type(riga); await page.keyboard.press('Enter'); }
/** Esce dalla vista Terminale e ci torna: è il gesto che fa ricollegare una scheda caduta (`attivaScheda` → `collegaWsScheda`). */
async function riapri(page) {
  await page.locator('[data-mode="chat"]:visible').first().click();
  await page.locator('[data-mode="terminal"]:visible').first().click();
}
async function cadeLaConnessione(traccia) {
  await expect.poll(() => Boolean(agganciato(traccia, 1)), { timeout: 20_000, message: 'the first attach never came' }).toBe(true);
  await traccia.rotte[0].close();
  await new Promise((r) => setTimeout(r, 500));
}

test('CODA-TASTI-T1 — aggancio trattenuto: i comandi scritti subito arrivano alla shell, una volta sola, nell’ordine', async ({ page }) => {
  test.setTimeout(60_000);
  const { traccia, tastiera } = await prepara(page, { trattieni: true });
  await scrivi(page, tastiera, 'echo TALOS-CODA-1');
  await scrivi(page, tastiera, 'echo TALOS-CODA-2');
  expect(agganciato(traccia, 1), 'premise: the keys were typed before the attach').toBeUndefined();
  traccia.rilascia();
  await expect.poll(() => stampato(traccia, 'TALOS-CODA-2'), { timeout: 20_000, message: 'the shell never printed the second command typed before the attach' }).toBe(true);
  expect(stampato(traccia, 'TALOS-CODA-1'), 'the first command typed before the attach was lost').toBe(true);
  expect(inviati(traccia, 'echo TALOS-CODA-1'), 'the queue was sent twice or never').toBe(1);
  expect(tuttoInviato(traccia).indexOf('TALOS-CODA-1') < tuttoInviato(traccia).indexOf('TALOS-CODA-2'), 'the queued commands were reordered').toBe(true);
});

test('CODA-TASTI-T2 — la connessione cade e si riaggancia alla STESSA shell: ciò che si è scritto nel frattempo parte', async ({ page }) => {
  test.setTimeout(60_000);
  const { traccia, tastiera } = await prepara(page);
  await cadeLaConnessione(traccia);
  await scrivi(page, tastiera, 'echo SCRITTO-DA-DISCONNESSO');
  await riapri(page);
  await expect.poll(() => Boolean(agganciato(traccia, 2)), { timeout: 20_000, message: 'the tab never reconnected' }).toBe(true);
  expect(agganciato(traccia, 2).ripreso, 'premise: the server kept the same shell').toBe(true);
  await expect.poll(() => stampato(traccia, 'SCRITTO-DA-DISCONNESSO'), { timeout: 20_000, message: 'a command typed while disconnected was lost on the same shell' }).toBe(true);
  expect(inviati(traccia, 'echo SCRITTO-DA-DISCONNESSO')).toBe(1);
});

test('CODA-TASTI-T3 AL CONTRARIO — al riaggancio la shell è NUOVA: ciò che era scritto per l’altra NON parte, e lo si dice', async ({ page }) => {
  test.setTimeout(60_000);
  const { traccia, tastiera } = await prepara(page, { riprendiFalso: true });
  await cadeLaConnessione(traccia);
  await scrivi(page, tastiera, 'echo PER-LA-SHELL-DI-PRIMA');
  await riapri(page);
  await expect.poll(() => Boolean(agganciato(traccia, 2)), { timeout: 20_000, message: 'the tab never reconnected' }).toBe(true);
  /* il controllo positivo prima di quello d'assenza: la connessione nuova funziona, quindi un «non è partito» non è un giro morto */
  await scrivi(page, tastiera, 'echo DOPO-IL-RIAGGANCIO');
  await expect.poll(() => stampato(traccia, 'DOPO-IL-RIAGGANCIO'), { timeout: 20_000, message: 'positive control: the new connection does not reach the shell' }).toBe(true);
  expect(inviati(traccia, 'echo PER-LA-SHELL-DI-PRIMA'), 'a command typed for the old shell was sent to a new one').toBe(0);
  expect(stampato(traccia, 'PER-LA-SHELL-DI-PRIMA'), 'a new shell ran a command typed for the old one').toBe(false);
  /* ⛔ l'avviso «shell nuova» non si legge da qui: la xterm disegna su WebGL e il testo non è nel DOM (misurato 18/10, `.xterm-rows`
     assente). Le parole stanno nel dizionario (`app.terminal.queuedDropped`, due lingue) e il cancello della lingua le controlla. */
});
