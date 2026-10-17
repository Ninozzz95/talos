/*
 * 13/10/2026 notte (bugfixer NUOVO, lotto 3, SECONDA PASSATA) — gli attacchi fatti dopo il fermo del revisore di prima, sulla testa
 * `eae1a56fc`: la sorgente della storia (`grafo/fonte.js`), il client delle deleghe e il nome breve (`grafo/run-dalle-deleghe.js`).
 * Dalla sorgente vera e dal client vero. `[REGGE]` = ho provato a romperlo e ha retto; `[DIFETTO]` = consegnata rossa.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaFonte } from '../../src/components/grafo/fonte.js';
import { creaClientDeleghe, nomeBreve, NOME_IN_UNA_FRASE, NOME_MASSIMO } from '../../src/components/grafo/run-dalle-deleghe.js';

const T0 = Date.parse('2026-10-12T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const figlia = (id, nascita, extra = {}) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(nascita), conclusa: false, modello: 'ollama:mock-model', taskCorto: `Compito ${id}`, ...extra });
const finita = (id, nascita, fine, extra = {}) => figlia(id, nascita, { conclusa: true, conclusaAlle: at(fine), esitoDelega: 'concluso', ...extra });
const madre = { sessionId: 'madre', avviataAlle: at(0), conclusa: false, taskCorto: 'Conversazione' };
const registrato = (seq, secondi, node, event = 'updated', coverage = 'complete') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: 'madre', seq, at: at(secondi), coverage, event, node });
const corta = (voci) => voci.map((v) => `${v.scope === 'run' ? 'run' : v.nodeId}:${v.state}@${(Date.parse(v.at) - T0) / 1000}`);
const car = (...codici) => String.fromCodePoint(...codici);

/* ——— eae1a56fc: «senza record ⇒ si rigioca dai fatti». E quando il primo record ARRIVA? ——— */
async function laFonteCambia({ primaCopertura, primoThrough }) {
  // il registro all'inizio non ha nessun record (non c'è, oppure il suo file non ha una riga valida): si rigioca dai fatti
  const stato = { figli: [figlia('a', 60), finita('b', 70, 200)], record: [], through: primoThrough, coverage: primaCopertura };
  const leggiCronologia = async ({ after = 0, through = stato.through } = {}) => ({ schema: 'talos.agent-timeline.v1', rootId: 'madre', coverage: stato.coverage, persisted: true, through, next: null, items: stato.record.filter((r) => r.seq > after && r.seq <= through) });
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: stato.figli }), leggiCronologia });
  const fonte = creaFonte({ client, sorgente: await client.sorgente() });
  await fonte.caricaPanoramica(); await fonte.aggiornaStoria();
  assert.equal(client.fonteDellaStoria(), 'fatti', 'la premessa: senza record si rigioca dai fatti');
  // «a» finisce (la struttura NON cambia: stessi agenti, stessi posti) e il registro registra quell'evento: da qui ha una storia
  stato.figli = [finita('a', 60, 420), finita('b', 70, 200)];
  stato.record.push(registrato(primoThrough + 1, 420, finita('a', 60, 420), 'updated', 'partial'));
  stato.through = primoThrough + 1; stato.coverage = 'partial';
  const versione = fonte.panoramica.graphVersion;
  await fonte.caricaPanoramica();
  assert.equal(fonte.panoramica.graphVersion, versione, 'la premessa: la struttura non è cambiata');
  await fonte.aggiornaStoria();
  assert.equal(client.fonteDellaStoria(), 'registro', 'la premessa: adesso la barra dichiara «dal registro»');
  // che cosa leggerebbe il diagramma chiuso e riaperto nello stesso momento
  const riaperta = creaFonte({ client, sorgente: await client.sorgente() });
  await riaperta.caricaPanoramica(); await riaperta.aggiornaStoria();
  return { tenuta: corta(fonte.storia), riaperta: corta(riaperta.storia) };
}
test('SECONDA-FONTE-01 [DIFETTO] — la FONTE della storia cambia da «fatti» a «registro» senza che cambi la struttura: la storia tenuta è quella che si legge riaprendo il diagramma, non i fatti di prima sotto la nota «dal registro»', async () => {
  /* `fonte.js` rilegge da capo solo quando cambia la STRUTTURA. Ma la storia è legata anche alla fonte: `client.storia({ offset })`
     taglia a `offset` un elenco che adesso è un ALTRO elenco (quello del registro). Con meno voci di prima non arriva niente: resta
     la storia dei fatti letta all'inizio («a» in corso per sempre nella riproduzione e nella vista Tempo), mentre la barra dice
     «Storia del registro incompleta: comincia alle…». Con più voci se ne appende la coda: un miscuglio delle due. */
  // (1) un file della cronologia senza una riga valida (`partial`, zero record, numerazione già a 5): NUOVO con `eae1a56fc`, che lo
  //     manda ai fatti — prima restava «dal registro», vuota, e il primo record arrivava in coda alla SUA storia
  const rotto = await laFonteCambia({ primaCopertura: 'partial', primoThrough: 5 });
  assert.deepEqual(rotto.tenuta, rotto.riaperta, 'file della cronologia senza righe valide, poi un evento');
  // (2) nessuna cronologia (`unavailable`: una conversazione nata prima del registro), poi un evento su un agente che c'è già
  //     (pausa, ripresa, fine): c'era già prima di questi commit
  const assente = await laFonteCambia({ primaCopertura: 'unavailable', primoThrough: 0 });
  assert.deepEqual(assente.tenuta, assente.riaperta, 'nessuna cronologia, poi il primo evento registrato');
});

