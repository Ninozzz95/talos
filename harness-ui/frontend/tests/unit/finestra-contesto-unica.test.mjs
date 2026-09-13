import test from 'node:test';
import assert from 'node:assert/strict';
import { descriviContextCompactor } from '../../src/components/context-compactor.js';
import { kilo, righeFinestra } from '../../src/components/inspector.js';
import { finestraDiContesto, frasiFinestraContesto, ripartizioneContesto, frasiRipartizione } from '../../src/components/contesto.js';

/*
 * 09/09 — DUE FONTI DI VERITÀ SULLA STESSA FINESTRA. Misurato dal vivo, stessa foto,
 * stessa chat, stesso istante:
 *   · colonna destra, scheda «Contesto»  → «Finestra del contesto 1310,7k»
 *                                          «Conversazione 11k · 0,8%»
 *   · modale «Context Manager»           → «10.163 / 16.384», cioè il 62,0%
 * Il giro vero è stato preparato e compattato contro 16.384 (`windowTokens` del
 * profilo del Context Engine): la finestra GRANDE era quella sbagliata.
 *
 * PROVA RED, prima della cura (`node --test tests/unit/finestra-contesto-unica.test.mjs`,
 * alimentando la colonna come fa `app.js` oggi, cioè col `contextLength` del catalogo):
 *   AssertionError: la finestra citata dalla colonna deve essere quella del profilo…
 *   '1310,7k' !== '16,4k'
 * cioè esattamente i due numeri della foto, riprodotti in un test.
 *
 * Ricerca web 09/09/2026 (fonti e date per esteso nel cappello di `contesto.js`):
 * Eden AI 07/08/2026 «limits are configuration, not contracts» · Codex Knowledge Base
 * 14/04/2026 (il denominatore di Codex è `model_context_window`, lo stesso su cui si
 * calcola la soglia di compattazione) · Claude Code «Explore the context window»
 * (ripartizione live e buffer riservato) · Nous Research hermes-agent #683 08/03/2026 e
 * la guida «Tips & Best Practices» (Hermes prende il denominatore dal catalogo e NON dice
 * cosa fare quando catalogo ed effettivo divergono).
 */
const CATALOGO = 1_310_720;          // `contextLength` da /api/v1/models per il modello scelto
const USAGE = { prompt_tokens: 10_163, completion_tokens: 837 }; // 11.000 → «11k» nella colonna
const TOKENS = { schema: 'talos.context.tokens.v1', inputTokens: 10_163, windowTokens: 16_384, responseReserve: 2_048, method: 'runtime', exact: true, provider: 'local', model: 'm' };
const SNAPSHOT = { sessionId: 's1', revision: 7, measurement: { revision: 7, measuredAt: '2026-09-09T10:15:00.000Z', tokens: TOKENS } };

const perColonna = (f) => righeFinestra(f.perInspector.usage, f.perInspector.finestra, f.perInspector.ripartizione);
const riga = (colonna, nome) => colonna.righe.find((r) => r[0] === nome)?.slice(0, 2);

test('CTX-FINESTRA-UNICA: col Context Engine attivo la colonna e la modale dichiarano la STESSA finestra', () => {
  const modale = descriviContextCompactor(SNAPSHOT, { translate: (x) => x }).measurement;
  const unica = finestraDiContesto({ misura: SNAPSHOT.measurement, revisione: SNAPSHOT.revision, finestraCatalogo: CATALOGO, usage: USAGE });

  assert.equal(unica.fonte, 'profilo', 'il profilo vince sul catalogo quando la misura esiste');
  assert.equal(unica.finestra, modale.windowTokens);
  assert.equal(unica.occupato, modale.inputTokens);
  assert.equal(unica.riserva, 2_048, 'la riserva per la risposta è parte del budget dichiarato, non si nasconde');
  assert.equal(unica.attuale, true);

  const colonna = perColonna(unica);
  assert.equal(colonna.titoloDestra, kilo(modale.windowTokens), 'la finestra citata dalla colonna è quella con cui la richiesta è preparata');
  assert.equal(colonna.titoloDestra, '16,4k');
  assert.deepEqual(riga(colonna, 'Conversazione'), ['Conversazione', '10,2k · 62,0%'], 'il 62% della modale, non lo 0,8% del catalogo');
  assert.deepEqual(riga(colonna, 'Libera'), ['Libera', '6,2k · 38,0%']);

  // ⛔ il numero della foto che NON deve più comparire da nessuna parte quando il profilo c'è
  assert.notEqual(colonna.titoloDestra, kilo(CATALOGO));
  assert.equal(frasiFinestraContesto(unica), '10.163 / 16.384 token · 62,0% · profilo del contesto di questa chat');
});

