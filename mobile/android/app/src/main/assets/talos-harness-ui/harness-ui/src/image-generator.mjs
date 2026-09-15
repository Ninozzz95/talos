/**
 * image-generator.mjs — porta canonico (desktop, FASE H, 29/8): chiama
 * la Image API di OpenRouter, la STESSA chiave già in `config.mjs` —
 * zero provider nuovo, il one-up dichiarato su Hermes/Codex (loro un
 * attrezzo immagine verso un provider SEPARATO dal modello di chat).
 *
 * Codici d'errore `TALOS_IMAGE_*` — stessa famiglia già in uso
 * nell'omologo mobile (`mobile/src/lib/images/imageTools.ts`).
 *
 * Due percorsi (confermati sul desktop, 29/8, riferimento API
 * ufficiale, non presunti):
 * - **DEDICATO** (`nativo:false`): `POST /api/v1/images`, corpo
 *   `{model, prompt, aspect_ratio}`, risposta `data[0].{b64_json, media_type}`.
 * - **NATIVO** (`nativo:true`): `POST /api/v1/chat/completions`
 *   STANDARD con `modalities:["text","image"]` — l'immagine arriva in
 *   `choices[0].message.images[0].image_url.url`, una data URL, MAI
 *   in `data[].b64_json`.
 *
 * ⛔ Quale dei due usare è una proprietà del MODELLO scelto
 * (`config.mjs`, `immagine.nativo`), decisa a monte — nessun giro di
 * rete in più per scoprirlo a runtime.
 *
 * ⛔ 30/8, PORTING mobile — differenza dichiarata dal canonico: il
 * canonico importa `talosSafeFileStem` da `document-filename.mjs`
 * (dipende da `unicode-segmenter`, un pacchetto npm). Il server
 * imbarcato su mobile non ha NESSUNA dipendenza di terze parti (solo
 * `node:*` e import relativi — verificato con una grep su tutto
 * `harness-ui/src/*.mjs` prima di scrivere questo file): importarne
 * una prima ora significherebbe costruire un'infrastruttura di
 * staging per node_modules che oggi non esiste, sproporzionato per un
 * nome file. `sanitizzaStemFile` qui sotto è più semplice (itera per
 * PUNTO DI CODICE Unicode via `Array.from`, non per grafema — un
 * emoji con selettore di variazione può quindi tagliare a metà un
 * cluster visibile, un limite dichiarato, non un bug nascosto) ma
 * copre lo stesso bisogno reale: un nome file leggibile dal prompt,
 * mai un carattere che romperebbe un filesystem.
 */

const OPENROUTER_IMAGES_URL = 'https://openrouter.ai/api/v1/images';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** ⭐ Le tre forme che il tool del kernel offre — stesso vocabolario di `mobile/src/lib/images/imageTools.ts` (`SHAPES`), non un terzo nuovo. */
export const ASPECT_RATIO_PER_FORMA = Object.freeze({ square: '1:1', portrait: '9:16', landscape: '16:9' });

const CARATTERI_VIETATI_FILE = new Set(['/', '\\', ':', '"', '*', '?', '<', '>', '|']);

function puntoDiCodiceNonSicuro(code) {
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  if (code >= 0xd800 && code <= 0xdfff) return true;
  if (code === 0x00ad || code === 0x200b || code === 0xfeff) return true;
  if (code === 0x200e || code === 0x200f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;
  return code >= 0x2066 && code <= 0x2069;
}

function sanitizzaStemFile(value) {
  let sicuro = '';
  for (const carattere of String(value ?? '').normalize('NFKC')) {
    const code = carattere.codePointAt(0) ?? 0;
    if (puntoDiCodiceNonSicuro(code)) continue;
    sicuro += CARATTERI_VIETATI_FILE.has(carattere) ? ' ' : carattere;
  }
  return sicuro.replace(/\s+/gu, ' ').trim();
}

/** Torna uno STEM di nome file sicuro sotto un tetto di byte UTF-8. L'estensione è del chiamante, aggiunta dopo questo confine. */
export function talosSafeFileStem(value, maxUtf8Bytes, fallback) {
  if (!Number.isSafeInteger(maxUtf8Bytes) || maxUtf8Bytes < 1) {
    throw new RangeError('TALOS_FILENAME_BUDGET_INVALID');
  }
  const safeFallback = sanitizzaStemFile(fallback) || 'file';
  const source = sanitizzaStemFile(value) || safeFallback;

  function limitato(testo) {
    let bounded = '';
    for (const puntoDiCodice of Array.from(testo)) {
      const candidato = `${bounded}${puntoDiCodice}`;
      if (Buffer.byteLength(candidato, 'utf8') > maxUtf8Bytes) break;
      bounded = candidato;
    }
    return bounded.trimEnd();
  }

  return limitato(source) || limitato(safeFallback) || 'f';
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl ?? '');
  if (!match) throw new Error('TALOS_IMAGE_BAD_RESPONSE: OpenRouter has returned an image in an unexpected format (not a base64 data URL).');
  return { mediaType: match[1], bytes: Buffer.from(match[2], 'base64') };
}

