/*
 * S4 della CLI (quarta revisione della 0.6.7, 16/10/2026): un Esc mentre TALOS contava la richiesta — dentro `contextHooks.prepare`,
 * cioè il conteggio dei token o l'attesa del motore del contesto — diceva «stopped on request: while the model was answering, at
 * round 1», ma il modello non era ancora stato chiamato. Ora la fase dice il vero: «before the request was sent». AL CONTRARIO: uno
 * Stop a richiesta partita dice ancora «while the model was answering». Kernel vero, fornitore finto, nessuna rete.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const interrotto = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

async function giro(t, { fermaNellaPreparazione, conInfer = true }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  let richieste = 0;
  const contextHooks = {
    prepare: async ({ messages }) => {
      if (fermaNellaPreparazione) { stop.abort(); throw interrotto(); } // Esc mentre si conta la richiesta
      return { messages };
    },
    ...(conInfer ? { infer: ({ signal }, operazione) => operazione(signal) } : {}), // il servizio del contesto ha `infer`
  };
  const fetchDiRete = async () => { richieste += 1; stop.abort(); throw interrotto(); }; // Esc mentre il modello risponde
  const esito = await talosLavora({
    cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, segnaleStop: stop.signal,
  });
  return { testo: JSON.stringify(esito), richieste };
}

test('FERMATA-INVIO-01 — Esc mentre si contava la richiesta: «before the request was sent», e nessuna richiesta al modello', async (t) => {
  const { testo, richieste } = await giro(t, { fermaNellaPreparazione: true });
  assert.equal(richieste, 0, 'premessa: il modello non è stato chiamato');
  assert.match(testo, /stopped on request: before the request was sent, at round 1\./u);
  assert.doesNotMatch(testo, /while the model was answering/u);
});

test('FERMATA-INVIO-02 — AL CONTRARIO: Esc a richiesta partita dice ancora «while the model was answering»', async (t) => {
  const { testo, richieste } = await giro(t, { fermaNellaPreparazione: false });
  assert.equal(richieste, 1);
  assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
});

test('FERMATA-INVIO-02b — AL CONTRARIO anche senza il gancio `infer` (la seconda strada del kernel)', async (t) => {
  const { testo, richieste } = await giro(t, { fermaNellaPreparazione: false, conInfer: false });
  assert.equal(richieste, 1);
  assert.match(testo, /stopped on request: while the model was answering, at round 1\./u);
});

test('FERMATA-INVIO-04 — Esc mentre si ri-prepara dopo un «contesto pieno» (il ritentativo): la richiesta nuova non era ancora partita', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  let richieste = 0;
  const fetchDiRete = async () => { richieste += 1; return new Response(JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 60000 tokens." } }), { status: 400, headers: { 'content-type': 'application/json' } }); };
  const contextHooks = { prepare: async ({ messages }) => ({ messages }), infer: async ({ signal }, operazione) => {
    try { return await operazione(signal); } catch { stop.abort(); throw interrotto(); } // come il ritentativo: Esc mentre si ri-prepara
  } };
  const esito = await talosLavora({ cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, segnaleStop: stop.signal });
  assert.equal(richieste, 1, 'premessa: la prima richiesta è partita ed è stata rifiutata');
  assert.match(JSON.stringify(esito), /stopped on request: before the request was sent, at round 1\./u);
});

test('FERMATA-INVIO-05 — Esc durante la capture INIZIALE: il giro finisce «stopped on request: before round 1», non lancia', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stop = new AbortController();
  let richieste = 0;
  const contextHooks = { capture: async ({ reason }) => { if (reason === 'start') { stop.abort(); throw interrotto(); } }, prepare: async ({ messages }) => ({ messages }) };
  const esito = await talosLavora({ cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: async () => { richieste += 1; throw interrotto(); }, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks, segnaleStop: stop.signal });
  assert.equal(richieste, 0);
  assert.match(JSON.stringify(esito), /stopped on request: before round 1\./u);
});

test('FERMATA-INVIO-06 — AL CONTRARIO: un errore vero della capture iniziale, senza Stop, passa com era', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-fermata-invio-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const contextHooks = { capture: async ({ reason }) => { if (reason === 'start') throw Object.assign(new Error('archivio rotto'), { code: 'CTX_STORE_BROKEN' }); }, prepare: async ({ messages }) => ({ messages }) };
  await assert.rejects(talosLavora({ cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: async () => { throw new Error('mai'); }, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0', contextHooks }), /archivio rotto/u);
});
