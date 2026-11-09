/* Tester R2, R3, R4 (03/11/2026): il «no» della persona su una carta non è un guasto e non si richiede. Forma della 44, aggiunta del 03/11. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { comeNoDellaPersona, contieneMotivoFermatoChiedendo, rifiutoDellaDelega, TESTO_DEL_NO, talosLavora, verificaAzioneAutomazione, verificaChiamataDalTesto } from '../src/kernel/talosHarness.mjs';

const chiama = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const FINE = { role: 'assistant', content: 'ok' };
const rete = (...risposte) => {
  const corpi = [];
  return { corpi, fetch: async (_url, o) => {
    const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
    corpi.push(JSON.parse(o.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  } };
};
const esitiTool = (r) => r.corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content));
function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'no-persona-'));
  t.after(() => { try { rimuoviCartellaDiProva(c); } catch { /* già sparita */ } });
  return c;
}
const GUASTO = 'the approval could not be asked (the gate failed); nothing was approved.';
const lancia = async () => { throw new Error('canale rotto'); };

test('NO-01 il no della persona diventa DECLINED con la consegna di non chiedere, e la coda dello strumento resta', () => {
  for (const frase of ['the person declined to run this call.', 'the person did not approve it.', 'the owner did not approve this action.']) {
    assert.equal(comeNoDellaPersona(`REFUSED. ${frase} Nothing was written.`), `${TESTO_DEL_NO} Nothing was written.`, frase);
  }
  assert.match(TESTO_DEL_NO, /^DECLINED\. .*Do not ask again for it, by a card or a question/u);
});

test('NO-02 AL CONTRARIO: i rifiuti di sicurezza, i testi qualunque e le deleghe restano come sono', () => {
  assert.equal(comeNoDellaPersona('REFUSED. "x" is inside a folder the person blocked for the device that sent this turn. Nothing was searched;'), null);
  assert.equal(comeNoDellaPersona('REFUSED [ACCESS_DENIED]. the person declined to run this call.'), null, 'col codice è un rifiuto di regola');
  assert.equal(comeNoDellaPersona('the person declined to run this call.'), null);
  assert.equal(comeNoDellaPersona(null), null);
  assert.match(rifiutoDellaDelega({ motivo: 'the person did not approve starting this agent.' }), /^REFUSED\. .*No child was started\.$/u, 'le deleghe restano REFUSED (CLI)');
});

/* Revisione del blocco del 03/11 pomeriggio, D3: un cancello che LANCIA non è un no della persona. Era vero solo per
   `verificaPermessoScrittura`; le altre due porte davano la frase di serie del no, che diventava DECLINED («non chiedere più»). */
test('NO-03 D3: con un cancello che lancia, le carte degli strumenti e del testo dicono il guasto, e il modello legge REFUSED', async () => {
  const automazione = await verificaAzioneAutomazione({ tipo: 'app_settings' }, { chiediApprovazioneFn: lancia });
  assert.deepEqual(automazione, { consentito: false, motivo: GUASTO });
  const dalTesto = await verificaChiamataDalTesto({ tipo: 'chiamata-dal-testo', toolCallId: 'x', nome: 'leggi', argomenti: {} }, { chiediApprovazioneFn: lancia });
  assert.deepEqual(dalTesto, { consentito: false, motivo: GUASTO });
  assert.equal(comeNoDellaPersona(`REFUSED. ${automazione.motivo}`), null, 'resta REFUSED');
  /* AL CONTRARIO: un no vero resta il no della persona */
  assert.deepEqual(await verificaAzioneAutomazione({ tipo: 'app_settings' }, { chiediApprovazioneFn: async () => false }), { consentito: false, motivo: 'the person did not approve it.' });
  assert.deepEqual(await verificaChiamataDalTesto({ tipo: 'chiamata-dal-testo', toolCallId: 'x', nome: 'leggi', argomenti: {} }, { chiediApprovazioneFn: async () => false }), { consentito: false, motivo: 'the person declined to run this call.' });
});

test('NO-04 D3 lungo il giro: la carta della ricerca col cancello rotto arriva al modello come REFUSED, mai DECLINED', async (t) => {
  const r = rete(chiama('c1', 'research_start', { question: 'Come fanno i concorrenti?', depth: 'quick' }), FINE);
  const avviate = [];
  await talosLavora({ cartella: cartella(t), task: { consegna: 'x' }, modello: 'f', chiave: 'k', fetchDiRete: r.fetch, livelloAccesso: 'accesso-pieno', strumentiEstesi: ['research_start'],
    chiediApprovazioneFn: lancia, onRicercaAvvia: async (a) => { avviate.push(a); return { ok: true, esito: 'started' }; } });
  const [esito] = esitiTool(r);
  assert.deepEqual(avviate, []);
  assert.match(esito, /^REFUSED\. the approval could not be asked \(the gate failed\); nothing was approved\. No research was started\./u);
  assert.doesNotMatch(esito, /DECLINED/u);
});

/* Revisione del blocco del 03/11 pomeriggio, D4: le guardie dei giri in tondo leggevano l'esito PRIMA della riscrittura, quando diceva
   ancora REFUSED. Tre no di fila davano «has failed 3 times in a row … looks like a loop», e due chiamate identiche rimandavano il testo
   REFUSED al posto di DECLINED. Ora un no della persona non è un fallimento per le guardie, e nemmeno un passo avanti. */
