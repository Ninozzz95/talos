/*
 * ⛔ F-E-001 (CLI, triage della corsa 0.6.14 del 26/10/2026, riproduttore `repro-fe001.mjs`): `shell` senza `comando`, o con soli
 *   spazi, PARTIVA — sotto Windows `cmd /c ""` esce 0 e il modello leggeva «exit 0» come un comando riuscito. Gli altri attrezzi
 *   dicono già «manca l'argomento» (`messaggioArgomentiAssenti`: `leggi`/`scrivi` senza `percorso`, `file_edit` senza `old_string`):
 *   qui la stessa forma, e non parte niente — nessun permesso chiesto, nessun processo, nessuna ricevuta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const chiamata = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: argomenti } });
const rispostaDi = (message) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message }] }), text: async () => '' });

async function giroShell(t, argomenti) {
  const cartella = mkdtempSync(join(tmpdir(), 'shell-vuoto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'a.txt'), 'alpha');
  const eventi = [];
  let conta = 0;
  let domande = 0;
  const risultato = await talosLavora({
    cartella, task: { consegna: 'esegui' }, modello: 'x', chiave: 'y', livelloAccesso: 'accesso-pieno',
    chiediApprovazioneFn: async () => { domande += 1; return { approvato: true }; },
    onGiro: (e) => eventi.push(e),
    fetchDiRete: async () => rispostaDi(conta++ ? { role: 'assistant', content: 'fatto' } : { role: 'assistant', content: null, tool_calls: [chiamata('c1', 'shell', argomenti)] }),
  });
  return { esito: String(risultato.messaggiFinali.find((m) => m.role === 'tool')?.content ?? ''), eventi, domande };
}

for (const [nome, argomenti] of [['senza argomenti', ''], ['oggetto vuoto', '{}'], ['comando di soli spazi', '{"comando":"   "}'], ['alias command vuoto', JSON.stringify({ command: '\n\t' })]]) {
  test(`SHELL-VUOTO-01 ${nome}: non parte niente, e il modello legge «manca il comando»`, async (t) => {
    const { esito, eventi, domande } = await giroShell(t, argomenti);
    assert.match(esito, /Nothing was run: no command was given/u, esito.slice(0, 200));
    assert.doesNotMatch(esito, /^exit /mu, 'un «exit N» direbbe che un comando è girato');
    assert.equal(domande, 0, 'nessuna domanda di permesso per una chiamata che non può fare niente');
    assert.equal(eventi.filter((e) => e?.tipo === 'ricevuta').length, 0, 'nessuna ricevuta: non è successo niente');
  });
}

/* Revisione blocco 4 (B-1): un `comando` che non è testo faceva leggere al modello un guasto interno di JavaScript */
for (const [nome, argomenti] of [['un numero', '{"comando":42}'], ['la lista alla Codex', JSON.stringify({ command: ['bash', '-lc', 'echo x'] })],
  ['un oggetto', '{"cmd":{"riga":"ls"}}'], ['un booleano', '{"comando":true}']]) {
  test(`SHELL-VUOTO-03 ${nome}: non parte niente, e il modello legge che il comando va dato come testo`, async (t) => {
    const { esito, eventi, domande } = await giroShell(t, argomenti);
    assert.match(esito, /Nothing was run: `comando` must be the whole command line as ONE string/u, esito.slice(0, 200));
    assert.doesNotMatch(esito, /is not a function/u, 'mai un guasto interno al modello');
    assert.equal(domande, 0);
    assert.equal(eventi.filter((e) => e?.tipo === 'ricevuta').length, 0);
  });
}

test('SHELL-VUOTO-02 AL CONTRARIO: un comando vero gira come prima', async (t) => {
  const { esito } = await giroShell(t, JSON.stringify({ comando: 'echo ciao-shell' }));
  assert.match(esito, /^exit 0/mu, esito.slice(0, 200));
  assert.match(esito, /ciao-shell/u);
});