test('⛔ AL CONTRARIO — senza Context Engine resta il CATALOGO, e si dice che è il catalogo', () => {
  const senza = finestraDiContesto({ misura: null, revisione: 7, finestraCatalogo: CATALOGO, usage: USAGE });
  assert.equal(senza.fonte, 'catalogo');
  assert.equal(senza.finestra, CATALOGO);
  assert.equal(senza.occupato, 11_000, 'il comportamento storico: prompt + completion dell ultimo /usage');
  const colonna = perColonna(senza);
  assert.equal(colonna.titoloDestra, '1310,7k');
  assert.deepEqual(riga(colonna, 'Conversazione'), ['Conversazione', '11k · 0,8%'], 'senza profilo la vecchia riga è ancora la verità disponibile');
  assert.match(frasiFinestraContesto(senza), /catalogo del modello/);
});

test('⛔ AL CONTRARIO — niente misura e niente catalogo: si dice che manca, non si inventa uno zero', () => {
  const nulla = finestraDiContesto({ misura: null, revisione: null, finestraCatalogo: null, usage: null });
  assert.equal(nulla.fonte, null);
  assert.equal(nulla.finestra, null);
  assert.equal(nulla.occupato, null, '⛔ «non misurato» non è «zero»');
  assert.equal(frasiFinestraContesto(nulla), 'Finestra del contesto non dichiarata.');
  assert.equal(perColonna(nulla).titoloDestra, 'finestra non dichiarata');

  // una misura senza `windowTokens` valido non è una misura: si ripiega sul catalogo, dichiarandolo
  const rotta = finestraDiContesto({ misura: { revision: 7, measuredAt: '2026-09-09T10:15:00.000Z', tokens: { ...TOKENS, windowTokens: 0 } }, revisione: 7, finestraCatalogo: CATALOGO, usage: USAGE });
  assert.equal(rotta.fonte, 'catalogo');
  assert.equal(rotta.finestra, CATALOGO);
});

test('⛔ REVISIONE — una misura vecchia NON si spaccia per attuale, ma la finestra resta quella del profilo', () => {
  const vecchia = finestraDiContesto({ misura: SNAPSHOT.measurement, revisione: 9, finestraCatalogo: CATALOGO, usage: USAGE });
  assert.equal(vecchia.fonte, 'profilo');
  assert.equal(vecchia.finestra, 16_384, 'una revisione piu nuova sposta l occupazione, non il tetto con cui si costruisce la richiesta');
  assert.equal(vecchia.attuale, false);
  assert.equal(vecchia.nota, 'il contesto è cambiato dopo la misura');
  assert.match(frasiFinestraContesto(vecchia), /⛔ il contesto è cambiato dopo la misura/);

  // stessa lettura della modale, dallo stesso lettore: le due superfici non possono più divergere
  const modale = descriviContextCompactor({ ...SNAPSHOT, revision: 9 }, { translate: (x) => x }).measurement;
  assert.equal(vecchia.attuale, modale.current);
  assert.equal(vecchia.finestra, modale.windowTokens);
});

const RIPARTIZIONE = { attrezzi: 7_454, istruzioni: 4_100, memoria: 1_800 }; // le tre voci che il kernel può dichiarare

