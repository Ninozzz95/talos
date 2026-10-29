/*
 * R-01 (2) (Performance 29/10/2026, glm-5.3-flash; OK della CLI): con NESSUNO davanti la nota delle chiamate identiche diceva «at the
 *   5th the person is asked» — falso, alla 5ª il giro si ferma. Dalla 3ª la nota ha un testo suo, stabile, che dice il vero e chiede di
 *   cambiare strada. Con una persona davanti non cambia niente; l'esito alla 5ª resta `ripetizione` (la CLI lo mappa su
 *   REPEATED_TOOL_CALL); il modello di testo «⛔ Discarded: …» delle copie nella stessa risposta non si tocca.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { notaGiriInTondo, talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const risposta = (delta, fine) => new Response(new ReadableStream({ start(c) {
  c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`));
  c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: fine }] })}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n')); c.close();
} }));
const chiama = (i, nome, argomenti) => risposta({ tool_calls: [{ index: 0, id: `call_${i}`, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] }, 'tool_calls');

async function giro({ nessunoDavanti }) {
  const cartella = cartellaDiProva('talos-r01-terza-');
  writeFileSync(join(cartella, 'AGENTS.md'), 'rules\n');
  const richieste = []; let n = 0;
  const leggi = ['leggi', { percorso: 'AGENTS.md' }];
  const piano = [leggi, leggi, leggi, leggi, leggi, leggi];
  const esito = await talosLavora({
    cartella, task: { consegna: 'work' }, modello: 'x', chiave: 'y', livelloAccesso: 'Full access', guardiaGiriInTondo: true,
    ...(nessunoDavanti ? { nessunoDavanti: true } : { chiediApprovazioneFn: async () => false }),
    onDelta: () => {},
    fetchDiRete: async (_url, init) => {
      richieste.push(JSON.parse(init.body)); const passo = piano[n]; n += 1;
      return passo ? chiama(n, passo[0], passo[1]) : risposta({ content: 'done' }, 'stop');
    },
  });
  const tool = (i) => richieste[i]?.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  return { esito, tool };
}

const TERZA = '[TALOS: this is call 3 of "cerca" with the same arguments, and the result is the same as before, with nothing changed in between.'
  + ' Nobody can answer in this session: at the 5th identical call this turn stops. Change the arguments, use another tool, or answer with what'
  + ' you already have.]';

test('R01-T-01 il testo stabile della 3ª con nessuno davanti (quello che la CLI prova), e il prefisso di sempre', () => {
  assert.equal(notaGiriInTondo('cerca', 3, 'x'.repeat(600), { nessunoDavanti: true }), TERZA);
  assert.match(notaGiriInTondo('cerca', 4, 'x'.repeat(600), { nessunoDavanti: true }), /^\[TALOS: this is call 4 of "cerca" with the same arguments.*Nobody can answer/u);
  // al contrario: la 2ª con nessuno davanti e ogni chiamata con una persona restano come prima
  for (const [volte, opz] of [[2, { nessunoDavanti: true }], [3, {}], [4, { nessunoDavanti: false }]]) {
    assert.match(notaGiriInTondo('cerca', volte, 'x'.repeat(600), opz), /at the 5th the person is asked whether to go on\.\]$/u);
  }
});

test('R01-T-02 nel giro, con nessuno davanti: 2ª nota di sempre, dalla 3ª quella nuova, alla 5ª il giro si ferma con «ripetizione»', async () => {
  const { esito, tool } = await giro({ nessunoDavanti: true });
  assert.match(tool(2), /at the 5th the person is asked/u, 'la 2ª');
  assert.match(tool(3), /Nobody can answer in this session: at the 5th identical call this turn stops\./u, 'la 3ª');
  assert.match(tool(4), /^\[TALOS: this is call 4 of "leggi".*Nobody can answer/u, 'la 4ª');
  assert.equal(esito.comeFinita, 'ripetizione', 'l\'esito alla 5ª non cambia nome');
});

test('R01-T-03 AL CONTRARIO: con una persona davanti la 3ª e la 4ª dicono ancora che alla 5ª le si chiede', async () => {
  const { esito, tool } = await giro({ nessunoDavanti: false });
  for (const i of [2, 3, 4]) {
    assert.match(tool(i), /at the 5th the person is asked whether to go on\./u);
    assert.doesNotMatch(tool(i), /Nobody can answer/u);
  }
  assert.equal(esito.comeFinita, 'ripetizione', 'il no della persona chiude come prima');
});
