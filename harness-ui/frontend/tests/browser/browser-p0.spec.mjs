import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⭐⭐⭐ 16/09/2026 — P0, CORSIA B: il Browser interno, punti 4 (robustezza) e 5 (modo per scheda).
 *
 * Perché questa prova esiste e perché sta QUI e non fra le unità: la regia del Browser vive dentro
 * `creaBrowser`, che vuole tutto il DOM del mockup, e la catena di apertura vive in `legacy/app.js`.
 * Le unità (`tests/unit/browser*.test.mjs`) tengono ferme le CONDIZIONI leggendo il sorgente; qui si
 * misura il RISULTATO sulla app vera, con le risposte di rete finte — che è l'unico posto dove si
 * vede se una cornice si ricarica, se una scheda in errore ne sporca un'altra, e se «Pagina» resta
 * «Pagina» quando si torna indietro.
 *
 * ⛔ Nessuna chiamata esce da qui: ogni rotta del Browser è intercettata (con la query string
 *   coperta — l'11/09 una `page.route('**‌/api/v1/sessions')` senza query ha fatto partire un giro
 *   VERO a pagamento). Mai il 4174 dell'owner: il server se lo accende questo file, su una porta
 *   effimera scelta dal sistema e con uno store di sessioni vuoto e temporaneo.
 *
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — PERCHÉ QUESTA PROVA SI ACCENDE IL SERVER DA SOLA.
 *
 * Bocciatura del controllore, riprodotta col comando del brief: lanciata con la configurazione del
 * progetto questa suite dava **6 rosse su 7**, e il verde 7/7 esisteva solo passando a mano
 * `TALOS_HARNESS_UI_PUBLIC_DIR`. La causa: `playwright.config.mjs` accende `server.mjs` senza
 * dichiarare la cartella da servire, e `src/config.mjs` ricade su `harness-ui/public/` — il
 * MONOLITE CONGELATO. Cioè la suite misurava il codice vecchio, e il codice nuovo non era provato
 * da niente. ⛔ «Un cancello che vive in un paragrafo non è un cancello»: una variabile d'ambiente
 * scritta in un rapporto non protegge nessuno, perché nessuno la scriverà mai più.
 *
 * ⇒ La cura non è cambiare la configurazione di tutti (quella serve alle altre 114 prove, che il
 *   monolite lo provano apposta): è rendere QUESTA prova autoportante. Si ricostruisce la app
 *   (`scripts/build.mjs`, misurato 0,43 s) e si accende `server.mjs` puntato su `frontend/dist`.
 *   È esattamente ciò che fa già `tests/browser/context-compactor.spec.mjs` in questa stessa
 *   cartella — il precedente esiste, non l'avevo guardato.
 * ⛔ Doppio guadagno: la build si rifà a ogni giro, quindi il cancello guarda il codice di ADESSO
 *   e non l'uscita di un build di ieri (la lezione «il build non arriva al telefono»).
 */

const CARTELLA_FOTO = new URL('../../artifacts/p0-B/', import.meta.url);
const HARNESS = fileURLToPath(new URL('../../../', import.meta.url));

/** Il banco: una porta effimera, uno store vuoto, e la app COSTRUITA ADESSO. */
let banco = { base: null, token: null, figlio: null, cartella: null };

test.beforeAll(async () => {
  /* ⛔ La build PRIMA del server: senza, si servirebbe l'uscita di un build precedente e il
     cancello parlerebbe di un codice che non è quello del commit. Costa 0,43 s misurati. */
  const costruita = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', windowsHide: true });
  if (costruita.status !== 0) throw new Error(`build fallita: ${costruita.stderr || costruita.stdout}`);

  /* La porta la sceglie il SISTEMA (bind su 0): niente 4174, niente 4176, niente collisioni con
     un'altra corsia che lavora nello stesso momento — il 16/09 la 4176 era occupata da un altro
     processo, e una porta scritta a mano è una prova che si rompe per colpa di qualcun altro. */
  const presa = createServer();
  await new Promise((fatto) => presa.listen(0, '127.0.0.1', fatto));
  const porta = presa.address().port;
  await new Promise((fatto) => presa.close(fatto));

  banco.cartella = mkdtempSync(join(tmpdir(), 'talos-p0b-'));
  banco.token = randomBytes(24).toString('hex');
  banco.base = `http://127.0.0.1:${porta}`;
  banco.figlio = spawn(process.execPath, ['server.mjs'], {
    cwd: HARNESS, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TALOS_HARNESS_UI_PORT: String(porta),
      TALOS_HARNESS_UI_TOKEN: banco.token,
      TALOS_HARNESS_UI_SESSIONS_DIR: banco.cartella,
      TALOS_HARNESS_UI_PUBLIC_DIR: resolve(HARNESS, 'frontend/dist'),
      TALOS_INTRO: '0',
    },
  });
  banco.figlio.stdout.resume(); banco.figlio.stderr.resume();
  await expect.poll(async () => {
    try { return (await fetch(`${banco.base}/api/v1/health`, { headers: { Cookie: `talos_token=${banco.token}` }, signal: AbortSignal.timeout(400) })).status; } catch { return 0; }
  }, { timeout: 30_000 }).toBe(200);
});

test.afterAll(async () => {
  if (banco.figlio && banco.figlio.exitCode === null && banco.figlio.signalCode === null) {
    const finito = new Promise((fatto) => banco.figlio.once('exit', fatto));
    banco.figlio.kill();
    await finito;
  }
  /* ⛔ 16/09 — la rimozione passa dall'attrezzo di BC-09, non da un `rmSync` nudo: su Windows la
     cancellazione ricorsiva senza ritentativi esce ENOTEMPTY e ha già fatto morire un job di
     rilascio con UN solo test rosso. Il cancello `tests/bc09-classificazione-rimozioni.test.mjs`
     me l'ha trovato addosso in questo stesso giro. */
  if (banco.cartella && banco.cartella.includes('talos-p0b-')) { try { await rimuoviCartellaDiProvaAttesa(banco.cartella); } catch { /* il sistema la pulirà */ } }
});