async function leggiCorpoJson(risposta, dove) {
  try {
    return await risposta.json();
  } catch {
    throw new Error(`TALOS_IMAGE_BAD_RESPONSE: ${dove} returned a response that is not valid JSON.`);
  }
}

async function chiamaImmaginiDedicato({ prompt, shape, modello, chiave }, fetchFn) {
  let risposta;
  try {
    risposta = await fetchFn(OPENROUTER_IMAGES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modello, prompt, aspect_ratio: ASPECT_RATIO_PER_FORMA[shape] ?? '1:1' }),
    });
  } catch (errore) {
    throw new Error(`TALOS_IMAGE_UNREACHABLE: the OpenRouter Image API could not be reached (${errore instanceof Error ? errore.message : String(errore)}).`);
  }
  const corpo = await leggiCorpoJson(risposta, 'the OpenRouter Image API');
  if (!risposta.ok) {
    throw new Error(`TALOS_IMAGE_UPSTREAM_ERROR: the OpenRouter Image API responded ${risposta.status} (${corpo?.error?.message ?? 'no detail'}).`);
  }
  const voce = corpo?.data?.[0];
  if (!voce?.b64_json) throw new Error('TALOS_IMAGE_BAD_RESPONSE: the OpenRouter Image API response has no image data.');
  return { mediaType: typeof voce.media_type === 'string' && voce.media_type ? voce.media_type : 'image/png', bytes: Buffer.from(voce.b64_json, 'base64') };
}

async function chiamaImmaginiNativo({ prompt, modello, chiave }, fetchFn) {
  let risposta;
  try {
    risposta = await fetchFn(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modello, messages: [{ role: 'user', content: prompt }], modalities: ['text', 'image'] }),
    });
  } catch (errore) {
    throw new Error(`TALOS_IMAGE_UNREACHABLE: OpenRouter could not be reached for native image generation (${errore instanceof Error ? errore.message : String(errore)}).`);
  }
  const corpo = await leggiCorpoJson(risposta, 'OpenRouter (native image generation)');
  if (!risposta.ok) {
    throw new Error(`TALOS_IMAGE_UPSTREAM_ERROR: OpenRouter responded ${risposta.status} for native image generation (${corpo?.error?.message ?? 'no detail'}).`);
  }
  const dataUrl = corpo?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) {
    throw new Error('TALOS_IMAGE_NO_IMAGE: the model did not return an image — it may have answered in text only. Try a more explicit drawing prompt, or a dedicated image model.');
  }
  return decodeDataUrl(dataUrl);
}

/**
 * `spec.shape` è ignorato sul percorso nativo (nessun campo confermato
 * nel riferimento API ufficiale per l'aspect ratio nativo) — non un
 * bug, un limite dichiarato: il prompt può descrivere l'inquadratura
 * in linguaggio naturale.
 * @param {{prompt:string, shape?:'square'|'portrait'|'landscape', modello:string, nativo:boolean, chiave:string}} spec
 * @param {{fetchFn?: typeof fetch}} [deps]
 * @returns {Promise<{mediaType:string, bytes:Buffer, fileStem:string}>}
 */
export async function generaImmagineOpenRouter(spec, deps = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const { prompt, shape, modello, nativo, chiave } = spec;
  const { mediaType, bytes } = nativo
    ? await chiamaImmaginiNativo({ prompt, modello, chiave }, fetchFn)
    : await chiamaImmaginiDedicato({ prompt, shape, modello, chiave }, fetchFn);
  const fileStem = talosSafeFileStem(prompt, 80, 'immagine');
  return { mediaType, bytes, fileStem };
}
