/*
 * D7 del Tester (blocco 25, 02/11/2026): un'immagine mandata a un modello locale che non vede non dà nessun avviso, e il modello risponde
 *   «non posso vedere». Letto il 04/11: a ogni giro con la persona davanti il nucleo accoda alla richiesta note `system` non salvate (le
 *   istruzioni di Ask, la nota della lingua, quella del Piano: `talosHarness.mjs`, `noteInCoda`). `immaginiPerUnModelloSenzaVista`
 *   cercava l'ingresso «di adesso» dall'ultimo messaggio e si fermava al primo che non è `user` né `tool`: con una nota in coda la foto
 *   appena mandata contava come vecchia, diventava la riga di testo e nessuno rifiutava.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RIGA_AL_POSTO_DELL_IMMAGINE, immaginiPerUnModelloSenzaVista } from '../src/immagini-senza-vista.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';

const IMMAGINE = { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } };
const NOTA = { role: 'system', content: 'Ask instructions: use ask_user_question when a decision is needed.' };

test('D7-01 — la foto appena mandata resta «nuova» anche con note di sistema in coda alla richiesta', () => {
  const messaggi = [{ role: 'system', content: 'base' }, { role: 'user', content: [{ type: 'text', text: 'guarda' }, IMMAGINE] }, NOTA, { role: 'developer', content: 'lingua' }];
  const r = immaginiPerUnModelloSenzaVista(messaggi);
  assert.deepEqual([r.immagini, r.nuove], [true, true]);
  assert.equal(r.messaggi[1].content[1], IMMAGINE, 'non diventa la riga: è l\'adattatore che la rifiuta');
});

test('D7-02 — anche il risultato di un attrezzo con un\'immagine, seguito da una nota in coda, è «nuovo»', () => {
  const messaggi = [{ role: 'user', content: 'apri' }, { role: 'assistant', content: null, tool_calls: [{ id: 'c' }] }, { role: 'tool', tool_call_id: 'c', content: [IMMAGINE] }, NOTA];
  assert.equal(immaginiPerUnModelloSenzaVista(messaggi).nuove, true);
});

test('D7-03 — AL CONTRARIO: una foto vecchia resta vecchia anche con una nota in coda, e diventa la riga', () => {
  const messaggi = [{ role: 'user', content: [{ type: 'text', text: 'guarda' }, IMMAGINE] }, { role: 'assistant', content: 'un gatto' }, { role: 'user', content: 'e adesso?' }, NOTA];
  const r = immaginiPerUnModelloSenzaVista(messaggi);
  assert.deepEqual([r.immagini, r.nuove], [true, false]);
  assert.deepEqual(r.messaggi[0].content[1], { type: 'text', text: RIGA_AL_POSTO_DELL_IMMAGINE });
});

test('D7-04 — AL CONTRARIO: una nota di sistema in MEZZO (prima della risposta del modello) non rende nuova una foto vecchia', () => {
  const messaggi = [{ role: 'user', content: [IMMAGINE] }, NOTA, { role: 'assistant', content: 'visto' }, { role: 'user', content: 'ok' }, NOTA];
  assert.equal(immaginiPerUnModelloSenzaVista(messaggi).nuove, false);
});

test('D7-05 — la strada vera del guscio: foto appena mandata e nota in coda, modello senza vista ⇒ rifiuto prima della rete', async () => {
  let inviato = null;
  const messaggi = [{ role: 'system', content: 'base' }, { role: 'user', content: [{ type: 'text', text: 'guarda' }, IMMAGINE] }, NOTA];
  const adapter = createOwnerRuntimeAdapter({
    modulePath: `${process.cwd()}/runtime-image-fixture.mjs`,
    importFn: async () => ({ talosLavora: async (input) => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'local:lfm2', messages: messaggi, stream: false }) }) }),
    resolveImagesFn: async (m) => m,
    modelCapabilityFn: async () => ({ inputModalities: ['text'] }),
  });
  const giro = adapter.talosLavora({ fetchDiRete: async (_url, init) => { inviato = JSON.parse(init.body); return new Response('{}', { status: 200 }); } });
  await assert.rejects(giro, (e) => e?.code === 'MODEL_IMAGE_NOT_SUPPORTED');
  assert.equal(inviato, null, 'niente è arrivato alla rete');
});

/* Revisione avversaria di D7 del Desktop (04/11/2026, REVISIONE-D7-MOTORE-2026-11-04.md): L06, L11, L13, L14 dalla sua sonda. */
const RIGA = { type: 'text', text: RIGA_AL_POSTO_DELL_IMMAGINE };
const DEV = { role: 'developer', content: 'dev' };

