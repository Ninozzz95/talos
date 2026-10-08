import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as kernel from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * Unione CLI 01/10/2026 — C-005 (il no porta il motivo di chi ha risposto) + F4-03 (una scrittura fuori dalla cartella della
 * sessione chiede, e un no senza motivo dice al modello cosa fare). Le due cure toccavano la stessa riga di
 * `verificaPermessoScrittura`. Scelta: il motivo di chi ha risposto vince sempre (è il perché vero: la CLI non interattiva lo
 * conosce); senza motivo, la frase di F4-03; per ogni altra domanda, quella di sempre.
 */
const { talosLavora } = kernel;

function cartelle(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-unione-'));
  const progetto = join(radice, 'progetto'); mkdirSync(progetto);
  t.after(() => rimuoviCartellaDiProva(radice));
  return { radice, progetto };
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });

async function giro(progetto, chiamate, risposta) {
  let richiesta = 0;
  const risultato = await talosLavora({
    cartella: progetto, task: { consegna: 'Scrivi il file di prova.' }, modello: 'test', chiave: 'test', livelloAccesso: 'scrittura-progetto',
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: richiesta++ === 0 ? { role: 'assistant', content: null, tool_calls: chiamate } : { role: 'assistant', content: 'Fatto.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }) }),
    chiediApprovazioneFn: async () => risposta,
  });
  return (id) => risultato.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '';
}

test('UNIONE-C005-F403: un no col motivo, su una scrittura fuori dal progetto, dà al modello QUEL motivo', async (t) => {
  const { radice, progetto } = cartelle(t);
  const esito = await giro(progetto, [chiama('f', 'scrivi', { percorso: join(radice, 'fuori.txt'), contenuto: 'x' })],
    { approvato: false, motivo: 'la regola Write(./**) non copre questo percorso' });
  assert.match(esito('f'), /la regola Write\(\.\/\*\*\) non copre questo percorso/u);
  assert.doesNotMatch(esito('f'), /non è stata confermata/u, 'la frase di F4-03 non prende il posto del motivo vero');
  assert.equal(existsSync(join(radice, 'fuori.txt')), false, 'niente scritto fuori');
});

test('UNIONE-C005-F403 al contrario: un no senza motivo, fuori dal progetto, porta la frase di F4-03; altrove quella di sempre', async (t) => {
  const { radice, progetto } = cartelle(t);
  const esito = await giro(progetto, [chiama('f', 'scrivi', { percorso: join(radice, 'fuori.txt'), contenuto: 'x' })], false);
  assert.match(esito('f'), /writing outside the session folder was not confirmed/u);
  assert.doesNotMatch(esito('f'), /the owner did not approve/u);
  assert.equal(existsSync(join(radice, 'fuori.txt')), false);
});
