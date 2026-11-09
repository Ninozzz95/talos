/*
 * Desktop 01/11/2026: a chat died for a photo of an hour ago. The phone's rule (owner 27/07): only an image in the input sent now is
 * refused; older ones become a line. Both directions, on the helper and on the real adapter road.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { RIGA_AL_POSTO_DELL_IMMAGINE, immaginiPerUnModelloSenzaVista } from '../src/immagini-senza-vista.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';

const IMMAGINE = { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } };
const vecchia = [
  { role: 'user', content: [{ type: 'text', text: 'guarda' }, IMMAGINE] },
  { role: 'assistant', content: 'una foto di un gatto' },
  { role: 'user', content: 'e adesso un riassunto' },
];
const nuova = [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao' }, { role: 'user', content: [{ type: 'text', text: 'guarda' }, IMMAGINE] }];

test('ISV-1 the helper: an image before the last answer is replaced by the phone\'s line; the new input is untouched', () => {
  const r = immaginiPerUnModelloSenzaVista(vecchia);
  assert.deepEqual([r.immagini, r.nuove], [true, false]);
  assert.deepEqual(r.messaggi[0].content, [{ type: 'text', text: 'guarda' }, { type: 'text', text: RIGA_AL_POSTO_DELL_IMMAGINE }]);
  assert.equal(r.messaggi[2], vecchia[2]);
  assert.equal(vecchia[0].content[1], IMMAGINE, 'the history is not changed in place');
  assert.equal(RIGA_AL_POSTO_DELL_IMMAGINE, '[An image was here. The current model cannot see images, so it was left out.]', 'same line as the phone');
});

test('ISV-2 the helper: an image in the input sent now is «nuove», also a tool result after the last answer', () => {
  assert.equal(immaginiPerUnModelloSenzaVista(nuova).nuove, true);
  assert.deepEqual(immaginiPerUnModelloSenzaVista(nuova).messaggi[2].content[1], IMMAGINE, 'the new image stays as it is: it is the adapter that refuses it');
  const attrezzo = [{ role: 'user', content: 'apri' }, { role: 'assistant', content: null, tool_calls: [{ id: 'c' }] }, { role: 'tool', tool_call_id: 'c', content: [IMMAGINE] }];
  assert.equal(immaginiPerUnModelloSenzaVista(attrezzo).nuove, true);
  assert.deepEqual(immaginiPerUnModelloSenzaVista([{ role: 'user', content: 'x' }]), { immagini: false, nuove: false, messaggi: [{ role: 'user', content: 'x' }] });
  assert.equal(immaginiPerUnModelloSenzaVista(null).immagini, false);
});

function strada(messages, inputModalities) {
  let sent = null;
  const adapter = createOwnerRuntimeAdapter({
    modulePath: `${process.cwd()}/runtime-image-fixture.mjs`,
    importFn: async () => ({ talosLavora: async (input) => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'deepseek/deepseek-v4', messages, stream: false }) }) }),
    resolveImagesFn: async (m) => m,
    modelCapabilityFn: async () => ({ inputModalities }),
  });
  const giro = adapter.talosLavora({ fetchDiRete: async (_url, init) => { sent = JSON.parse(init.body); return new Response('{}', { status: 200 }); } });
  return { giro, inviato: () => sent };
}

test('ISV-6 sixth review B2: after a refused photo (no answer after it) a text-only message is not refused again; the photo becomes the line', async () => {
  const dopoIlRifiuto = [
    { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao' },
    { role: 'user', content: [{ type: 'text', text: 'guarda' }, IMMAGINE] }, // refused: no answer after it
    { role: 'user', content: 'allora rispondi solo a parole' },
  ];
  const r = immaginiPerUnModelloSenzaVista(dopoIlRifiuto);
  assert.equal(r.nuove, false);
  assert.equal(r.messaggi[2].content[1].text, RIGA_AL_POSTO_DELL_IMMAGINE);
  const s = strada(dopoIlRifiuto, ['text']);
  await s.giro;
  assert.ok(s.inviato(), 'the turn left');
  const stop = immaginiPerUnModelloSenzaVista([{ role: 'user', content: [IMMAGINE] }, { role: 'user', content: 'ok' }]);
  assert.equal(stop.nuove, false, 'a photo stopped before the answer does not block the next message either');
});

test('ISV-3 the real road, a model without vision: a photo of an hour ago no longer kills the chat; the turn leaves with the line', async () => {
  const s = strada(vecchia, ['text']);
  await s.giro;
  assert.ok(s.inviato(), 'the turn left');
  assert.equal(s.inviato().messages[0].content[1].text, RIGA_AL_POSTO_DELL_IMMAGINE);
  assert.equal(s.inviato().messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')), false);
});

test('ISV-4 the other way: an image in the message sent now is still refused before the network, same code and class', async () => {
  const s = strada(nuova, ['text']);
  await assert.rejects(s.giro, (e) => e?.code === 'MODEL_IMAGE_NOT_SUPPORTED' && e?.name === 'OwnerRuntimeUnavailableError' && /does not accept images/u.test(e.message));
  assert.equal(s.inviato(), null, 'nothing reached the network');
});

test('ISV-5 a model that sees, or one whose capability is unknown, gets the images as they are', async () => {
  for (const modalita of [['text', 'image'], []]) {
    const s = strada(vecchia, modalita);
    await s.giro;
    assert.deepEqual(s.inviato().messages[0].content[1], IMMAGINE, JSON.stringify(modalita));
  }
});
