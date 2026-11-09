/*
 * Revisione del blocco dati, BD1 (S2): un id che il nucleo ha approvato lo vede anche il modello, nella storia. Riusato nel passo dopo apriva
 * di nuovo la porta: una seconda ricerca «della persona», o il «sì solo» per un attrezzo qualunque. Il sì vale per la chiamata che il nucleo ha
 * costruito, nel passo in cui l'ha costruita.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const risposta = (message, fine) => new Response(JSON.stringify({ choices: [{ message, finish_reason: fine }] }), { headers: { 'Content-Type': 'application/json' } });
const chiamata = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const idVisto = (corpo, prefisso) => corpo.messages.flatMap((m) => m.tool_calls ?? []).map((c) => c.id).find((i) => i?.startsWith(prefisso));

function cartella(t) {
  const radice = realpathSync(mkdtempSync(join(tmpdir(), 'talos-id-una-volta-')));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  mkdirSync(progetto);
  return progetto;
}

async function giroDellaPersona(t, { riusa, nome, argomenti, livelloAccesso, risposteCarta }) {
  const progetto = cartella(t);
  const carte = [], avviate = [];
  let passo = 0;
  await talosLavora({ cartella: progetto, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 5, livelloAccesso,
    fetchDiRete: async (_u, opzioni) => {
      passo += 1;
      if (passo === 1) return risposta(chiamata(riusa ? idVisto(JSON.parse(opzioni.body), 'persona-') : 'call_1', nome, argomenti), 'tool_calls');
      return risposta({ role: 'assistant', content: 'fatto' }, 'stop');
    },
    chiamataIniziale: { nome: 'research_start', argomenti: { question: 'domanda della persona', depth: 'quick' } },
    onRicercaAvvia: async (a) => { avviate.push(a); return { ricercaId: `r${avviate.length}`, stato: 'avviata' }; },
    chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return risposteCarta; } });
  return { progetto, carte, avviate };
}

test('BD1-01 (K6): il modello che riusa l id della persona non fa partire una seconda ricerca senza carta', async (t) => {
  const { carte, avviate } = await giroDellaPersona(t, { riusa: true, nome: 'research_start', argomenti: { question: 'spesa non chiesta', depth: 'exhaustive' }, livelloAccesso: 'accesso-pieno', risposteCarta: false });
  assert.equal(avviate.length, 1, 'parte solo la ricerca della persona');
  assert.deepEqual(carte, ['research_start'], 'la seconda passa dalla sua carta');
});

test('BD1-02 (K8): il sì solo non copre un altro attrezzo: con l id riusato si chiede come con uno nuovo', async (t) => {
  const argomenti = { percorso: 'creato.txt', contenuto: 'x' };
  const nuovo = await giroDellaPersona(t, { riusa: false, nome: 'scrivi', argomenti, livelloAccesso: 'su-richiesta', risposteCarta: false });
  const riusato = await giroDellaPersona(t, { riusa: true, nome: 'scrivi', argomenti, livelloAccesso: 'su-richiesta', risposteCarta: false });
  assert.deepEqual(nuovo.carte, ['scrivi']);
  assert.deepEqual(riusato.carte, ['scrivi']);
  assert.equal(existsSync(join(riusato.progetto, 'creato.txt')), false);
});

test('BD1-03: al contrario, la chiamata della persona parte da sola, senza carta e senza un secondo sì', async (t) => {
  const progetto = cartella(t);
  const avviate = [], carte = [];
  await talosLavora({ cartella: progetto, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'su-richiesta',
    fetchDiRete: async () => risposta({ role: 'assistant', content: 'fatto' }, 'stop'),
    chiamataIniziale: { nome: 'research_start', argomenti: { question: 'domanda della persona', depth: 'quick' } },
    onRicercaAvvia: async (a) => { avviate.push(a); return { ricercaId: 'r1', stato: 'avviata' }; },
    chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return false; } });
  assert.equal(avviate.length, 1);
  assert.deepEqual(carte, []);
});

test('BD1-04: anche l id di una chiamata scritta come testo vale una volta: approvata la lettura, la scrittura con lo stesso id chiede', async (t) => {
  const progetto = cartella(t);
  writeFileSync(join(progetto, 'a.txt'), 'x\n');
  const enc = new TextEncoder();
  const sse = (...righe) => new Response(new ReadableStream({ start(c) { for (const r of [...righe, '[DONE]']) c.enqueue(enc.encode(`data: ${typeof r === 'string' ? r : JSON.stringify(r)}\n\n`)); c.close(); } }));
  const carte = [];
  let passo = 0;
  await talosLavora({ cartella: progetto, task: { consegna: 'leggi a.txt' }, modello: 'ollama:llama3', chiave: 'k', giriMassimi: 5, livelloAccesso: 'su-richiesta', personaPresenteFn: () => true, promuoviDalTesto: true, onDelta: () => {},
    fetchDiRete: async (_u, opzioni) => {
      passo += 1;
      if (passo === 1) return sse({ choices: [{ delta: { content: 'Leggo:leggi<arg_key>percorso</arg_key><arg_value>a.txt</arg_value></tool_call>' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      const id = idVisto(JSON.parse(opzioni.body), 'daTesto-');
      if (passo === 2) return sse({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'creato.txt', contenuto: 'x' }) } }] } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
      return sse({ choices: [{ delta: { content: 'Fatto.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] });
    },
    chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return a.tipo === 'chiamata-dal-testo'; } });
  assert.deepEqual(carte, ['chiamata-dal-testo', 'scrivi']);
  assert.equal(existsSync(join(progetto, 'creato.txt')), false);
});
