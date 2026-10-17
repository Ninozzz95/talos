/*
 * LE CURE DELLA TERZA PASSATA DEL REVISORE (14/10/2026), provate una per una dove il browser non le distingue.
 * Le prove rosse del revisore (`terza-passata-*.test.mjs`, `*-terza-passata-*.spec.mjs`) dicono CHE COSA non deve succedere a
 * schermo; alcune cure però hanno due strati (il motivo di una lettura fallita si ripulisce dove nasce nella app E nell'adattatore
 * del diagramma), e a schermo uno copre l'altro. Qui ogni strato dell'adattatore ha la sua prova.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { NOME_MASSIMO, creaClientDeleghe } from '../../src/components/grafo/run-dalle-deleghe.js';
import { tentativiDallaStoria } from '../../src/components/grafo/tempo-modello.js';

const T0 = Date.parse('2026-10-14T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const madre = { sessionId: 'madre', avviataAlle: at(0), conclusa: false, taskCorto: 'Conversazione' };
const figlia = (id, nascita, extra = {}) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(nascita), conclusa: false, modello: 'ollama:mock-model', taskCorto: `Compito ${id}`, ...extra });
const RLO = String.fromCodePoint(0x202E);

test('CURA-T7 — il motivo di una lettura fallita, nell’ADATTATORE del diagramma: senza i caratteri che ingannano, corto anche se è uno stack intero — e un motivo normale resta com’è', async () => {
  let errore = `Sessione ${RLO}gpj.exe non leggibile`;
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [figlia('a', 10)], errore, aggiornato: at(5) }) });
  await client.panoramica();
  assert.equal(client.statoDeiDati().errore, 'Sessione gpj.exe non leggibile', 'l’inversione della scrittura non arriva a chi disegna');
  errore = `Errore interno: ${'at Oggetto.metodo (file:///C:/talos/harness-ui/src/session-registry.mjs:12030:17) '.repeat(120)}`;
  await client.panoramica();
  const lungo = client.statoDeiDati().errore;
  assert.ok([...lungo].length <= NOME_MASSIMO + 1, `al più ${NOME_MASSIMO} caratteri più i puntini: ${[...lungo].length}`);
  assert.ok(lungo.startsWith('Errore interno: at Oggetto.metodo'), 'se ne tiene l’inizio');
  // AL CONTRARIO: un motivo normale non si tocca, e i segnaposto restano testo
  for (const normale of ['Banco temporaneamente offline', '{errore} {n} $& $1 %s']) {
    errore = normale;
    await client.panoramica();
    assert.equal(client.statoDeiDati().errore, normale);
  }
  // e niente motivo resta niente: un motivo di soli spazi o di soli caratteri che ingannano non è un motivo
  for (const vuoto of ['', '   ', RLO, null, 7]) {
    errore = vuoto;
    await client.panoramica();
    assert.equal(client.statoDeiDati().errore, null, JSON.stringify(vuoto));
  }
  assert.equal(client.statoDeiDati().aggiornato, at(5), 'l’ora dell’ultima lettura riuscita non c’entra col motivo');
});

test('CURA-T8 — una fine dichiarata PRIMA dell’inizio (l’orologio è stato corretto all’indietro) non arriva così alla scheda: la fine coincide al più con l’inizio, e la durata resta «non si sa» — AL CONTRARIO, una fine vera resta la sua', async () => {
  const figli = [
    figlia('a', 120, { conclusa: true, conclusaAlle: at(90), esitoDelega: 'concluso' }), // finita 30 s «prima» di cominciare
    figlia('b', 120, { conclusa: true, conclusaAlle: at(200), esitoDelega: 'concluso' }),
  ];
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli }) });
  await client.panoramica();
  const [a, b] = ['a', 'b'].map((id) => client.righe().find((r) => r.sessionId === id));
  assert.equal(a.startedAt, at(120));
  assert.equal(a.finishedAt, at(120), 'la fine non precede l’inizio');
  assert.equal(a.durationMs, null, 'una durata che nessuno ha misurato non si inventa');
  assert.deepEqual([b.startedAt, b.finishedAt, b.durationMs], [at(120), at(200), 80_000]);
});

test('CURA-T8-TENTATIVI — un tentativo non finisce mai prima di cominciare, da qualunque storia (anche quella numerata di un Workflow, se l’orologio del server è tornato indietro): la fine coincide al più con l’inizio — AL CONTRARIO, una fine vera resta la sua', () => {
  const voce = (nodeId, secondi, state) => ({ scope: 'node', nodeId, at: at(secondi), state });
  const tentativi = tentativiDallaStoria([voce('n1', 120, 'running'), voce('n1', 90, 'succeeded'), voce('n2', 120, 'running'), voce('n2', 200, 'failed')]);
  const [n1] = tentativi.get('n1'); const [n2] = tentativi.get('n2');
  assert.equal(n1.da, Date.parse(at(120)));
  assert.equal(n1.a, n1.da, 'la fine non precede l’inizio');
  assert.equal(n1.esito, 'succeeded');
  assert.deepEqual([n2.da, n2.a, n2.esito], [Date.parse(at(120)), Date.parse(at(200)), 'failed']);
});
