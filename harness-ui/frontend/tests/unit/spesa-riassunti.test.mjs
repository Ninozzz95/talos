/*
 * Spesa dei riassunti nella scheda Contesto (owner 30/10/2026 sera, «Sì, così»; contratto
 * in-corso/CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO-2026-10-30.md). Il conto della pagina, PURO: per riassunto, testata, piede; le
 * condizioni del Mobile (1: «nessun costo» solo senza righe; 2: un uso ignoto non è zero; 3: dopo `migliora` la riga somma i due id).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { impostaLingua } from '../../src/components/lingua.js';
import {
  nuovaSpesa, registraSpesa, tokenDellaRiga, costoDelRiassunto, costoDeiRiassunti, tokenDiServizio, testoCosto, contoTestataRiassunti, idDellaFine,
} from '../../src/components/spesa-riassunti.js';
import { modelloContesto } from '../../src/components/pannello/contesto.js';
import { testiUsage, kilo as kiloDelPiede } from '../../src/components/chat-foot.js';
import { interpretaEventoCompattazione } from '../../src/components/compattazione-legacy.js';
import { kilo } from '../../src/components/pannello/comune.js';
import { readFileSync } from 'node:fs';
import { contextUsageFromEvents } from '../../../../context-engine/src/usage.mjs';
import { sommaUsage } from '../../src/components/consumo-sessione.js';

/*
 * CI #91 (09/11/2026): sul runner inglese `kilo` di `pannello/comune.js` senza `locale` scrive «1.6k» (lingua del SISTEMA, non
 * dell'interfaccia: `impostaLingua` non lo cambia). Le prove passano un kilo con la lingua ESPLICITA, come fa chi lo chiama con
 * `localeUI()`; il piede invece usa il suo `kilo` (`chat-foot.js`, lingua dell'interfaccia) e si confronta con quello.
 */
const kiloIt = (n) => kilo(n, 'it');
const kiloEn = (n) => kilo(n, 'en');

/*
 * ⭐ PROVA COMUNE desktop/telefono/CLI (correzione del punto 4, 30/10 sera; testo della CLI, «ogni spesa una volta» del Mobile): lo
 *   stesso giornale e lo stesso numero, ognuno per la sua strada. Il desktop legge `context.usage.recorded` (`aggiornaUsageSessione`
 *   in legacy/app.js: la chat più `contextUsageFromEvents`), quindi salta le righe `motore`; il telefono e la CLI non lo leggono e le
 *   sommano. La fixture sta nella suite del server, accanto a CONSUMO-SERVIZIO-02, per chi la legge da lì.
 */
test('SPESA-RIAS-COMUNE — «ogni spesa una volta»: il giornale comune dà il numero atteso sulla strada del desktop', () => {
  impostaLingua('it');
  const f = JSON.parse(readFileSync(new URL('../../../tests/fixtures/spesa-ogni-spesa-una-volta.json', import.meta.url), 'utf8'));
  const spesa = nuovaSpesa();
  for (const e of f.eventi) if (e.name === 'consumo-di-servizio') registraSpesa(spesa, e.value, e._sequenza);
  /* la strada di `aggiornaUsageSessione`: la chat più l'uso del motore dai talos.context */
  const motore = contextUsageFromEvents(f.eventi.filter((e) => e.name === 'talos.context'), { sessionId: 'sessione-fixture' });
  const sessione = sommaUsage(f.chat, { prompt_tokens: motore.prompt_tokens, completion_tokens: motore.completion_tokens });
  const piede = testiUsage(null, { usageSessione: sessione, tokenServizio: tokenDiServizio(spesa) });
  const atteso = f.atteso.tokenTotali;
  assert.equal(sessione.prompt_tokens + sessione.completion_tokens + tokenDiServizio(spesa), atteso, 'il motore contato una volta sola');
  assert.equal(kiloDelPiede(atteso), '32,8k', 'il kilo del piede, in italiano');
  assert.ok(piede.tokenGiri.startsWith(`${kiloDelPiede(atteso)} token`), piede.tokenGiri);
  assert.deepEqual(costoDeiRiassunti(spesa), f.atteso.testataRiassunti, 'la testata comprende il motore e dice «almeno» (una riga senza uso)');
  for (const [id, c] of Object.entries(f.atteso.costoPerId)) assert.deepEqual(costoDelRiassunto(spesa, [id]), c, id);
});