const busta = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } }) });
const PAGINA_HTML = (titolo) => ({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><title>${titolo}</title></head><body><h1>${titolo}</h1></body></html>` });

/** Le risposte del server per «questo sito si lascia incorniciare?», decise per indirizzo. */
function rispostaCornice(url, { incorniciabile = true, motivo = null, genere = null, dettagli = {}, titolo = 'Pagina di prova' } = {}) {
  /* ⛔ 16/09, giro di riparazione — `dettagli` NON è un di piu': è la meta' del contratto nuovo.
     Il server manda il genere del guasto e i suoi PARAMETRI (i secondi, per un timeout), e la
     frase la scrive il client nella lingua di chi guarda. Una fixture che li omette prova una
     risposta che il server non manda, e il verde che ne esce non parla del prodotto. */
  return busta({ url, incorniciabile, motivo, stato: incorniciabile ? 200 : null, titolo, genere, dettagli, via: incorniciabile ? 'cornice' : 'vivo', percheVia: incorniciabile ? 'Il sito si lascia incorniciare' : 'Il sito vieta la cornice' });
}

/**
 * Prepara la app con le rotte del Browser finte.
 * @param {import('@playwright/test').Page} page
 * @param {(url:string)=>object} decidi che cosa rispondere a `incorniciabile` per quell'indirizzo
 */
async function apparecchia(page, decidi, { conta = null } = {}) {
  await page.route('**/api/v1/browser/incorniciabile**', async (rotta) => {
    const chiesto = new URL(rotta.request().url()).searchParams.get('url') || '';
    if (conta) conta.push(chiesto);
    const risposta = await decidi(chiesto);
    if (!risposta) { await rotta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Il server non ha risposto' } }) }); return; }
    await rotta.fulfill(risposta);
  });
  /* ⛔ 16/09 — il flusso di eventi della sessione finta va intercettato, o il server vero risponde
     «non esiste», la sorveglianza segna la rete caduta e ogni chiamata riuscita del Browser fa
     comparire un «Collegato di nuovo» a schermo: TRE avvisi nella prima foto, che non c'entravano
     niente col Browser. Trovato guardando lo screenshot, non dai conteggi verdi. */
  /* ⛔⛔ 16/09, GIRO DI RIPARAZIONE — lo stub NON risponde: TIENE APERTA la richiesta.
     Prima rispondeva con un corpo SSE che finiva subito, e per un EventSource quella è una
     CHIUSURA: `segnalaSse` marcava la rete sospetta e il primo battito riuscito faceva comparire
     «Collegato di nuovo · Il server risponde: puoi continuare» in TUTTE le foto. Il controllore
     l'aveva visto e non era stato attribuito a nessuno: non era un difetto del prodotto, era la
     mia fixture che fingeva un flusso MORTO. Un flusso vivo che non ha ancora niente da dire è
     una richiesta che resta appesa — ed è esattamente questo. Le rotte si tengono in un elenco
     perché Playwright non le raccolga prima della fine della prova. */
  const flussiAppesi = [];
  await page.route('**/api/v1/sessions/browser-p0*/events**', (rotta) => { flussiAppesi.push(rotta); });
  // ⛔ la lettura per il modello e il browser pilotato non devono MAI uscire di qui
  await page.route('**/api/v1/browser/leggi**', (rotta) => rotta.fulfill(busta({ url: 'https://esempio.test/', stato: 200, corpo: '<html><body>testo</body></html>' })));
  await page.route('**/api/v1/browser/vivo/**', (rotta) => rotta.fulfill(busta({ ok: false, errore: 'Nessun browser disponibile su questa macchina di prova' })));
  await page.route('**/*.test/**', (rotta) => rotta.fulfill(PAGINA_HTML(new URL(rotta.request().url()).hostname)));
  await page.route('https://*.test/', (rotta) => rotta.fulfill(PAGINA_HTML(new URL(rotta.request().url()).hostname)));
}

/*
 * ⛔ 16/09 — il velo d'avvio e la modale del primo avvio coprivano la pagina e si mangiavano i
 *   clic (misurato: 56 ritentativi di `page.click` contro la modale). La modale è uscita il 17/09
 *   con PO-27 e con lei la riga che la dichiarava «saltata»; resta il velo d'avvio, che va
 *   aspettato prima di toccare qualunque cosa.
 *   Il tema si sceglie dalla stessa preferenza salvata che usa una persona vera, non forzando
 *   l'attributo sulla radice: una foto presa su uno stato irraggiungibile non varrebbe niente.
 */
async function apriLaApp(page, { tema = 'dark', lingua = 'it' } = {}) {
  await page.context().addCookies([{ name: 'talos_token', value: banco.token, url: banco.base, httpOnly: true, sameSite: 'Strict' }]);
  /*
   * ⛔ 16/09, GIRO DI RIPARAZIONE — LA LINGUA SI DICHIARA, non si eredita dal Chromium di turno.
   *   Il Chromium di Playwright si presenta in `en-US` e `uiLanguage: 'sistema'` risolve quindi
   *   INGLESE: le prove giravano su un profilo inglese senza che nessuno l'avesse deciso, e una
   *   guardia che legge una frase italiana diventava rossa per la lingua invece che per il
   *   comportamento. Qui la lingua è un parametro, come per una persona che la sceglie nelle
   *   Impostazioni, e il valore predefinito è quello del prodotto.
   */
  await page.addInitScript(([colorMode, uiLanguage]) => {
    try {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
    } catch { /* finestra senza storage */ }
  }, [tema, lingua]);
  await page.goto(banco.base);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
}

/** Tre letture dell'agente, dalla porta VERA: l'attrezzo `naviga` con i suoi eventi. */
async function treLetture(page) {
  return page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('browser-p0', 'workspace', 'Browser P0', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    let seq = 77000;
    const leggi = (id, url, testo) => {
      runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'naviga', _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ url }), _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: testo, _sequenza: seq += 1 }, generation);
    };
    leggi('p0a', 'https://sito-a.test/', 'Alfa\n\nTesto della pagina Alfa.');
    leggi('p0b', 'https://sito-b.test/', 'Beta\n\nTesto della pagina Beta.');
    leggi('p0c', 'https://sito-c.test/', 'Gamma\n\nTesto della pagina Gamma.');
    runtime.executeCommand('browser');
    await new Promise((r) => requestAnimationFrame(r));
    return [...document.querySelectorAll('#browserSchede [data-browser-tab]')].map((x) => x.dataset.browserId);
  });
}

/** Letture dell'agente quante ne servono, stessa porta vera di `treLetture`. */
async function letture(page, quante) {
  return page.evaluate(async (n) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('browser-p0', 'workspace', 'Browser P0', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    let seq = 79000;
    for (let i = 0; i < n; i += 1) {
      const id = `p0n${i}`;
      runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'naviga', _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ url: `https://sito-${i}.test/` }), _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: `Pagina ${i}\n\nTesto della pagina ${i}.`, _sequenza: seq += 1 }, generation);
    }
    runtime.executeCommand('browser');
    await new Promise((r) => requestAnimationFrame(r));
    return [...document.querySelectorAll('#browserSchede [data-browser-tab]')].map((x) => x.dataset.browserId);
  }, quante);
}

const scegliScheda = (page, id) => page.click(`#browserSchede [data-browser-id="${id}"]`);
const modoPremuto = (page) => page.evaluate(() => [...document.querySelectorAll('#schermoBrowser [data-browser-modo]')].find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.browserModo || null);

