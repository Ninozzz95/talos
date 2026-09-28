/*
 * kernel-letture-sezioni.test.mjs — decisione owner 27/09 (memoria `decisioni-owner-capacita-sezioni-27-09`): nel kernel,
 *   gli attrezzi nuovi di lettura passano da `onLetturaSezione`, e le memorie entrano nel prompt di una sessione NUOVA (mai
 *   in una ripresa, mai a una figlia). Il collaudo dell'owner: «se in una chat dico "d'ora in poi parla sempre in linguaggio
 *   pirata", la chat nuova deve seguire quella memoria».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ATTREZZI_LETTURA_SEZIONI, talosLavora } from '../src/kernel/talosHarness.mjs';

function reteDiRisposte(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (url, opzioni) => {
      const indice = chiamate.length;
      chiamate.push({ url, corpo: JSON.parse(opzioni.body) });
      const scelta = risposte[Math.min(indice, risposte.length - 1)];
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
    },
  };
}
const TASK = { consegna: 'un compito qualunque, per la prova' };
const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamata = (nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const NUOVI = ['memory_list', 'notes_search', 'notes_read', 'tasks_search', 'research_search', 'conversation_search'];
const PIRATA = 'MEMORY — what the person asked TALOS to remember: 1 of 1, most recently updated first.\n- Lingua: d\'ora in poi parla sempre in linguaggio pirata (id m1)';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-letture-sezioni-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}

test('LETTURE-SEZIONI-01 — i sei attrezzi nuovi sono offerti se nominati, e sono gli stessi del canale', async (t) => {
  assert.deepEqual([...ATTREZZI_LETTURA_SEZIONI].sort(), [...NUOVI].sort());
  const rete = reteDiRisposte(FINE);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: NUOVI });
  const nomi = rete.chiamate[0].corpo.tools.map((a) => a.function.name);
  for (const nome of NUOVI) assert.ok(nomi.includes(nome), nome);
});

test('LETTURE-SEZIONI-02 — ogni attrezzo nuovo passa da onLetturaSezione con nome e argomenti veri; il testo torna al modello', async (t) => {
  for (const nome of NUOVI) {
    const ricevute = [];
    const rete = reteDiRisposte(chiamata(nome, { query: 'pirata', id: 'n1' }), FINE);
    await talosLavora({
      cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, strumentiEstesi: [nome],
      onLetturaSezione: async (n, a) => { ricevute.push([n, a]); return `esito di ${n}`; },
    });
    assert.deepEqual(ricevute, [[nome, { query: 'pirata', id: 'n1' }]]);
    const esito = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool');
    assert.equal(esito.content, `esito di ${nome}`);
  }
});

test('LETTURE-SEZIONI-03 — AL CONTRARIO: senza canale lo dice; un canale che lancia dà un «failed» onesto', async (t) => {
  const senza = reteDiRisposte(chiamata('memory_list', {}), FINE);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: senza.fetch, strumentiEstesi: ['memory_list'] });
  assert.match(senza.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content, /^memory_list is not configured on this harness/u);
  const rotto = reteDiRisposte(chiamata('notes_read', { id: 'x' }), FINE);
  await talosLavora({
    cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rotto.fetch, strumentiEstesi: ['notes_read'],
    onLetturaSezione: async () => { throw new Error('negozio illeggibile'); },
  });
  assert.equal(rotto.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content, 'notes_read failed: negozio illeggibile');
});

test('LETTURE-SEZIONI-04 — la memoria «pirata» entra nel prompt di una sessione NUOVA, dopo le istruzioni e prima della consegna', async (t) => {
  const rete = reteDiRisposte(FINE);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, memorieNelPrompt: PIRATA });
  const messaggi = rete.chiamate[0].corpo.messages;
  const i = messaggi.findIndex((m) => m.role === 'system' && m.content === PIRATA);
  assert.ok(i > 0, 'il blocco delle memorie c’è');
  assert.equal(messaggi[i + 1].role, 'user', 'subito prima della consegna');
  assert.equal(messaggi[0].role, 'system');
});

test('LETTURE-SEZIONI-05 — AL CONTRARIO: niente memorie a una figlia, in una ripresa, o se il blocco è vuoto', async (t) => {
  const figlia = reteDiRisposte(FINE);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: figlia.fetch, memorieNelPrompt: PIRATA, agentRole: 'child' });
  assert.ok(!figlia.chiamate[0].corpo.messages.some((m) => String(m.content).includes('linguaggio pirata')), 'la figlia no');
  const ripresa = reteDiRisposte(FINE);
  await talosLavora({
    cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: ripresa.fetch, memorieNelPrompt: PIRATA,
    messaggiIniziali: [{ role: 'system', content: 'istruzioni di allora' }, { role: 'user', content: 'ciao' }],
  });
  assert.ok(!ripresa.chiamate[0].corpo.messages.some((m) => String(m.content).includes('linguaggio pirata')), 'la ripresa no');
  const vuota = reteDiRisposte(FINE);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: vuota.fetch, memorieNelPrompt: '   ' });
  const senza = reteDiRisposte(FINE);
  await talosLavora({ cartella: cartella(t), task: TASK, modello: 'x', chiave: 'y', fetchDiRete: senza.fetch });
  assert.equal(vuota.chiamate[0].corpo.messages.length, senza.chiamate[0].corpo.messages.length, 'un blocco vuoto non aggiunge niente');
});