const riga = (scopo, usage, extra = {}) => ({ schema: 'talos.consumo-di-servizio.v1', scopo, usage, esito: 'completato', inPrimoPiano: false, ...extra });
const uso = (p, c) => ({ prompt_tokens: p, completion_tokens: c });

test('SPESA-RIAS-01 — una riga: entrata + uscita; senza uso è «non so», mai 0', () => {
  assert.equal(tokenDellaRiga(riga('riassunto', uso(1000, 100))), 1100);
  assert.equal(tokenDellaRiga(riga('riassunto', null)), null);
  assert.equal(tokenDellaRiga(riga('riassunto', {})), null);
  assert.equal(tokenDellaRiga(riga('riassunto', { prompt_tokens: 7 })), 7);
});

test('SPESA-RIAS-02 — per riassunto, testata e piede; i doppioni per sequenza non contano due volte', () => {
  const s = nuovaSpesa();
  assert.equal(registraSpesa(s, riga('riassunto', uso(1000, 100), { idRiassunto: 'rias-a-1' }), 5), true);
  assert.equal(registraSpesa(s, riga('riassunto', uso(1000, 100), { idRiassunto: 'rias-a-1' }), 5), false, 'stessa sequenza: già contata');
  registraSpesa(s, riga('compact', uso(900, 200), { idRiassunto: 'rias-a-2' }), 6);
  registraSpesa(s, riga('motore', uso(500, 50), { jobId: 'job-7' }), 7);
  registraSpesa(s, riga('giudice', uso(300, 30)), 8);
  registraSpesa(s, riga('scopo-nuovo', uso(10, 0)), 9);
  assert.deepEqual(costoDelRiassunto(s, ['rias-a-1']), { stato: 'misurato', token: 1100 });
  assert.deepEqual(costoDelRiassunto(s, ['job-7']), { stato: 'misurato', token: 550 }, 'il lavoro del motore per jobId');
  assert.deepEqual(costoDeiRiassunti(s), { stato: 'misurato', token: 1100 + 1100 + 550 }, 'testata: riassunto, compact, motore — non il giudice');
  /* piede: ogni scopo (anche uno sconosciuto), TRANNE il motore, che ci arriva già coi talos.context usage */
  assert.equal(tokenDiServizio(s), 1100 + 1100 + 330 + 10);
  assert.equal(JSON.parse(JSON.stringify(s)).perId['rias-a-1'].token, 1100, 'serializzabile: la scheda confronta i dati con JSON');
});

test('SPESA-RIAS-03 (Mobile 1) — «nessun costo» SOLO senza righe; un ripiego che ha pagato tentativi falliti dice quanto', () => {
  impostaLingua('it');
  const s = nuovaSpesa();
  assert.deepEqual(costoDelRiassunto(s, ['rias-rapido-1']), { stato: 'nessuno', token: 0 });
  assert.equal(testoCosto(costoDelRiassunto(s, ['rias-rapido-1']), kiloIt), 'nessun costo');
  /* due tentativi falliti CON uso, poi il ripiego senza modello: stesso id ⇒ «costato» */
  registraSpesa(s, riga('riassunto', uso(800, 0), { idRiassunto: 'rias-r-2', esito: 'interrotto' }), 1);
  registraSpesa(s, riga('riassunto', uso(800, 4), { idRiassunto: 'rias-r-2', esito: 'interrotto' }), 2);
  assert.equal(testoCosto(costoDelRiassunto(s, ['rias-r-2']), kiloIt), 'costato 1,6k token');
  assert.equal(costoDelRiassunto(s, []), null, 'un riassunto di prima (senza id) non dice niente');
  assert.equal(costoDelRiassunto(s, undefined), null);
  assert.equal(testoCosto(null, kiloIt), null);
});

