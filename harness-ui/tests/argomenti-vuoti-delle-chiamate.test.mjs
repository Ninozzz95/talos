/*
 * ⛔ 08/10/2026 (CLI, prova dal vivo sulla rotta nativa Anthropic) — UNA CHIAMATA SENZA ARGOMENTI ROMPEVA LA RIPRESA.
 *
 * Uno strumento chiamato senza argomenti (`elenca`) arriva dallo stream con ZERO frammenti di argomenti: il kernel accumulava
 * `arguments: ''` e la riga 11905 di talosHarness.mjs lo lasciava così (`grezzi === ''` → `continue`). Alla ripresa
 * `recuperaCronologiaTool` (session-registry.mjs) fa `JSON.parse('')`, lo prende per «JSON troncato» e riscrive la chiamata e il suo
 * risultato in TESTO («History recovery: a call with incomplete JSON…»): la storia attiva non coincide più con l'archivio del Context
 * Engine e ogni giro muore con `CTX_HISTORY_DIVERGED` (riprodotto con claude-haiku-5-5, claude-sonnet-5-5 e claude-fable-5-1; la stessa
 * storia con un solo `leggi` riprende). Sul filo nativo, con lo stato del fornitore che non coincide (cambio modello), `toNativeMessages`
 * fa `JSON.parse('')` e il giro cade con «Unexpected end of JSON input».
 *
 * Ricerca letta 08/10/2026: Hermes (865ba906, 07/10) turn_tool_validation.py:150-161 «empty strings become empty objects (common model
 * quirk)», message_sanitization.py:230-236 `_repair_tool_call_arguments` (vuoto → «{}»), codex_runtime.py:1020; Pi (bf8e4b9, 26/09)
 * packages/ai/src/utils/json-parse.ts:104-106 (vuoto/spazi → {}); Codex (42266240, 24/09) core/src/mcp_tool_call.rs:145 (argomenti
 * vuoti = oggetto vuoto); doc Anthropic Messages streaming: «the final tool_use.input is always an object», e `partial_json=''`
 * nell'esempio di una chiamata senza parametri.
 *
 * Cura in tre punti, tutti sullo stesso fatto («vuoto = {}»): alla FONTE (la risposta del modello entra nella storia come `{}`), nella
 * RIPARAZIONE della ripresa (le storie già salvate con `''` non sono troncate e NON si riscrivono: l'archivio ha il loro `''`), e al
 * CONFINE col fornitore (la copia per il fornitore porta `{}`, mai la storia salvata).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { prepareProviderContext } from '../src/context-provider-adapter.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { toNativeMessages } from '../src/native-provider-adapter.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const chiamata = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: argomenti } });
const rispostaDi = (message) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message }] }), text: async () => '' });

/* Giro vero di talosLavora con un fornitore finto: la prima risposta chiama `elenca` con gli argomenti dati, la seconda chiude. */
async function giroConChiamata(t, argomenti, extra = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'argv-vuoti-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'a.txt'), 'alpha');
  const richieste = [];
  let conta = 0;
  const risultato = await talosLavora({
    cartella, task: { consegna: 'elenca i file' }, modello: 'x', chiave: 'y',
    fetchDiRete: async (url, opzioni) => {
      richieste.push(JSON.parse(opzioni.body));
      return rispostaDi(conta++ ? { role: 'assistant', content: 'fatto' } : { role: 'assistant', content: null, tool_calls: [chiamata('c1', 'elenca', argomenti)] });
    },
    ...extra,
  });
  return { risultato, richieste };
}

test('ARGV-1: una chiamata con argomenti VUOTI entra nella storia come «{}» e lo strumento gira davvero', async (t) => {
  const { risultato } = await giroConChiamata(t, '');
  const assistant = risultato.messaggiFinali.find((m) => m.role === 'assistant' && m.tool_calls);
  assert.equal(assistant.tool_calls[0].function.arguments, '{}', 'la storia non porta una stringa vuota: non è JSON');
  const esito = risultato.messaggiFinali.find((m) => m.role === 'tool').content;
  assert.match(String(esito), /a\.txt/u, 'una chiamata senza argomenti è una chiamata valida: elenca la cartella, non fallisce');
});

test('ARGV-2: anche solo spazi e a-capo valgono «nessun argomento»', async (t) => {
  const { risultato } = await giroConChiamata(t, '  \n ');
  assert.equal(risultato.messaggiFinali.find((m) => m.tool_calls).tool_calls[0].function.arguments, '{}');
});

test('ARGV-3: AL CONTRARIO — un JSON valido resta byte per byte, e un JSON troncato si cura come prima (→ «{}»)', async (t) => {
  const valido = '{"percorso": "" }';
  const { risultato } = await giroConChiamata(t, valido);
  assert.equal(risultato.messaggiFinali.find((m) => m.tool_calls).tool_calls[0].function.arguments, valido, 'nemmeno uno spazio cambia');
  const { risultato: troncato } = await giroConChiamata(t, '{');
  assert.equal(troncato.messaggiFinali.find((m) => m.tool_calls).tool_calls[0].function.arguments, '{}', 'la cura BC-11 non si perde');
});

