/*
 * Ritocco di Performance sul blocco del gettone (03/11/2026): `aiutoDisponibile()` stava dentro `filterBaseTools` e guardava il disco a ogni passata.
 * L'elenco degli attrezzi si ricostruisce a giro vivo (il sì al piano, il livello cambiato): se la guida spariva lì, spariva un attrezzo in mezzo al giro e
 * la cache del fornitore cadeva con lui. Si legge una volta all'inizio del giro. Hermes tiene stabile il prefisso per la stessa ragione (`run_agent.py:1221`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { NOME_AIUTO } from '../src/kernel/aiuto-talos.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function giroConPiano(t, disponibile) {
  const c = mkdtempSync(join(tmpdir(), 'talos-aiuto-giro-'));
  t.after(() => rimuoviCartellaDiProva(c));
  let n = 0;
  const offerti = [];
  await talosLavora({
    cartella: c, task: { consegna: 'pianifica' }, modello: 'x', chiave: 'y', modalitaOperativa: 'piano', strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI, 'present_plan'],
    aiutoTalos: { rispondi: async () => 'pagina', disponibile },
    presentaPianoFn: async () => ({ decisione: 'procedi-con-conferma', livelloAccesso: 'su-richiesta' }),
    fetchDiRete: async (_u, init) => {
      offerti.push(JSON.parse(init.body).tools.map((a) => a.function.name));
      n += 1;
      const message = n === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'p1', type: 'function', function: { name: 'present_plan', arguments: JSON.stringify({ plan: '# Piano\n\n1. fare la cosa\n2. provarla\n' }) } }] }
        : { role: 'assistant', content: 'fatto' };
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
    },
  });
  return offerti;
}

test('AIUTO-GIRO-01: la guida sparita a giro vivo non toglie l attrezzo: si guarda una volta sola, all inizio del giro', async (t) => {
  let viste = 0;
  const offerti = await giroConPiano(t, () => { viste += 1; return viste === 1; });
  assert.equal(offerti.length, 2, 'il giro ha due passi: il piano, e il lavoro dopo il sì');
  assert.equal(viste, 1, 'il disco si guarda una volta');
  assert.ok(offerti[0].includes(NOME_AIUTO));
  assert.ok(offerti[1].includes(NOME_AIUTO), 'dopo il sì al piano la lista si ricostruisce: la guida resta');
});

test('AIUTO-GIRO-02: al contrario, una guida assente all inizio del giro resta assente anche dopo il sì al piano', async (t) => {
  const offerti = await giroConPiano(t, () => false);
  assert.equal(offerti.length, 2);
  assert.ok(!offerti[0].includes(NOME_AIUTO));
  assert.ok(!offerti[1].includes(NOME_AIUTO));
});
