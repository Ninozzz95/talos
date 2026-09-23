import assert from 'node:assert/strict';
import test from 'node:test';

import { ASPECT_RATIO_PER_FORMA, generaImmagineOpenRouter } from './image-generator.mjs';

/**
 * ⭐⭐⭐ 30/8, Fase C (2/7) — porto quasi verbatim dal canonico desktop
 * (`AVM-harness-desktop/harness-ui/tests/image-generator.test.mjs`),
 * adattato solo all'import relativo: il modulo mobile ha una
 * `talosSafeFileStem` più semplice (nessuna dipendenza `unicode-segmenter`,
 * vedi la doc in `image-generator.mjs`), ma il comportamento
 * OSSERVABILE — inclusi i casi coi caratteri vietati e il fallback —
 * resta identico, quindi la stessa batteria di prove regge invariata.
 */

function fetchFinto(corpo, { ok = true, status = 200 } = {}) {
  const chiamate = [];
  const fn = async (url, opzioni) => {
    chiamate.push({ url, corpo: JSON.parse(opzioni.body), headers: opzioni.headers });
    return { ok, status, json: async () => corpo };
  };
  fn.chiamate = chiamate;
  return fn;
}

const B64_ROSSO_1X1 = 'aGVsbG8='; // stand-in: contenuto finto, non un PNG vero — questo modulo non decodifica i pixel, solo il base64.

test('⭐⭐⭐ percorso DEDICATO: POST /images con model/prompt/aspect_ratio, risposta da data[0].b64_json/media_type', async () => {
  const fetchFn = fetchFinto({ created: 1, data: [{ b64_json: B64_ROSSO_1X1, media_type: 'image/png' }], usage: { cost: 0.04 } });
  const esito = await generaImmagineOpenRouter(
    { prompt: 'un gatto rosso su un tetto', shape: 'landscape', modello: 'bytedance-seed/seedream-4.5', nativo: false, chiave: 'chiave-vera' },
    { fetchFn },
  );
  assert.equal(fetchFn.chiamate.length, 1);
  assert.equal(fetchFn.chiamate[0].url, 'https://openrouter.ai/api/v1/images');
  assert.deepEqual(fetchFn.chiamate[0].corpo, { model: 'bytedance-seed/seedream-4.5', prompt: 'un gatto rosso su un tetto', aspect_ratio: '16:9' });
  assert.equal(fetchFn.chiamate[0].headers.Authorization, 'Bearer chiave-vera');
  assert.equal(esito.mediaType, 'image/png');
  assert.equal(esito.bytes.toString(), 'hello');
  assert.equal(esito.fileStem, 'un gatto rosso su un tetto');
});

test('⭐⭐ le tre forme mappano sui tre aspect_ratio veri (square/portrait/landscape → 1:1/9:16/16:9)', () => {
  assert.deepEqual(ASPECT_RATIO_PER_FORMA, { square: '1:1', portrait: '9:16', landscape: '16:9' });
});

test('⛔ AL CONTRARIO — shape assente sul percorso dedicato: default onesto 1:1, mai un valore inventato diverso', async () => {
  const fetchFn = fetchFinto({ data: [{ b64_json: B64_ROSSO_1X1, media_type: 'image/png' }] });
  await generaImmagineOpenRouter({ prompt: 'una montagna', modello: 'x', nativo: false, chiave: 'k' }, { fetchFn });
  assert.equal(fetchFn.chiamate[0].corpo.aspect_ratio, '1:1');
});

