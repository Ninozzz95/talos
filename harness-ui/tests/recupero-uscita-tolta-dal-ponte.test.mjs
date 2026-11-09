/*
 * La coda dopo il riassunto (owner 05/11/2026, registro 224), richiesta del Mobile sulla forma: un'uscita vecchia della coda diventa un
 * segnaposto che dice «rileggila con conversation_search». Questa prova segue il RECUPERO lungo il filo vero, dal modello all'uscita:
 *   - il segnaposto è quello del motore (`clearedOutputPlaceholder`) col puntatore del desktop (`PUNTATORE_USCITA_TOLTA`);
 *   - gli eventi della conversazione sono fatti coi costruttori del server (`agui-events.mjs`), mai inventati;
 *   - la lettura passa da `onLetturaSezione` come nel servizio (`agent-service.mjs`, ramo `conversation_search`) e da
 *     `conversazioniFn` come nel registro (`session-registry.mjs`, ramo `this_conversation`), copiati qui riga per riga;
 *   - il modello è un fornitore finto che chiama attraverso il PONTE degli attrezzi differiti (`ponte-attrezzi.mjs`:
 *     `conversation_search` è fra i differibili, e col modello locale del telefono, `'essenziali'`, sta sempre dietro il ponte).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { ATTREZZI_DIFFERIBILI, NOME_CHIAMATA_ATTREZZO } from '../src/kernel/ponte-attrezzi.mjs';
import { runStarted, toolCallStart, toolCallArgs, toolCallResult, textMessageStart, textMessageContent, textMessageEnd } from '../src/agui-events.mjs';
import { cercaConversazioni, leggiConversazione, messaggiDaEventi } from '../src/conversazioni-per-il-modello.mjs';
import { PUNTATORE_USCITA_TOLTA } from '../src/context-runtime.mjs';
import { clearedOutputPlaceholder } from '../../context-engine/src/tool-output-clearing.mjs';
import { testoPerLoSchermo } from '../src/kernel/confine-dati.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs';

const SESSIONE = 'sessione-finta';
/* un'uscita di media grandezza, con un «ago» in mezzo: entra intera nella lettura di un messaggio */
const ORIGINALE = Array.from({ length: 60 }, (_, i) => `riga ${i + 1} di modulo1/config.json: chiave_${i} = valore_${i * 7}`).join('\n')
  + '\nimpronta del pacchetto: 9f2c4e7a1b3d55aa';
const ARGOMENTI = JSON.stringify({ path: 'modulo1/config.json' });

/* gli eventi della conversazione, coi costruttori del server */
const eventi = [
  runStarted({ threadId: SESSIONE, runId: 'giro-1', input: { consegna: 'Richiesta numero 1: leggi la configurazione del modulo 1.' } }),
  toolCallStart({ toolCallId: 'c1', toolCallName: 'read_file' }),
  toolCallArgs({ toolCallId: 'c1', delta: ARGOMENTI }),
  toolCallResult({ messageId: 'r1', toolCallId: 'c1', content: ORIGINALE }),
  textMessageStart({ messageId: 'm1' }),
  textMessageContent({ messageId: 'm1', delta: 'Letta la configurazione.' }),
  textMessageEnd({ messageId: 'm1' }),
];

/* `session-registry.mjs`, `conversazioniFn`, ramo `this_conversation` (copiato) */
const voceCorrente = { riga: { sessionId: SESSIONE, nome: '' }, eventi };
const conversazioniFn = async (argomenti = {}) => {
  if (argomenti.this_conversation === true) {
    return argomenti.around_message !== undefined || argomenti.from !== undefined
      ? leggiConversazione(voceCorrente, { ...argomenti, conversation_id: SESSIONE, correnteId: SESSIONE })
      : cercaConversazioni([voceCorrente], { query: argomenti.query, limit: argomenti.limit, correnteId: SESSIONE, this_conversation: true });
  }
  return 'fuori dalla prova';
};
/* `agent-service.mjs`, `onLetturaSezione`, ramo `conversation_search` (copiato) */
const onLetturaSezione = async (nome, argomenti = {}) => (nome === 'conversation_search'
  ? (typeof conversazioniFn === 'function' ? conversazioniFn(argomenti) : 'conversations are not available on this harness.')
  : `${nome}: fuori dalla prova`);

/* il fornitore finto: una risposta per richiesta dal copione, e i corpi delle richieste per leggere gli esiti */
function fornitore(copione) {
  const richieste = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    richieste.push(corpoSenzaMarcatori(init.body));
    const passo = copione[n] ?? { content: 'fatto' };
    n += 1;
    const message = passo.chiamate
      ? { role: 'assistant', content: null, tool_calls: passo.chiamate.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
      : { role: 'assistant', content: passo.content };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: passo.chiamate ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchDiRete, richieste };
}
const esitoDi = (richieste, id) => richieste.flatMap((r) => r.messages).find((m) => m.role === 'tool' && m.tool_call_id === id)?.content;
const offerti = (richieste) => (richieste[0]?.tools ?? []).map((a) => a.function?.name);

async function giro(copione, attrezziDifferiti) {
  const { fetchDiRete, richieste } = fornitore(copione);
  await talosLavora({
    cartella: mkdtempSync(join(tmpdir(), 'recupero-')), task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 4, fetchDiRete,
    livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async () => true,
    strumentiEstesi: ['conversation_search'], onLetturaSezione, attrezziDifferiti,
  });
  return richieste;
}

