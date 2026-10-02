/*
 * ⭐ 01/10/2026 — IL CANALE DEGLI AGGIORNAMENTI fra la pagina e il guscio, senza ponte (prova R01: niente preload; owner 27/09,
 *   «senza ponte, coi canali del browser»). È la forma del menu della barra (`barra-finestra.mjs`, `puntoDelMenu`):
 *   · guscio → pagina: `webContents.executeJavaScript` posa lo stato in `window.__talosAggiornamenti` e lancia l'evento
 *     `talos:aggiornamenti` (lo stato si rimanda dopo ogni caricamento: una pagina ricaricata lo ritrova);
 *   · pagina → guscio: `window.open('talos-desktop://aggiornamenti?azione=…&gettone=…')`, negato da `setWindowOpenHandler` e
 *     interpretato qui.
 * ⛔ Il gettone: casuale per avvio, consegnato SOLO alla cornice principale con lo stato. Una pagina HTML resa nel lettore vive in
 *   una cornice a origine nulla (F5) e non legge la finestra madre: senza gettone non può spegnere gli aggiornamenti né far
 *   riavviare l'app. Un indirizzo senza gettone giusto si nega e basta.
 */
import { timingSafeEqual } from 'node:crypto';

export const EVENTO_PAGINA = 'talos:aggiornamenti';
const AZIONI = new Set(['controlla', 'riavvia', 'automatici', 'nascondi']);

function stessoGettone(a, b) {
  const x = Buffer.from(String(a ?? '')); const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * @returns {null | {valida:false} | {valida:true, azione:'controlla'|'riavvia'|'nascondi'} | {valida:true, azione:'automatici', acceso:boolean}}
 *   `null` = non è un indirizzo degli aggiornamenti (lo gestisce qualcun altro).
 */
export function azioneAggiornamenti(indirizzo, gettone) {
  let url;
  try { url = new URL(String(indirizzo ?? '')); } catch { return null; }
  if (url.protocol !== 'talos-desktop:' || url.hostname !== 'aggiornamenti') return null;
  if (url.pathname !== '' && url.pathname !== '/') return { valida: false };
  if (!stessoGettone(url.searchParams.get('gettone'), gettone)) return { valida: false };
  const azione = url.searchParams.get('azione');
  if (!AZIONI.has(azione)) return { valida: false };
  if (azione !== 'automatici') return { valida: true, azione };
  const acceso = url.searchParams.get('acceso');
  if (acceso !== '1' && acceso !== '0') return { valida: false };
  return { valida: true, azione, acceso: acceso === '1' };
}

/** Ciò che la pagina vede: lo stato dell'aggiornatore, se è attivo in questa copia, e il gettone per rispondere. */
export function statoPerLaPagina(stato, { attivo, motivoSpento = null, gettone, nascosto = false }) {
  return {
    attivo: attivo === true,
    motivoSpento: attivo === true ? null : motivoSpento,
    versioneAttuale: stato?.versioneAttuale ?? null,
    stato: stato?.stato ?? 'fermo',
    automatici: stato?.automatici !== false,
    ultimoControllo: stato?.ultimoControllo ?? null,
    pronto: stato?.pronto ?? null,
    errore: stato?.errore ?? null,
    nascosto: nascosto === true,
    gettone,
  };
}

/** Il copione da passare a `executeJavaScript`: JSON, mai testo interpolato. */
export function copioneStato(perLaPagina) {
  const dati = JSON.stringify(perLaPagina);
  return `(() => { const d = ${dati}; window.__talosAggiornamenti = d; window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTO_PAGINA)}, { detail: d })); })();`;
}
