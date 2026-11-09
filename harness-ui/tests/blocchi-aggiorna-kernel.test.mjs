/*
 * Scene 1+4 (FE-081, G-B), kernel: `blocco_aggiorna` is offered only with the catalog on and at least one block in the conversation, and
 * the model sees the blocks by name (`nome=bN`). With the catalog off nothing changes, byte for byte (C2). Ledger §2 G-B, UIG-1.7.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ATTREZZO_BLOCCO_AGGIORNA } from '../src/blocchi/aggiorna.mjs';
import { stimaToken } from '../src/blocchi/prompt-del-catalogo.mjs';
import { ATTREZZI_ESTESI_OPENAI, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TABELLA = readFileSync(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8').trim();
const CON_BLOCCO = [
  { role: 'system', content: 'sistema' },
  { role: 'user', content: 'una tabella' },
  { role: 'assistant', content: `Ecco:\n\`\`\`talos-blocco\n${TABELLA}\n\`\`\`` },
  { role: 'user', content: 'aggiungi aprile' },
];
const SENZA_BLOCCO = [
  { role: 'system', content: 'sistema' },
  { role: 'user', content: 'ciao' },
  { role: 'assistant', content: 'ciao a te' },
  { role: 'user', content: 'e ora?' },
];
const fine = (content = 'ok') => Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });

/* every request the kernel sends, and the calls of the host callback */
async function giro(ingresso = {}, risposte = []) {
  const richieste = [];
  const chiamate = [];
  const cartella = mkdtempSync(join(tmpdir(), 'talos-blocco-aggiorna-'));
  try {
    await talosLavora({
      cartella, task: { consegna: 'aggiungi aprile' }, modello: 'x', chiave: 'y', _giriMassimiInterno: risposte.length + 1,
      onAggiornaBlocco: async (input) => { chiamate.push(input); return { ok: true, blocco: input.blocco, versione: 2, tipo: 'tabella' }; },
      ...ingresso,
      fetchDiRete: async (_url, init) => {
        richieste.push(JSON.parse(init.body));
        const r = risposte[richieste.length - 1];
        return r ? Response.json(r) : fine();
      },
    });
  } finally { rimuoviCartellaDiProva(cartella); }
  return { richieste, chiamate };
}
const nomiDegliAttrezzi = (r) => (r.tools ?? []).map((t) => t.function?.name);

test('the tool is in ATTREZZI_ESTESI next to artifact_update, verbatim, and its weight is measured', () => {
  const nomi = ATTREZZI_ESTESI_OPENAI.map((a) => a.function.name);
  assert.equal(nomi.indexOf('blocco_aggiorna'), nomi.indexOf('artifact_update') + 1);
  const voce = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'blocco_aggiorna');
  assert.deepEqual(voce.function.parameters, ATTREZZO_BLOCCO_AGGIORNA.input_schema);
  const peso = stimaToken(JSON.stringify(voce));
  assert.equal(peso, 167, 'schema weight in the OpenAI form, measured 05/11 with stimaToken: the commit cites it');
});

test('UIG-1.7 null catalog with blocks: no tool, no nome=, the history byte for byte', async () => {
  const { richieste, chiamate } = await giro({ messaggiIniziali: CON_BLOCCO, catalogoBlocchi: null });
  assert.equal(nomiDegliAttrezzi(richieste[0]).includes('blocco_aggiorna'), false);
  const inviati = JSON.stringify(richieste[0].messages);
  assert.doesNotMatch(inviati, /nome=/u);
  assert.ok(inviati.includes(JSON.stringify(CON_BLOCCO[2].content)), 'the assistant message is sent as it was');
  assert.equal(chiamate.length, 0);
  /* even a host that names it among the extended tools does not get it without the catalog */
  const r2 = await giro({ messaggiIniziali: CON_BLOCCO, catalogoBlocchi: null, strumentiEstesi: ['blocco_aggiorna'] });
  assert.equal(nomiDegliAttrezzi(r2.richieste[0]).includes('blocco_aggiorna'), false);
});