test('SECONDA-D9-03 [REGGE] — i buchi dichiarati solo alla SECONDA pagina della cronologia si dicono lo stesso; e una pagina che non è una pagina non lascia una storia a metà', async () => {
  const record = [registrato(1, 0, { ...madre }, 'created'), registrato(2, 60, figlia('a', 60), 'created'), registrato(3, 70, figlia('b', 70), 'created'), registrato(4, 200, finita('b', 70, 200))];
  const pagine = (rotta = false) => async ({ after = 0, through = record.length } = {}) => {
    const items = record.filter((r) => r.seq > after && r.seq <= through).slice(0, 2);
    const seconda = after >= 2;
    if (rotta && seconda) return { schema: 'talos.agent-timeline.v1', rootId: 'madre', coverage: 'complete', persisted: true, through: 'quattro', next: null, items };
    return { schema: 'talos.agent-timeline.v1', rootId: 'madre', coverage: seconda ? 'partial' : 'complete', persisted: true, through, next: items.at(-1)?.seq < through ? items.at(-1).seq : null, items };
  };
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [figlia('a', 60), finita('b', 70, 200)] }), leggiCronologia: pagine() });
  await client.panoramica(); await client.storia();
  assert.deepEqual(client.coperturaDellaStoria(), { parziale: true, da: at(0) });
  // la seconda pagina non è valida: la lettura fallisce e lo si sa (niente storia finta), e la copertura non dice «completa» di una storia a metà
  const rotto = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [figlia('a', 60), finita('b', 70, 200)] }), leggiCronologia: pagine(true) });
  await rotto.panoramica();
  await assert.rejects(rotto.storia(), /HISTORY_INVALID/u);
  assert.equal(rotto.erroreCronologia(), 'HISTORY_INVALID');
});

