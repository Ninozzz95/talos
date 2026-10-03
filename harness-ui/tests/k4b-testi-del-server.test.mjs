/*
 * K4b (03/10/2026, owner «ogni singola parola nella app deve essere sia in inglese che in italiano»): i testi del SERVER che la
 * persona legge viaggiano come frase INGLESE di riserva + `<campo>Chiave` + `<campo>Params`, e l'interfaccia li dice con
 * `testoDelCampo` (components/testo-server.js), come in K4a. Qui: la scheda Capability (dipendenza di `web_search`) e gli
 * errori dell'elenco attrezzi; il Doctor del server (server.mjs) usa chiavi già provate da k4a-testi-del-server.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { TESTI } from '../frontend/src/i18n/testi/index.js';

const BASE = { base: [], estesi: [{ nome: 'web_search', descrizione: 'Searches the web', tokenSchemaStimati: 60 }] };
const registro = (extra) => createSessionRegistry({ modello: 'm', chiave: 'k', strumentiEstesi: ['web_search'], ...extra });
const riempi = (lingua, chiave, params = {}) => TESTI[lingua][chiave].replace(/\{(\w+)\}/gu, (_, n) => String(params[n]));

test('K4B-CAPABILITY-01 — la fonte della ricerca web arriva in inglese con la sua chiave, e il dizionario la dice nelle due lingue', async () => {
  const casi = [
    [null, 'server.tools.search.notConfigured', 'non-configurata'],
    [() => ({ ricercaWeb: { provider: 'duckduckgo' }, richiediRicercaFn: () => {} }), 'server.tools.search.keyless', 'pronta'],
    [() => ({ ricercaWeb: { provider: 'brave' } }), 'server.tools.search.source', 'pronta'],
  ];
  for (const [ricercaWebFn, chiave, stato] of casi) {
    const esito = await registro({ attrezziKernelFn: async () => BASE, ...(ricercaWebFn ? { ricercaWebFn } : { ricercaWebFn: () => ({ ricercaWeb: null }) }) }).elencaAttrezziPredefiniti();
    const { dipendenza } = esito.attrezzi.find((a) => a.nome === 'web_search');
    assert.equal(dipendenza.stato, stato);
    assert.equal(dipendenza.dettaglioChiave, chiave);
    assert.equal(dipendenza.dettaglio, riempi('en', chiave, dipendenza.dettaglioParams), 'la frase del server è la voce inglese, coi suoi valori');
    assert.ok(TESTI.it[chiave] && TESTI.it[chiave] !== TESTI.en[chiave], `${chiave} ha il suo italiano`);
    assert.doesNotMatch(dipendenza.dettaglio, /Fonte|senza chiave|Nessuna/u, 'nessun italiano nella frase del server');
  }
});

test('K4B-CAPABILITY-02 — gli errori dell\'elenco attrezzi: inglese con chiave; un messaggio vero del runtime passa com\'è, senza chiave', async () => {
  const senzaRuntime = await registro({}).elencaAttrezziPredefiniti();
  assert.deepEqual([senzaRuntime.attrezzi, senzaRuntime.erroreChiave], [null, 'server.tools.runtimeNotConfigured']);
  assert.equal(senzaRuntime.errore, TESTI.en['server.tools.runtimeNotConfigured']);
  const muto = await registro({ attrezziKernelFn: async () => { throw new Error(''); } }).elencaAttrezziPredefiniti();
  assert.deepEqual([muto.errore, muto.erroreChiave], [TESTI.en['server.tools.runtimeNoAnswer'], 'server.tools.runtimeNoAnswer']);
  const parlante = await registro({ attrezziKernelFn: async () => { throw new Error('runtime module not found'); } }).elencaAttrezziPredefiniti();
  assert.equal(parlante.errore, 'runtime module not found');
  assert.equal('erroreChiave' in parlante, false, 'un testo che il dizionario non conosce non prende una chiave a caso');
});
