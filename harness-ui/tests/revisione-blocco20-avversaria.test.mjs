/*
 * Revisione avversaria del blocco 20 (29/10/2026). Ogni prova qui è ROSSA sul candidato `candidata/blocco-20` (29ab1573f) e descrive
 * un difetto; i controlli positivi (marcati «controllo») sono verdi e mostrano che la prova sa vedere il caso giusto.
 * Fonte (29/10/2026): VS Code `remote.autoForwardPortsSource` distingue «process» da «output» proprio perché un URL locale stampato
 * nel terminale inoltra porte non volute (release notes 1.54, microsoft/vscode-docs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { creaSorveglianteServerLocali, creaLettorePorte, lettorePorteDisponibile } from '../src/server-locali.mjs';
import { creaGestoreBrowserVivo } from '../src/browser-sessione-viva.mjs';
import { creaApriPaginaLocale, SCHEDA_DELLA_FINESTRA } from '../src/pagina-locale-ospite.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const pausa = (ms = 20) => new Promise((r) => { setTimeout(r, ms); });

/* ── R1: una porta diventa «server pronto di QUESTA conversazione» solo perché un comando ne ha STAMPATO l'indirizzo ── */
test('RV20-R1a un indirizzo solo STAMPATO (echo, cat, grep) rende «pronta» una porta che nessun processo della conversazione ascolta', async () => {
  const lettorePorte = { leggi: async () => ({ perPid: new Map(), perMarcatore: new Map() }) };
  /* `richiediPorta` esplicito (Mobile 29/10/2026): di serie vale solo su Windows, e la prova ereditava la piattaforma — rossa su
     Linux e Android, dove il limite è dichiarato a parte (RV20-R1c) */
  const s = creaSorveglianteServerLocali({ lettorePorte, richiediPorta: true, sonda: async (porta) => (porta === 4174 ? 'http://127.0.0.1:4174' : null) });
  // `echo http://localhost:4174` (o `grep -r localhost:4174 docs/`): il 4174 è il server di TALOS stesso, che risponde sempre
  s.dallUscita('conv-A', { toolCallId: 'tc-echo' }, { indirizzi: [{ host: 'localhost', porta: 4174 }] });
  await pausa();
  assert.equal(s.portaDellaSessione('conv-A', 4174), false,
    'la porta 4174 non è ascoltata da nessun processo di conv-A, eppure local_page la può aprire (uscita e porte NON incrociate)');
});

/* Il server fantasma di un'altra conversazione: conv-A ne stampa l'indirizzo, poi dorme */
async function fantasma({ richiediPorta }) {
  const lettorePorte = creaLettorePorte({ piattaforma: 'linux', spawnFn: () => { throw new Error('non chiamato'); } });
  const s = creaSorveglianteServerLocali({ lettorePorte, richiediPorta, sonda: async () => 'http://127.0.0.1:5173' });
  s.dallUscita('conv-A', { toolCallId: 'tc-1' }, { indirizzi: [{ host: 'localhost', porta: 5173 }] });
  await pausa();
  await s.campiona('conv-A', [{ toolCallId: 'tc-1', pid: 999, comando: 'echo http://localhost:5173 && sleep 600' }]);
  return s.portaDellaSessione('conv-A', 5173);
}

test('RV20-R1b con la porta richiesta, anche col lettore di Linux (che non legge niente) il server fantasma non diventa «pronto»', async () => {
  assert.equal(await fantasma({ richiediPorta: true }), false, 'dopo un giro di sorveglianza la porta di un altro resta di conv-A');
});

/* 29/10/2026: su Linux il lettore delle porte c'è (`porteLinuxPerRadice`, `/proc`), e `richiediPorta` di serie lo segue
   (`lettorePorteDisponibile`). Il /proc qui è finto: la 5173 la ascolta il PID 500 di un'altra conversazione; il 999 di conv-A ha
   solo stampato l'indirizzo. Controllo: quando è il 999 ad ascoltarla, la porta è di conv-A. */
