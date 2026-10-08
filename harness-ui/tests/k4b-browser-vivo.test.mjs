/*
 * K4b (04/10/2026, owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — il motivo per cui una pagina non si è
 * caricata nel browser pilotato (`vaiA`, `browser-vivo.mjs`) arriva alla persona come frase INGLESE + `erroreChiave` (+ `erroreParams`).
 * Si prova che: (1) la voce inglese, coi valori dentro, è IDENTICA alla frase inglese del server; (2) la voce italiana è IDENTICA, parola per
 * parola, alla frase che il server diceva prima (letterale qui sotto); (3) un testo di Chrome che non conosciamo passa com'è, senza chiave.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import server from '../frontend/src/i18n/testi/server.js';
import { vaiA } from '../src/browser-vivo.mjs';

const voce = (lingua, chiave, params = {}) => server[lingua][chiave.replace(/^server\./u, '')]
  .replace(/\{([a-zA-Z0-9_]+)\}/gu, (tutto, nome) => (nome in params ? String(params[nome]) : tutto));

/** Un CDP finto: `Page.navigate` risponde con l'errore di rete dato, oppure con un riquadro che si ferma con lo stato dato. */
function cdpFinto({ stato = 200, errorText = null, mai = false } = {}) {
  const ascoltatori = new Map();
  const spara = (evento, p) => { for (const cb of ascoltatori.get(evento) || []) cb(p, { sessionId: 'S', metodo: evento }); };
  return {
    invia: async (metodo) => {
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
  };
}

const ERRORI_DI_RETE = [
  ['net::ERR_NAME_NOT_RESOLVED', 'server.liveBrowser.nameNotResolved', 'Il nome del sito non esiste'],
  ['net::ERR_CONNECTION_REFUSED', 'server.liveBrowser.connectionRefused', "Nessuno risponde a quell'indirizzo"],
  ['net::ERR_CONNECTION_TIMED_OUT', 'server.liveBrowser.timedOut', 'Il sito non ha risposto in tempo'],
  ['net::ERR_CERT_AUTHORITY_INVALID', 'server.liveBrowser.badCertificate', 'Il certificato del sito non è valido'],
  ['net::ERR_ABORTED', 'server.liveBrowser.aborted', 'Il caricamento è stato interrotto'],
  ['net::ERR_BLOCKED_BY_CLIENT', 'server.liveBrowser.blocked', 'Il browser ha bloccato la pagina'],
];

test('K4B-VIVO-01 — gli errori di rete: frase inglese = voce inglese, voce italiana = la frase di prima', async () => {
  for (const [errorText, chiave, italianoDiPrima] of ERRORI_DI_RETE) {
    const esito = await vaiA(cdpFinto({ errorText }), 'S', 'https://esempio.org/');
    assert.equal(esito.ok, false, errorText);
    assert.equal(esito.erroreChiave, chiave, errorText);
    assert.equal(esito.errore, voce('en', chiave), 'la voce inglese è la frase del server');
    assert.equal(voce('it', chiave), italianoDiPrima, 'la voce italiana è la frase di prima, parola per parola');
  }
});

test('K4B-VIVO-02 — URL non valido, stato HTTP e timeout: frase inglese, chiave e valori nei parametri', async () => {
  const nonUrl = await vaiA(cdpFinto(), 'S', 'questo non è un indirizzo');
  assert.equal(nonUrl.erroreChiave, 'server.liveBrowser.invalidUrl');
  assert.equal(nonUrl.errore, voce('en', 'server.liveBrowser.invalidUrl'));
  assert.equal(voce('it', 'server.liveBrowser.invalidUrl'), 'URL non valido');

  const manca = await vaiA(cdpFinto({ stato: 404 }), 'S', 'https://esempio.org/manca');
  assert.equal(manca.erroreChiave, 'server.liveBrowser.siteStatus');
  assert.deepEqual(manca.erroreParams, { status: 404 });
  assert.equal(manca.errore, voce('en', manca.erroreChiave, manca.erroreParams));
  assert.equal(voce('it', manca.erroreChiave, manca.erroreParams), 'Il sito ha risposto 404');

  const lenta = await vaiA(cdpFinto({ mai: true }), 'S', 'http://localhost:5173/', { attesaMs: 30 });
  assert.equal(lenta.erroreChiave, 'server.liveBrowser.loadTimeout');
  assert.deepEqual(lenta.erroreParams, { seconds: 0 }, 'i secondi arrivano come valore, non incollati nella frase');
  assert.equal(lenta.errore, voce('en', lenta.erroreChiave, lenta.erroreParams));
  assert.equal(voce('it', 'server.liveBrowser.loadTimeout', { seconds: 30 }), 'La pagina non ha finito di caricare entro 30 secondi');
  assert.equal(voce('en', 'server.liveBrowser.loadTimeout', { seconds: 30 }), 'The page did not finish loading within 30 seconds');
});

test('K4B-VIVO-03 — AL CONTRARIO: un testo di Chrome che non conosciamo passa com\'è, senza chiave', async () => {
  const esito = await vaiA(cdpFinto({ errorText: 'net::ERR_QUALCOSA_DI_NUOVO' }), 'S', 'https://esempio.org/');
  assert.equal(esito.errore, 'net::ERR_QUALCOSA_DI_NUOVO');
  assert.equal('erroreChiave' in esito, false, 'nessuna chiave inventata: si mostra il testo che ha dato il browser');
});