test('ARGV-3b: una chiamata a `leggi` SENZA argomenti riceve «manca il percorso», non «argomenti arrivati INCOMPLETI» (vuoto non è troncato)', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'argv-vuoti-leggi-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let conta = 0;
  const risultato = await talosLavora({
    cartella, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y',
    fetchDiRete: async () => rispostaDi(conta++ ? { role: 'assistant', content: 'fatto' } : { role: 'assistant', content: null, tool_calls: [chiamata('c1', 'leggi', '')] }),
  });
  const esito = String(risultato.messaggiFinali.find((m) => m.role === 'tool').content);
  assert.match(esito, /no file path was given/u, esito.slice(0, 200));
  assert.equal(/INCOMPLETE/u.test(esito), false, 'dire «tagliato a metà» a chi non ha mandato argomenti fa cercare un errore che non c’è');
  /* AL CONTRARIO: un JSON davvero troncato continua a dire INCOMPLETE. */
  let conta2 = 0;
  const troncato = await talosLavora({
    cartella, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y',
    fetchDiRete: async () => rispostaDi(conta2++ ? { role: 'assistant', content: 'fatto' } : { role: 'assistant', content: null, tool_calls: [chiamata('c1', 'leggi', '{"percorso": "a.')] }),
  });
  assert.match(String(troncato.messaggiFinali.find((m) => m.role === 'tool').content), /INCOMPLETE/u);
});

const STORIA_VECCHIA = () => [
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'elenca' },
  { role: 'assistant', content: null, tool_calls: [chiamata('c1', 'elenca', '')] },
  { role: 'tool', tool_call_id: 'c1', content: 'a.txt' },
  { role: 'assistant', content: 'ecco' },
];

test('ARGV-4: porta SENZA motore del contesto — una sessione già salvata con «» manda «{}» al fornitore e conserva «» nella storia viva', async (t) => {
  const storia = STORIA_VECCHIA();
  const { risultato, richieste } = await giroConChiamata(t, '{}', { messaggiIniziali: [...storia, { role: 'user', content: 'continua' }] });
  const inviata = richieste[0].messages.find((m) => m.tool_calls);
  assert.equal(inviata.tool_calls[0].function.arguments, '{}', 'il fornitore riceve JSON');
  const viva = risultato.messaggiFinali.find((m) => m.tool_calls && m.tool_calls[0].id === 'c1');
  assert.equal(viva.tool_calls[0].function.arguments, '', 'la storia salvata NON si riscrive: l’archivio ha il suo «» e deve combaciare');
});

test('ARGV-5: porta CON il motore — prepareProviderContext manda «{}» e non tocca l’ingresso', () => {
  const ingresso = STORIA_VECCHIA();
  const copia = structuredClone(ingresso);
  const { messages } = prepareProviderContext({ messages: ingresso, provider: 'openrouter', model: 'm' });
  assert.equal(messages.find((m) => m.tool_calls).tool_calls[0].function.arguments, '{}');
  assert.deepEqual(ingresso, copia, 'la storia in ingresso resta com’era');
});

test('ARGV-6: sul filo nativo una chiamata vecchia con «» non fa cadere il giro («Unexpected end of JSON input»)', () => {
  const nativi = toNativeMessages(STORIA_VECCHIA(), { provider: 'anthropic', model: 'm' });
  const parte = nativi.find((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((p) => p.type === 'tool-call')).content.find((p) => p.type === 'tool-call');
  assert.deepEqual(parte.input, {});
});

/* ── la RIPRESA del registro: la storia salvata con «» non è un JSON troncato ───────────────────────────────────── */
function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'k',
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto', nome: 'progetto' }], ...opzioni,
  });
}
function giriFinti() {
  const inputs = []; let risolvi = null; let onEvento = null;
  return {
    avviaSessioneFn: async (input) => { inputs.push(input); onEvento = input.onEvento; input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${inputs.length}` }); return new Promise((r) => { risolvi = r; }); },
    concludi(messaggiFinali) { onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${inputs.length}` }); risolvi({ esito: { messaggiFinali, comeFinita: 'concluso' } }); },
    get ultimo() { return inputs[inputs.length - 1]; },
  };
}
async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) { try { await attendiScritture({ cartellaStore }); } catch { /* la rimozione dirà il resto */ } await new Promise((r) => setImmediate(r)); }
}
const unTick = () => new Promise((r) => setTimeout(r, 0));

async function riprendi(storia) {
  const cartellaStore = cartellaDiProva('talos-argv-vuoti-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'elenca' });
    prima.concludi(storia);
    await svuota(cartellaStore);
    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    riavviato.resume(sessionId, 'continua');
    await unTick();
    return dopo.ultimo.messaggiIniziali;
  } finally { await svuota(cartellaStore); rimuoviCartellaDiProva(cartellaStore); }
}

test('ARGV-7: la ripresa NON riscrive in testo una chiamata senza argomenti: la storia attiva resta quella salvata', async () => {
  const storia = STORIA_VECCHIA();
  const iniziali = await riprendi(storia);
  assert.deepEqual(iniziali.slice(0, -1), storia, 'scambio nativo e accoppiato, identico all’archivio (altrimenti CTX_HISTORY_DIVERGED)');
  assert.equal(JSON.stringify(iniziali).includes('History recovery'), false);
});

test('ARGV-8: AL CONTRARIO — un JSON troncato («{») alla ripresa si cura ancora in testo, come prima', async () => {
  const storia = STORIA_VECCHIA();
  storia[2].tool_calls[0].function.arguments = '{';
  const iniziali = await riprendi(storia);
  assert.equal(JSON.stringify(iniziali).includes('History recovery'), true, 'la riparazione vera resta: un `{` a metà rimandato al fornitore è un 500 per sempre');
  assert.equal(iniziali.some((m) => m.tool_calls), false);
});