test('SECONDA-D14-02 [REGGE] — ramo isolato + ambito «cartella» + cambio di richiesta: l’isolamento si toglie e si dice, l’ambito resta; AL CONTRARIO, se il ramo isolato non era fra ciò che si guardava non si dice niente', async () => {
  const fatti = () => ({ corrente: { ...madre, cartella: 'C:/progetti/listini' }, sessioni: [{ sessionId: 'altra', cartella: 'C:/progetti/listini', avviataAlle: at(5), conclusa: true, nome: 'Altra conversazione' }],
    figli: [finita('a', 60, 90, { taskCorto: 'Correggi i prezzi' }), finita('b', 62, 120, { taskCorto: 'Leggi il CSV' }), figlia('c', 400, { taskCorto: 'Riscrivi le prove' })],
    richieste: [{ id: 'r1', at: T0 + 30_000, testo: 'Sistema i listini' }, { id: 'r2', at: T0 + 300_000, testo: 'Ora le prove' }] });
  const client = creaClientDeleghe({ leggi: async () => fatti() });
  client.scegliRichiesta('r1'); client.isola('b'); client.scegliAmbito('cartella');
  let p = (await client.panoramica()).data;
  assert.equal(p.filtro.isolato, 'b'); assert.equal(p.filtro.ambito, 'cartella');
  client.scegliRichiesta('r2');
  p = (await client.panoramica()).data;
  assert.equal(p.filtro.isolato, null, 'il ramo non è più isolato');
  assert.equal(p.filtro.isolamentoTolto, 'Leggi il CSV', 'e lo si dice, col suo nome');
  assert.equal(p.filtro.ambito, 'cartella', 'l’ambito resta quello scelto');
  assert.deepEqual(p.groups.map((g) => g.phaseId).filter((x) => x === 'cartella'), ['cartella'], 'e le altre conversazioni della cartella si vedono ancora');
  // al contrario: isolato un agente che la richiesta mostrata NON ha (non isola niente): il cambio di richiesta non dice niente
  const altro = creaClientDeleghe({ leggi: async () => fatti() });
  altro.scegliRichiesta('r1'); altro.isola('c');
  assert.equal((await altro.panoramica()).data.filtro.isolato, null, 'la premessa: «c» è dell’altra richiesta, qui non isola niente');
  altro.scegliRichiesta('r2');
  const q = (await altro.panoramica()).data;
  assert.equal(q.filtro.isolamentoTolto, null);
  assert.equal(q.filtro.isolato, null, 'e non riappare isolato nella richiesta dove c’è: il ramo ricordato si è tolto');
});

/* ——— d0a397649: il nome breve ——— */
test('SECONDA-NOME-01 [DIFETTO] — una consegna che comincia (o finisce) con centinaia di spazi o di righe vuote: il nome è il suo testo, non «…», e senza puntini se niente è stato tagliato', () => {
  /* `nomeBreve` guarda i primi `massimo × 4` caratteri GREZZI: se sono tutti spazi resta la stringa vuota, e siccome il testo è più
     lungo della finestra ci aggiunge i puntini — la scheda, il suggerimento e il nome letto diventano «…» (e «…» non è vuoto:
     non scatta nemmeno «Senza titolo»). */
  assert.equal(nomeBreve(`${' '.repeat(700)}Il compito vero`), 'Il compito vero');
  assert.equal(nomeBreve(`${'\n'.repeat(300)}Il compito vero`, NOME_IN_UNA_FRASE), 'Il compito vero');
  assert.equal(nomeBreve(`Corto${' '.repeat(2000)}`), 'Corto', 'solo spazi in coda: niente è stato tagliato, niente puntini');
});

test('SECONDA-NOME-02 [REGGE] — nomi strani: solo spazi ⇒ vuoto; emoji, arabo e scritture miste non superano il tetto e non spezzano una coppia surrogata; 5.000 consegne lunghe costano poco', () => {
  assert.equal(nomeBreve('   \n\t  '), '');
  assert.equal(nomeBreve(null), ''); assert.equal(nomeBreve(12), '');
  assert.equal(nomeBreve('x'.repeat(NOME_MASSIMO)), 'x'.repeat(NOME_MASSIMO), 'al tetto esatto: intero, senza puntini');
  assert.equal(nomeBreve('x'.repeat(NOME_MASSIMO + 1)), `${'x'.repeat(NOME_MASSIMO - 1)}…`);
  const faccina = car(0x1F600);
  for (const [nome, testo] of [['emoji', faccina.repeat(400)], ['emoji dispari', `a${faccina.repeat(400)}`], ['arabo', 'اكتب اختبارات للوحدة ثم شغّلها وتحقق من النتائج '.repeat(20)], ['misto', `Fix the ${'ملف-الإعدادات '.repeat(40)} parser`]]) {
    for (const massimo of [NOME_MASSIMO, NOME_IN_UNA_FRASE]) {
      const breve = nomeBreve(testo, massimo);
      assert.ok(breve.length <= massimo, `${nome} a ${massimo}: ${breve.length} caratteri`);
      assert.ok(breve.isWellFormed(), `${nome} a ${massimo}: una coppia surrogata spezzata`);
      assert.ok(breve.endsWith('…'), `${nome} a ${massimo}: è stato tagliato e lo dice`);
    }
  }
  const consegna = 'Analizza con cura e riscrivi. '.repeat(250);
  const t0 = performance.now();
  for (let i = 0; i < 5000; i += 1) nomeBreve(consegna);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `5.000 nomi da consegne di 7.500 caratteri: ${Math.round(ms)} ms`);
});
