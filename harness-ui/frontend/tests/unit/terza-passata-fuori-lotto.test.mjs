/*
 * TERZA PASSATA DEL REVISORE (14/10/2026) — un difetto trovato LEGGENDO, fuori dai cinque commit rivisti (è del 12/10: l'adattatore
 * delle deleghe sopra la sorgente del diagramma del 26/09). Sta qui, a parte, perché non è colpa di quella linea e non ne decide
 * il verdetto. Cura proposta nel rapporto (`handoff …/bugfixer/RAPPORTO-TERZA-PASSATA-2026-10-14.md`, sezione «Fuori lotto»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaFonte } from '../../src/components/grafo/fonte.js';
import { creaClientDeleghe } from '../../src/components/grafo/run-dalle-deleghe.js';

const T0 = Date.parse('2026-10-12T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const madre = { sessionId: 'madre', avviataAlle: at(0), conclusa: false, taskCorto: 'Conversazione' };
const figlia = (id, nascita, extra = {}) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(nascita), conclusa: false, modello: 'ollama:mock-model', taskCorto: `Compito ${id}`, ...extra });

test('TERZA-FUORI-01 — una delega finita che RIPARTE («Riprova» / «Riprendi»: un messaggio nuovo nella stessa figlia): alla rilettura la testata e i conti del lotto la contano di nuovo al lavoro — la panoramica nuova non viene scartata come «più vecchia»', async () => {
  let figli = [figlia('a', 10, { conclusa: true, conclusaAlle: at(50), esitoDelega: 'fallito' }), figlia('b', 11, { conclusa: true, conclusaAlle: at(60), esitoDelega: 'concluso' })];
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli }) });
  const fonte = creaFonte({ client, sorgente: await client.sorgente() });
  await fonte.caricaPanoramica();
  assert.equal(fonte.panoramica.delegated.terminated, 2, 'la premessa: tutte e due finite');
  assert.equal(fonte.panoramica.groups[0].counts.failed, 1);
  // la persona preme «Riprova» su «a»: stessa sessione, di nuovo al lavoro, senza più un'ora di fine
  figli = [figlia('a', 10), figli[1]];
  await fonte.caricaPanoramica();
  const visto = { terminati: fonte.panoramica.delegated.terminated, conti: fonte.panoramica.groups[0].counts, lastSeq: fonte.panoramica.lastSeq };
  assert.equal(visto.terminati, 1, `dopo la ripartenza una sola delega è terminata: ${JSON.stringify(visto)}`);
  assert.equal(visto.conti.running, 1, JSON.stringify(visto));
});
