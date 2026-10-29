/*
 * Owner 27/10/2026 — «guarda immagine», la parte dell'ospite: lettura, riconoscimento, riduzione, store delle immagini della chat.
 * Lo store è quello VERO (`createChatImageStore`) in una cartella temporanea; le immagini si disegnano con `@napi-rs/canvas`.
 */
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCanvas } from '@napi-rs/canvas';

import { createChatImageStore } from '../src/chat-image-attachments.mjs';
import { creaGuardaImmagine, ridimensionaConCanvas, ridimensionatoreDisponibile } from '../src/guarda-immagine-ospite.mjs';
import { BYTE_MASSIMI_IMMAGINE, LATO_MASSIMO_IMMAGINE, leggiIntestazioneImmagine } from '../src/kernel/immagine-da-guardare.mjs';

/** Un PNG vero, con rumore perché non si comprima a niente (così si può superare il tetto dei byte). */
function png(larghezza, altezza, { rumore = false } = {}) {
  const tela = createCanvas(larghezza, altezza);
  const ctx = tela.getContext('2d');
  if (rumore) {
    const dati = ctx.createImageData(larghezza, altezza);
    randomFillSync(dati.data);
    for (let i = 3; i < dati.data.length; i += 4) dati.data[i] = 255;
    ctx.putImageData(dati, 0, 0);
  } else { ctx.fillStyle = '#3366cc'; ctx.fillRect(0, 0, larghezza, altezza); }
  return tela.encodeSync('png');
}
const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

