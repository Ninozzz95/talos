/*
 * Giri in tondo (stress test of 0.5.0, 08/10/2026: the tester's model read AGENTS.md 130 times in 18 minutes; owner 09/10/2026
 * «Avvisa, poi chiede o ferma (Consigliata)»). The guard stopped only identical calls inside ONE answer. With
 * `guardiaGiriInTondo`: from the 2nd call with the same tool, the same arguments and the same result, and nothing changed in
 * between, the model gets a note instead of the repeated result; at the 5th the person is asked; a no (or nobody) ends the
 * turn with its reason. A call that changes something (a write, a command) resets the count. Without the option nothing changes
 * (the desktop decides for itself). Hermes agent/tool_guardrails.py (warn 2, block 5, identical results as a reference);
 * OpenCode session/processor.ts DOOM_LOOP_THRESHOLD = 3 with `doom_loop: "ask"`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const risposta = (delta, fine) => new Response(new ReadableStream({ start(c) {
  c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`));
  c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: fine }] })}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n')); c.close();
} }));
const chiama = (i, nome, argomenti) => risposta({ tool_calls: [{ index: 0, id: `call_${i}`, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }, 'tool_calls');

async function giro({ piano, guardia = true, risposte = [] }) {
  const cartella = cartellaDiProva('talos-giri-in-tondo-');
  writeFileSync(join(cartella, 'AGENTS.md'), 'rules\n');
  const richieste = []; const domande = []; let n = 0;
  const esito = await talosLavora({
    cartella, task: { consegna: 'work' }, modello: 'x', chiave: 'y', livelloAccesso: 'Full access',
    ...(guardia ? { guardiaGiriInTondo: true } : {}),
    onDelta: () => {},
    chiediApprovazioneFn: async (azione) => { domande.push(azione); return risposte.length ? risposte.shift() : false; },
    fetchDiRete: async (_url, init) => {
      richieste.push(JSON.parse(init.body)); const passo = piano[n]; n += 1;
      return passo ? chiama(n, passo[0], passo[1]) : risposta({ content: 'done' }, 'stop');
    },
  });
  const ultimiTool = (i) => richieste[i]?.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  return { esito, richieste, domande, ultimiTool };
}
const leggi = ['leggi', { percorso: 'AGENTS.md' }];

test('giri in tondo: the 2nd identical read with the same result gets a note, not the result again', async () => {
  const { ultimiTool } = await giro({ piano: [leggi, leggi] });
  assert.match(ultimiTool(1), /rules/u, 'the first read is the file');
  assert.match(ultimiTool(2), /same arguments/u, 'the second is the note');
});

test('giri in tondo: at the 5th the person is asked; no ends the turn with its reason', async () => {
  const { esito, domande, richieste } = await giro({ piano: [leggi, leggi, leggi, leggi, leggi, leggi, leggi] });
  assert.equal(domande.filter((d) => d.tipo === 'giri-in-tondo').length, 1);
  assert.equal(domande[0].volte, 5);
  assert.equal(esito.comeFinita, 'ripetizione');
  assert.match(esito.detto, /5 times/u);
  assert.equal(richieste.length, 5, 'no request after the stop');
});

test('giri in tondo: a yes lets the work go on and the count starts again', async () => {
  const { esito, domande } = await giro({ piano: [leggi, leggi, leggi, leggi, leggi, leggi, leggi], risposte: [true] });
  assert.equal(domande.length, 1, 'asked once: after the yes the count starts again');
  assert.equal(esito.comeFinita, 'concluso');
});

test('giri in tondo: a write in between is progress, and resets the count', async () => {
  const scrivi = (i) => ['scrivi', { percorso: `note${i}.txt`, contenuto: 'x' }];
  const { domande, esito } = await giro({ piano: [leggi, leggi, scrivi(1), leggi, leggi, scrivi(2), leggi, leggi, leggi] });
  assert.equal(domande.filter((d) => d.tipo === 'giri-in-tondo').length, 0);
  assert.equal(esito.comeFinita, 'concluso');
});

test('giri in tondo: without the option nothing changes (the desktop decides for itself)', async () => {
  const { ultimiTool, domande } = await giro({ piano: [leggi, leggi, leggi, leggi, leggi, leggi], guardia: false });
  assert.match(ultimiTool(2), /rules/u);
  assert.equal(domande.length, 0);
});

/*
 * R2 della review del desktop (09/10/2026), le due sequenze misurate da lui con `creaGuardiaGiriInTondo`: prima della cura
 * `leggi`+`shell ls` alternati davano [1,1,1,1,1,1] e lo stesso `shell cat` riuscito sei volte [0,0,0,0,0,0]. Una scrittura
 * NUOVA resta progresso (decisione owner «le chiamate che cambiano qualcosa azzerano», prova qui sopra).
 */
test('giri in tondo R2: a read alternated with the same successful command keeps counting', async () => {
  const { creaGuardiaGiriInTondo } = await import('../src/kernel/talosHarness.mjs');
  const g = creaGuardiaGiriInTondo(); const conti = [];
  for (let i = 0; i < 3; i += 1) {
    conti.push(g.osserva({ nome: 'leggi', argomenti: { percorso: 'AGENTS.md' }, esito: 'rules', progresso: false }));
    conti.push(g.osserva({ nome: 'shell', argomenti: { comando: 'ls' }, esito: 'a.txt', progresso: true }));
  }
  assert.deepEqual(conti, [1, 1, 1, 2, 2, 3], 'the replayed command is not progress the 2nd time');
});

test('giri in tondo R2: the same successful command with the same output counts like any other call', async () => {
  const { creaGuardiaGiriInTondo } = await import('../src/kernel/talosHarness.mjs');
  const g = creaGuardiaGiriInTondo();
  const conti = Array.from({ length: 6 }, () => g.osserva({ nome: 'shell', argomenti: { comando: 'cat AGENTS.md' }, esito: 'rules', progresso: true }));
  assert.deepEqual(conti, [1, 2, 3, 4, 5, 6]);
});

test('giri in tondo R2: in a real turn, the same `shell cat` five times asks the person', async () => {
  const cat = ['shell', { comando: 'echo rules' }];
  const { domande } = await giro({ piano: [cat, cat, cat, cat, cat, cat] });
  assert.equal(domande.filter((d) => d.tipo === 'giri-in-tondo').length, 1);
});