test('⛔ DOPPIO CONTEGGIO — sopra una misura del motore la ripartizione per categoria non si somma', () => {
  const unica = finestraDiContesto({ misura: SNAPSHOT.measurement, revisione: 7, finestraCatalogo: CATALOGO, usage: USAGE, ripartizione: RIPARTIZIONE });
  assert.equal(unica.perInspector.ripartizione, null, 'attrezzi, istruzioni e ricordi sono GIÀ dentro inputTokens');
  assert.equal(unica.perInspector.usage.completion_tokens, 0, 'inputTokens è già tutto cio che occupa la finestra al prossimo invio');
  const colonna = perColonna(unica);
  assert.deepEqual(colonna.righe.map((r) => r[0]), ['Conversazione', 'Libera', 'Riusato dalla cache'], 'la cache di sessione non aggiunge categorie stimate alla finestra');

  // ⛔ AL CONTRARIO — senza misura la ripartizione è l'unica cosa che sappiamo: passa, e si vede
  const senza = finestraDiContesto({ misura: null, revisione: 7, finestraCatalogo: CATALOGO, usage: USAGE, ripartizione: RIPARTIZIONE });
  assert.deepEqual(senza.perInspector.ripartizione, RIPARTIZIONE);
  assert.deepEqual(perColonna(senza).righe.map((r) => r[0]), ['Attrezzi', 'Istruzioni', 'Memoria', 'Conversazione', 'Libera', 'Riusato dalla cache']);
});

test('⛔ FORMA PIATTA — una misura senza revisione (fixture pre-09/09) vale come numero, non come freschezza', () => {
  const piatta = finestraDiContesto({ misura: TOKENS, revisione: 7, finestraCatalogo: CATALOGO, usage: USAGE });
  assert.equal(piatta.fonte, 'profilo');
  assert.equal(piatta.finestra, 16_384);
  assert.equal(piatta.attuale, false, 'senza revisione non si afferma nulla sulla freschezza');
});

/*
 * ⛔ LA SECONDA SUPERFICIE CON LO STESSO DIFETTO — la pagina «Memoria e contesto»
 * (D26) divide il peso degli schemi degli attrezzi per la finestra del modello.
 * Con lo stesso modello della foto: 7.454 token su 1.310.720 = 0,6%, mentre la
 * richiesta vera è costruita contro 16.384 ⇒ 45,4%. Settantacinque volte.
 */
const ATTREZZI = [{ tokenSchemaStimati: 7_454, categoria: 'file' }];

test('CTX-FINESTRA-UNICA (Memoria e contesto): la ripartizione divide per la finestra del PROFILO', () => {
  const unica = finestraDiContesto({ misura: SNAPSHOT.measurement, revisione: 7, finestraCatalogo: CATALOGO, usage: USAGE });
  const r = ripartizioneContesto({ attrezzi: ATTREZZI, finestra: unica });
  assert.equal(r.finestra, 16_384);
  assert.equal(r.fonteFinestra, 'profilo');
  assert.ok(r.percentuale > 45 && r.percentuale < 46, `45,4% e non 0,6%: era ${r.percentuale}`);
  assert.match(frasiRipartizione(r), /finestra del profilo di questa chat/);

  // ⛔ AL CONTRARIO — un NUMERO nudo continua a funzionare come prima, e non nomina nessuna fonte
  const vecchioModo = ripartizioneContesto({ attrezzi: ATTREZZI, finestra: 131_072 });
  assert.equal(vecchioModo.finestra, 131_072);
  assert.equal(vecchioModo.fonteFinestra, null);
  assert.doesNotMatch(frasiRipartizione(vecchioModo), /finestra del profilo|finestra del catalogo/);

  // ⛔ AL CONTRARIO — senza misura il descrittore porta il catalogo, e lo DICE
  const senza = finestraDiContesto({ misura: null, revisione: 7, finestraCatalogo: CATALOGO, usage: USAGE });
  const rs = ripartizioneContesto({ attrezzi: ATTREZZI, finestra: senza });
  assert.equal(rs.finestra, CATALOGO);
  assert.match(frasiRipartizione(rs), /finestra del catalogo del modello/);
});
