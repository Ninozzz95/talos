import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  candidatiChromium,
  canaleDaPercorso,
  trovaChromium,
  argomentiChromium,
  avviaBrowserVivo,
  wsUrlDaRiga,
  creaClientCdp,
  apriSchedaVuota,
  vaiA,
} from '../src/browser-vivo.mjs';

// M1 (07/09) — il motore del browser vivo. ⛔ Nessuna prova qui avvia un browser
// vero: `avvia` ed `esiste` sono finti, ed è per questo che stanno nel contratto.
// Ogni prova ha la sua metà AL CONTRARIO — un percorso che non c'è, una riga
// senza indirizzo, un CDP che risponde errore, una chiusura su un socket morto.

/** Un processo finto: la stessa forma che avviaBrowserVivo tocca davvero. */
function processoFinto({ pid = 4321 } = {}) {
  const p = new EventEmitter();
  p.pid = pid;
  p.exitCode = null;
  p.stderr = new PassThrough();
  p.uccisiCon = [];
  p.kill = (segnale) => { p.uccisiCon.push(segnale || 'SIGTERM'); return true; };
  p.esci = (codice = 0) => { p.exitCode = codice; p.emit('exit', codice); };
  return p;
}

/** Un socket finto alla maniera di `ws`: send/close/on. */
function socketFinto({ rispondi } = {}) {
  const s = new EventEmitter();
  s.inviati = [];
  s.chiuso = false;
  s.send = (testo) => {
    s.inviati.push(JSON.parse(testo));
    if (typeof rispondi === 'function') {
      const risposta = rispondi(JSON.parse(testo), s);
      if (risposta !== undefined) setImmediate(() => s.emit('message', JSON.stringify(risposta)));
    }
  };
  s.close = () => { s.chiuso = true; };
  s.evento = (messaggio) => s.emit('message', JSON.stringify(messaggio));
  return s;
}

const AMBIENTE_WIN = {
  PROGRAMFILES: 'C:\\Program Files',
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\tizio\\AppData\\Local',
};

test('CANDIDATI: su Windows prima Chrome, poi Edge, poi Chromium — e su tutte e tre le radici', () => {
  const elenco = candidatiChromium('win32', AMBIENTE_WIN);
  const primoEdge = elenco.findIndex((p) => p.includes('msedge.exe'));
  const primoChrome = elenco.findIndex((p) => p.includes('Google\\Chrome'));
  const primoChromium = elenco.findIndex((p) => p.includes('\\Chromium\\'));
  assert.ok(primoChrome >= 0 && primoEdge > primoChrome && primoChromium > primoEdge, `ordine sbagliato: ${elenco.join(' , ')}`);
  // Edge sta per default sotto «Program Files (x86)» anche se è a 64 bit: quella radice ci deve essere
  assert.ok(elenco.includes('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'));
  // niente doppioni anche se due radici coincidono
  const doppio = candidatiChromium('win32', { PROGRAMFILES: 'C:\\PF', 'PROGRAMFILES(X86)': 'C:\\PF' });
  assert.equal(new Set(doppio).size, doppio.length);
});

