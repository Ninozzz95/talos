/*
 * ⭐ Owner 27/10/2026 — «GUARDA IMMAGINE» (`view_image`), la parte dell'OSPITE (contratto in handoff
 *   `CONTRATTO-GUARDA-IMMAGINE-2026-10-27.md`). Il nucleo decide se si può leggere (il cancello di `leggi`) e dove va l'immagine; qui si
 *   legge il file, si riconosce dai byte, si riduce per la storia e si mette nello store delle immagini della chat, lo stesso degli
 *   allegati della persona (`chat-image-attachments.mjs`): da lì la catena sa già portarla a ogni fornitore.
 * Come Codex (`codex-rs/core/src/tools/handlers/view_image.rs:150-181`): deve essere un file, e i byte che non sono un'immagine si
 *   rifiutano. Come Hermes (`tools/vision_tools.py:722-735`): l'immagine entra nella STORIA, quindi si riduce a un tetto di lato e di
 *   byte (JPEG), e ciò che non scende sotto il tetto si rifiuta con una frase, mai una sessione inchiodata.
 * Il ridimensionatore è `@napi-rs/canvas` (dipendenza facoltativa, arriva con `pdfjs-dist`): se manca, vale il tetto degli allegati
 *   (5 MiB) e una GIF (che lo store non accetta) si rifiuta con la frase.
 */
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { BYTE_MASSIMI_IMMAGINE, LATO_MASSIMO_IMMAGINE, decidiImmagine, leggiIntestazioneImmagine } from './kernel/immagine-da-guardare.mjs';

/** Oltre questa misura il file non si legge nemmeno: nessuna foto utile per un modello pesa tanto. */
export const BYTE_MASSIMI_DA_LEGGERE = 25 * 1024 * 1024;
/** I formati che lo store delle immagini della chat accetta così come sono (`chat-image-attachments.mjs`, `decodeImage`). */
const ACCETTATI_DALLO_STORE = new Set(['image/png', 'image/jpeg', 'image/webp']);
const QUALITA_JPEG = [85, 72, 60, 48];

const mb = (n) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Il ridimensionatore con `@napi-rs/canvas`: lato lungo ≤ `latoMax`, poi JPEG a qualità decrescente finché sta in `byteMax`; se
 * nemmeno la qualità più bassa basta, si dimezza il lato (al più tre volte). `null` se non ci sta: chi chiama rifiuta.
 */
export async function ridimensionaConCanvas(byte, { latoMax, byteMax }) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const immagine = await loadImage(Buffer.from(byte));
  let scala = Math.min(1, latoMax / Math.max(immagine.width, immagine.height));
  for (let dimezzamenti = 0; dimezzamenti <= 3; dimezzamenti += 1) {
    const larghezza = Math.max(1, Math.round(immagine.width * scala));
    const altezza = Math.max(1, Math.round(immagine.height * scala));
    const tela = createCanvas(larghezza, altezza);
    const ctx = tela.getContext('2d');
    ctx.fillStyle = '#ffffff'; // il JPEG non ha trasparenza: lo sfondo bianco invece del nero
    ctx.fillRect(0, 0, larghezza, altezza);
    ctx.drawImage(immagine, 0, 0, larghezza, altezza);
    for (const qualita of QUALITA_JPEG) {
      const uscita = await tela.encode('jpeg', qualita);
      if (uscita.length <= byteMax) return { byte: new Uint8Array(uscita), mime: 'image/jpeg', larghezza, altezza };
    }
    scala /= 2;
  }
  return null;
}

/** Il ridimensionatore di serie, o `null` se `@napi-rs/canvas` non c'è su questa installazione (si misura una volta). */
export async function ridimensionatoreDisponibile() {
  try {
    const m = await import('@napi-rs/canvas');
    return typeof m.createCanvas === 'function' && typeof m.loadImage === 'function' ? ridimensionaConCanvas : null;
  } catch { return null; }
}

/**
 * La funzione `onGuardaImmagine` del nucleo: `({ percorso, percorsoMostrato, segnale }) => { ok, esito, immagine? }`. `percorso` è già
 * assoluto e già passato dal cancello del nucleo. `chatImageStore.upload({ nome, dataUrl })` → `{ id }` (64 hex), il riferimento.
 */
export function creaGuardaImmagine({ chatImageStore, ridimensionaFn = null, statFn = stat, readFileFn = readFile }) {
  if (!chatImageStore || typeof chatImageStore.upload !== 'function') throw new TypeError('creaGuardaImmagine needs the chat image store.');
  return async ({ percorso, percorsoMostrato, segnale } = {}) => {
    const detto = String(percorsoMostrato ?? percorso ?? '');
    let info;
    try { info = await statFn(percorso); }
    catch { return { ok: false, esito: `"${detto}" does not exist. Check the path with "elenca".` }; }
    if (!info.isFile()) return { ok: false, esito: `"${detto}" is not a file.` };
    if (info.size > BYTE_MASSIMI_DA_LEGGERE) return { ok: false, esito: `"${detto}" is too large to view (${mb(info.size)}).` };
    segnale?.throwIfAborted?.();
    let byte = new Uint8Array(await readFileFn(percorso));
    const intestazione = leggiIntestazioneImmagine(byte);
    const decisione = decidiImmagine({ byte, intestazione, sappiamoRidimensionare: typeof ridimensionaFn === 'function' });
    if (decisione.esito === 'rifiuta') {
      return {
        ok: false,
        esito: decisione.motivo === 'not-an-image'
          ? `"${detto}" is not a PNG, JPEG, WebP or GIF image. Use "leggi" for text files.`
          /* revisione del blocco 12: oltre il tetto dei pixel (bombe di decompressione) non si apre nemmeno per ridurla */
          : decisione.motivo === 'too-many-pixels'
            ? `"${detto}" is ${intestazione.larghezza}×${intestazione.altezza} pixels, more than this computer opens safely (about 89 megapixels). Save a smaller copy to view it.`
            : `"${detto}" is too large to view (${mb(byte.length)}) and cannot be reduced on this computer.`,
      };
    }
    let { mime, larghezza, altezza } = intestazione;
    const originale = { larghezza, altezza };
    const daConvertire = !ACCETTATI_DALLO_STORE.has(mime); // una GIF: lo store non la accetta, si passa dal ridimensionatore
    if (decisione.esito === 'ridimensiona' || daConvertire) {
      if (typeof ridimensionaFn !== 'function') return { ok: false, esito: `"${detto}" is a GIF, and this computer cannot convert it. Save it as PNG to view it.` };
      segnale?.throwIfAborted?.();
      let ridotta = null;
      try { ridotta = await ridimensionaFn(byte, { latoMax: LATO_MASSIMO_IMMAGINE, byteMax: BYTE_MASSIMI_IMMAGINE }); }
      catch { ridotta = null; }
      if (!ridotta) return { ok: false, esito: `"${detto}" could not be reduced to a size that fits the conversation.` };
      ({ byte, mime, larghezza, altezza } = ridotta);
    }
    segnale?.throwIfAborted?.();
    const salvata = await chatImageStore.upload({ nome: basename(detto) || 'image', dataUrl: `data:${mime};base64,${Buffer.from(byte).toString('base64')}` });
    const ridottaDa = originale.larghezza !== larghezza || originale.altezza !== altezza ? `, reduced from ${originale.larghezza}×${originale.altezza}` : '';
    return {
      ok: true,
      esito: `Image "${detto}" (${larghezza}×${altezza}${ridottaDa}) is attached below.`,
      immagine: { riferimento: salvata.id, mime, larghezza, altezza },
    };
  };
}
