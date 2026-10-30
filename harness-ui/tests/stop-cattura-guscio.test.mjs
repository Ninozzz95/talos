/*
 * CAPTURE-NATIVO-05 passando dal GUSCIO desktop (talosHarness.desktop-hotfix.mjs), quello che gira davvero sul 4174 e nell'app: la sua
 * `capture` rilancia l'errore quando il giro è fermato (riga «Uno Stop resta uno Stop»), e il nucleo deve tenerlo per sé. Trovato dal
 * vivo il 29/10/2026 notte: un sotto-agente fermato a metà consegnava al padre «The active history differs from the archive…».
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('STOP-CATTURA-GUSCIO-01 Stop durante un attrezzo e capture del motore che fallisce: dal guscio il giro è «fermato», senza la frase interna', async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-stop-cattura-'));
  writeFileSync(join(c, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(c));
  const stop = new AbortController();
  let n = 0;
  const rete = async (_url, init) => {
    const body = JSON.parse(init.body);
    n += 1;
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (n === 1) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const divergenza = Object.assign(new Error('The active history differs from the archive. The originals are kept; the full version must be recovered.'), { code: 'CTX_HISTORY_DIVERGED' });
  const contextHooks = {
    capture: async ({ reason }) => { if (reason === 'tool-result' || reason === 'finished') { stop.abort(); throw divergenza; } },
    prepare: async ({ messages }) => ({ messages }),
  };
  let lanciato = null;
  let esito = null;
  try {
    esito = await talosLavora({ cartella: c, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete: rete,
      contestoDelProgetto: 'P', contextHooks, segnaleStop: stop.signal });
  } catch (errore) { lanciato = errore; }
  // uno Stop chiude il giro SUBITO (REV-B8-A4) — o con l'esito «fermato» o con un errore DI STOP — ma mai con l'errore dell'archivio
  if (lanciato) {
    assert.equal(lanciato.fermatoSuRichiesta, true, `è un errore di Stop, non della capture: ${lanciato.message}`);
    assert.doesNotMatch(String(lanciato.message), /differs from the archive/u);
  } else {
    assert.equal(esito.comeFinita, 'fermato');
    assert.doesNotMatch(JSON.stringify(esito), /differs from the archive/u);
  }
});