const giroConNo = async (t, risposte, { chiedi = async () => false, livelloAccesso = 'su-richiesta' } = {}) => {
  const r = rete(...risposte, FINE);
  await talosLavora({ cartella: cartella(t), task: { consegna: 'x' }, modello: 'f', chiave: 'k', fetchDiRete: r.fetch, livelloAccesso,
    guardiaGiriInTondo: true, chiediApprovazioneFn: chiedi });
  return esitiTool(r);
};

test('NO-05 D4: tre no di fila sullo stesso strumento non sono «un giro in tondo che fallisce»', async (t) => {
  const esiti = await giroConNo(t, ['a', 'b', 'c'].map((n, i) => chiama(`s${i}`, 'scrivi', { percorso: `${n}.txt`, contenuto: 'ciao' })));
  assert.equal(esiti.length, 3);
  for (const e of esiti) assert.match(e, /^DECLINED\. /u);
  assert.doesNotMatch(esiti[2], /has failed 3 times in a row/u);
});

test('NO-06 D4: due chiamate identiche dopo un no: la nota dei giri in tondo porta DECLINED, mai il REFUSED di prima', async (t) => {
  const esiti = await giroConNo(t, [chiama('s1', 'scrivi', { percorso: 'a.txt', contenuto: 'ciao' }), chiama('s2', 'scrivi', { percorso: 'a.txt', contenuto: 'ciao' })]);
  assert.match(esiti[1], /^\[TALOS: this is call 2 of "scrivi"/u, 'la guardia vede ancora la ripetizione');
  assert.match(esiti[1], /DECLINED\. The person said no to this/u);
  assert.doesNotMatch(esiti[1], /REFUSED/u);
});

test('NO-07 D4 AL CONTRARIO: un no non è un passo avanti (le letture ripetute si contano ancora), e un rifiuto di sicurezza resta un fallimento', async (t) => {
  const leggi = (id) => chiama(id, 'elenca', {});
  const esiti = await giroConNo(t, [leggi('l1'), leggi('l2'), chiama('s1', 'scrivi', { percorso: 'a.txt', contenuto: 'ciao' }), leggi('l3')]);
  assert.match(esiti[3], /^\[TALOS: this is call 3 of "elenca"/u, 'il no in mezzo non azzera il conto');
  const sicurezza = await giroConNo(t, ['a', 'b', 'c'].map((n, i) => chiama(`s${i}`, 'scrivi', { percorso: `${n}.txt`, contenuto: 'ciao' })), { livelloAccesso: 'lettura' });
  for (const e of sicurezza) assert.match(e, /^REFUSED/u);
  assert.match(sicurezza[2], /has failed 3 times in a row/u, 'un rifiuto che non è della persona si conta come prima');
});

/* Revisione del blocco del 03/11 pomeriggio, D2: con Reindirizza la carta si chiudeva (`resolve(false)`) PRIMA dell'abort. La corsa del
   nucleo prendeva il no, e il modello leggeva DECLINED («la persona ha detto no, non chiedere più») anche se la persona aveva solo scritto
   un messaggio nuovo. Lo Stop l'ha curato il 30/10 (COD-205): prima l'abort, poi la chiusura. Col registro VERO e il cancello VERO. */
async function registroConCarta(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'no-persona-registro-'));
  const giri = [];
  const registry = createSessionRegistry({ cartellaStore,
    avviaSessioneFn(input) {
      const promise = new Promise((r) => { giri.push({ input, resolve: r }); });
      input.onEvento({ type: 'RunStarted', threadId: 't0', runId: `r${giri.length}` });
      return promise;
    },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'Rifattorizza il parser' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  t.after(async () => {
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const via = registry.iscriviti(sessionId, () => {}); // un client collegato: senza, la carta non nasce
  t.after(() => via());
  const { input } = giri[0];
  const carta = verificaAzioneAutomazione({ tipo: 'app_settings', toolCallId: 'c1' }, { chiediApprovazioneFn: input.chiediApprovazioneFn, segnaleStop: input.segnaleStop });
  await new Promise((r) => setImmediate(r));
  assert.ok(registry.domandaInAttesa(sessionId)?.requestId, 'la carta è aperta');
  return { registry, sessionId, carta };
}

test('NO-08 D2: un messaggio nuovo con la carta aperta FERMA la carta: il modello legge «fermato», mai il no della persona', async (t) => {
  const { registry, sessionId, carta } = await registroConCarta(t);
  assert.equal(registry.reindirizza(sessionId, 'sì, fallo, ma nell\'altra cartella').ok, true);
  const esito = await carta;
  assert.equal(esito.consentito, false);
  assert.equal(esito.via, 'fermato-su-richiesta');
  assert.equal(contieneMotivoFermatoChiedendo(esito.motivo), true, `il motivo dello Stop: ${esito.motivo}`);
  assert.equal(comeNoDellaPersona(`REFUSED. ${esito.motivo}`), null, 'mai DECLINED');
});

test('NO-09 D2 AL CONTRARIO: il no della persona sulla stessa carta resta il suo no', async (t) => {
  const { registry, sessionId, carta } = await registroConCarta(t);
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, false);
  assert.deepEqual(await carta, { consentito: false, motivo: 'the person did not approve it.' });
});
