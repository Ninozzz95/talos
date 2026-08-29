/**
 * image-generator.mjs — FASE H del piano `elegant-spinning-dongarra.md`
 * (29/8): chiama la Image API di OpenRouter (lanciata fine giugno
 * 2026), la STESSA chiave già in `config.mjs` — zero provider nuovo,
 * il one-up dichiarato su Hermes/Codex (loro un attrezzo immagine
 * verso un provider SEPARATO dal modello di chat).
 *
 * Codici d'errore `TALOS_IMAGE_*` — stessa famiglia di nomi già in
 * uso nell'omologo mobile (`mobile/src/lib/images/imageTools.ts`:
 * `TALOS_IMAGE_NO_PROVIDER`/`TALOS_IMAGE_SOURCE_NOT_FOUND`/...), non
 * inventata qui — un modello che ha già visto quei codici (in
 * un'altra conversazione, o nella sua formazione) li riconosce.
 *
 * Due percorsi CONFERMATI (29/8, tre fonti incluso il riferimento API
 * ufficiale, non presunti — vedi il piano madre, FASE H):
 * - **DEDICATO** (`nativo:false`): `POST /api/v1/images`, corpo
 *   `{model, prompt, aspect_ratio}`, risposta
 *   `data[0].{b64_json, media_type}`. Il catalogo di questi modelli è
 *   `GET /api/v1/images/models` — un endpoint SEPARATO da
 *   `/api/v1/models` (verificato dal vivo il 29/8: un modello dedicato
 *   reale, `bytedance-seed/seedream-4.5`, NON compare affatto in
 *   `/api/v1/models` — solo i modelli NATIVI ci compaiono, con
 *   `architecture.output_modalities` che include `"image"`).
 * - **NATIVO** (`nativo:true`): `POST /api/v1/chat/completions`
 *   STANDARD (lo stesso endpoint che il kernel già chiama per il
 *   testo) con `modalities:["text","image"]` nel corpo — l'immagine
 *   arriva in `choices[0].message.images[0].image_url.url`, una data
 *   URL (`data:<mediaType>;base64,<dati>`), MAI in `data[].b64_json`
 *   (quello è solo del percorso dedicato).
 *
 * ⛔ Quale dei due usare NON si indovina qui — è una proprietà del
 * MODELLO scelto (`config.mjs`, `immagine.nativo`), decisa a monte:
 * questo modulo non chiama nessun catalogo per scoprirlo (un giro di
 * rete in più per ogni immagine, per un fatto che il chiamante può
 * già sapere). I due cataloghi VERI esistono e sono stati verificati
 * dal vivo il 29/8 — restano per un futuro picker owner-facing
 * (mirror del picker `modello` già in uso), non per questa decisione
 * a runtime.
 *
 * ⛔ Aspect ratio sul percorso NATIVO: non inviato in questa fetta —
 * un campo che alcune fonti secondarie citano (`image_config.aspect_ratio`)
 * non è confermato nel riferimento API ufficiale consultato il 29/8;
 * mai un campo non verificato nella chiamata vera. Il prompt può
 * comunque descrivere l'inquadratura in linguaggio naturale.
 */
import { talosSafeFileStem } from './document-filename.mjs';

const OPENROUTER_IMAGES_URL = 'https://openrouter.ai/api/v1/images';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** ⭐ Le tre forme che il tool del kernel offre — stesso vocabolario di `mobile/src/lib/images/imageTools.ts` (`SHAPES`), non un terzo nuovo. */
export const ASPECT_RATIO_PER_FORMA = Object.freeze({ square: '1:1', portrait: '9:16', landscape: '16:9' });

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
 * `spec.shape` è ignorato sul percorso nativo (vedi la doc sopra sul
 * campo non confermato) — non un bug, un limite dichiarato.
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
  // ⭐ un nome file leggibile dal prompt, mai "immagine-<uuid>" — stesso principio di talosSafeFileStem già in uso per document-generator.mjs.
  const fileStem = talosSafeFileStem(prompt, 80, 'immagine');
  return { mediaType, bytes, fileStem };
}