test('⭐⭐⭐ percorso NATIVO: POST /chat/completions con model/messages/modalities, risposta da message.images[0].image_url.url (data URL)', async () => {
  const fetchFn = fetchFinto({
    choices: [{ message: { role: 'assistant', content: 'Ecco il disegno.', images: [{ image_url: { url: `data:image/png;base64,${B64_ROSSO_1X1}` } }] } }],
  });
  const esito = await generaImmagineOpenRouter(
    { prompt: 'un tramonto sul mare', modello: 'google/gemini-3.1-flash-image', nativo: true, chiave: 'chiave-vera' },
    { fetchFn },
  );
  assert.equal(fetchFn.chiamate[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(fetchFn.chiamate[0].corpo, {
    model: 'google/gemini-3.1-flash-image',
    messages: [{ role: 'user', content: 'un tramonto sul mare' }],
    modalities: ['text', 'image'],
  });
  assert.equal(esito.mediaType, 'image/png');
  assert.equal(esito.bytes.toString(), 'hello');
});

test('⛔ AL CONTRARIO — percorso nativo: shape NON entra nel corpo (campo non confermato, mai inviato non verificato)', async () => {
  const fetchFn = fetchFinto({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${B64_ROSSO_1X1}` } }] } }] });
  await generaImmagineOpenRouter({ prompt: 'x', shape: 'portrait', modello: 'm', nativo: true, chiave: 'k' }, { fetchFn });
  assert.ok(!('image_config' in fetchFn.chiamate[0].corpo));
  assert.ok(!('shape' in fetchFn.chiamate[0].corpo));
  assert.ok(!('aspect_ratio' in fetchFn.chiamate[0].corpo));
});

test('⛔⛔⛔ AL CONTRARIO — rete irraggiungibile: TALOS_IMAGE_UNREACHABLE, mai un successo inventato', async () => {
  const fetchFn = async () => { throw new Error('ECONNRESET'); };
  await assert.rejects(
    () => generaImmagineOpenRouter({ prompt: 'x', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn }),
    /TALOS_IMAGE_UNREACHABLE.*ECONNRESET/s,
  );
});

test('⛔⛔ AL CONTRARIO — status non-ok: TALOS_IMAGE_UPSTREAM_ERROR col dettaglio VERO del fornitore', async () => {
  const fetchFn = fetchFinto({ error: { message: 'insufficient credit' } }, { ok: false, status: 402 });
  await assert.rejects(
    () => generaImmagineOpenRouter({ prompt: 'x', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn }),
    /TALOS_IMAGE_UPSTREAM_ERROR.*402.*insufficient credit/s,
  );
});

test('⛔⛔ AL CONTRARIO — dedicato, risposta senza b64_json: TALOS_IMAGE_BAD_RESPONSE, mai un file vuoto salvato per un successo finto', async () => {
  const fetchFn = fetchFinto({ data: [{}] });
  await assert.rejects(
    () => generaImmagineOpenRouter({ prompt: 'x', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn }),
    /TALOS_IMAGE_BAD_RESPONSE/,
  );
});

test('⛔⛔⛔ AL CONTRARIO — nativo, il modello risponde SOLO testo (nessuna immagine): TALOS_IMAGE_NO_IMAGE, motivo azionabile per il modello', async () => {
  const fetchFn = fetchFinto({ choices: [{ message: { role: 'assistant', content: 'Non posso disegnare questo.' } }] });
  await assert.rejects(
    () => generaImmagineOpenRouter({ prompt: 'x', modello: 'm', nativo: true, chiave: 'k' }, { fetchFn }),
    /TALOS_IMAGE_NO_IMAGE/,
  );
});

test('⛔⛔ AL CONTRARIO — nativo, image_url.url malformato (non una data URL base64): TALOS_IMAGE_BAD_RESPONSE', async () => {
  const fetchFn = fetchFinto({ choices: [{ message: { images: [{ image_url: { url: 'https://esempio.com/non-e-una-data-url.png' } }] } }] });
  await assert.rejects(
    () => generaImmagineOpenRouter({ prompt: 'x', modello: 'm', nativo: true, chiave: 'k' }, { fetchFn }),
    /TALOS_IMAGE_BAD_RESPONSE/,
  );
});

test('⛔ AL CONTRARIO — corpo risposta non-JSON: TALOS_IMAGE_BAD_RESPONSE, non un\'eccezione grezza propagata', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => { throw new Error('unexpected token'); } });
  await assert.rejects(
    () => generaImmagineOpenRouter({ prompt: 'x', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn }),
    /TALOS_IMAGE_BAD_RESPONSE/,
  );
});

test('⭐⭐ fileStem: derivato dal prompt VERO, sanificato — mai "immagine-<uuid>" quando il prompt esiste', async () => {
  const fetchFn = fetchFinto({ data: [{ b64_json: B64_ROSSO_1X1, media_type: 'image/jpeg' }] });
  const esito = await generaImmagineOpenRouter({ prompt: 'Un/gatto:rosso*su<un>tetto?', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn });
  assert.equal(esito.fileStem, 'Un gatto rosso su un tetto');
});

test('⛔ AL CONTRARIO — prompt vuoto: fileStem ricade sul fallback onesto, mai una stringa vuota', async () => {
  const fetchFn = fetchFinto({ data: [{ b64_json: B64_ROSSO_1X1, media_type: 'image/png' }] });
  const esito = await generaImmagineOpenRouter({ prompt: '   ', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn });
  assert.equal(esito.fileStem, 'immagine');
});

test('⭐ 30/8, mobile — un budget UTF-8 stretto taglia per punto di codice, mai un troncamento a metà multi-byte (Buffer.byteLength verificato dopo ogni aggiunta)', async () => {
  const fetchFn = fetchFinto({ data: [{ b64_json: B64_ROSSO_1X1, media_type: 'image/png' }] });
  const esito = await generaImmagineOpenRouter({ prompt: 'città è bella', shape: 'square', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn });
  assert.ok(Buffer.byteLength(esito.fileStem, 'utf8') <= 80);
  assert.equal(esito.fileStem, 'città è bella');
});
