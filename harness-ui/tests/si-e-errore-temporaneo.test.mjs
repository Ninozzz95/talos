/*
 * Domanda di Performance sul blocco del gettone (03/11/2026): «il sì che vale un passo» (BD1, `approvateDalTesto` e l'id della persona si azzerano a ogni passo).
 * Lo stesso passo ripetuto dopo un errore temporaneo chiede una seconda carta? Risposta misurata:
 *   · il fornitore cade (429, 503): il ritento sta DENTRO il passo, la carta non si ripresenta (SI-TEMP-01);
 *   · la partenza della ricerca che cade sulla rete: il percorso vero non lo produce. `research-orchestrator.mjs` `avvia` scrive su disco e `costruisciPiano` inghiotte gli
 *     errori del pianificatore; la CLI non ha `onRicercaAvvia`. La prima cura riportava il sì al passo dopo, e la revisione avversaria (R3) ha provato il suo costo: un id
 *     scelto dal modello entrava fra quelli approvati e un comando partiva senza carta. Il sì riportato è stato TOLTO: una ripetizione è una chiamata nuova e chiede.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const risposta = (message, fine) => new Response(JSON.stringify({ choices: [{ message, finish_reason: fine }] }), { headers: { 'Content-Type': 'application/json' } });
const chiamata = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const GUASTO_DI_RETE = () => Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET' });
const DOMANDA = { question: 'domanda della persona', depth: 'quick' };

function cartella(t) {
  const radice = realpathSync(mkdtempSync(join(tmpdir(), 'talos-si-temporaneo-')));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  mkdirSync(progetto);
  return progetto;
}

test('SI-TEMP-01: il fornitore cade prima e dopo una chiamata scritta come testo: il ritento sta nel passo, una carta sola', async (t) => {
  const progetto = cartella(t);
  writeFileSync(join(progetto, 'a.txt'), 'x\n');
  const enc = new TextEncoder();
  const sse = (...righe) => new Response(new ReadableStream({ start(c) { for (const r of [...righe, '[DONE]']) c.enqueue(enc.encode(`data: ${typeof r === 'string' ? r : JSON.stringify(r)}\n\n`)); c.close(); } }));
  const guasto = () => new Response('occupato', { status: 503, headers: { 'retry-after': '0' } });
  const carte = [];
  let passo = 0;
  await talosLavora({ cartella: progetto, task: { consegna: 'leggi a.txt' }, modello: 'ollama:llama3', chiave: 'k', giriMassimi: 6, livelloAccesso: 'su-richiesta', promuoviDalTesto: true, personaPresenteFn: () => true, onDelta: () => {},
    fetchDiRete: async () => {
      passo += 1;
      if (passo === 1 || passo === 3) return guasto();
      if (passo === 2) return sse({ choices: [{ delta: { content: 'Leggo:leggi<arg_key>percorso</arg_key><arg_value>a.txt</arg_value></tool_call>' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      return sse({ choices: [{ delta: { content: 'Fatto.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] });
    },
    chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return true; } });
  assert.ok(passo >= 4, `il fornitore è stato richiamato: ${passo}`);
  assert.deepEqual(carte, ['chiamata-dal-testo']);
});

test('SI-TEMP-02: una ricerca ripetuta dal modello dopo un guasto è una chiamata nuova e chiede: nessun sì passa da un passo all altro', async (t) => {
  const progetto = cartella(t);
  const carte = [], avviate = [];
  let passo = 0;
  await talosLavora({ cartella: progetto, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 6, livelloAccesso: 'su-richiesta',
    fetchDiRete: async () => {
      passo += 1;
      return passo === 1 ? risposta(chiamata('call_1', 'research_start', DOMANDA), 'tool_calls') : risposta({ role: 'assistant', content: 'fatto' }, 'stop');
    },
    chiamataIniziale: { nome: 'research_start', argomenti: DOMANDA },
    onRicercaAvvia: async (a) => { avviate.push(a); if (avviate.length === 1) throw GUASTO_DI_RETE(); return { ricercaId: 'r2', stato: 'avviata' }; },
    chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return false; } });
  assert.equal(avviate.length, 1, 'al no della carta la seconda non parte');
  assert.deepEqual(carte, ['research_start']);
});

test('SI-TEMP-10 (R3 della revisione): un comando accanto a una ricerca, al passo dopo un guasto, chiede la sua carta, con id uguali e con id diversi', async (t) => {
  for (const [idRicerca, idComando] of [['dup', 'dup'], ['uno', 'due']]) {
    const progetto = cartella(t);
    const carte = [];
    let passo = 0, avviate = 0;
    await talosLavora({ cartella: progetto, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 6, livelloAccesso: 'su-richiesta',
      fetchDiRete: async () => {
        passo += 1;
        if (passo === 1) return risposta(chiamata('call_1', 'research_start', DOMANDA), 'tool_calls');
        if (passo === 2) {
          return risposta({ role: 'assistant', content: null, tool_calls: [chiamata(idRicerca, 'research_start', DOMANDA).tool_calls[0], chiamata(idComando, 'shell', { comando: 'echo fatto' }).tool_calls[0]] }, 'tool_calls');
        }
        return risposta({ role: 'assistant', content: 'fatto' }, 'stop');
      },
      onRicercaAvvia: async () => { avviate += 1; if (avviate === 1) throw GUASTO_DI_RETE(); return { ricercaId: 'r2', stato: 'avviata' }; },
      chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return a.tipo !== 'shell'; } });
    assert.ok(carte.includes('shell'), `${idRicerca}/${idComando}: il comando deve chiedere, carte: ${carte.join(', ')}`);
  }
});