function procFinto({ ascoltaIl999 }) {
  const file = new Map([
    ['/proc/net/tcp', '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n'
      + '   0: 0100007F:1435 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 7001 1 0 100 0 0 10 0\n'],
    ['/proc/999/stat', '999 (sh) S 1 999 999 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 5000 0 0'],
    ['/proc/500/stat', '500 (node) S 1 500 500 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 4000 0 0'],
  ]);
  const fd = new Map([['/proc/999/fd', ['0', '1', '2']], ['/proc/500/fd', ['0', '19']]]);
  const link = new Map([['/proc/999/fd/0', '/dev/null'], ['/proc/999/fd/1', 'pipe:[1]'], ['/proc/999/fd/2', ascoltaIl999 ? 'socket:[7001]' : 'pipe:[2]'],
    ['/proc/500/fd/0', '/dev/null'], ['/proc/500/fd/19', ascoltaIl999 ? 'pipe:[3]' : 'socket:[7001]']]);
  const manca = (p) => Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' });
  return {
    readFileSync: (p) => { if (!file.has(p)) throw manca(p); return file.get(p); },
    readdirSync: (p) => { if (p === '/proc') return ['1', '500', '999', 'net', 'self']; if (!fd.has(p)) throw manca(p); return fd.get(p); },
    readlinkSync: (p) => { if (!link.has(p)) throw manca(p); return link.get(p); },
  };
}
async function fantasmaSuLinux({ ascoltaIl999 }) {
  const fsProc = procFinto({ ascoltaIl999 });
  const lettorePorte = creaLettorePorte({ piattaforma: 'linux', fsProc, spawnFn: () => { throw new Error('non chiamato'); } });
  const richiediPorta = lettorePorteDisponibile({ piattaforma: 'linux', readFileSync: fsProc.readFileSync });
  const s = creaSorveglianteServerLocali({ lettorePorte, richiediPorta, sonda: async () => 'http://127.0.0.1:5173' });
  s.dallUscita('conv-A', { toolCallId: 'tc-1' }, { indirizzi: [{ host: 'localhost', porta: 5173 }] });
  await pausa();
  await s.campiona('conv-A', [{ toolCallId: 'tc-1', pid: 999, comando: ascoltaIl999 ? 'npx vite' : 'echo http://localhost:5173 && sleep 600' }]);
  await pausa();
  return s.portaDellaSessione('conv-A', 5173);
}

test('RV20-R1c su Linux il lettore delle porte c\'è: un indirizzo solo stampato non rende «pronta» la porta di un\'altra conversazione', async () => {
  assert.equal(await fantasmaSuLinux({ ascoltaIl999: false }), false);
});

test('RV20-R1c controllo: su Linux la porta che un processo della conversazione ascolta davvero diventa sua', async () => {
  assert.equal(await fantasmaSuLinux({ ascoltaIl999: true }), true);
});

/* ⛔ Limite DICHIARATO che resta: macOS (servirebbe `lsof`) e Android (`/proc/net/tcp` negato alle app). Sul telefono `local_page` non
   si offre (nessun Chromium, `apriPaginaLocaleSeCeIlBrowser`), quindi lì il limite non apre niente; resta per un desktop macOS. */
test('RV20-R1d [LIMITE DICHIARATO] senza lettore delle porte (macOS) un indirizzo solo stampato rende ancora «pronta» la porta', { todo: 'macOS: lettore delle porte con lsof' }, async () => {
  assert.equal(await fantasma({ richiediPorta: false }), false);
});

