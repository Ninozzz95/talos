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
  await assert.rejects(() => g.gesto('sessione-A', { tipo: 'clic', x: 1, y: 1 }), /pagina aperta/);
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
    assert.match(e.message, /già installato/);
    assert.match(e.message, /non ne scarica uno suo/);
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