/* il messaggio dell'uscita nella numerazione che il modello vede (persona #1, attrezzo #2, …) */
const numeroDellUscita = messaggiDaEventi(eventi, { completo: true }).findIndex((m) => m.ruolo === 'tool' && m.testo.includes('9f2c4e7a1b3d55aa')) + 1;

for (const ponte of [true, 'essenziali']) {
  test(`RECUPERO-PONTE (${ponte === true ? 'ponte acceso' : 'modello locale del telefono'}): l’uscita tolta torna intera, uguale all’originale, attraverso tool_call`, async () => {
    const segnaposto = clearedOutputPlaceholder({ role: 'tool', tool_call_id: 'c1', content: ORIGINALE },
      { id: 'c1', type: 'function', function: { name: 'read_file', arguments: ARGOMENTI } }, { pointer: PUNTATORE_USCITA_TOLTA });
    assert.ok(segnaposto.includes('conversation_search') && segnaposto.includes('this_conversation=true'), 'il segnaposto dice come rileggerla');
    assert.ok(ATTREZZI_DIFFERIBILI.has('conversation_search'), 'premessa: conversation_search sta dietro il ponte');
    /* il modello fa ciò che dice il segnaposto: cerca con le parole della chiamata, poi legge il messaggio trovato */
    const richieste = await giro([
      { chiamate: [['k1', NOME_CHIAMATA_ATTREZZO, { name: 'conversation_search', arguments: { this_conversation: true, query: 'modulo1/config.json' } }]] },
      { chiamate: [['k2', NOME_CHIAMATA_ATTREZZO, { name: 'conversation_search', arguments: { this_conversation: true, around_message: numeroDellUscita, window: 1 } }]] },
      { content: 'fatto' },
    ], ponte);
    assert.equal(offerti(richieste).includes('conversation_search'), false, 'premessa: conversation_search non è fra gli attrezzi davanti al modello');
    const trovato = testoPerLoSchermo(esitoDi(richieste, 'k1'));
    assert.match(trovato, new RegExp(`message #${numeroDellUscita} \\(tool\\)`, 'u'), 'la ricerca trova il messaggio dell’uscita');
    const letto = testoPerLoSchermo(esitoDi(richieste, 'k2'));
    const riga = letto.split(`#${numeroDellUscita} tool: `)[1];
    assert.ok(riga, 'la lettura mostra il messaggio dell’uscita');
    const uscita = riga.slice(riga.indexOf('→ ') + 2).split(`\n#${numeroDellUscita + 1} `)[0];
    assert.equal(uscita, ORIGINALE, 'il testo tornato è uguale all’originale');
  });
}

test('RECUPERO-PONTE (chiamata diretta): il modello chiama conversation_search col nome del segnaposto anche se sta dietro il ponte, e la ricerca risponde', async () => {
  for (const ponte of [true, 'essenziali']) {
    const richieste = await giro([
      { chiamate: [['d1', 'conversation_search', { this_conversation: true, query: 'modulo1/config.json' }]] },
      { content: 'fatto' },
    ], ponte);
    assert.equal(offerti(richieste).includes('conversation_search'), false, 'premessa: non è fra gli attrezzi davanti al modello');
    assert.ok(testoPerLoSchermo(esitoDi(richieste, 'd1')).includes(`message #${numeroDellUscita} (tool)`), `ponte ${ponte}: la chiamata diretta trova l’uscita`);
  }
});

/* ⚠ Il limite che resta (misurato 05/11): la lettura mostra al più 8.000 caratteri per messaggio (`LIMITI_CONVERSAZIONI`,
   `caratteriPerMessaggioScorrendo`). Un'uscita più lunga torna con i primi 8.000 caratteri e il conto di quelli mancanti, mai tagliata in
   silenzio. Leggerla intera chiede di cambiare l'attrezzo che vede il modello: forma a parte con CLI e Mobile. */
test('RECUPERO-PONTE (uscita oltre 8.000 caratteri): torna l’inizio esatto e il conto di ciò che manca, mai un taglio muto', () => {
  const grande = Array.from({ length: 900 }, (_, i) => `riga ${i} del file grande`).join('\n');
  const ev = [
    runStarted({ threadId: SESSIONE, runId: 'giro-1', input: { consegna: 'leggi il file grande' } }),
    toolCallStart({ toolCallId: 'g1', toolCallName: 'read_file' }),
    toolCallArgs({ toolCallId: 'g1', delta: '{"path":"grande.txt"}' }),
    toolCallResult({ messageId: 'r', toolCallId: 'g1', content: grande }),
  ];
  const letto = leggiConversazione({ riga: { sessionId: SESSIONE, nome: '' }, eventi: ev }, { conversation_id: SESSIONE, correnteId: SESSIONE, this_conversation: true, around_message: 2, window: 1 });
  const uscita = letto.split('#2 tool: ')[1].split('\n#3 ')[0].split('\nShowing messages')[0];
  const mostrato = uscita.slice(uscita.indexOf('→ ') + 2).replace(/… \[\d+ more characters\]$/u, '');
  assert.ok(grande.startsWith(mostrato) && mostrato.length > 7_000, 'l’inizio è esatto');
  assert.match(uscita, /… \[\d+ more characters\]$/u, 'il conto di ciò che manca');
});