async function banco(t, opzioni = {}) {
  const cartella = await mkdtemp(join(tmpdir(), 'talos-guarda-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(cartella));
  const store = createChatImageStore({ rootDir: join(cartella, '.chat-images') });
  const guarda = creaGuardaImmagine({ chatImageStore: store, ...opzioni });
  return { cartella, store, guarda };
}

test('OSP-IMG-01 un PNG piccolo entra com\'è: riferimento dello store, dimensioni vere, i byte nello store sono quelli del file', async (t) => {
  const { cartella, store, guarda } = await banco(t, { ridimensionaFn: ridimensionaConCanvas });
  const byte = png(640, 480);
  await writeFile(join(cartella, 'foto.png'), byte);
  const r = await guarda({ percorso: join(cartella, 'foto.png'), percorsoMostrato: 'foto.png' });
  assert.equal(r.ok, true);
  assert.match(r.immagine.riferimento, /^[a-f0-9]{64}$/u);
  assert.deepEqual([r.immagine.mime, r.immagine.larghezza, r.immagine.altezza], ['image/png', 640, 480]);
  assert.match(r.esito, /foto\.png.*640×480.*attached below/u);
  const salvata = await store.read(r.immagine.riferimento);
  assert.deepEqual(Buffer.from(salvata.bytes), Buffer.from(byte));
});

test('OSP-IMG-02 una foto enorme si riduce sotto i due tetti (lato e byte), e l\'esito lo dice', async (t) => {
  const { cartella, store, guarda } = await banco(t, { ridimensionaFn: ridimensionaConCanvas });
  await writeFile(join(cartella, 'schermo.png'), png(3200, 2000, { rumore: true }));
  const r = await guarda({ percorso: join(cartella, 'schermo.png'), percorsoMostrato: 'schermo.png' });
  assert.equal(r.ok, true, r.esito);
  assert.equal(r.immagine.mime, 'image/jpeg');
  assert.ok(Math.max(r.immagine.larghezza, r.immagine.altezza) <= LATO_MASSIMO_IMMAGINE);
  assert.match(r.esito, /reduced from 3200×2000/u);
  const salvata = await store.read(r.immagine.riferimento);
  assert.ok(salvata.bytes.length <= BYTE_MASSIMI_IMMAGINE, `${salvata.bytes.length} byte`);
  const vera = leggiIntestazioneImmagine(new Uint8Array(salvata.bytes));
  assert.deepEqual([vera.larghezza, vera.altezza], [r.immagine.larghezza, r.immagine.altezza], 'le dimensioni dette sono quelle del file salvato');
});

test('OSP-IMG-03 AL CONTRARIO: un testo, una cartella, un file che non c\'è — rifiutati con la frase, niente nello store', async (t) => {
  const { cartella, guarda } = await banco(t, { ridimensionaFn: ridimensionaConCanvas });
  await writeFile(join(cartella, 'nota.png'), 'non sono una foto, sono un testo con il nome sbagliato');
  await mkdir(join(cartella, 'sotto'));
  const testo = await guarda({ percorso: join(cartella, 'nota.png'), percorsoMostrato: 'nota.png' });
  assert.deepEqual([testo.ok, testo.immagine], [false, undefined]);
  assert.match(testo.esito, /is not a PNG, JPEG, WebP or GIF image/u);
  assert.match((await guarda({ percorso: join(cartella, 'sotto'), percorsoMostrato: 'sotto' })).esito, /is not a file/u);
  assert.match((await guarda({ percorso: join(cartella, 'manca.png'), percorsoMostrato: 'manca.png' })).esito, /does not exist/u);
});

test('OSP-IMG-04 una GIF si converte col ridimensionatore; senza ridimensionatore si rifiuta, e un PNG da 1-5 MiB entra com\'è', async (t) => {
  const conR = await banco(t, { ridimensionaFn: ridimensionaConCanvas });
  await writeFile(join(conR.cartella, 'anim.gif'), GIF_1x1);
  const gif = await conR.guarda({ percorso: join(conR.cartella, 'anim.gif'), percorsoMostrato: 'anim.gif' });
  assert.equal(gif.ok, true, gif.esito);
  assert.equal(gif.immagine.mime, 'image/jpeg');

  const senza = await banco(t, { ridimensionaFn: null });
  await writeFile(join(senza.cartella, 'anim.gif'), GIF_1x1);
  assert.match((await senza.guarda({ percorso: join(senza.cartella, 'anim.gif'), percorsoMostrato: 'anim.gif' })).esito, /GIF.*cannot convert/u);
  const medio = png(1200, 900, { rumore: true });
  assert.ok(medio.length > BYTE_MASSIMI_IMMAGINE, `premessa: oltre il tetto della storia (${medio.length})`);
  await writeFile(join(senza.cartella, 'medio.png'), medio);
  const r = await senza.guarda({ percorso: join(senza.cartella, 'medio.png'), percorsoMostrato: 'medio.png' });
  assert.equal(r.ok, true, r.esito);
  assert.equal(r.immagine.mime, 'image/png');
});

test('OSP-IMG-05 il ridimensionatore di serie c\'è su questa installazione (dipendenza facoltativa, arriva con pdfjs-dist)', async () => {
  assert.equal(await ridimensionatoreDisponibile(), ridimensionaConCanvas);
});

/* Revisione del blocco 12 (bombe di decompressione): un PNG di pochi byte che dichiara 16000×16000 non si decodifica né si riduce — la
   frase dice le misure, e il ridimensionatore non è mai chiamato. */
test('OSP-IMG-06 un PNG oltre il tetto dei pixel si rifiuta dall\'intestazione, senza decodificarlo né ridurlo', async (t) => {
  const chiamate = [];
  const { cartella, guarda } = await banco(t, { ridimensionaFn: async (...a) => { chiamate.push(a); return null; } });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16_000, 0); ihdr.writeUInt32BE(16_000, 4); ihdr[8] = 8; ihdr[9] = 6;
  const intestazione = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'), ihdr, Buffer.alloc(4)]);
  await writeFile(join(cartella, 'bomba.png'), intestazione);
  const esito = await guarda({ percorso: join(cartella, 'bomba.png'), percorsoMostrato: 'bomba.png' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /16000×16000 pixels, more than this computer opens safely/u);
  assert.equal(chiamate.length, 0, 'never decoded to be reduced');
});
