/*
 * conversazioni-per-il-modello.test.mjs — decisione owner 27/09 (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 3):
 *   Conversazioni + Board in un attrezzo a quattro forme come `session_search` di Hermes. Gli eventi hanno la forma VERA
 *   del journal (misurata sulla sessione 56066b64: RunStarted.input.consegna, TextMessage* per messageId, ToolCall*).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIMITI_CONVERSAZIONI, cercaConversazioni, leggiConversazione, messaggiDaEventi, sfogliaConversazioni, statoDellaConversazione,
} from '../src/conversazioni-per-il-modello.mjs';

const giro = (consegna, risposta, id) => [
  { type: 'RunStarted', input: { consegna } },
  { type: 'TextMessageStart', messageId: id },
  ...risposta.match(/.{1,7}/gsu).map((delta) => ({ type: 'TextMessageContent', messageId: id, delta })),
  { type: 'TextMessageEnd', messageId: id },
  { type: 'RunFinished', outcome: { type: 'success' } },
];
const riga = (sessionId, extra = {}) => ({
  sessionId, taskId: 'workspace', nome: `Sessione ${sessionId}`, avviataAlle: '2026-09-20T10:00:00.000Z', ultimaRispostaAlle: null,
  conclusa: true, interrotta: false, ultimoEsito: 'successo', motivoChiusura: 'fine-lavoro', padreId: null, modello: 'z-ai/glm-5.3-flash', ...extra,
});

const SALUTO = [
  ...giro('cosa fa saluto?', 'Esporta una funzione che restituisce «Ciao, nome!».', 'm1'),
  { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'leggi' },
  { type: 'ToolCallArgs', toolCallId: 't1', delta: '{"percorso":"saluto.js"}' },
  { type: 'ToolCallResult', toolCallId: 't1', content: 'export const saluto = (nome) => `Ciao, ${nome}!`;' },
  { type: 'ReasoningMessageContent', messageId: 'r1', delta: 'penso alla funzione zanzibar' },
  ...giro('rendila un file html interattivo', 'Ecco Saluto Enterprise Edition, un artefatto HTML.', 'm2'),
];
const VOCI = [
  { riga: riga('a-saluto', { nome: 'Saluto enterprise', ultimaRispostaAlle: '2026-09-27T10:30:00.000Z', usageSessione: { prompt_tokens: 40_000, completion_tokens: 2_000, giri: 3 }, giriFermati: 1, cartella: 'C:/prova/progetto' }), eventi: SALUTO },
  { riga: riga('b-auto', { nome: 'Rapporto notturno', senzaInterfaccia: true, ultimaRispostaAlle: '2026-09-27T11:00:00.000Z' }), eventi: giro('scrivi il rapporto html', 'Rapporto html scritto.', 'm3') },
  { riga: riga('c-figlia', { padreId: 'a-saluto', ultimaRispostaAlle: '2026-09-27T12:00:00.000Z' }), eventi: giro('sotto-compito html', 'fatto html', 'm4') },
  { riga: riga('d-corrente', { conclusa: false, ultimaRispostaAlle: '2026-09-27T12:30:00.000Z' }), eventi: giro('che memorie ho? html', '…', 'm5') },
  { riga: riga('e-attesa', { conclusa: false, inAttesaDomanda: true, ultimaRispostaAlle: '2026-09-26T09:00:00.000Z' }), eventi: [] },
];
const righe = VOCI.map((v) => v.riga);

test('CONVERSAZIONI-01 — i messaggi dal journal: persona, modello, una riga per attrezzo; il ragionamento resta fuori', () => {
  const m = messaggiDaEventi(SALUTO);
  assert.deepEqual(m.map((x) => [x.n, x.ruolo]), [[1, 'person'], [2, 'model'], [3, 'tool'], [4, 'person'], [5, 'model']]);
  assert.equal(m[1].testo, 'Esporta una funzione che restituisce «Ciao, nome!».', 'i pezzi del messaggio si ricompongono');
  assert.match(m[2].testo, /^leggi \{"percorso":"saluto\.js"\} → export const saluto/u);
  assert.ok(!m.some((x) => x.testo.includes('zanzibar')), 'il ragionamento non entra');
});

test('CONVERSAZIONI-02 — SFOGLIA è la Board: dalla più recente, stato come la Board, niente figlie né la corrente', () => {
  const out = sfogliaConversazioni(righe, { correnteId: 'd-corrente' });
  assert.match(out, /^Conversations: showing 3 of 3, most recent first\./u);
  const ordine = [...out.matchAll(/— id (\S+)/gu)].map((x) => x[1]);
  assert.deepEqual(ordine, ['b-auto', 'a-saluto', 'e-attesa']);
  assert.match(out, /\[Saluto enterprise\]\(talos:\/\/conversazione\/a-saluto\) — done · model z-ai\/glm-5\.3-flash · 4 turns · 42\.0k tokens · closed: finished the work/u);
  assert.match(out, /Rapporto notturno.*automation/u);
  assert.match(out, /a-saluto\) — [^\n]*· project progetto — id a-saluto/u, 'il nome della cartella, non il percorso');
  assert.match(sfogliaConversazioni([riga('w', { cartella: 'C:\\Users\\x\\Progetto Win\\' })]), /· project Progetto Win — id w/u, 'anche coi separatori di Windows');
  assert.doesNotMatch(out, /C:\/prova/u, 'il percorso intero non esce');
  assert.match(out, /\(talos:\/\/conversazione\/e-attesa\) — waiting for the person/u);
  assert.equal(statoDellaConversazione(VOCI[4].riga), 'waiting for the person');
});

test('CONVERSAZIONI-03 — SFOGLIA coi filtri: stato e cartella; uno stato sconosciuto si dice', () => {
  assert.match(sfogliaConversazioni(righe, { status: 'waiting' }), /showing 1 of 1[\s\S]*e-attesa/u);
  assert.match(sfogliaConversazioni(righe, { folder: 'c:\\prova' }), /showing 1 of 1[\s\S]*a-saluto/u);
  assert.match(sfogliaConversazioni(righe, { status: 'dormiente' }), /unknown status «dormiente»/u);
  assert.match(sfogliaConversazioni(righe, { status: 'error' }), /No conversation matches these filters/u);
  assert.equal(sfogliaConversazioni([], {}), 'There are no other conversations yet.');
});

test('CONVERSAZIONI-04 — CERCA per parole: estratto del messaggio migliore, automazioni in coda, figlia e corrente escluse', () => {
  const out = cercaConversazioni(VOCI, { query: 'html', correnteId: 'd-corrente', limit: 10 });
  const ordine = [...out.matchAll(/— id (\S+)/gu)].map((x) => x[1]);
  assert.deepEqual(ordine, ['a-saluto', 'b-auto'], 'l’automazione, più recente, va in coda; figlia e corrente non ci sono');
  assert.match(out, /message #4 \(person\): rendila un file html interattivo/u);
  assert.equal(cercaConversazioni(VOCI, { query: '*' }), null, '«*» vuol dire sfogliare');
  assert.equal(cercaConversazioni(VOCI, { query: '' }), null);
});

test('CONVERSAZIONI-05 — AL CONTRARIO: una parola che non c’è non trova niente e lo dice; il ragionamento non si cerca', () => {
  assert.match(cercaConversazioni(VOCI, { query: 'zanzibar' }), /^No conversation contains «zanzibar»\. Try other or fewer words/u);
});

test('CONVERSAZIONI-06 — LEGGI a pagine e SCORRI intorno a un messaggio; la corrente e le figlie non si leggono', () => {
  const tutta = leggiConversazione(VOCI[0], { conversation_id: 'a-saluto' });
  assert.match(tutta, /^Conversation \[Saluto enterprise\]\(talos:\/\/conversazione\/a-saluto\) — done · model z-ai\/glm-5\.3-flash · 5 messages\./u);
  assert.match(tutta, /#1 person: cosa fa saluto\?/u);
  assert.match(tutta, /Showing messages 1-5 of 5: the end of the conversation\./u);
  const intorno = leggiConversazione(VOCI[0], { conversation_id: 'a-saluto', around_message: 4, window: 1 });
  assert.match(intorno, /Showing messages 3-5 of 5, around #4\./u);
  assert.doesNotMatch(intorno, /#1 person/u);
  assert.match(leggiConversazione(VOCI[3], { conversation_id: 'd-corrente', correnteId: 'd-corrente' }), /that is the current conversation/u);
  assert.match(leggiConversazione(VOCI[2], { conversation_id: 'c-figlia' }), /no conversation with id «c-figlia»/u);
  assert.match(leggiConversazione(null, { conversation_id: 'x' }), /no conversation with id «x»/u);
});

test('CONVERSAZIONI-07 — i tetti: un messaggio lungo si taglia dicendo quanto manca, la pagina si ferma e dice da dove continuare', () => {
  const lungo = 'parola '.repeat(1_000); // 7.000 caratteri
  const eventi = [];
  for (let i = 0; i < 8; i += 1) eventi.push(...giro(`domanda ${i}`, lungo, `l${i}`));
  const voce = { riga: riga('f-lunga'), eventi };
  const pagina = leggiConversazione(voce, { conversation_id: 'f-lunga' });
  assert.match(pagina, /\[4999 more characters\]/u, 'lettura: 2.000 per messaggio (6.999 caratteri, tolto lo spazio finale)');
  const fine = /Showing messages 1-(\d+) of 16\. Continue with from=(\d+)\./u.exec(pagina);
  assert.ok(fine, pagina.slice(-200));
  assert.equal(Number(fine[2]), Number(fine[1]) + 1);
  assert.ok(pagina.length < LIMITI_CONVERSAZIONI.caratteriPerPagina + 3_000);
  const scorrendo = leggiConversazione(voce, { conversation_id: 'f-lunga', around_message: 2, window: 1 });
  assert.match(scorrendo, /#2 model: (parola ){20}/u);
  assert.doesNotMatch(scorrendo.split('\n').find((l) => l.startsWith('#2')), /more characters/u, 'scorrendo 7.000 caratteri stanno interi');
});

test('CONVERSAZIONI-08 — quando: l’età come la Board e l’orario marcato UTC (il modello aveva detto «ieri» di un’ora prima)', async () => {
  const { quando } = await import('../src/conversazioni-per-il-modello.mjs');
  const adesso = Date.parse('2026-09-27T12:30:00.000Z');
  assert.equal(quando('2026-09-27T10:30:00.000Z', adesso), '2 hours ago (2026-09-27 10:30 UTC)');
  assert.equal(quando('2026-09-27T12:29:30.000Z', adesso), 'just now (2026-09-27 12:29 UTC)');
  assert.equal(quando('2026-09-27T12:25:00.000Z', adesso), '5 minutes ago (2026-09-27 12:25 UTC)');
  assert.equal(quando('2026-09-24T12:30:00.000Z', adesso), '3 days ago (2026-09-24 12:30 UTC)');
  assert.equal(quando('non una data', adesso), '');
  const board = sfogliaConversazioni([riga('x', { ultimaRispostaAlle: '2026-09-27T10:30:00.000Z' })], { adesso });
  assert.match(board, /· last activity 2 hours ago \(2026-09-27 10:30 UTC\) — id x/u);
});

// C3 tappa 4 (09/10/2026, review Y-4B-1 del bugfixer): una delega in pausa non è un «error» per il modello; al contrario un
// errore vero resta «error» e una fermata resta «stopped by the person».
test('C3-CONVERSAZIONE-PAUSA — a paused delegation reads «paused» to the model, not «error»', () => {
  const base = { conclusa: true, interrotta: false, ultimoEsito: 'errore' };
  assert.equal(statoDellaConversazione({ ...base, motivoChiusura: 'in-pausa' }), 'paused');
  assert.equal(statoDellaConversazione({ ...base, motivoChiusura: 'errore' }), 'error');
  assert.equal(statoDellaConversazione({ ...base, motivoChiusura: 'fermata' }), 'stopped by the person');
});