/* ── R2: la console vista da local_page diventa muta dopo 20 errori/avvisi accumulati nella scheda condivisa ── */
function cdpFinto({ erroriAllaNavigazione = 1 } = {}) {
  const ascoltatori = new Map();
  const cdp = {
    invia(metodo, parametri) {
      if (metodo === 'Target.createBrowserContext') return Promise.resolve({ browserContextId: 'ctx-1' });
      if (metodo === 'Target.createTarget') return Promise.resolve({ targetId: 'tg-1' });
      if (metodo === 'Target.attachToTarget') return Promise.resolve({ sessionId: 'cdp-1' });
      if (metodo === 'Page.getFrameTree') return Promise.resolve({ frameTree: { frame: { id: 'frame-1' } } });
      if (metodo === 'Page.createIsolatedWorld') return Promise.resolve({ executionContextId: 7 });
      if (metodo === 'Runtime.evaluate') return Promise.resolve({ result: { value: 'pagina' } });
      if (metodo === 'Page.navigate') {
        queueMicrotask(() => {
          if (String(parametri?.url).startsWith('http://127.0.0.1:5173')) {
            for (let i = 0; i < erroriAllaNavigazione; i += 1) {
              cdp.emetti('Runtime.exceptionThrown', { exceptionDetails: { text: `Uncaught ReferenceError: rotto${i} is not defined` } });
            }
          }
          cdp.emetti('Network.responseReceived', { type: 'Document', frameId: 'frame-1', response: { status: 200, url: parametri?.url } });
          cdp.emetti('Page.frameStoppedLoading', { frameId: 'frame-1' });
          cdp.emetti('Page.loadEventFired', {});
        });
        return Promise.resolve({ frameId: 'frame-1', loaderId: 'l-1' });
      }
      return Promise.resolve({});
    },
    su(evento, cb) {
      const lista = ascoltatori.get(evento) || [];
      lista.push(cb); ascoltatori.set(evento, lista);
      return () => ascoltatori.set(evento, (ascoltatori.get(evento) || []).filter((x) => x !== cb));
    },
    emetti(evento, dato) { for (const cb of ascoltatori.get(evento) || []) cb(dato); },
    chiudi() {},
  };
  return cdp;
}
function pagina(cdp) {
  const browser = creaGestoreBrowserVivo({
    trovaFn: () => ({ percorso: 'C:/chrome.exe', canale: 'chrome' }),
    avviaFn: async () => ({ pid: 1, wsUrl: 'ws://127.0.0.1:9/x', chiudi: async () => {} }),
    clientFn: () => cdp, connettiFn: async () => ({}), cartellaProfilo: 'C:/temp/profilo-rv20',
  });
  const registro = { portaLocaleDellaSessione: (_s, p) => p === 5173, serverLocali: () => [{ porta: 5173, stato: 'pronto' }] };
  return { browser, apri: creaApriPaginaLocale({ registroFn: () => registro, browserVivoFn: () => browser, chatImageStore: null }) };
}

test('RV20-R2 controllo: su una scheda nuova l\'errore della pagina arriva al modello', async () => {
  const { apri } = pagina(cdpFinto());
  const r = await apri({ sessionId: 'conv-A', porta: 5173, percorso: '/', guarda: 'console' });
  assert.equal(r.ok, true);
  assert.equal(r.console.length, 1, JSON.stringify(r));
});

test('RV20-R2 dopo 20 errori/avvisi nella vita della scheda (la persona ha navigato, o la pagina ne ha già dati), «console» dice «nessun errore» anche se la pagina ne lancia', async () => {
  const cdp = cdpFinto();
  const { browser, apri } = pagina(cdp);
  await browser.apri(SCHEDA_DELLA_FINESTRA, 'https://example.org/');
  for (let i = 0; i < 20; i += 1) cdp.emetti('Runtime.consoleAPICalled', { type: 'warning', args: [{ type: 'string', value: `avviso ${i}` }] });
  const r = await apri({ sessionId: 'conv-A', porta: 5173, percorso: '/', guarda: 'console' });
  assert.equal(r.ok, true);
  assert.equal(r.console.length, 1, 'la pagina ha lanciato un ReferenceError, e il modello riceve «(no errors in the console)»');
});

