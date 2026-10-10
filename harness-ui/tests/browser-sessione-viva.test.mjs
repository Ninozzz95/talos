import test from 'node:test';
import assert from 'node:assert/strict';
import { creaGestoreBrowserVivo, cartellaProfiloPredefinita, INATTIVITA_MS } from '../src/browser-sessione-viva.mjs';

/*
 * Il collante fra motore, trasmissione e annotazione. Nessun browser vero viene avviato qui: tutto
 * ciò che tocca il sistema è iniettato, ed è per questo che nel modulo le dipendenze sono parametri.
 *
 * Ogni prova ha la sua METÀ AL CONTRARIO. I tre vincoli che la ricerca del 07/09/2026 ha aggiunto —
 * l'isolamento dei cookie per contesto, la scheda che muore senza dircelo, la scadenza per
 * inattività — sono esattamente le tre cose che dal nostro codice non si vedevano, quindi sono le
 * tre che qui si provano per prime.
 */

/** Un client CDP finto: registra i comandi, risponde come il browser vero, e sa emettere eventi. */
function cdpFinto({ risposte = {} } = {}) {
  const inviati = [];
  const ascoltatori = new Map();
  return {
    inviati,
    invia(metodo, parametri, sessionId) {
      const self = this;
      inviati.push({ metodo, parametri, sessionId });
      if (typeof risposte[metodo] === 'function') return Promise.resolve(risposte[metodo](parametri));
      if (metodo === 'Target.createBrowserContext') return Promise.resolve({ browserContextId: 'ctx-1' });
      if (metodo === 'Target.createTarget') return Promise.resolve({ targetId: 'tg-1' });
      if (metodo === 'Target.attachToTarget') return Promise.resolve({ sessionId: 'cdp-1' });
      // quel tanto che serve all'overlay e alla navigazione: il resto del protocollo qui non ci riguarda
      if (metodo === 'Page.getFrameTree') return Promise.resolve({ frameTree: { frame: { id: 'frame-1' } } });
      if (metodo === 'Page.createIsolatedWorld') return Promise.resolve({ executionContextId: 7 });
      if (metodo === 'Page.navigate') {
        /* `vaiA` aspetta gli eventi veri del caricamento: un finto che non li emette la fa
           aspettare fino allo scadere del tetto (venti secondi per prova). Qui si risponde come
           farebbe un browser che carica bene, subito. */
        queueMicrotask(() => {
          self.emetti('Network.responseReceived', { type: 'Document', frameId: 'frame-1', response: { status: 200, url: parametri?.url } });
          self.emetti('Page.frameStoppedLoading', { frameId: 'frame-1' });
          self.emetti('Page.loadEventFired', {});
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
    chiudi() { this.chiuso = true; },
  };
}

function gestoreFinto({ cdp = cdpFinto(), trovato = { percorso: 'C:/chrome.exe', canale: 'chrome' }, orologio, inattivitaMs } = {}) {
  const chiusure = [];
  const g = creaGestoreBrowserVivo({
    trovaFn: () => trovato,
    avviaFn: async () => ({ pid: 1234, wsUrl: 'ws://127.0.0.1:9999/x', chiudi: async () => { chiusure.push('browser'); } }),
    clientFn: () => cdp,
    connettiFn: async () => ({}),
    cartellaProfilo: 'C:/temp/profilo-di-prova',
    orologio,
    inattivitaMs,
  });
  return { g, cdp, chiusure };
}

test('PROFILO: mai quello personale — il browser pilotato ha una cartella sua, fuori dal progetto', () => {
  const dove = cartellaProfiloPredefinita('/tmp');
  assert.match(dove, /talos-browser-vivo$/);
  assert.equal(dove.includes('Default'), false, 'il profilo di Chrome dell’utente si chiama «Default»: mai quello');
});

test('L’OVERLAY È UN DI PIÙ: se non si installa, la pagina si apre lo stesso e lo dichiara', async () => {
  const cdp = cdpFinto({ risposte: { 'Page.getFrameTree': () => ({}) } }); // nessun frame: l'overlay non può nascere
  const { g } = gestoreFinto({ cdp });
  const esito = await g.apri('sessione-A', 'https://example.org');
  assert.equal(esito.ok !== false, true, 'la pagina è la cosa principale: non cade per un accessorio');
  assert.equal(esito.annotabile, false, 'e lo dichiara, invece di far credere che gli spilli funzionino');
});

test('VINCOLO 1 · i cookie non passano da una sessione all’altra: un CONTESTO per sessione', async () => {
  const { g, cdp } = gestoreFinto();
  const esito = await g.apri('sessione-A', 'https://example.org');
  assert.equal(esito.isolata, true, 'senza contesto proprio le due schede si scambierebbero i cookie');
  const creaContesto = cdp.inviati.filter((c) => c.metodo === 'Target.createBrowserContext');
  assert.equal(creaContesto.length, 1);
  const creaScheda = cdp.inviati.find((c) => c.metodo === 'Target.createTarget');
  assert.equal(creaScheda.parametri.browserContextId, 'ctx-1', 'la scheda deve nascere DENTRO il contesto, o l’isolamento non c’è');
});

test('VINCOLO 1, al contrario: un Chromium che non offre i contesti non impedisce di navigare', async () => {
  const cdp = cdpFinto({ risposte: { 'Target.createBrowserContext': () => { throw new Error('non supportato'); } } });
  const { g } = gestoreFinto({ cdp });
  const esito = await g.apri('sessione-A', 'https://example.org');
  assert.equal(esito.isolata, false, 'lo dice, invece di fingere un isolamento che non c’è');
  assert.equal(esito.url, 'https://example.org/', 'l’indirizzo torna normalizzato dal browser, con la barra finale');
});

test('VINCOLO 2 · una scheda che muore là fuori sparisce dalla mappa, senza che nessuno le parli', async () => {
  const { g, cdp } = gestoreFinto();
  await g.apri('sessione-A', 'https://example.org');
  assert.equal(g.stato().schede.length, 1);
  cdp.emetti('Target.detachedFromTarget', { targetId: 'tg-1' });
  assert.equal(g.stato().schede.length, 0, 'la verità su chi è vivo la dice il browser, non la nostra mappa');
  await assert.rejects(() => g.gesto('sessione-A', { tipo: 'clic', x: 1, y: 1 }), /page open/);
});

test('VINCOLO 2, al contrario: la morte di UN’ALTRA scheda non tocca la nostra', async () => {
  const { g, cdp } = gestoreFinto();
  await g.apri('sessione-A', 'https://example.org');
  cdp.emetti('Target.detachedFromTarget', { targetId: 'tg-di-qualcun-altro' });
  assert.equal(g.stato().schede.length, 1);
});

test('VINCOLO 3 · una scheda che nessuno tocca da dieci minuti si chiude, e col suo Chromium', async () => {
  let adesso = 1_000_000;
  const { g, chiusure } = gestoreFinto({ orologio: () => adesso, inattivitaMs: 1000 });
  await g.apri('sessione-A', 'https://example.org');
  adesso += 5000; // cinque secondi di niente, con un tetto di uno
  const scadute = await g.raccogliScadute();
  assert.deepEqual(scadute, ['sessione-A']);
  assert.equal(g.stato().finestraAperta, false, 'l’ultima scheda che se ne va porta via anche il browser');
  assert.deepEqual(chiusure, ['browser']);
});

test('VINCOLO 3, al contrario: chi viene usato NON scade — un gesto la tiene viva', async () => {
  let adesso = 1_000_000;
  const { g } = gestoreFinto({ orologio: () => adesso, inattivitaMs: 1000 });
  await g.apri('sessione-A', 'https://example.org');
  adesso += 800;
  await g.gesto('sessione-A', { tipo: 'clic', x: 10, y: 20 });
  adesso += 800; // 1600 dall'apertura, ma solo 800 dall'ultimo gesto
  assert.deepEqual(await g.raccogliScadute(), []);
  assert.equal(g.stato().schede.length, 1);
});

test('SENZA CHROMIUM: lo dice in italiano e non finge — nessun download di nascosto', async () => {
  const { g } = gestoreFinto({ trovato: null });
  await assert.rejects(() => g.apri('sessione-A', 'https://example.org'), (e) => {
    assert.equal(e.code, 'BROWSER_VIVO_ASSENTE');
    assert.match(e.message, /(?:already installed|già installato)/);
    assert.match(e.message, /(?:does not download its own|non ne scarica uno suo)/);
    return true;
  });
});

test('TETTO alle schede: la settima non apre una finestra in più, lo dice', async () => {
  const { g } = gestoreFinto();
  for (let i = 0; i < 6; i += 1) await g.apri(`sessione-${i}`, 'https://example.org');
  await assert.rejects(() => g.apri('sessione-7', 'https://example.org'), (e) => {
    assert.equal(e.code, 'BROWSER_VIVO_TROPPE_SCHEDE');
    return true;
  });
  assert.equal(g.stato().schede.length, 6);
});

test('CHIUSURA: la scheda porta via il suo contesto — i cookie non restano in giro', async () => {
  const { g, cdp } = gestoreFinto();
  await g.apri('sessione-A', 'https://example.org');
  await g.chiudi('sessione-A');
  const metodi = cdp.inviati.map((c) => c.metodo);
  assert.ok(metodi.includes('Target.closeTarget'));
  assert.ok(metodi.includes('Target.disposeBrowserContext'), 'senza questo i cookie della sessione sopravvivono alla scheda');
  assert.equal(g.stato().finestraAperta, false);
});

test('GESTO IGNOTO: si rifiuta con un nome, non con un errore generico', async () => {
  const { g } = gestoreFinto();
  await g.apri('sessione-A', 'https://example.org');
  await assert.rejects(() => g.gesto('sessione-A', { tipo: 'telepatia' }), (e) => {
    assert.equal(e.code, 'BROWSER_VIVO_GESTO_IGNOTO');
    assert.match(e.message, /telepatia/);
    return true;
  });
});

test('LA SCADENZA PREDEFINITA è dichiarata, non nascosta in un numero magico', () => {
  assert.equal(INATTIVITA_MS, 10 * 60 * 1000);
});

/*
 * C36 (bugfixer, 10/10/2026, dal vivo sulla 4176: 0 pagine su 10 con un fotogramma, poi 18 su 20 con la cura). Il Chrome di oggi
 * rifiuta un secondo `Page.startScreencast` senza stop in mezzo («Screencast is already active», -32000). Il finto qui lo imita.
 */
function cdpComeChrome() {
  const attivi = new Set();
  const cdp = cdpFinto({ risposte: {
    'Page.startScreencast': () => { if (attivi.has('cdp-1')) throw new Error('Screencast is already active (code -32000)'); attivi.add('cdp-1'); return {}; },
    'Page.stopScreencast': () => { attivi.delete('cdp-1'); return {}; },
  } });
  cdp.attivi = attivi;
  return cdp;
}

test('C36-SESS-01: aprire una scheda NUOVA e poi seguirla: lo schermo parte, nessun «already active»', async () => {
  const cdp = cdpComeChrome();
  const { g } = gestoreFinto({ cdp });
  await g.apri('sessione-A', 'https://example.org', { larghezza: 1200, altezza: 800 });
  assert.equal(cdp.attivi.size, 0, 'aprire non avvia lo screencast: nessuno lo segue ancora');
  await assert.doesNotReject(() => g.segui('sessione-A', () => {}));
  assert.equal(cdp.attivi.size, 1, 'il seguito ha il suo screencast');
});

test('C36-SESS-02: la misura sveglia il flusso solo se qualcuno lo segue; senza seguito non accende niente', async () => {
  const cdp = cdpComeChrome();
  const { g } = gestoreFinto({ cdp });
  await g.apri('sessione-A', 'https://example.org', { larghezza: 1200, altezza: 800 });
  const prima = cdp.inviati.length;
  await g.misura('sessione-A', { larghezza: 1000, altezza: 700 });
  assert.equal(cdp.inviati.slice(prima).filter((c) => c.metodo === 'Page.startScreencast').length, 0, 'senza seguito: niente screencast');
  await g.segui('sessione-A', () => {});
  const dopoSeguito = cdp.inviati.length;
  await assert.doesNotReject(() => g.misura('sessione-A', { larghezza: 900, altezza: 600 }));
  assert.deepEqual(cdp.inviati.slice(dopoSeguito).map((c) => c.metodo).filter((m) => m.includes('Screencast')), ['Page.stopScreencast', 'Page.startScreencast']);
  assert.equal(cdp.attivi.size, 1, 'il flusso è vivo dopo il risveglio');
});

/* C36, nota della review della sessione desktop (10/10/2026): il risveglio al ridimensionamento riparte con le SCELTE di chi segue
   (qualità, tetti, un fotogramma ogni N), non con quelle predefinite — dopo C36 ogni ridimensionamento passa di lì. */
test('C36-SESS-03: the resize wake restarts the stream with the follower\'s quality and limits; a new follow uses its own', async () => {
  const cdp = cdpComeChrome();
  const { g } = gestoreFinto({ cdp });
  await g.apri('sessione-A', 'https://example.org', { larghezza: 1200, altezza: 800 });
  await g.segui('sessione-A', () => {}, { qualita: 35, larghezzaMax: 800, altezzaMax: 600, ogniNFrame: 2 });
  const avvioDelSeguito = cdp.inviati.filter((c) => c.metodo === 'Page.startScreencast').at(-1).parametri;
  const prima = cdp.inviati.length;
  await g.misura('sessione-A', { larghezza: 900, altezza: 600 });
  const risveglio = cdp.inviati.slice(prima).filter((c) => c.metodo === 'Page.startScreencast');
  assert.equal(risveglio.length, 1);
  assert.deepEqual(risveglio[0].parametri, avvioDelSeguito, 'same parameters as the follow that is running');
  assert.equal(risveglio[0].parametri.quality, 35);
  // il seguito si ferma: le sue scelte non restano appese a un seguito nuovo con le predefinite
  const stop = await g.segui('sessione-A', () => {});
  const dopo = cdp.inviati.length;
  await g.misura('sessione-A', { larghezza: 1000, altezza: 700 });
  const nuovo = cdp.inviati.slice(dopo).filter((c) => c.metodo === 'Page.startScreencast').at(-1).parametri;
  assert.equal(nuovo.quality, cdp.inviati.filter((c) => c.metodo === 'Page.startScreencast').at(-2).parametri.quality);
  assert.notEqual(nuovo.quality, 35);
  await stop();
});

/*
 * C1b (owner 10/10/2026: «adesso aprono la pagina una volta ogni 10»). Misurato sulla 4177 con la sonda dalla UI: il SERVER
 * moriva alla sesta apertura. `TypeError: Cannot read properties of null (reading 'cdp')` in `scheda.ferma`, chiamata dalla
 * chiusura della risposta dello schermo DOPO che l'ultima scheda aveva portato via il browser; la promessa rifiutata non la
 * raccoglieva nessuno, e con Node 24 un rifiuto non raccolto chiude il processo (`--unhandled-rejections=throw` di serie,
 * nodejs.org/docs/latest-v24.x/api/cli.html, letto il 10/10/2026). Da lì ogni apertura dava «Failed to fetch».
 */
test('C1B-SESS-01: the follower\'s stop called again after the last tab took the browser away resolves, never rejects', async () => {
  const cdp = cdpComeChrome();
  const { g, chiusure } = gestoreFinto({ cdp });
  await g.apri('sessione-A', 'https://example.org', { larghezza: 1200, altezza: 800 });
  const ferma = await g.segui('sessione-A', () => {});
  await g.chiudi('sessione-A');
  assert.deepEqual(chiusure, ['browser'], 'the last tab took the browser away');
  // la risposta dello schermo si chiude adesso, a browser già andato
  await assert.doesNotReject(() => ferma());
});

/*
 * Lo stesso difetto, dall'altro verso: lo stop di un seguito VECCHIO (la sua risposta si chiude tardi, dopo che un seguito nuovo è
 * già partito) azzerava `scheda.ferma` del nuovo e fermava il SUO screencast: la vista restava nera finché nessuno la ridimensionava.
 */
test('C1B-SESS-02: a late stop of an old follower does not stop the new follower\'s stream', async () => {
  const cdp = cdpComeChrome();
  const { g } = gestoreFinto({ cdp });
  await g.apri('sessione-A', 'https://example.org', { larghezza: 1200, altezza: 800 });
  const fermaVecchio = await g.segui('sessione-A', () => {});
  const fermaNuovo = await g.segui('sessione-A', () => {});
  await fermaVecchio(); // la risposta del seguito vecchio si chiude solo adesso
  assert.equal(cdp.attivi.size, 1, 'the new follower still has its screencast');
  assert.equal(g.stato().schede[0].trasmette, true, 'the tab is still streaming');
  await fermaNuovo();
  assert.equal(cdp.attivi.size, 0, 'the new follower\'s own stop does stop it');
  assert.equal(g.stato().schede[0].trasmette, false);
});

/*
 * C1b, il secondo modo in cui il Browser smetteva di aprire: il Chromium pilotato muore (un crash, o la persona ne chiude la
 * finestra) e `finestra` restava in piedi con la connessione chiusa. Ogni apertura dopo falliva con CDP_SOCKET_CHIUSO finché il
 * server non ripartiva. Hermes controlla che la sessione sia viva prima di riusarla e altrimenti la sostituisce
 * (`tools/browser_tool_session.py:366-380`, letto il 10/10/2026).
 */
function cdpMorto(cdp) {
  cdp.chiuso = true;
  cdp.invia = (metodo) => Promise.reject(Object.assign(new Error(`${metodo}: the browser connection closed`), { code: 'CDP_SOCKET_CHIUSO' }));
  return cdp;
}

test('C1B-SESS-03: a browser whose connection died is replaced at the next open, not reused', async () => {
  const clienti = [];
  const avvii = [];
  const g = creaGestoreBrowserVivo({
    trovaFn: () => ({ percorso: 'C:/chrome.exe', canale: 'chrome' }),
    avviaFn: async () => { avvii.push('avvio'); return { pid: 1000 + avvii.length, wsUrl: 'ws://127.0.0.1:9999/x', chiudi: async () => { avvii.push('chiuso'); } }; },
    clientFn: () => { const c = cdpFinto(); clienti.push(c); return c; },
    connettiFn: async () => ({}),
    cartellaProfilo: 'C:/temp/profilo-di-prova',
  });
  assert.equal((await g.apri('sessione-A', 'https://example.org')).ok, true);
  const fermaA = await g.segui('sessione-A', () => {});
  cdpMorto(clienti[0]); // il Chromium se n'è andato
  const esito = await g.apri('sessione-A', 'https://example.org/dopo');
  assert.equal(esito.ok, true, 'the next open works on a new browser');
  assert.equal(clienti.length, 2, 'a new connection to a new browser');
  assert.deepEqual(avvii, ['avvio', 'chiuso', 'avvio'], 'the dead one is shut (no zombie left), then a new one starts');
  assert.equal(g.stato().schede.length, 1, 'the dead tab is gone from the map; the session has its new one');
  assert.ok(clienti[1].inviati.some((c) => c.metodo === 'Target.createTarget'), 'the session gets a NEW tab in the new browser: the old tab id belongs to the dead one');
  await assert.doesNotReject(() => fermaA(), 'the stop of the follower of the dead browser is harmless');
});

test('C1B-SESS-03, reverse: a live browser is reused, never restarted', async () => {
  const clienti = [];
  let avvii = 0;
  const g = creaGestoreBrowserVivo({
    trovaFn: () => ({ percorso: 'C:/chrome.exe', canale: 'chrome' }),
    avviaFn: async () => { avvii += 1; return { pid: 1, wsUrl: 'ws://x', chiudi: async () => {} }; },
    clientFn: () => { const c = cdpFinto(); clienti.push(c); return c; },
    connettiFn: async () => ({}),
    cartellaProfilo: 'C:/temp/profilo-di-prova',
  });
  await g.apri('sessione-A', 'https://example.org');
  await g.apri('sessione-B', 'https://example.org');
  await g.apri('sessione-A', 'https://example.org/2');
  assert.equal(avvii, 1);
  assert.equal(clienti.length, 1);
});
