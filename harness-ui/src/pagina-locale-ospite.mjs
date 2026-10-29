/*
 * Owner 27/10/2026 (server locali nella scheda Browser, terza scelta: «un attrezzo del modello per aprire e guardare la pagina LOCALE
 *   nella stessa scheda — testo, foto, console — dietro il cancello»). Forma concordata con la CLI il 29/10/2026. Il nucleo controlla
 *   la FORMA (porta, percorso senza host, che cosa guardare); qui sta il CONFINE:
 *   - solo una porta PRONTA dei server di sviluppo di QUESTA conversazione (`portaLocaleDellaSessione`), mai una qualunque;
 *   - host fisso `127.0.0.1`, mai scelto dal modello;
 *   - l'indirizzo FINALE della scheda si ricontrolla dopo i rinvii: se la pagina ha portato altrove, non si legge niente;
 *   - la pagina si apre nella scheda Browser che la persona VEDE (owner 29/10/2026, «la stessa che vedi tu»): la chiave della scheda è
 *     quella dell'interfaccia, `IDENTITA_BROWSER` di `app.js` (una per finestra di TALOS), non la conversazione — con la conversazione
 *     come chiave il modello guardava una scheda che nessuno vedeva. La porta resta controllata per conversazione.
 * Come Cline (`browser_action`: foto e console dopo ogni azione) e Hermes (testo tagliato, mai intero); la foto va nello store delle
 * immagini della chat come quelle di `view_image` (`guarda-immagine-ospite.mjs`).
 */

import { trovaChromium } from './browser-vivo.mjs';

const HOST_LOCALI = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** L'indirizzo finale è ancora la porta chiesta, su questo computer? */
export function restaSullaPorta(indirizzo, porta) {
  let u;
  try { u = new URL(String(indirizzo ?? '')); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const portaVera = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  return HOST_LOCALI.has(u.hostname) && portaVera === porta;
}

/**
 * @param {{ registroFn: () => any, browserVivoFn: () => any, chatImageStore: { upload: Function } | null }} dipendenze
 *   funzioni e non valori: il registro e il browser nascono DOPO questa funzione nel server.
 */
/** La chiave della scheda Browser dell'interfaccia (`frontend/src/legacy/app.js`, `IDENTITA_BROWSER`): devono restare uguali. */
export const SCHEDA_DELLA_FINESTRA = 'browser-di-questa-pagina';

/**
 * Mobile 29/10/2026 (pin di r4 sul telefono): `local_page` si offre solo dove c'è un Chromium da pilotare — la stessa ricerca del Browser
 * vivo (`trovaChromium`, che legge anche `TALOS_CHROMIUM`/`CHROME_PATH`). Sul telefono non c'è, e un attrezzo che non può funzionare
 * non si mette davanti al modello: senza browser torna `null`, e il registro non lo offre. ⛔ Si guarda all'avvio del server: un browser
 * installato dopo vuole un riavvio (su Windows Edge c'è di serie).
 */
export function apriPaginaLocaleSeCeIlBrowser(dipendenze, { trovaFn = trovaChromium } = {}) {
  let trovato = null;
  try { trovato = trovaFn(); } catch { trovato = null; }
  return trovato ? creaApriPaginaLocale(dipendenze) : null;
}

export function creaApriPaginaLocale({ registroFn, browserVivoFn, chatImageStore = null, chiaveScheda = SCHEDA_DELLA_FINESTRA }) {
  return async ({ sessionId, porta, percorso, guarda = 'text', segnale = null }) => {
    const registro = registroFn?.();
    const browser = browserVivoFn?.();
    if (!registro || !browser) return { ok: false, motivo: 'The Browser of this conversation is not available here.' };
    if (!registro.portaLocaleDellaSessione?.(sessionId, porta)) {
      const pronte = (registro.serverLocali?.(sessionId) ?? []).filter((s) => s?.stato === 'pronto').map((s) => s.porta);
      return { ok: false, motivo: `Port ${porta} is not a ready development server of this conversation. Ready ones: ${pronte.length ? pronte.join(', ') : 'none'}.` };
    }
    segnale?.throwIfAborted?.();
    const indirizzo = `http://127.0.0.1:${porta}${percorso}`;
    const prima = browser.quantiErrori?.(chiaveScheda) ?? 0;
    const aperta = await browser.apri(chiaveScheda, indirizzo);
    if (aperta?.ok === false && !aperta?.stato) return { ok: false, motivo: `The page did not open: ${aperta?.errore ?? 'unknown error'}.` };
    segnale?.throwIfAborted?.();
    const letta = await browser.leggi(chiaveScheda, { guarda, daErrore: prima });
    const finale = letta?.url ?? aperta?.url ?? indirizzo;
    if (!restaSullaPorta(finale, porta)) {
      return { ok: false, motivo: `The page moved to another address (${String(finale).slice(0, 200)}), outside port ${porta}: nothing was read.` };
    }
    if (guarda === 'screenshot') {
      if (!letta?.immagine || !chatImageStore) return { ok: true, url: finale, immagine: null };
      const salvata = await chatImageStore.upload({ nome: `localhost-${porta}.png`, dataUrl: `data:${letta.immagine.mime};base64,${letta.immagine.base64}` });
      return { ok: true, url: finale, immagine: { riferimento: salvata.id, mime: letta.immagine.mime, larghezza: null, altezza: null } };
    }
    if (guarda === 'console') return { ok: true, url: finale, console: letta?.console ?? [] };
    return { ok: true, url: finale, testo: letta?.testo ?? '' };
  };
}
