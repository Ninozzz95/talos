/*
 * Decisione 215 dell'owner (04/11/2026) — quando il server rifiuta un file («Scarica», il lettore, un allegato), la persona legge una
 * frase di TALOS nella sua lingua, mai l'errore del browser né l'inglese del server.
 *
 * Prima di oggi:
 *   · «Scarica» era un `<a download>` nudo: con un rifiuto del server Chrome mostrava il suo «Il sito non era disponibile» nella
 *     barra dei download, e TALOS non diceva niente;
 *   · il lettore mostrava il `message` inglese della busta («Il file non si è aperto: File not found», owner 04/11).
 * Ora un rifiuto si riconosce dal CODICE (e dal motivo, quando il codice ne ha più d'uno), come `testoErroreServer` di `errori.js`;
 * un codice che qui non c'è riceve la frase generica, mai le parole del server.
 *
 * ⛔ Lo scarico NON porta il file in memoria: si chiede la rotta, si leggono solo stato e intestazioni (la `fetch` si risolve lì,
 *   MDN «Using the Fetch API»: «As soon as the browser has received the response status and headers from the server (and potentially
 *   before the response body itself has been received), the promise returned by fetch() is fulfilled», letto il 04/11/2026), e la
 *   richiesta si interrompe. Se il server ha detto sì, il download lo fa il browser col `<a download>` di sempre, che scrive su disco
 *   a pezzi: un file da 50 MB non passa mai per la pagina (`conversazione.js`, PO-05). Se ha detto no, si legge il corpo JSON della
 *   busta (piccolo) e si avvisa.
 * Hermes (`hermes-agent-2026-11-01/apps/desktop/electron/main.ts:5626-5680`, `previewFileTarget`) risponde con un risultato TIPIZZATO
 *   (`missing`, `directory`) «so a dead link reports instead of previewing»: stessa idea, il rifiuto ha un nome e una frase.
 */
import { t } from './lingua.js';

/** Codice (e motivo) → la chiave della frase. Le voci con motivo vincono su quella del solo codice. */
const FRASI = Object.freeze({
  'FILE_NOT_FOUND': 'varie.fileRefusal.notFound',
  'QUERY_INVALID:path-outside-session': 'varie.fileRefusal.outsideFolder',
  'QUERY_INVALID:path-invalid': 'varie.fileRefusal.outsideFolder',
  'QUERY_INVALID': 'varie.fileRefusal.badPath',
  'NOT_A_FILE': 'varie.fileRefusal.notAFile',
  'FILE_TOO_LARGE': 'varie.fileRefusal.tooLarge',
  'PREVIEW_FILE_SECRET': 'varie.fileRefusal.secret',
  'ATTACHMENT_NOT_AVAILABLE:attachment-of-another-chat': 'errori.ATTACHMENT_NOT_AVAILABLE.attachment_of_another_chat',
  'ATTACHMENT_NOT_AVAILABLE': 'errori.ATTACHMENT_NOT_AVAILABLE.attachment_unknown',
  'NOT_FOUND': 'varie.fileRefusal.chatGone',
  'LIBRARY_NOT_FOUND': 'varie.fileRefusal.libraryGone',
  'SESSION_NOT_READY': 'varie.fileRefusal.notReady',
  'PLATFORM_UNSUPPORTED': 'varie.fileRefusal.platform',
});
export const FRASE_GENERICA = 'varie.fileRefusal.generic';
/** Per un allegato la frase di riserva è quella dell'allegato che non c'è più (brief 215, parte 2). */
export const FRASE_GENERICA_ALLEGATO = 'errori.ATTACHMENT_NOT_AVAILABLE.attachment_unknown';

/** La chiave della frase per un rifiuto `{ code, reason }`; la generica per un codice ignoto o assente. Pura. */
export function chiaveDelRifiuto({ code, reason } = {}, generica = FRASE_GENERICA) {
  const codice = typeof code === 'string' ? code : '';
  const motivo = typeof reason === 'string' ? reason : '';
  return (motivo && FRASI[`${codice}:${motivo}`]) || FRASI[codice] || generica;
}

/** La frase, nella lingua corrente. */
export function fraseDelRifiuto(rifiuto = {}, generica = FRASE_GENERICA) {
  return t(chiaveDelRifiuto(rifiuto, generica));
}

/**
 * Un errore leggibile da una risposta non riuscita: `message` è la frase di TALOS, `frase === true` dice al lettore di mostrarla da
 * sola (senza «Il file non si è aperto:» davanti). Il corpo si legge solo se è la busta JSON del server.
 */
export async function erroreDalRifiuto(risposta, generica = FRASE_GENERICA) {
  let corpo = null;
  try { corpo = await risposta.json(); } catch { /* il corpo non è JSON */ }
  const code = typeof corpo?.error?.code === 'string' ? corpo.error.code : null;
  const reason = typeof corpo?.error?.reason === 'string' ? corpo.error.reason : null;
  // Un rifiuto SENZA codice ma con la frase del server (la Libreria, le pagine): resta la frase del server, come prima.
  const delServer = !code && typeof corpo?.error?.message === 'string' && corpo.error.message.trim() ? corpo.error.message : null;
  const errore = new Error(delServer ?? fraseDelRifiuto({ code, reason }, generica));
  errore.code = code;
  errore.reason = reason;
  errore.status = risposta.status;
  errore.frase = true;
  return errore;
}

/**
 * «Scarica» con il controllo prima: `true` se il download è partito, `false` se il server ha rifiutato (e `avvisa` ha ricevuto la
 * frase). `documento` serve per il link; `fetchFn` per le prove.
 * @param {{ indirizzo: string, nome: string, avvisa: (titolo: string, frase: string) => void, documento?: Document, fetchFn?: typeof fetch }} p
 */
export async function scaricaControllando({ indirizzo, nome, avvisa, documento = globalThis.document, fetchFn = (...a) => globalThis.fetch(...a) }) {
  const freno = new AbortController();
  let risposta;
  try {
    risposta = await fetchFn(indirizzo, { credentials: 'same-origin', signal: freno.signal });
  } catch {
    avvisa(t('varie.fileRefusal.downloadTitle'), t(FRASE_GENERICA));
    return false;
  }
  if (!risposta.ok) {
    const errore = await erroreDalRifiuto(risposta);
    avvisa(t('varie.fileRefusal.downloadTitle'), errore.message);
    return false;
  }
  freno.abort(); // ⛔ i byte non si leggono qui: li scrive il browser col link
  try { await risposta.body?.cancel?.(); } catch { /* già interrotta */ }
  const link = documento.createElement('a');
  link.href = indirizzo;
  link.download = nome || 'file';
  documento.body.append(link);
  link.click();
  link.remove();
  return true;
}