/* ── R3: «Ferma tutto» mentre una delega sta nascendo — la figlia parte DOPO e resta al lavoro ── */
function runtimeControllabile() {
  const runs = [];
  return {
    runs,
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const index = runs.length;
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` });
      return promise;
    },
    fine(index, esito = 'concluso') {
      const run = runs[index];
      run.input.onEvento({ type: esito === 'concluso' ? 'RunFinished' : 'RunError', threadId: `t${index}`, runId: `r${index}`, ...(esito === 'fermato' ? { code: 'fermato' } : {}) });
      run.resolve({ ok: esito === 'concluso', esito: { detto: `risposta ${index}`, comeFinita: esito,
        messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: `risposta ${index}` }] } });
    },
  };
}

test('RV20-R3 «Ferma tutto» mentre la madre sta avviando una figlia: la figlia nasce dopo e lavora (e paga) da sola', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-rv20-'));
  const runtime = runtimeControllabile();
  let liberaCatalogo;
  const catalogo = new Promise((r) => { liberaCatalogo = r; });
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia le figlie' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, modelliDisponibiliFn: () => catalogo });
  t.after(async () => {
    for (let i = 0; i < runtime.runs.length; i += 1) { try { runtime.fine(i, 'fermato'); } catch { /* già finito */ } }
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registry.avvia('task');
  const delega = runtime.runs[0].input.onDelega('figlia', '/tmp/uno', { modello: 'm2' }); // aspetta il catalogo dei modelli
  const esito = registry.fermaTutto(sessionId);
  assert.deepEqual([esito.fermata, esito.figlieFermate], [true, 0], 'premessa: la figlia non c\'è ancora');
  liberaCatalogo(['m', 'm2']);
  const avvio = await delega;
  const nate = runtime.runs.slice(1);
  assert.ok(avvio?.esito !== 'avviato' || nate.every((r) => r.input.segnaleStop?.aborted === true),
    `dopo «Ferma tutto» è partita una figlia al lavoro (esito ${avvio?.esito}, figlie vive ${nate.filter((r) => !r.input.segnaleStop?.aborted).length})`);
});

/* ── R4: una figlia A RIPOSO che aspetta il suo nipote non riceve il segno «nessun risveglio»: il «fermato» del nipote la sveglia ── */
async function scenaR4(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-rv20b-'));
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia le figlie' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  t.after(async () => {
    for (let i = 0; i < runtime.runs.length; i += 1) { try { runtime.fine(i, 'fermato'); } catch { /* già finito */ } }
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  return { registry, runtime, ...registry.avvia('task') };
}

test('RV20-R4 controllo: senza «Ferma tutto», la figlia a riposo si sveglia quando il nipote finisce (K2, il meccanismo esiste)', async (t) => {
  const { registry, runtime } = await scenaR4(t);
  assert.equal((await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')).esito, 'avviato');
  assert.equal((await runtime.runs[1].input.onDelega('nipote', '/tmp/due')).esito, 'avviato');
  const figlia = (await runtime.runs[0].input.listChildrenFn({})).items[0].childId;
  runtime.fine(1); // la figlia chiude il suo giro e aspetta il nipote
  await registry.attendiAssestamento(figlia);
  runtime.fine(2); // il nipote finisce
  await t.waitFor(() => assert.equal(runtime.runs.length, 4, 'la figlia riparte col risultato del nipote'));
});

test('RV20-R4 «Ferma tutto» con la figlia a riposo e il nipote al lavoro: il «fermato» del nipote fa ripartire la figlia (giro a pagamento)', async (t) => {
  const { registry, runtime, sessionId } = await scenaR4(t);
  assert.equal((await runtime.runs[0].input.onDelega('figlia', '/tmp/uno')).esito, 'avviato');
  assert.equal((await runtime.runs[1].input.onDelega('nipote', '/tmp/due')).esito, 'avviato');
  const figlia = (await runtime.runs[0].input.listChildrenFn({})).items[0].childId;
  runtime.fine(1);
  await registry.attendiAssestamento(figlia);
  const esito = registry.fermaTutto(sessionId);
  assert.equal(esito.figlieFermate, 1, 'premessa: il nipote è fermato');
  runtime.fine(2, 'fermato');
  await pausa(300);
  assert.equal(runtime.runs.length, 3, `dopo «Ferma tutto» è ripartito: ${runtime.runs.slice(3).map((r) => r.input.checkpointSessionId === figlia ? 'la figlia' : r.input.checkpointSessionId === sessionId ? 'la chat' : 'altro ' + r.input.checkpointSessionId).join(', ')}`);
});