test('SPESA-RIAS-04 (Mobile 2) — uso sconosciuto: tutte senza ⇒ «non misurato», alcune ⇒ «almeno»; anche in testata', () => {
  impostaLingua('it');
  const tutte = nuovaSpesa();
  registraSpesa(tutte, riga('riassunto', null, { idRiassunto: 'rias-x-1' }), 1);
  assert.equal(testoCosto(costoDelRiassunto(tutte, ['rias-x-1']), kiloIt), 'costo non misurato');
  assert.equal(contoTestataRiassunti(1, costoDeiRiassunti(tutte), kiloIt), '1 · non misurato');
  assert.equal(tokenDiServizio(tutte), 0, 'nel piede un uso ignoto resta fuori, non diventa zero «misurato»');
  const alcune = nuovaSpesa();
  registraSpesa(alcune, riga('riassunto', uso(1000, 100), { idRiassunto: 'rias-y-1' }), 1);
  registraSpesa(alcune, riga('riassunto', null, { idRiassunto: 'rias-y-1' }), 2);
  assert.equal(testoCosto(costoDelRiassunto(alcune, ['rias-y-1']), kiloIt), 'almeno 1,1k token');
  assert.equal(contoTestataRiassunti(3, costoDeiRiassunti(alcune), kiloIt), '3 · almeno 1,1k token');
  impostaLingua('en');
  assert.equal(testoCosto(costoDelRiassunto(alcune, ['rias-y-1']), kiloEn), 'at least 1.1k tokens'); // il kilo con la lingua esplicita
  assert.equal(testoCosto(costoDelRiassunto(tutte, ['rias-x-1']), kiloEn), 'spent, not measured');
  assert.equal(testoCosto(costoDelRiassunto(nuovaSpesa(), ['z']), kiloEn), 'no cost');
  impostaLingua('it');
});

test('SPESA-RIAS-05 (Mobile 3) — dopo `migliora` la riga somma i due id, e la testata conta ogni id una volta', () => {
  const s = nuovaSpesa();
  registraSpesa(s, riga('riassunto', uso(500, 0), { idRiassunto: 'rias-rapido-1', esito: 'interrotto' }), 1); // il rapido aveva pagato un tentativo
  registraSpesa(s, riga('riassunto', uso(1000, 100), { idRiassunto: 'rias-modello-2' }), 2);
  assert.deepEqual(costoDelRiassunto(s, ['rias-rapido-1', 'rias-modello-2', 'rias-modello-2']), { stato: 'misurato', token: 1600 });
  assert.deepEqual(costoDeiRiassunti(s), { stato: 'misurato', token: 1600 });
});

test('SPESA-RIAS-06 — la testata come nel bozzetto («3 · 2,2k token»); senza nessun riassunto pagato resta il numero', () => {
  impostaLingua('it');
  const s = nuovaSpesa();
  assert.equal(contoTestataRiassunti(3, costoDeiRiassunti(s), kiloIt), 3, 'nessuna riga: il solo numero, come prima');
  registraSpesa(s, riga('riassunto', uso(1000, 100), { idRiassunto: 'a' }), 1);
  registraSpesa(s, riga('riassunto', uso(1000, 100), { idRiassunto: 'b' }), 2);
  assert.equal(contoTestataRiassunti(3, costoDeiRiassunti(s), kiloIt), '3 · 2,2k token');
  impostaLingua('en');
  assert.equal(contoTestataRiassunti(3, costoDeiRiassunti(s), kiloEn), '3 · 2.2k tokens');
  impostaLingua('it');
});

test('SPESA-RIAS-07 — la scheda Contesto: ogni riga col suo costo, i riassunti di prima senza; la testata col totale', () => {
  impostaLingua('it');
  const spesa = nuovaSpesa();
  registraSpesa(spesa, riga('riassunto', uso(1000, 100), { idRiassunto: 'rias-m-9' }), 1);
  const storiaContesto = [
    { giro: 4, at: 1, token: 50_000, compattazione: { prima: 50_000, dopo: 12_000, conModello: true } }, // di prima: niente id
    { giro: 9, at: 2, token: 60_000, compattazione: { prima: 60_000, dopo: 19_000, conModello: true, ids: ['rias-m-9'] } },
    { giro: 11, at: 3, token: 30_000, compattazione: { prima: 30_000, dopo: 23_800, conModello: false, ids: ['rias-q-10'] } },
  ];
  const m = modelloContesto({ storiaContesto, spesaRiassunti: spesa });
  assert.deepEqual(m.riassunti.map((x) => [x.giro, x.costo?.stato ?? null]), [[11, 'nessuno'], [9, 'misurato'], [4, null]]);
  assert.deepEqual(m.costoRiassunti, { stato: 'misurato', token: 1100 });
  assert.equal(modelloContesto({ storiaContesto }).costoRiassunti, null, 'senza dati di spesa: niente, come prima');
});