test('P0-B-5 — PAGINA/TESTO PER SCHEDA: A pagina, B testo, C pagina, e tornando su A resta pagina', async ({ page }) => {
  await apparecchia(page, (url) => rispostaCornice(url, { titolo: url }));
  await apriLaApp(page);
  const ids = await treLetture(page);
  expect(ids).toHaveLength(3);
  const [a, b, c] = ids;

  await scegliScheda(page, a);
  expect(await modoPremuto(page)).toBe('pagina'); // ⛔ una scheda nuova nasce in «Pagina», sempre

  await scegliScheda(page, b);
  await page.click('#schermoBrowser [data-browser-modo="testo"]');
  expect(await modoPremuto(page)).toBe('testo');

  await scegliScheda(page, c);
  expect(await modoPremuto(page)).toBe('pagina');

  // il ritorno: è la riga esatta dell'ordine del 16/09
  await scegliScheda(page, a);
  expect(await modoPremuto(page)).toBe('pagina');
  await scegliScheda(page, b);
  expect(await modoPremuto(page)).toBe('testo');

  /*
   * ⛔ «sopravvive a re-render, aggiornamento contenuto, streaming»: arriva una QUARTA lettura
   *   dall'agente mentre siamo su B. Prima della cura del 16/09 questo bastava a far ridisegnare
   *   tutto con la variabile globale del modo.
   */
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'p0d', toolCallName: 'naviga', _sequenza: 78001 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'p0d', delta: JSON.stringify({ url: 'https://sito-d.test/' }), _sequenza: 78002 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'p0d', content: 'Delta\n\nTesto della pagina Delta.', _sequenza: 78003 }, generation);
  });
  await scegliScheda(page, b);
  expect(await modoPremuto(page)).toBe('testo');
  await scegliScheda(page, a);
  expect(await modoPremuto(page)).toBe('pagina');

  /*
   * ⛔ AL CONTRARIO — il ripiego AUTOMATICO di una scheda non tocca le altre: la scheda C scopre
   *   che il suo sito vieta la cornice e scivola in «Testo»; A e B devono restare dov'erano.
   */
  const dopoIlRipiego = await page.evaluate(async () => {
    const rs = window.__talosHarnessUiRuntime.realSessionState;
    const gamma = rs.browserPagine.find((p) => p.url === 'https://sito-c.test/');
    gamma.incorniciabile = false;
    gamma.motivoCornice = 'La pagina vieta ogni cornice (X-Frame-Options: DENY)';
    const premuto = () => [...document.querySelectorAll('#schermoBrowser [data-browser-modo]')].find((x) => x.getAttribute('aria-pressed') === 'true')?.dataset.browserModo || null;
    const vaiA = async (id) => { document.querySelector(`#browserSchede [data-browser-id="${id}"]`).click(); await new Promise((r) => requestAnimationFrame(r)); return premuto(); };
    const ids = [...document.querySelectorAll('#browserSchede [data-browser-tab]')].map((x) => x.dataset.browserId);
    const suC = await vaiA(ids[2]);
    return { suC, suA: await vaiA(ids[0]), suB: await vaiA(ids[1]) };
  });
  expect(dopoIlRipiego.suC).toBe('testo'); // il ripiego ha agito dove doveva
  expect(dopoIlRipiego.suA).toBe('pagina'); // ⛔ e NON dove non doveva
  expect(dopoIlRipiego.suB).toBe('testo'); // B era già testo per scelta della persona: resta la sua
});

test('P0-B-4d — LA CORNICE NON SI RICOSTRUISCE al cambio scheda: A → B → A e l’iframe è lo stesso, caricato una volta', async ({ page }) => {
  await apparecchia(page, (url) => rispostaCornice(url, { titolo: url }));
  /* ⭐ la MISURA che conta per chi guarda: quante volte la pagina di A viene chiesta alla rete in un
     giro A → B → A. Prima della cura: 2 (la seconda è la ricostruzione). Dopo: 1. */
  const richiesteDiA = [];
  page.on('request', (r) => { if (r.url().startsWith('https://sito-a.test/')) richiesteDiA.push(r.url()); });
  await apriLaApp(page);
  const ids = await treLetture(page);
  const [a, b] = ids;

  await scegliScheda(page, a);
  await page.waitForFunction(() => document.querySelector('#browserLive iframe'));
  // si marca la cornice di A e si contano i caricamenti SUCCESSIVI a questo istante
  await page.evaluate(() => {
    const frame = document.querySelector('#browserLive iframe');
    frame.dataset.marcato = 'A';
    window.__caricamentiA = 0;
    frame.addEventListener('load', () => { window.__caricamentiA += 1; });
  });
  await scegliScheda(page, b);
  await page.waitForTimeout(250);
  await scegliScheda(page, a);
  await page.waitForTimeout(250);

  const misura = await page.evaluate(() => {
    const cornici = [...document.querySelectorAll('#browserLive iframe')];
    const diA = cornici.find((x) => x.dataset.marcato === 'A');
    return {
      caricamentiDopoIlGiro: window.__caricamentiA,
      stessoNodo: Boolean(diA) && diA.hidden === false,
      quante: cornici.length,
      visibili: cornici.filter((x) => !x.hidden).length,
    };
  });
  // ⛔ MISURATO il 16/09 sullo stesso giro: prima della cura 3 richieste, dopo 1 (la cornice non si rifà)
  expect(richiesteDiA.length).toBe(1);
  expect(misura.caricamentiDopoIlGiro).toBe(0); // ⛔ prima della cura: 1 (ricostruita ⇒ ricaricata)
  expect(misura.stessoNodo).toBe(true);
  /* ⛔ TRE, non due, e il terzo non è un errore: all'arrivo delle tre letture la scheda ATTIVA è
     l'ultima (C), che ha quindi già la sua cornice. Poi A e B. Il tetto è `MASSIMO_CORNICI_VIVE`
     = 4, quindi nessuna è stata scaricata: quel che conta è che restino VIVE e se ne veda UNA. */
  expect(misura.quante).toBe(3);
  expect(misura.visibili).toBe(1);
});

/*
 * ⛔ 16/09, punto 4(d), seconda metà — IL TETTO. Tenere vive le cornici è ciò che rende istantaneo
 *   tornare indietro, ed è anche memoria che non si libera: misurato su un banco locale (tre giri,
 *   mediana) ogni cornice viva costa +470 KB di heap e +218 nodi NELLA PAGINA, che è un minimo —
 *   una cornice di un'altra origine gira in un processo suo (20-100 MB, Chromium «Process Model and
 *   Site Isolation»). Quindi un tetto, la più vecchia se ne va, e quando ci torni la scheda LO DICE
 *   invece di far finta di niente.
 */
test('P0-B-4d — IL TETTO DELLE CORNICI VIVE: mai più di quattro, la più vecchia va a riposo e lo dichiara', async ({ page }) => {
  await apparecchia(page, (url) => rispostaCornice(url, { titolo: url }));
  await apriLaApp(page);
  const ids = await letture(page, 6);
  expect(ids).toHaveLength(6);

  const conteggi = [];
  for (const id of ids) {
    await scegliScheda(page, id);
    await page.waitForTimeout(200);
    conteggi.push(await page.evaluate(() => document.querySelectorAll('#browserLive iframe').length));
  }
  expect(Math.max(...conteggi)).toBeLessThanOrEqual(4); // ⛔ senza tetto sarebbero sei documenti vivi

  // si torna sulla PRIMA, che nel frattempo è stata messa a riposo: deve dirlo, non tacere
  await scegliScheda(page, ids[0]);
  await page.waitForTimeout(200);
  const tornato = await page.evaluate(() => {
    const box = document.querySelector('#browserStatoScheda');
    return { visibile: box && !box.hidden, stato: box?.dataset.stato || null, testo: box?.textContent || '' };
  });
  expect(tornato.visibile).toBe(true);
  expect(tornato.stato).toBe('riposo');
  expect(tornato.testo.length).toBeGreaterThan(20); // c'è una frase, non un riquadro vuoto
});