test('D7-L06 — compattazione: riassunto come user, poi la foto nuova, il preambolo salvato e due note in coda', () => {
  const m = [{ role: 'system', content: 'base' }, { role: 'user', content: 'Riassunto: ...' }, { role: 'assistant', content: 'ok' },
    { role: 'user', content: [IMMAGINE] }, { role: 'system', content: 'preambolo aggiornato' }, NOTA, DEV];
  assert.equal(immaginiPerUnModelloSenzaVista(m).nuove, true);
});

test('D7-L11 — AL CONTRARIO: dopo la risposta del modello solo note, niente di nuovo (la risposta resta un confine)', () => {
  const m = [{ role: 'user', content: [IMMAGINE] }, { role: 'assistant', content: 'visto' }, NOTA, DEV];
  const r = immaginiPerUnModelloSenzaVista(m);
  assert.equal(r.nuove, false);
  assert.deepEqual(r.messaggi[0].content, [RIGA]);
});

test('D7-L13 — reperto R1: una nota developer IN CODA che porta una immagine non parte intatta verso un modello senza vista', () => {
  const m = [{ role: 'user', content: 'ciao' }, { role: 'developer', content: [{ type: 'text', text: 'd' }, IMMAGINE] }];
  const r = immaginiPerUnModelloSenzaVista(m);
  // verifica della cura (V1): la cura ha scelto «diventa la riga», non «si rifiuta»; la prova lo fissa
  assert.deepEqual([r.immagini, r.nuove], [true, false]);
  assert.deepEqual(r.messaggi[1].content, [{ type: 'text', text: 'd' }, RIGA]);
});

test('D7-L14 — reperto R1: solo note, una con immagine, non parte intatta', () => {
  const r = immaginiPerUnModelloSenzaVista([{ role: 'system', content: [IMMAGINE] }]);
  assert.deepEqual([r.immagini, r.nuove], [true, false]);
  assert.deepEqual(r.messaggi[0].content, [RIGA]);
});

/* Verifica della cura R1 del Desktop (04/11/2026, V1): S15, S16, S17 dalla sua sonda. */
test('D7-S15 — immagine nella PRIMA di due note in coda: diventa la riga anche lei', () => {
  const r = immaginiPerUnModelloSenzaVista([{ role: 'user', content: 'ciao' }, { role: 'system', content: [IMMAGINE] }, NOTA]);
  assert.equal(r.nuove, false);
  assert.deepEqual(r.messaggi[1].content, [RIGA]);
});

test('D7-S16 — foto nuova della persona E nota in coda con immagine: la foto resta intatta (nuova), la nota diventa la riga', () => {
  const r = immaginiPerUnModelloSenzaVista([{ role: 'user', content: [IMMAGINE] }, { role: 'developer', content: [IMMAGINE] }]);
  assert.equal(r.nuove, true);
  assert.equal(r.messaggi[0].content[0], IMMAGINE);
  assert.deepEqual(r.messaggi[1].content, [RIGA]);
});

test('D7-S17 — strada vera del guscio: nota in coda con immagine, modello senza vista ⇒ parte con la riga, nessuna immagine sul filo', async () => {
  let inviato = null;
  const messaggi = [{ role: 'system', content: 'base' }, { role: 'user', content: 'ciao' }, { role: 'developer', content: [{ type: 'text', text: 'd' }, IMMAGINE] }];
  const adapter = createOwnerRuntimeAdapter({
    modulePath: `${process.cwd()}/runtime-image-fixture.mjs`,
    importFn: async () => ({ talosLavora: async (input) => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'local:lfm2', messages: messaggi, stream: false }) }) }),
    resolveImagesFn: async (m) => m,
    modelCapabilityFn: async () => ({ inputModalities: ['text'] }),
  });
  await adapter.talosLavora({ fetchDiRete: async (_url, init) => { inviato = JSON.parse(init.body); return new Response('{}', { status: 200 }); } });
  assert.ok(inviato, 'la richiesta è partita');
  assert.equal(JSON.stringify(inviato.messages).includes('image_url'), false);
  assert.deepEqual(inviato.messages[2].content, [{ type: 'text', text: 'd' }, RIGA]);
});