test('CANDIDATI: il binario dichiarato dall\'ambiente viene PRIMO; una piattaforma ignota non inventa percorsi', () => {
  const conScelta = candidatiChromium('win32', { ...AMBIENTE_WIN, TALOS_CHROMIUM: 'D:\\mio\\chrome.exe' });
  assert.equal(conScelta[0], 'D:\\mio\\chrome.exe');
  assert.ok(conScelta.length > 1, 'la scelta dell\'owner non deve cancellare i ripieghi');
  assert.equal(candidatiChromium('linux', {}).includes('/usr/bin/microsoft-edge-stable'), true);
  assert.ok(candidatiChromium('darwin', { HOME: '/Users/tizio' }).includes('/Users/tizio/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
  // AL CONTRARIO: piattaforma che non conosciamo ⇒ zero candidati inventati…
  assert.deepEqual(candidatiChromium('sunos', {}), []);
  // …ma se l'ambiente ne dichiara uno, quello resta
  assert.deepEqual(candidatiChromium('sunos', { CHROME_PATH: '/opt/mio/chromium' }), ['/opt/mio/chromium']);
});

test('CANALE: si legge dal percorso, ed Edge non si fa scambiare per Chrome', () => {
  assert.equal(canaleDaPercorso('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), 'chrome');
  assert.equal(canaleDaPercorso('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'), 'edge');
  assert.equal(canaleDaPercorso('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'), 'edge');
  assert.equal(canaleDaPercorso('/usr/bin/chromium-browser'), 'chromium');
  // AL CONTRARIO: un percorso che non dice niente non diventa «chrome» per comodità
  assert.equal(canaleDaPercorso('/usr/bin/qualcosa'), 'chromium');
  assert.equal(canaleDaPercorso(''), 'chromium');
});

test('TROVA: il primo che esiste davvero; se non esiste nessuno la risposta è null, non un percorso a caso', () => {
  const soloEdge = trovaChromium({ piattaforma: 'win32', ambiente: AMBIENTE_WIN, esiste: (p) => p.includes('msedge.exe') });
  assert.deepEqual(soloEdge, { percorso: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', canale: 'edge' });
  // con tutti e due installati vince Chrome, che è il primo in preferenza
  const tutti = trovaChromium({ piattaforma: 'win32', ambiente: AMBIENTE_WIN, esiste: () => true });
  assert.equal(tutti.canale, 'chrome');
  // AL CONTRARIO: nessun binario sul disco ⇒ null
  assert.equal(trovaChromium({ piattaforma: 'win32', ambiente: AMBIENTE_WIN, esiste: () => false }), null);
  // AL CONTRARIO: un `esiste` che esplode (permessi negati) non fa cadere la ricerca
  assert.equal(trovaChromium({ piattaforma: 'linux', ambiente: {}, esiste: () => { throw new Error('EACCES'); } }), null);
});

test('ARGOMENTI: porta 0 e profilo nostro; e NON ci sono i flag che aprirebbero un buco', () => {
  const args = argomentiChromium({ cartellaProfilo: 'C:\\talos\\profilo-browser' });
  assert.ok(args.includes('--remote-debugging-port=0'), 'la porta la sceglie Chrome, mai noi');
  assert.ok(args.includes('--user-data-dir=C:\\talos\\profilo-browser'));
  assert.ok(args.includes('--no-first-run') && args.includes('--no-default-browser-check'));
  assert.ok(args.includes('--disable-backgrounding-occluded-windows'), 'senza, una finestra coperta falsa ogni misura');
  assert.equal(args.at(-1), 'about:blank', 'si parte da una pagina vuota, non dalla «nuova scheda» che fa rete');
  // AL CONTRARIO — la parte che conta: questi NON ci devono essere
  const proibiti = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--remote-allow-origins=*', '--headless'];
  for (const flag of proibiti) {
    assert.equal(args.some((a) => a.startsWith(flag)), false, `${flag} non deve mai finire nella riga di comando`);
  }
  // e senza profilo non si parte proprio: il profilo personale non è un ripiego
  assert.throws(() => argomentiChromium({}), /profilo/i);
});

test('RIGA: l\'indirizzo si estrae solo se è davvero un ws://', () => {
  assert.equal(
    wsUrlDaRiga('DevTools listening on ws://127.0.0.1:36775/devtools/browser/a292f96c-7332-4ce8-82a9-7411f3bd280a'),
    'ws://127.0.0.1:36775/devtools/browser/a292f96c-7332-4ce8-82a9-7411f3bd280a',
  );
  // su Windows la riga porta il ritorno a capo dentro: non deve finire nell'indirizzo
  assert.equal(wsUrlDaRiga('DevTools listening on ws://127.0.0.1:1/x\r'), 'ws://127.0.0.1:1/x');
  // AL CONTRARIO: righe che somigliano ma non lo sono
  assert.equal(wsUrlDaRiga('DevTools listening on http://127.0.0.1:9222/json'), null);
  assert.equal(wsUrlDaRiga('[0907/101010.123:ERROR:socket.cc(93)] bind: address in use'), null);
  assert.equal(wsUrlDaRiga('DevTools listening on'), null);
  assert.equal(wsUrlDaRiga(''), null);
  assert.equal(wsUrlDaRiga(null), null);
});

test('AVVIO: risolve solo quando CDP ha annunciato la porta, e la cartella del profilo la crea lui', async () => {
  const p = processoFinto();
  const create = [];
  let argomentiVisti = null;
  const avvio = avviaBrowserVivo({
    percorso: 'C:\\finto\\chrome.exe',
    cartellaProfilo: 'C:\\talos\\profilo',
    creaCartella: (dove) => create.push(dove),
    avvia: (percorso, argomenti) => { argomentiVisti = argomenti; assert.equal(percorso, 'C:\\finto\\chrome.exe'); return p; },
  });
  // rumore prima dell'indirizzo: il browser scrive un sacco di righe che non c'entrano
  p.stderr.write('[0907/101010.000:WARNING:bluetooth_adapter_winrt.cc(1230)] niente bluetooth\n');
  p.stderr.write('DevTools listening on ws://127.0.0.1:51234/devtools/browser/abc-123\n');
  const vivo = await avvio;
  assert.equal(vivo.wsUrl, 'ws://127.0.0.1:51234/devtools/browser/abc-123');
  assert.equal(vivo.pid, 4321);
  assert.deepEqual(create, ['C:\\talos\\profilo']);
  assert.ok(argomentiVisti.includes('--user-data-dir=C:\\talos\\profilo'));
});

test('AVVIO AL CONTRARIO: se l\'indirizzo non arriva l\'errore lo DICE e il processo non resta vivo', async () => {
  const p = processoFinto();
  let albero = 0;
  const avvio = avviaBrowserVivo({
    percorso: '/finto/chrome',
    cartellaProfilo: '/tmp/profilo',
    creaCartella: () => {},
    avvia: () => p,
    attesaMs: 40,
    graziaMs: 20,
    terminaAlbero: (proc) => { albero += 1; proc.esci(9); return true; },
  });
  p.stderr.write('[0907/101010.000:ERROR:socket.cc(93)] bind: address in use\n');
  await assert.rejects(avvio, (e) => {
    assert.equal(e.codice, 'BROWSER_VIVO_ATTESA_SCADUTA');
    assert.match(e.message, /address in use/, 'l\'errore deve riportare cosa stava dicendo il browser');
    return true;
  });
  assert.equal(albero, 1, 'un Chromium orfano col nostro profilo non si lascia in giro');
});

test('AVVIO AL CONTRARIO: un browser che muore subito, e un binario che non parte proprio', async () => {
  const p = processoFinto();
  const avvio = avviaBrowserVivo({ percorso: '/finto/chrome', cartellaProfilo: '/tmp/p', creaCartella: () => {}, avvia: () => p, graziaMs: 10, terminaAlbero: () => true });
  setImmediate(() => p.esci(1));
  await assert.rejects(avvio, (e) => e.codice === 'BROWSER_VIVO_USCITO_SUBITO' && /codice 1/.test(e.message));

  await assert.rejects(
    avviaBrowserVivo({ percorso: '/non/ci/sono', cartellaProfilo: '/tmp/p', creaCartella: () => {}, avvia: () => { throw new Error('ENOENT'); } }),
    (e) => e.codice === 'BROWSER_VIVO_NON_PARTE',
  );
  await assert.rejects(
    avviaBrowserVivo({ cartellaProfilo: '/tmp/p' }),
    (e) => e.codice === 'BROWSER_VIVO_SENZA_BINARIO',
  );
  await assert.rejects(
    avviaBrowserVivo({ percorso: '/finto/chrome', cartellaProfilo: '/tmp/p', creaCartella: () => { throw new Error('EACCES'); }, avvia: () => p }),
    (e) => e.codice === 'BROWSER_VIVO_PROFILO_NON_CREABILE',
  );
});

test('CHIUSURA: chiude davvero, e se l\'albero non risponde arriva comunque il SIGKILL', async () => {
  const p = processoFinto();
  const avvio = avviaBrowserVivo({
    percorso: '/finto/chrome', cartellaProfilo: '/tmp/p', creaCartella: () => {}, avvia: () => p,
    terminaAlbero: (proc) => { proc.esci(0); return true; },
  });
  p.stderr.write('DevTools listening on ws://127.0.0.1:1/x\n');
  const vivo = await avvio;
  assert.deepEqual(await vivo.chiudi(), { chiuso: true, modo: 'albero' });
  // la seconda chiamata non ri-uccide niente
  assert.deepEqual(await vivo.chiudi(), { chiuso: true, modo: 'già chiuso' });

  // AL CONTRARIO: taskkill fallisce e il processo ignora tutto ⇒ SIGKILL, non un browser vivo
  const sordo = processoFinto({ pid: 999 });
  const avvio2 = avviaBrowserVivo({
    percorso: '/finto/chrome', cartellaProfilo: '/tmp/p', creaCartella: () => {}, avvia: () => sordo,
    graziaMs: 30,
    terminaAlbero: () => { throw new Error('taskkill: accesso negato'); },
  });
  sordo.stderr.write('DevTools listening on ws://127.0.0.1:2/y\n');
  const vivo2 = await avvio2;
  assert.deepEqual(await vivo2.chiudi(), { chiuso: true, modo: 'forzata' });
  assert.deepEqual(sordo.uccisiCon, ['SIGKILL']);
});

test('CDP: id progressivi, sessionId su ogni messaggio della scheda, eventi smistati per nome', async () => {
  const socket = socketFinto({ rispondi: (m) => ({ id: m.id, result: { eco: m.method, sessione: m.sessionId ?? null } }) });
  const cdp = creaClientCdp(socket, { attesaMs: 500 });
  const uno = await cdp.invia('Browser.getVersion');
  const due = await cdp.invia('Page.enable', {}, 'SESSIONE-1');
  assert.deepEqual(uno, { eco: 'Browser.getVersion', sessione: null });
  assert.deepEqual(due, { eco: 'Page.enable', sessione: 'SESSIONE-1' });
  assert.deepEqual(socket.inviati.map((m) => m.id), [1, 2]);
  assert.equal(socket.inviati[0].sessionId, undefined, 'un comando al browser non porta sessionId');
  assert.equal(socket.inviati[1].sessionId, 'SESSIONE-1');

  const visti = [];
  const stacca = cdp.su('Page.frameStoppedLoading', (p, ctx) => visti.push([p.frameId, ctx.sessionId]));
  socket.evento({ method: 'Page.frameStoppedLoading', params: { frameId: 'F1' }, sessionId: 'SESSIONE-1' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(visti, [['F1', 'SESSIONE-1']]);
  // AL CONTRARIO: staccato, non arriva più niente
  stacca();
  socket.evento({ method: 'Page.frameStoppedLoading', params: { frameId: 'F2' }, sessionId: 'SESSIONE-1' });
  await new Promise((r) => setImmediate(r));
  assert.equal(visti.length, 1);
  cdp.chiudi();
});

test('CDP AL CONTRARIO: una risposta di errore, un socket già morto, una chiusura con richieste in volo', async () => {
  const conErrore = socketFinto({ rispondi: (m) => ({ id: m.id, error: { code: -32000, message: 'Cannot navigate to invalid URL' } }) });
  const cdp = creaClientCdp(conErrore, { attesaMs: 500 });
  await assert.rejects(cdp.invia('Page.navigate', { url: 'boh' }, 'S'), (e) => {
    assert.equal(e.codice, 'CDP_ERRORE');
    assert.match(e.message, /Page\.navigate: Cannot navigate to invalid URL \(codice -32000\)/);
    return true;
  });

  // un socket che non scrive più (browser morto sotto di noi)
  const morto = socketFinto();
  morto.send = () => { throw new Error('WebSocket is not open'); };
  const cdpMorto = creaClientCdp(morto, { attesaMs: 500 });
  await assert.rejects(cdpMorto.invia('Page.enable', {}, 'S'), (e) => e.codice === 'CDP_INVIO_FALLITO');
  // chiudere un socket già morto non deve esplodere
  morto.close = () => { throw new Error('già chiuso'); };
  assert.doesNotThrow(() => cdpMorto.chiudi());

  // chi era in volo quando la connessione cade riceve un rifiuto, non resta appeso per sempre
  const muto = socketFinto();
  const cdpMuto = creaClientCdp(muto, { attesaMs: 500 });
  const appesa = cdpMuto.invia('Page.navigate', { url: 'http://localhost:5173/' }, 'S');
  muto.emit('close');
  await assert.rejects(appesa, (e) => e.codice === 'CDP_SOCKET_CHIUSO');
  // e dopo la caduta un comando nuovo fallisce subito invece di far finta
  await assert.rejects(cdpMuto.invia('Page.enable', {}, 'S'), (e) => e.codice === 'CDP_SOCKET_CHIUSO');

  // una risposta senza nessuno che l'aspetta, e una riga che non è JSON: si ignorano
  const robusto = socketFinto();
  const cdpRobusto = creaClientCdp(robusto);
  assert.doesNotThrow(() => { robusto.emit('message', 'questa non è JSON'); robusto.emit('message', JSON.stringify({ id: 999, result: {} })); });
  cdpRobusto.chiudi();
});

test('SCHEDA: si aggancia con flatten:true — il sessionId in cima a ogni messaggio', async () => {
  const inviati = [];
  const cdp = {
    invia: async (metodo, parametri) => {
      inviati.push([metodo, parametri]);
      if (metodo === 'Target.createTarget') return { targetId: 'T-1' };
      if (metodo === 'Target.attachToTarget') return { sessionId: 'S-1' };
      return {};
    },
  };
  assert.deepEqual(await apriSchedaVuota(cdp), { targetId: 'T-1', sessionId: 'S-1' });
  assert.deepEqual(inviati[0], ['Target.createTarget', { url: 'about:blank' }]);
  assert.deepEqual(inviati[1], ['Target.attachToTarget', { targetId: 'T-1', flatten: true }]);

  // AL CONTRARIO: senza targetId o senza sessionId non si finge di avere una scheda
  await assert.rejects(apriSchedaVuota({ invia: async () => ({}) }), (e) => e.codice === 'BROWSER_VIVO_SCHEDA_SENZA_ID');
  await assert.rejects(
    apriSchedaVuota({ invia: async (m) => (m === 'Target.createTarget' ? { targetId: 'T' } : {}) }),
    (e) => e.codice === 'BROWSER_VIVO_SESSIONE_MANCANTE',
  );
});

/** Un CDP finto che risponde a Page/Network e sa sparare gli eventi del caricamento. */
function cdpFinto({ stato = 200, errorText = null, mai = false } = {}) {
  const ascoltatori = new Map();
  const chiamate = [];
  const spara = (evento, p) => { for (const cb of ascoltatori.get(evento) || []) cb(p, { sessionId: 'S', metodo: evento }); };
  return {
    chiamate,
    invia: async (metodo, parametri, sessionId) => {
      chiamate.push([metodo, parametri, sessionId]);
      if (metodo !== 'Page.navigate') return {};
      if (errorText) return { errorText };
      if (!mai) {
        setImmediate(() => {
          spara('Network.responseReceived', { type: 'Document', frameId: 'F-1', response: { status: stato } });
          spara('Page.frameStoppedLoading', { frameId: 'F-1' });
        });
      }
      return { frameId: 'F-1', loaderId: 'L-1' };
    },
    su: (evento, cb) => {
      if (!ascoltatori.has(evento)) ascoltatori.set(evento, new Set());
      ascoltatori.get(evento).add(cb);
      return () => ascoltatori.get(evento).delete(cb);
    },
    ascoltatoriRimasti: () => [...ascoltatori.values()].reduce((n, s) => n + s.size, 0),
  };
}

test('NAVIGA: lo stato HTTP viene da Network, non dal fatto che «la pagina si è caricata»', async () => {
  const cdp = cdpFinto({ stato: 200 });
  const esito = await vaiA(cdp, 'S', 'http://localhost:5173/');
  assert.deepEqual(esito, { ok: true, stato: 200, errore: null, url: 'http://localhost:5173/' });
  assert.deepEqual(cdp.chiamate.map((c) => c[0]), ['Page.enable', 'Network.enable', 'Page.navigate']);
  assert.equal(cdp.chiamate[0][2], 'S', 'ogni comando alla scheda porta il sessionId');
  assert.equal(cdp.ascoltatoriRimasti(), 0, 'gli ascoltatori si staccano: una navigazione non lascia perdite');
});

test('NAVIGA AL CONTRARIO: un 404 caricato benissimo È un fallimento, e un errore di rete si dice in italiano', async () => {
  // ⛔ è l'inganno esatto per cui la cornice <iframe> non si accorgeva di niente
  const quattroZeroQuattro = await vaiA(cdpFinto({ stato: 404 }), 'S', 'https://esempio.org/manca');
  assert.deepEqual([quattroZeroQuattro.ok, quattroZeroQuattro.stato], [false, 404]);
  assert.match(quattroZeroQuattro.errore, /404/);

  const rotta = await vaiA(cdpFinto({ errorText: 'net::ERR_NAME_NOT_RESOLVED' }), 'S', 'https://non-esiste.invalid/');
  assert.deepEqual(rotta, { ok: false, stato: null, errore: 'Il nome del sito non esiste', url: 'https://non-esiste.invalid/' });

  const lenta = await vaiA(cdpFinto({ mai: true }), 'S', 'http://localhost:5173/', { attesaMs: 30 });
  assert.equal(lenta.ok, false);
  assert.match(lenta.errore, /non ha finito di caricare/);
});

test('NAVIGA AL CONTRARIO: schemi e indirizzi vietati non arrivano MAI al browser', async () => {
  for (const cattivo of ['file:///C:/Users/tizio/.ssh/id_rsa', 'chrome://settings', 'devtools://devtools/bundled/inspector.html', 'http://tizio:segreto@esempio.org/']) {
    const cdp = cdpFinto();
    const esito = await vaiA(cdp, 'S', cattivo);
    assert.equal(esito.ok, false, `${cattivo} doveva essere respinto`);
    assert.equal(cdp.chiamate.length, 0, `${cattivo} non deve nemmeno accendere Page/Network`);
  }
  const nonUrl = await vaiA(cdpFinto(), 'S', 'questo non è un indirizzo');
  assert.deepEqual([nonUrl.ok, nonUrl.errore], [false, 'URL non valido']);

  // …e il verso giusto: loopback e rete privata RESTANO ammessi, sono il motivo per cui il browser vivo esiste
  for (const buono of ['http://localhost:5173/', 'http://127.0.0.1:4174/harness', 'http://192.168.1.40:3000/']) {
    const esito = await vaiA(cdpFinto({ stato: 200 }), 'S', buono);
    assert.equal(esito.ok, true, `${buono} doveva passare`);
  }
});