test('P0-B-4b/4e — UNA SCHEDA IN ERRORE non tocca le altre, e lo dice nel SUO pannello', async ({ page }) => {
  await apparecchia(page, (url) => (url.includes('sito-b') ? rispostaCornice(url, { incorniciabile: false, motivo: 'Questo indirizzo non esiste', genere: 'dns', titolo: null }) : rispostaCornice(url, { titolo: url })));
  await apriLaApp(page);
  const ids = await treLetture(page);
  const [a, b] = ids;

  await scegliScheda(page, a);
  await page.waitForFunction(() => document.querySelector('#browserLive iframe'));
  await scegliScheda(page, b);
  await page.waitForTimeout(300);

  const suB = await page.evaluate(() => {
    const box = document.querySelector('#browserStatoScheda');
    return {
      visibile: box && !box.hidden,
      testo: box?.querySelector('[data-stato-motivo]')?.textContent || '',
      rimedio: box?.querySelector('[data-stato-rimedio]')?.textContent || '',
      stato: box?.dataset.stato || null,
      linguetta: document.querySelector('#browserSchede [aria-selected="true"]')?.dataset.statoScheda,
    };
  });
  expect(suB.visibile).toBe(true);
  expect(suB.stato).toBe('unreachable'); // ⛔ il server non l'ha RAGGIUNTA (genere «dns»): non è un sito che rifiuta la cornice
  /* ⛔ 16/09, giro di riparazione — questa riga diceva «il motivo è un DATO del server: arriva così
     com'è, in nessun dizionario». Era la descrizione del DIFETTO, scambiata per il comportamento
     giusto: è per quello che il pannello usciva mezzo inglese e mezzo italiano. Adesso la frase la
     compone il client dal GENERE, e in italiano è questa. */
  expect(suB.testo).toContain('Questo indirizzo non esiste');
  /* ⛔ e il rimedio dipende da quel motivo, non è una frase fissa: per un nome che non esiste NON
     dev'essere «chiedi all'agente di leggerla», che è il consiglio falso curato oggi. */
  expect(suB.rimedio.toLowerCase()).toMatch(/indirizzo|address/);
  expect(suB.rimedio.toLowerCase()).not.toMatch(/agente|agent/);
  expect(suB.linguetta).toBe('unreachable');

  await scegliScheda(page, a);
  await page.waitForTimeout(150);
  const suA = await page.evaluate(() => {
    const box = document.querySelector('#browserStatoScheda');
    const frame = document.querySelector('#browserLive iframe:not([hidden])');
    return {
      pannelloNascosto: !box || box.hidden,
      corniceVisibile: Boolean(frame),
      modo: [...document.querySelectorAll('#schermoBrowser [data-browser-modo]')].find((x) => x.getAttribute('aria-pressed') === 'true')?.dataset.browserModo,
      avvisoGlobale: document.querySelector('#browserAvviso')?.hidden !== false ? '' : document.querySelector('#browserAvviso').textContent,
    };
  });
  expect(suA.pannelloNascosto).toBe(true); // ⛔ prima l'errore stava in una riga GLOBALE e si leggeva anche stando qui
  expect(suA.corniceVisibile).toBe(true);
  expect(suA.modo).toBe('pagina');
  expect(suA.avvisoGlobale).toBe('');
});

test('P0-B-4c — IL SERVER TACE: si ritenta col suo tempo, si dice a schermo, e alla fine «non raggiunta»', async ({ page }) => {
  const chiamate = [];
  await apparecchia(page, () => null, { conta: chiamate }); // null = il server risponde 500, sempre
  await apriLaApp(page);
  await page.evaluate(() => { window.__talosHarnessUiRuntime.executeCommand('browser'); });
  /*
   * ⭐ lo stato «riprovo» si VEDE mentre succede: è il punto 4(b), non un dettaglio del registro.
   * ⛔ Ma NON si aspetta con un `waitForFunction`: l'attesa del primo ritentativo è a jitter PIENO
   *   (fra 0 e 400 ms, come vuole AWS) e può durare pochi millisecondi — una guardia che campiona
   *   se lo perde, e diventa rossa a caso. Misurato il 16/09: verde tre volte, rossa alla quarta
   *   sullo stesso identico codice. ⇒ si REGISTRANO tutte le transizioni con un MutationObserver
   *   acceso PRIMA di premere Invio, e poi si guarda che cosa è passato davvero.
   * ⛔ Si legge l'ATTRIBUTO, non la frase: le frasi passano dal dizionario delle lingue e su un
   *   profilo inglese «Apertura in corso…» esce «Opening…» (misurato il 16/09). Le frasi si
   *   guardano nelle foto.
   */
  await page.evaluate(() => {
    window.__transizioni = [];
    const guarda = (nodo) => {
      if (!nodo) return;
      new MutationObserver(() => { const s = nodo.dataset.stato; if (s && window.__transizioni.at(-1) !== s) window.__transizioni.push(s); })
        .observe(nodo, { attributes: true, attributeFilter: ['data-stato', 'hidden'] });
    };
    guarda(document.querySelector('#browserCaricamento'));
    new MutationObserver(() => {
      const box = document.querySelector('#browserStatoScheda');
      if (box && !box.dataset.osservato) { box.dataset.osservato = 'si'; guarda(box); }
    }).observe(document.querySelector('#schermoBrowser'), { childList: true, subtree: true });
  });
  await page.fill('#urlBrowser', 'sito-muto.test');
  await page.press('#urlBrowser', 'Enter');

  await page.waitForFunction(() => document.querySelector('#browserStatoScheda')?.dataset.stato === 'unreachable', null, { timeout: 20000 });
  const transizioni = await page.evaluate(() => window.__transizioni);
  expect(transizioni).toContain('retrying'); // ⛔ il ritentativo è passato a schermo, non solo nel codice
  /* ⛔ Si guardano i NODI e il loro contenuto non vuoto, non le parole: il titolo e il rimedio
     passano dal dizionario delle lingue (su questo profilo «Non sono riuscito ad aprire questa
     pagina» esce «I could not open this page»), e una prova che pretende l'italiano dice rosso per
     la lingua invece che per il comportamento. Il MOTIVO invece è un dato del server, non una
     frase dell'interfaccia: quello si può leggere, ed è la prova nella prova 4b. */
  const finale = await page.evaluate(() => ({
    titolo: document.querySelector('#browserStatoScheda [data-stato-titolo]').textContent.trim(),
    rimedio: document.querySelector('#browserStatoScheda [data-stato-rimedio]').textContent.trim(),
    riprovaVisibile: !document.querySelector('#browserStatoScheda [data-stato-riprova]').hidden,
    annullaNascosto: document.querySelector('#browserStatoScheda [data-stato-annulla]').hidden,
    linguetta: document.querySelector('#browserSchede [aria-selected="true"]')?.dataset.statoScheda,
  }));
  expect(finale.titolo.length).toBeGreaterThan(10); // c'è una frase, in qualunque lingua sia il profilo
  expect(finale.rimedio.length).toBeGreaterThan(10); // e un rimedio, che non è mai vuoto
  expect(finale.riprovaVisibile).toBe(true);
  expect(finale.annullaNascosto).toBe(true); // ⛔ «Annulla» su una cosa già ferma non farebbe niente
  expect(finale.linguetta).toBe('unreachable');
  // ⛔ i tentativi sono quelli DICHIARATI: uno più due ritentativi, non «finché va»
  expect(chiamate.length).toBe(3);
});