test('UIG-1.7 catalog on with no blocks: no tool; with a block: tool offered and the block named', async () => {
  const senza = await giro({ messaggiIniziali: SENZA_BLOCCO, catalogoBlocchi: { clic: true } });
  assert.equal(nomiDegliAttrezzi(senza.richieste[0]).includes('blocco_aggiorna'), false);
  assert.doesNotMatch(JSON.stringify(senza.richieste[0].messages), /nome=/u);
  const con = await giro({ messaggiIniziali: CON_BLOCCO, catalogoBlocchi: { clic: true } });
  assert.ok(nomiDegliAttrezzi(con.richieste[0]).includes('blocco_aggiorna'));
  const assistente = con.richieste[0].messages.find((m) => m.role === 'assistant');
  assert.match(assistente.content, /```talos-blocco nome=b1\n/u);
  /* a child, a local model or a host without the callback: not offered */
  for (const ingresso of [{ agentRole: 'child' }, { modello: 'local:qualcosa' }, { onAggiornaBlocco: undefined }]) {
    const r = await giro({ messaggiIniziali: CON_BLOCCO, catalogoBlocchi: { clic: true }, ...ingresso });
    assert.equal(nomiDegliAttrezzi(r.richieste[0]).includes('blocco_aggiorna'), false, JSON.stringify(ingresso));
  }
});

test('the call reaches the host checked, and the model gets one line; an unknown name never reaches the host', async () => {
  const chiamata = (args, id) => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'blocco_aggiorna', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  const { richieste, chiamate } = await giro({ messaggiIniziali: CON_BLOCCO, catalogoBlocchi: { clic: true } }, [
    chiamata({ blocco: 'b1', modifiche: [{ vecchio: '["Marzo"]', nuovo: '["Marzo"], ["Aprile", 3]' }] }, 'c1'),
    chiamata({ blocco: 'b9', sorgente: TABELLA }, 'c2'),
    chiamata({ blocco: 'b1' }, 'c3'),
  ]);
  assert.deepEqual(chiamate, [{ blocco: 'b1', modifiche: [{ vecchio: '["Marzo"]', nuovo: '["Marzo"], ["Aprile", 3]' }] }]);
  const risultati = richieste.at(-1).messages.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.equal(risultati.length, 3);
  for (const r of risultati) assert.equal(r.includes('\n'), false);
  assert.deepEqual(JSON.parse(risultati[0]), { ok: true, blocco: 'b1', versione: 2, tipo: 'tabella' });
  assert.equal(JSON.parse(risultati[1]).codice, 'bloccoSconosciuto');
  assert.equal(JSON.parse(risultati[2]).codice, 'valoreNonValido');
});

/* ---- G-B2 (05/11/2026): names persisted with the message, the callback guard, k7 ---- */
const chiama = (args, id) => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'blocco_aggiorna', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const conBlocco = (testo = 'Nuova:') => ({ choices: [{ message: { role: 'assistant', content: `${testo}\n\`\`\`talos-blocco\n${TABELLA}\n\`\`\`` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
async function giroCompleto(ingresso = {}, risposte = []) {
  const annunci = [];
  const cartella = mkdtempSync(join(tmpdir(), 'talos-blocco-nomi-'));
  const richieste = [];
  let esito;
  try {
    esito = await talosLavora({
      cartella, task: { consegna: 'x' }, modello: 'x', chiave: 'y', _giriMassimiInterno: risposte.length + 1, catalogoBlocchi: { clic: true },
      onAggiornaBlocco: async (i) => ({ ok: true, blocco: i.blocco, versione: 2, tipo: 'tabella' }),
      onNomiDeiBlocchi: (a) => annunci.push(a),
      ...ingresso,
      fetchDiRete: async (_u, init) => { richieste.push(JSON.parse(init.body)); const r = risposte[richieste.length - 1]; return r ? Response.json(r) : fine(); },
    });
  } finally { rimuoviCartellaDiProva(cartella); }
  return { esito, annunci, richieste };
}
const nomiNellaStoria = (messaggi) => (messaggi ?? []).filter((m) => m.role === 'assistant' && typeof m.content === 'string').flatMap((m) => [...m.content.matchAll(/```talos-blocco[^\n]*nome=(b\d+)/gu)].map((x) => x[1]));

test('UIG-1.11 kernel: a block written by the model is stamped with the next name and announced; a regenerated turn never reuses it', async () => {
  const primo = await giroCompleto({ messaggiIniziali: CON_BLOCCO }, [conBlocco()]);
  assert.deepEqual(nomiNellaStoria(primo.esito.messaggiFinali), ['b1', 'b2'], 'the history block keeps b1, the new one is stamped b2');
  assert.deepEqual(primo.annunci.map((a) => a.nuovi.map((n) => n.nome)), [['b1'], ['b2']]);
  assert.equal(primo.annunci[1].prossimo, 3);
  assert.equal(primo.annunci[1].nuovi[0].sorgente, TABELLA, 'the raw body, which the frontend fingerprints');
  /* the regeneration is a fork of the prefix with the SOURCE counter (3): the new block is b3, b2 is never reused */
  const prefisso = primo.esito.messaggiFinali.slice(0, -1).filter((m) => m.role !== 'system');
  const rifatto = await giroCompleto({ messaggiIniziali: prefisso, prossimoNomeDeiBlocchi: 3 }, [conBlocco('Di nuovo:')]);
  assert.deepEqual(nomiNellaStoria(rifatto.esito.messaggiFinali), ['b1', 'b3']);
});

test('UIG-1.12 kernel: a reload of the stored history with its counter gives the same names, and nothing is announced again', async () => {
  const primo = await giroCompleto({ messaggiIniziali: CON_BLOCCO }, [conBlocco()]);
  const storia = [...primo.esito.messaggiFinali.filter((m) => m.role !== 'system'), { role: 'user', content: 'ancora' }];
  const ricaricato = await giroCompleto({ messaggiIniziali: storia, prossimoNomeDeiBlocchi: 3 });
  assert.deepEqual(nomiNellaStoria(ricaricato.esito.messaggiFinali), ['b1', 'b2']);
  assert.deepEqual(ricaricato.annunci, []);
  assert.ok(nomiDegliAttrezzi(ricaricato.richieste[0]).includes('blocco_aggiorna'));
});

test('UIG-1.13 kernel: a fork keeps its prefix names and the next block continues the counter; a block of this turn is updatable in the next round', async () => {
  const prefisso = [
    { role: 'system', content: 'sistema' }, { role: 'user', content: 'a' },
    { role: 'assistant', content: `A\n\`\`\`talos-blocco nome=b1\n${TABELLA}\n\`\`\`` }, { role: 'user', content: 'b' },
    { role: 'assistant', content: `B\n\`\`\`talos-blocco nome=b2\n${TABELLA}\n\`\`\`` }, { role: 'user', content: 'c' },
  ];
  const { esito, richieste } = await giroCompleto({ messaggiIniziali: prefisso, prossimoNomeDeiBlocchi: 5 }, [
    { choices: [{ message: { role: 'assistant', content: `C\n\`\`\`talos-blocco\n${TABELLA}\n\`\`\``, tool_calls: [{ id: 'k1', type: 'function', function: { name: 'blocco_aggiorna', arguments: JSON.stringify({ blocco: 'b2', sorgente: TABELLA }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    chiama({ blocco: 'b5', sorgente: TABELLA }, 'k2'),
  ]);
  assert.deepEqual(nomiNellaStoria(esito.messaggiFinali), ['b1', 'b2', 'b5']);
  const risultati = richieste.at(-1).messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content));
  assert.deepEqual(risultati.map((r) => r.ok), [true, true], 'b5, born in this turn, is a live name for the next round');
});

test('UIG-1.14 a host callback that throws or rejects becomes one erroreInterno line, and the turn completes', async () => {
  for (const onAggiornaBlocco of [() => { throw new Error('rotto'); }, async () => Promise.reject(new Error('rifiutato'))]) {
    const { esito, richieste } = await giroCompleto({ messaggiIniziali: CON_BLOCCO, onAggiornaBlocco }, [chiama({ blocco: 'b1', sorgente: TABELLA }, 'e1')]);
    const r = richieste.at(-1).messages.filter((m) => m.role === 'tool').map((m) => m.content);
    assert.equal(r.length, 1);
    assert.equal(r[0].includes('\n'), false);
    assert.equal(JSON.parse(r[0]).codice, 'erroreInterno');
    assert.ok(Array.isArray(esito.messaggiFinali), 'the turn completed');
  }
});

test('k7 the non-resume path sends the NAMED history, not the raw one', async () => {
  const { richieste } = await giroCompleto({ messaggiIniziali: CON_BLOCCO });
  const assistente = richieste[0].messages.find((m) => m.role === 'assistant');
  assert.match(assistente.content, /```talos-blocco nome=b1\n/u);
  assert.equal(richieste[0].messages.filter((m) => m.role === 'assistant').length, 1, 'the history is pushed once');
});

// ---- G-B3 (06/11/2026): the mutants s3, s5, s10 of the G-A review become tests ----
import { creaOspiteDeiBlocchi } from '../src/blocchi/aggiorna.mjs';

test('G-B3 s3 the host counter above the history wins: the next block takes it', async () => {
  const emessi = [];
  const ospite = creaOspiteDeiBlocchi({ stato: { prossimo: 7, storici: new Map(), correnti: {} }, emetti: (v) => emessi.push(v) });
  assert.equal(ospite.prossimoNomeDeiBlocchi, 7);
  const storia = CON_BLOCCO.map((m) => (m.role === 'assistant' ? { ...m, content: m.content.replace('```talos-blocco', '```talos-blocco nome=b1') } : m));
  const { esito } = await giroCompleto({ messaggiIniziali: storia, ...ospite }, [conBlocco()]);
  assert.deepEqual(nomiNellaStoria(esito.messaggiFinali), ['b1', 'b7']);
  assert.deepEqual(emessi.map((e) => e.blocco), ['b7']);
});

test('G-B3 s5 two block-bearing answers in ONE turn get different names', async () => {
  const conBloccoEAttrezzo = { choices: [{ message: { role: 'assistant', content: `Prima:\n\`\`\`talos-blocco\n${TABELLA}\n\`\`\``, tool_calls: [{ id: 'k1', type: 'function', function: { name: 'blocco_aggiorna', arguments: JSON.stringify({ blocco: 'b1', sorgente: TABELLA }) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  const { esito, annunci } = await giroCompleto({ messaggiIniziali: CON_BLOCCO }, [conBloccoEAttrezzo, conBlocco('Dopo:')]);
  const nomi = nomiNellaStoria(esito.messaggiFinali);
  assert.deepEqual(nomi, ['b1', 'b2', 'b3']);
  assert.deepEqual(annunci.flatMap((a) => a.nuovi.map((n) => n.nome)), ['b1', 'b2', 'b3']);
});

test('G-B3 s10 a local model never gets nome= stamped, and nothing is announced', async () => {
  const { richieste, annunci } = await giroCompleto({ messaggiIniziali: CON_BLOCCO, modello: 'local:qualcosa' }, [conBlocco()]);
  for (const r of richieste) for (const m of r.messages) assert.ok(!String(m.content ?? '').includes('nome=b'), 'no name in the history of a local model');
  assert.deepEqual(annunci, []);
});