test('SPESA-RIAS-08 — il piede: cambia solo il numero dei token, la cache resta quella della chat', () => {
  const sessione = { prompt_tokens: 30_000, completion_tokens: 729, cached_tokens: 19_800, giri: 13 };
  const prima = testiUsage(null, { usageSessione: sessione });
  const dopo = testiUsage(null, { usageSessione: sessione, tokenServizio: 2_200 });
  assert.match(prima.tokenGiri, /^30,7k token/u);
  assert.match(dopo.tokenGiri, /^32,9k token/u, 'il numero del bozzetto: 30,7k + 2,2k');
  assert.equal(dopo.cache, prima.cache, 'la percentuale di cache non cambia');
  assert.equal(testiUsage(null, { usageSessione: sessione, tokenServizio: Number.NaN }).tokenGiri, prima.tokenGiri);
});

test('SPESA-RIAS-09 — l’evento di fine: l’id passa solo su un successo e nella forma ammessa; gli id della riga', () => {
  const fine = (v) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', at: '2026-10-30T20:00:00.000Z', ...v } });
  assert.equal(fine({ compattato: true, idRiassunto: 'rias-abc-1' }).idRiassunto, 'rias-abc-1');
  assert.equal('idRiassunto' in fine({ compattato: false, idRiassunto: 'rias-abc-1' }), false);
  assert.equal('idRiassunto' in fine({ compattato: true, idRiassunto: 'con spazi' }), false);
  assert.equal('idRiassunto' in fine({ compattato: true }), false, 'senza id la forma resta quella di sempre');
  assert.deepEqual(idDellaFine({ idRiassunto: 'rias-abc-1', lavoroDelMotore: 'job-1' }), ['rias-abc-1', 'job-1']);
  assert.deepEqual(idDellaFine({}), []);
});

/* Il totale «dove c'è già» (owner 30/10 sera): Costi, Bacheca, Progetti e albero leggono `usageDellaSessione`, che aggiunge `servizio`. */
test('SPESA-RIAS-DOVE-01 — una riga dell’elenco del server: usageSessione + servizio, giri e cache invariati; senza servizio come prima', async () => {
  const { usageDellaSessione, conServizio } = await import('../../src/components/consumo-sessione.js');
  const f = JSON.parse(readFileSync(new URL('../../../tests/fixtures/spesa-ogni-spesa-una-volta.json', import.meta.url), 'utf8'));
  const usageSessione = { prompt_tokens: 30_800, completion_tokens: 809, cached_tokens: 19_800, giri: 13 }; // chat + motore dal contesto
  const riga = { usageSessione, servizio: f.atteso.servizioDelServer };
  const u = usageDellaSessione(riga);
  assert.equal(u.prompt_tokens + u.completion_tokens, 30_800 + 809 + 1_155, 'ogni spesa una volta: il motore è già in usageSessione');
  assert.equal(u.giri, 13);
  assert.equal(u.cached_tokens, 19_800);
  assert.equal(u.prompt_tokens_con_cache, 30_800, 'la base della percentuale di cache resta il prompt della chat');
  assert.equal(usageDellaSessione({ usageSessione }), usageSessione, 'senza il campo: lo stesso oggetto di prima');
  assert.equal(usageDellaSessione({ usageSessione, servizio: null }), usageSessione);
  assert.equal(conServizio(null, f.atteso.servizioDelServer), null, 'nessun totale non diventa un totale di soli riassunti');
  /* la percentuale del piede non cambia */
  assert.equal(testiUsage(null, { usageSessione: u }).cache, testiUsage(null, { usageSessione }).cache);
});