test('P0-B-4c, al contrario — ANNULLARE durante l’apertura: stato «annullata» e NESSUNA scrittura in ritardo', async ({ page }) => {
  let rilascia = null;
  const attesa = new Promise((r) => { rilascia = r; });
  await apparecchia(page, async (url) => { await attesa; return rispostaCornice(url, { titolo: 'arrivata tardi' }); });
  await apriLaApp(page);
  await page.evaluate(() => { window.__talosHarnessUiRuntime.executeCommand('browser'); });
  await page.fill('#urlBrowser', 'sito-lento.test');
  await page.press('#urlBrowser', 'Enter');

  await page.waitForFunction(() => {
    const c = document.querySelector('#browserCaricamento');
    return c && !c.hidden && c.dataset.stato === 'loading';
  }, null, { timeout: 8000 });

  await page.click('#browserCaricamento [data-action="annullaBrowser"]');
  await page.waitForFunction(() => document.querySelector('#browserStatoScheda')?.dataset.stato === 'cancelled', null, { timeout: 5000 });

  rilascia(); // la risposta arriva ADESSO, dopo l'annullamento
  await page.waitForTimeout(600);
  const dopo = await page.evaluate(() => ({
    stato: document.querySelector('#browserStatoScheda')?.dataset.stato,
    schede: document.querySelectorAll('#browserSchede [data-browser-tab]').length,
    titolo: document.querySelector('#browserSchede [aria-selected="true"] .talos-tabstrip__titolo')?.textContent,
    riprovaVisibile: !document.querySelector('#browserStatoScheda [data-stato-riprova]').hidden,
  }));
  expect(dopo.stato).toBe('cancelled'); // ⛔ la risposta tardiva NON ha riscritto lo stato
  expect(dopo.schede).toBe(1);
  expect(dopo.titolo).not.toContain('arrivata tardi'); // ⛔ né il titolo
  expect(dopo.riprovaVisibile).toBe(true); // e da qui si riparte quando si vuole
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — LA PROVA CHE MANCAVA, E CHE È LA PIÙ IMPORTANTE.
 *
 * Bocciatura del controllore, misurata così: ha spento l'annullamento vero — la riga
 * `volo.controller?.abort()` in `fermaRichiestaBrowser` — ha ricostruito la app e ha rilanciato la
 * suite. È rimasta TUTTA VERDE. La prova «ANNULLARE durante l'apertura» qui sopra guarda che la
 * risposta tardiva non riscriva niente, e QUELLO lo garantisce `voloCorrente()`, non l'abort: la
 * richiesta poteva continuare a correre sulla rete per sempre, e nessun rosso l'avrebbe detto.
 * `grep -i abort` su questo file dava ZERO occorrenze: il punto 4(c) era venduto e non provato.
 *
 * ⇒ Qui si guarda la cosa stessa, da due porte indipendenti:
 *   1. il SEGNALE. Si avvolge `window.fetch` prima che la app parta e si registra, per la chiamata
 *      del Browser, se il suo `AbortSignal` è arrivato a `aborted`. MDN «AbortController»: un
 *      segnale interrotto resta interrotto — quindi è un fatto osservabile e stabile, non una corsa.
 *   2. la RETE. Chromium abbandona la richiesta e Playwright lo dice con `requestfailed`
 *      (`net::ERR_ABORTED`) — il modo documentato di vedere da fuori una fetch annullata
 *      (microsoft/playwright #9850; DEV «Stop Leaking Resources: How to Use AbortSignal in
 *      Playwright Tests», letti il 16/09/2026).
 * Due canali perché uno solo non basta: il primo prova che la app ha chiesto di fermarsi, il
 * secondo che il browser si è davvero fermato.
 */
test('P0-B-4c — L’ANNULLAMENTO FERMA DAVVERO LA RICHIESTA IN VOLO (segnale interrotto e richiesta abbandonata)', async ({ page }) => {
  let rilascia = null;
  const attesa = new Promise((r) => { rilascia = r; });
  await apparecchia(page, async (url) => { await attesa; return rispostaCornice(url, { titolo: 'arrivata tardi' }); });

  const abbandonate = [];
  page.on('requestfailed', (r) => { if (r.url().includes('/api/v1/browser/incorniciabile')) abbandonate.push(r.failure()?.errorText || '?'); });

  /* ⛔ PRIMA del caricamento: la app fa le sue chiamate all'avvio, e un aggancio messo dopo non
     vedrebbe quelle che contano. Non si cambia il comportamento, si osserva soltanto. */
  await page.addInitScript(() => {
    window.__voliBrowser = [];
    const originale = window.fetch;
    window.fetch = function avvolta(input, init) {
      const indirizzo = String(typeof input === 'string' ? input : (input?.url || ''));
      if (indirizzo.includes('/api/v1/browser/incorniciabile')) {
        const riga = { indirizzo, conSegnale: Boolean(init?.signal), interrotta: false };
        window.__voliBrowser.push(riga);
        try { init?.signal?.addEventListener('abort', () => { riga.interrotta = true; }); } catch { /* nessun segnale: la riga resta false, ed è il rosso */ }
      }
      return originale.call(this, input, init);
    };
  });

  await apriLaApp(page);
  await page.evaluate(() => { window.__talosHarnessUiRuntime.executeCommand('browser'); });
  await page.fill('#urlBrowser', 'sito-lentissimo.test');
  await page.press('#urlBrowser', 'Enter');
  await page.waitForFunction(() => window.__voliBrowser?.length === 1 && document.querySelector('#browserCaricamento')?.dataset.stato === 'loading', null, { timeout: 8000 });

  /* PRIMA di annullare: la richiesta è in volo e nessuno l'ha fermata. Senza questa metà, una prova
     che vede «interrotta: true» non saprebbe dire se l'abort è arrivato al momento giusto. */
  expect(await page.evaluate(() => window.__voliBrowser.map((v) => [v.conSegnale, v.interrotta]))).toEqual([[true, false]]);

  await page.click('#browserCaricamento [data-action="annullaBrowser"]');
  await page.waitForFunction(() => document.querySelector('#browserStatoScheda')?.dataset.stato === 'cancelled', null, { timeout: 5000 });

  // 1ª porta — il segnale della richiesta in volo è arrivato a «interrotto»
  const voli = await page.evaluate(() => window.__voliBrowser);
  expect(voli).toHaveLength(1);
  expect(voli[0].conSegnale, 'la chiamata del Browser deve nascere con un AbortSignal, o non è annullabile').toBe(true);
  expect(voli[0].interrotta, 'annullare deve interrompere il SEGNALE, non solo smettere di leggere la risposta').toBe(true);

  // 2ª porta — il browser ha abbandonato la richiesta sulla rete
  await expect.poll(() => abbandonate.length, { timeout: 5000 }).toBeGreaterThan(0);
  expect(abbandonate.join(' ')).toMatch(/ABORT/i);

  rilascia();
  await page.waitForTimeout(400);
  // e resta vero quello che si sapeva già: nessuna scrittura in ritardo
  expect(await page.evaluate(() => document.querySelector('#browserStatoScheda')?.dataset.stato)).toBe('cancelled');
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — IL PANNELLO PARLA UNA LINGUA SOLA.
 *
 * Bocciatura con le foto in mano: `artifacts/p0-B/browser-p0-stato-*.png` mostravano il titolo «I
 * could not open this page» (inglese) sopra il motivo «Il sito non ha risposto in tempo (6
 * secondi)» (italiano), dentro una app per il resto tutta inglese — e il commit dichiarava quel
 * difetto riparato. La causa era STRUTTURALE: il motivo lo componeva il server con un numero
 * dentro, e il client lo passava a un dizionario a chiavi fisse, dove non potrà mai stare.
 * ⇒ Adesso il server manda `genere` + `dettagli` e la frase la scrive il client, col numero come
 * segnaposto. Questa prova gira la STESSA schermata nelle DUE lingue e pretende che nessuna delle
 * due sia mista.
 */
test('P0-B-4b — IL PANNELLO PARLA UNA LINGUA SOLA: stessa schermata in italiano e in inglese', async ({ page }) => {
  /*
   * ⛔ Le frasi ATTESE, non parole-spia. La prima versione di questa prova cercava parole
   *   («sito», «site», «page»…) e lasciava passare «Annulla navigazione» dentro un pannello
   *   inglese, perché quella frase non conteneva nessuna delle parole cercate — l'ho visto
   *   GUARDANDO la foto, non dal verde. Un contratto esatto non ha questo buco.
   */
  const atteso = {
    it: { titolo: 'Non sono riuscito ad aprire questa pagina', motivo: 'Il sito non ha risposto in tempo (6 secondi)', rimedio: 'Riprova fra un momento.', annulla: 'Annulla navigazione', apre: 'Apertura in corso…' },
    en: { titolo: 'I could not open this page', motivo: 'The site did not answer in time (6 seconds)', rimedio: 'Try again in a moment.', annulla: 'Cancel navigation', apre: 'Opening…' },
  };
  for (const lingua of ['it', 'en']) {
    let rilascia = null;
    const trattieni = new Promise((r) => { rilascia = r; });
    await apparecchia(page, async (url) => {
      if (!url.includes('sito-b')) return rispostaCornice(url, { titolo: url });
      await trattieni; // ⇒ la scheda B resta in «apertura»: è lì che vive il pulsante di annullamento
      return rispostaCornice(url, { incorniciabile: false, motivo: 'Il sito non ha risposto in tempo (6 secondi)', genere: 'timeout', dettagli: { secondi: 6 }, titolo: null });
    });
    await apriLaApp(page, { lingua });
    const ids = await treLetture(page);
    await scegliScheda(page, ids[1]);

    // 1ª metà — il pannello MENTRE lavora, quello che la versione precedente non guardava
    await page.waitForFunction(() => document.querySelector('#browserCaricamento')?.dataset.stato === 'loading', null, { timeout: 8000 });
    const lavorando = await page.evaluate(() => {
      const box = document.querySelector('#browserCaricamento');
      return {
        apre: box.querySelector('.talos-browser__heading')?.textContent?.trim() || '',
        sotto: box.querySelector('p.talos-muted')?.textContent?.trim() || '',
        annulla: box.querySelector('[data-action="annullaBrowser"]')?.textContent?.trim() || '',
      };
    });
    expect(lavorando.apre, `${lingua}: il titolo dell'attesa`).toBe(atteso[lingua].apre);
    expect(lavorando.annulla, `${lingua}: il pulsante dell'attesa — è scritto a mano nel modello HTML, e nessuno lo traduceva`).toBe(atteso[lingua].annulla);
    expect(lavorando.sotto.length, `${lingua}: il sottotitolo dell'attesa non è vuoto`).toBeGreaterThan(10);

    // 2ª metà — il pannello quando la catena si è fermata
    rilascia();
    await page.waitForFunction(() => document.querySelector('#browserStatoScheda')?.dataset.stato === 'unreachable', null, { timeout: 15000 });
    const fermo = await page.evaluate(() => {
      const box = document.querySelector('#browserStatoScheda');
      const leggi = (sel) => box.querySelector(sel)?.textContent?.trim() || '';
      return { titolo: leggi('[data-stato-titolo]'), motivo: leggi('[data-stato-motivo]'), rimedio: leggi('[data-stato-rimedio]') };
    });
    expect(fermo.titolo, `${lingua}: il titolo del guasto`).toBe(atteso[lingua].titolo);
    /* ⛔ È QUESTA la riga della bocciatura: il motivo lo componeva il server con «6» dentro e il
       client provava a tradurlo con un dizionario a chiavi fisse. Adesso il «6» è un parametro e
       la frase è dell'interfaccia — quindi si può pretendere ESATTA in tutt'e due le lingue. */
    expect(fermo.motivo, `${lingua}: il motivo del guasto, col numero come parametro`).toBe(atteso[lingua].motivo);
    expect(fermo.rimedio, `${lingua}: il rimedio`).toBe(atteso[lingua].rimedio);
  }
});

/*
 * ⛔⛔⛔ 16/09/2026, SECONDO GIRO DI RIPARAZIONE — LA LINGUA CAMBIATA A CALDO.
 *
 * Bocciatura del controllore, con la riproduzione in mano: la prova qui sopra apre la app GIÀ in
 * una lingua, quindi non poteva vedere il difetto. Cambiando lingua a app viva — dal selettore
 * delle Impostazioni, come fa una persona — titolo, motivo e rimedio passavano all'inglese e i due
 * pulsanti restavano «Riprova» e «Annulla». Causa, misurata sul file: le loro parole le scriveva
 * `nodoStato()` (`components/browser.js`), una fabbrica a CACHE che gira una volta sola; il nodo
 * sopravvive al cambio di lingua e quelle due parole non venivano mai più toccate.
 *
 * ⛔ Perché questa prova non è un doppione: l'altra misura una lingua SCELTA PRIMA (il nodo nasce
 *   già giusto e un'etichetta scritta nella fabbrica passa), questa misura il RIDISEGNO. È la
 *   differenza fra «la pagina nasce bene» e «la pagina si aggiorna» — e il difetto viveva tutto
 *   nella seconda.
 * ⛔ Il contratto è nei due versi: le frasi inglesi ATTESE una per una, e in più nessuna delle
 *   frasi italiane lette prima del cambio può sopravvivere da nessuna parte dentro il pannello.
 *   Un elenco di parole-spia non basterebbe: è esattamente il buco che la volta scorsa ha lasciato
 *   passare «Annulla navigazione» dentro una schermata inglese.
 */
test('P0-B-4b — LA LINGUA CAMBIATA A CALDO: nessuna parola del pannello resta indietro', async ({ page }, info) => {
  mkdirSync(CARTELLA_FOTO, { recursive: true });
  const ITALIANO = { titolo: 'Non sono riuscito ad aprire questa pagina', motivo: 'Questo indirizzo non esiste', rimedio: 'Controlla l’indirizzo.', riprova: 'Riprova', annulla: 'Annulla' };
  const INGLESE = { titolo: 'I could not open this page', motivo: 'That address does not exist', rimedio: 'Check the address.', riprova: 'Try again', annulla: 'Cancel' };

  /** Tutto ciò che il pannello dice: le cinque parti per nome, e ogni testo che contiene. */
  const leggiPannello = () => page.evaluate(() => {
    const box = document.querySelector('#browserStatoScheda');
    const testo = (sel) => box.querySelector(sel)?.textContent?.trim() || '';
    return {
      titolo: testo('[data-stato-titolo]'),
      motivo: testo('[data-stato-motivo]'),
      rimedio: testo('[data-stato-rimedio]'),
      riprova: testo('[data-stato-riprova]'),
      annulla: testo('[data-stato-annulla]'),
      tutti: [...box.querySelectorAll('*')].map((n) => n.textContent.trim()).filter(Boolean),
    };
  });

  for (const tema of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: tema });
    await apparecchia(page, (url) => (url.includes('sito-b')
      ? rispostaCornice(url, { incorniciabile: false, motivo: 'Questo indirizzo non esiste', genere: 'dns', titolo: null })
      : rispostaCornice(url, { titolo: url })));
    await apriLaApp(page, { tema, lingua: 'it' });
    const ids = await treLetture(page);
    await scegliScheda(page, ids[1]);
    await page.waitForFunction(() => document.querySelector('#browserStatoScheda')?.dataset.stato === 'unreachable', null, { timeout: 15000 });

    const prima = await leggiPannello();
    expect(prima.titolo, `${tema}: si parte dall'italiano, altrimenti non c'è nessun cambio da misurare`).toBe(ITALIANO.titolo);
    expect(prima.motivo, `${tema}: il motivo, in italiano`).toBe(ITALIANO.motivo);
    expect(prima.rimedio, `${tema}: il rimedio, in italiano`).toBe(ITALIANO.rimedio);
    expect(prima.riprova, `${tema}: il pulsante «Riprova», in italiano`).toBe(ITALIANO.riprova);
    expect(prima.annulla, `${tema}: il pulsante «Annulla», in italiano`).toBe(ITALIANO.annulla);

    /* ⇒ IL CAMBIO A CALDO, dalla porta vera: il selettore delle Impostazioni, senza ricaricare.
       Se il selettore non ci fosse la prova non misurerebbe niente, quindi lo dice invece di
       proseguire verde su un'app che non ha mai cambiato lingua. */
    await page.evaluate(() => {
      const sel = document.querySelector('#setting-uiLanguageSelect');
      if (!sel) throw new Error('il selettore della lingua non esiste: questa prova non misurerebbe niente');
      sel.value = 'en';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.documentElement.getAttribute('lang') === 'en', null, { timeout: 8000 });

    const dopo = await leggiPannello();
    expect(dopo.titolo, `${tema}: il titolo passa all'inglese`).toBe(INGLESE.titolo);
    expect(dopo.motivo, `${tema}: il motivo passa all'inglese`).toBe(INGLESE.motivo);
    expect(dopo.rimedio, `${tema}: il rimedio passa all'inglese`).toBe(INGLESE.rimedio);
    /* ⛔ LE DUE RIGHE DELLA BOCCIATURA: le etichette le scriveva la fabbrica a cache, e al cambio
       di lingua nessuno le toccava più. */
    expect(dopo.riprova, `${tema}: ⛔ l'etichetta «Riprova» deve seguire la lingua, non la nascita del nodo`).toBe(INGLESE.riprova);
    expect(dopo.annulla, `${tema}: ⛔ l'etichetta «Annulla» deve seguire la lingua, non la nascita del nodo`).toBe(INGLESE.annulla);

    // e la rete larga: NESSUNA delle frasi italiane lette prima può essere rimasta, in nessun nodo
    const sopravvissute = Object.values(ITALIANO).filter((frase) => dopo.tutti.some((x) => x.includes(frase)));
    expect(sopravvissute, `${tema}: il pannello deve parlare UNA lingua sola dopo il cambio a caldo`).toEqual([]);

    const foto = fileURLToPath(new URL(`browser-p0-lingua-a-caldo-${tema}.png`, CARTELLA_FOTO));
    await page.screenshot({ path: foto, fullPage: false });
    await info.attach(`lingua-a-caldo-${tema}`, { path: foto, contentType: 'image/png' });
  }
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — LO STATO DI UNA SCHEDA SI LEGGE SENZA VEDERE I COLORI.
 *
 * Bocciatura: il CSS del 16/09 portava lo stato di una scheda NON attiva col solo colore, su
 * un'icona `aria-hidden="true"`. WCAG 1.4.1 «Use of Color» (Livello A) era citato come fonte nello
 * stesso blocco che lo violava — «screen readers don't announce colors» (accessibility.chat,
 * riletto il 16/09/2026). ⇒ tre canali: colore, FORMA (icona diversa) e TESTO (`sr-only`).
 * Qui si guardano i due che il colore non porta.
 */
test('P0-B-4b — LO STATO DI UNA LINGUETTA si legge senza colore: forma diversa e parola che si ascolta', async ({ page }) => {
  await apparecchia(page, (url) => (url.includes('sito-b')
    ? rispostaCornice(url, { incorniciabile: false, motivo: 'Questo indirizzo non esiste', genere: 'dns', titolo: null })
    : rispostaCornice(url, { titolo: url })));
  await apriLaApp(page);
  const ids = await treLetture(page);
  await scegliScheda(page, ids[1]);
  await page.waitForFunction(() => document.querySelector('#browserSchede [data-stato-scheda="unreachable"]'), null, { timeout: 8000 });
  // si va SU UN'ALTRA scheda: il caso vero è leggere lo stato di B stando su A
  await scegliScheda(page, ids[0]);
  await page.waitForTimeout(200);

  const striscia = await page.evaluate(() => [...document.querySelectorAll('#browserSchede [data-browser-tab]')].map((x) => ({
    id: x.dataset.browserId,
    stato: x.dataset.statoScheda,
    icona: x.querySelector('use')?.getAttribute('href') || null,
    parola: x.querySelector('.sr-only')?.textContent?.trim() || '',
  })));
  const rotta = striscia.find((x) => x.stato === 'unreachable');
  const sane = striscia.filter((x) => x.stato === 'loaded');
  expect(rotta, 'la scheda non raggiunta deve esserci').toBeTruthy();
  expect(sane.length, 'e le altre devono essere sane').toBeGreaterThan(0);
  // 1º canale che non è il colore: la FORMA
  expect(rotta.icona, 'la scheda rotta deve avere un’icona DIVERSA dalle sane').not.toBe(sane[0].icona);
  // 2º canale: la PAROLA, che un lettore di schermo annuncia e una ricerca nella pagina trova
  expect(rotta.parola.length, 'senza una parola, chi ascolta non sa che quella scheda è rotta').toBeGreaterThan(2);
  // AL CONTRARIO: una scheda sana non porta rumore
  expect(sane[0].parola, 'una scheda a posto non deve dire niente: sarebbe rumore su ogni riga').toBe('');
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — UN RIFIUTO NON È UN GUASTO, e me lo stavo per perdere.
 *
 * Trovato da me mentre rileggevo la cura, non da un rosso: dando un `genere` anche ai RIFIUTI
 * (`xfo-deny`, `xfo-sameorigin`, `frame-ancestors`) — che serviva per poterli dire in due lingue —
 * le due righe che decidono lo stato diventavano sbagliate. Dicevano
 * `esito?.genere ? 'irraggiungibile' : …`, cioè leggevano «c'è un genere» come «non ci sono
 * arrivato»: un sito che risponde benissimo e dice soltanto «non mi far vedere dentro una cornice»
 * sarebbe diventato «non sono riuscito ad aprire questa pagina», con «Riprova» acceso su una cosa
 * che riprovare non cambia, invece di ripiegare in silenzio sul testo dell'agente.
 *
 * ⛔ Nessuna prova lo copriva: tutte usavano generi di GUASTO (`dns`, `timeout`). È la forma esatta
 *   del difetto che il controllore mi ha contestato — una condizione che cambia significato quando
 *   cambia il dato che legge, e nessun rosso lo dice. ⇒ `eUnGuasto()` sta nel server accanto a
 *   `classificaGuasto`, è una sola, e questa prova la tiene ferma dal lato di chi guarda.
 */
test('P0-B-4b — UN RIFIUTO DEL SITO non è un guasto: ripiega sul testo, non dice «non raggiunta»', async ({ page }) => {
  /* Un solo apparecchiamento per i due versi: B è un RIFIUTO del sito, C è un GUASTO vero. Le
     rotte si registrano una volta sola — riscriverle a metà prova non rimuove quelle di prima, e
     una scheda già risolta non richiede niente al server (misurato: la seconda metà restava ferma
     allo stato della prima). */
  await apparecchia(page, (url) => {
    if (url.includes('sito-b')) return rispostaCornice(url, { incorniciabile: false, motivo: 'La pagina vieta ogni cornice (X-Frame-Options: DENY)', genere: 'xfo-deny', titolo: null });
    if (url.includes('sito-c')) return rispostaCornice(url, { incorniciabile: false, motivo: 'Questo indirizzo non esiste', genere: 'dns', titolo: null });
    return rispostaCornice(url, { titolo: url });
  });
  await apriLaApp(page);
  const ids = await treLetture(page);
  await scegliScheda(page, ids[1]);
  await page.waitForTimeout(400);

  const suB = await page.evaluate(() => {
    const box = document.querySelector('#browserStatoScheda');
    return {
      statoLinguetta: document.querySelector('#browserSchede [aria-selected="true"]')?.dataset.statoScheda,
      pannelloFermo: Boolean(box) && !box.hidden,
      modo: [...document.querySelectorAll('#schermoBrowser [data-browser-modo]')].find((x) => x.getAttribute('aria-pressed') === 'true')?.dataset.browserModo,
      testoVisibile: !document.querySelector('#browserPagina')?.hidden,
      avviso: document.querySelector('#browserAvviso')?.hidden === false ? document.querySelector('#browserAvviso').textContent.trim() : '',
    };
  });
  // ⛔ la riga che si romperebbe: «c'è un genere» NON vuol dire «non ci sono arrivato»
  expect(suB.statoLinguetta, 'un sito che risponde e dice di no è una scheda SANA, ripiegata sul testo').toBe('loaded');
  expect(suB.pannelloFermo, 'nessun pannello di guasto: non c\u2019è niente da riprovare').toBe(false);
  expect(suB.modo, 'il ripiego automatico porta al testo dell\u2019agente').toBe('testo');
  expect(suB.testoVisibile, 'e il testo si vede: è il motivo per cui il ripiego esiste').toBe(true);
  expect(suB.avviso.length, 'la riga in cima spiega perché si vede il testo e non la pagina').toBeGreaterThan(10);

  // AL CONTRARIO — un genere di GUASTO deve invece fermare la scheda e offrire «Riprova»
  await scegliScheda(page, ids[2]);
  await page.waitForFunction(() => document.querySelector('#browserStatoScheda')?.dataset.stato === 'unreachable', null, { timeout: 8000 });
  expect(await page.evaluate(() => document.querySelector('#browserSchede [aria-selected="true"]')?.dataset.statoScheda)).toBe('unreachable');
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — IL DIFETTO VERO DEL PUNTO 4(a), quello raccontato male.
 *
 * Il commit e il commento dicevano: «chiudo la seconda scheda e il modo della terza diventa quello
 * della quarta». Il controllore ha verificato che al commit base non poteva accadere —
 * `browserPagine` si riempie solo con `push` e la chiusura non fa `splice`. Aveva ragione.
 * Il difetto VERO è peggiore: `browserPagine` si svuota al cambio di sessione e `browserChiuse`
 * NO. Con gli id posizionali la prima lettura di una sessione nuova si chiamava `lettura-0`, un id
 * quasi certamente già fra le chiuse ⇒ nasceva INVISIBILE, senza errori e senza una riga a schermo.
 * Qui si misura quello, e non ciò che avevo immaginato.
 */
test('P0-B-4a — UNA SESSIONE NUOVA non nasce con la prima lettura invisibile', async ({ page }) => {
  await apparecchia(page, (url) => rispostaCornice(url, { titolo: url }));
  await apriLaApp(page);
  const ids = await treLetture(page);
  // si chiude la PRIMA scheda: il suo id entra fra le chiuse
  await page.evaluate((id) => {
    const scheda = document.querySelector(`#browserSchede [data-browser-id="${id}"]`);
    scheda.querySelector('button').click();
  }, ids[0]);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.querySelectorAll('#browserSchede [data-browser-tab]').length)).toBe(2);

  // ⇒ SESSIONE NUOVA, come quando si apre un'altra chat
  const dopo = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('browser-p0-due', 'workspace', 'Seconda', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'n1', toolCallName: 'naviga', _sequenza: 81001 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'n1', delta: JSON.stringify({ url: 'https://prima-della-nuova.test/' }), _sequenza: 81002 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'n1', content: 'Prima lettura della sessione nuova.', _sequenza: 81003 }, generation);
    runtime.executeCommand('browser');
    await new Promise((r) => requestAnimationFrame(r));
    return {
      schede: [...document.querySelectorAll('#browserSchede [data-browser-tab]')].map((x) => x.dataset.browserId),
      chiuse: runtime.realSessionState.browserChiuse.size,
    };
  });
  expect(dopo.schede.length, '⛔ la prima lettura di una sessione nuova deve VEDERSI').toBe(1);
  // e l'insieme delle chiuse non si porta dietro il passato: era quello a far sparire la scheda
  expect(dopo.chiuse, 'le chiuse si potano contro le letture che esistono').toBe(0);
});

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — LE FOTO ADESSO COPRONO ANCHE L'INGLESE.
 *
 * La bocciatura è nata GUARDANDO queste foto: nella versione precedente ce n'erano quattro, tutte
 * su un profilo che risultava inglese per caso (il Chromium di Playwright si presenta `en-US` e la
 * preferenza era «Segui il sistema»), e mostravano il pannello mezzo inglese e mezzo italiano —
 * mentre il commit lo dichiarava riparato. ⇒ Le foto sono OTTO: due temi per due lingue, la
 * schermata dello stato e quella della pagina. La lingua adesso è DICHIARATA, non ereditata: è
 * l'unico modo perché una foto provi qualcosa su quale lingua si sta guardando.
 */
test('P0-B — le foto dei sei stati, nei DUE temi e nelle DUE lingue', async ({ page }, info) => {
  mkdirSync(CARTELLA_FOTO, { recursive: true });
  for (const tema of ['dark', 'light']) {
    for (const lingua of ['it', 'en']) {
      await page.emulateMedia({ colorScheme: tema });
      await apparecchia(page, (url) => (url.includes('sito-b') ? rispostaCornice(url, { incorniciabile: false, motivo: 'Il sito non ha risposto in tempo (6 secondi)', genere: 'timeout', dettagli: { secondi: 6 }, titolo: null }) : rispostaCornice(url, { titolo: url })));
      await apriLaApp(page, { tema, lingua });
      const ids = await treLetture(page);
      await scegliScheda(page, ids[1]);
      /* ⛔ 16/09 — si aspetta che la catena si FERMI. Con una semplice attesa a tempo la foto
         cadeva a volte sul ritentativo e a volte sullo stato finale, cioè non era riproducibile:
         una foto che cambia soggetto a ogni giro non prova niente. */
      await page.waitForFunction(() => document.querySelector('#browserStatoScheda')?.dataset.stato === 'unreachable', null, { timeout: 15000 });
      await page.mouse.move(640, 620); // ⛔ il puntatore resta sulla linguetta e il suo fumetto copre la barra dell'indirizzo: si sposta prima di fotografare
      await page.waitForTimeout(400);
      await page.screenshot({ path: fileURLToPath(new URL(`browser-p0-stato-${tema}-${lingua}.png`, CARTELLA_FOTO)), fullPage: false });
      await scegliScheda(page, ids[0]);
      await page.mouse.move(640, 620);
      await page.waitForTimeout(400);
      await page.screenshot({ path: fileURLToPath(new URL(`browser-p0-pagina-${tema}-${lingua}.png`, CARTELLA_FOTO)), fullPage: false });
      const temaVero = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark');
      expect(temaVero).toBe(tema === 'light' ? 'light' : 'dark');
      const linguaVera = await page.evaluate(() => document.documentElement.getAttribute('lang'));
      expect(linguaVera, 'una foto vale solo se si sa in che lingua è').toBe(lingua);
    }
  }
  info.annotations.push({ type: 'foto', description: 'artifacts/p0-B/ — otto foto: stato e pagina, chiaro e scuro, italiano e inglese' });
});
