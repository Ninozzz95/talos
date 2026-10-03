import { t } from './lingua.js';
/** The existing artifact card, backed by its exact Library copy after replay.
 * HTML remains behind the server's sandbox/CSP and session page capability.
 * No HTML, absolute filesystem path or expiring capability is persisted here.
 */
import {creaArtefatto} from './conversazione.js';
import {fonteDaLibreria} from './lettore/fonti.js';

const ID_LIBRERIA = /^lib-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function paginaValida(indirizzo) {
  if (typeof indirizzo !== 'string' || !/^\/api\/v1\/pagine\/[A-Za-z0-9_-]{43}\/[^/?#]+$/.test(indirizzo)) return false;
  try {
    const nome = decodeURIComponent(indirizzo.split('/').at(-1));
    return nome !== '.' && nome !== '..' && !/[\\/:\x00-\x1f\x7f]/.test(nome);
  } catch { return false; }
}

export function creaCardArtefatto({evento, sessionId, API = p => p,
  fetchFn = (...a) => globalThis.fetch(...a), apriFn = (...a) => globalThis.open(...a),
  ancoraValida = () => true}, opzioni = {}) {
  let indirizzo = null;
  let fonte = null;
  let apertura = Promise.resolve();
  const viva = () => card.isConnected && ancoraValida();
  const {card, frame, apri} = creaArtefatto({titolo: evento.titolo || t('chat.artifact.badge'),
    onApri: apriPagina}, opzioni);
  apri.title = t('chat.artifact.openInTab');
  const stato = card.ownerDocument.createElement('p');
  stato.className = 'talos-artifact__status talos-muted';
  stato.setAttribute('role', 'status');
  stato.textContent = t('chat.artifact.loading');
  card.insertBefore(stato, frame);
  apri.disabled = true;
  frame.hidden = true;
  function erroreVisibile(messaggio) {
    stato.hidden = false;
    stato.textContent = t('chat.artifact.unavailable', { messaggio });
  }
  function apriPagina() {
    if (!indirizzo || !viva() || apri.disabled) return;
    if (!fonte) { apriFn(indirizzo, '_blank', 'noopener'); return; }
    // Open during the gesture. A capability from the original preview may have
    // expired; renew it before navigation without losing popup permission.
    apertura = (async () => {
      let tab;
      const avevaFocus = card.ownerDocument.activeElement === apri;
      const chiudi = () => { try { tab?.close(); } catch { /* the user may have closed it already */ } };
      try {
        tab = apriFn('about:blank', '_blank');
        if (!tab) { erroreVisibile(t('chat.artifact.tabBlocked')); return; }
        tab.opener = null; // Before any await or untrusted document navigation.
        apri.disabled = true;
        const pagina = await fonte.creaPagina();
        if (!paginaValida(pagina)) throw new Error(t('chat.artifact.pageReferenceInvalid'));
        if (!viva() || tab.closed) { chiudi(); return; }
        tab.location.replace(API(pagina));
        stato.hidden = true;
      } catch (errore) {
        chiudi();
        if (viva()) erroreVisibile(errore instanceof Error ? errore.message : t('chat.artifact.loadFailed'));
      } finally {
        if (viva()) {
          apri.disabled = false;
          if (avevaFocus && card.ownerDocument.activeElement === card.ownerDocument.body) apri.focus({preventScroll: true});
        }
      }
    })();
  }
  const pronta = (async () => {
    // The caller inserts the card synchronously after creation. Check attachment
    // after that insertion, including legacy events that need no network await.
    await Promise.resolve();
    try {
      let pagina;
      if (Object.hasOwn(evento, 'voceLibreriaId')) {
        if (typeof evento.voceLibreriaId !== 'string' || !ID_LIBRERIA.test(evento.voceLibreriaId)
          || typeof sessionId !== 'string' || !sessionId) throw new Error(t('chat.artifact.savedReferenceInvalid'));
        fonte = fonteDaLibreria({sessionId, voce: {id: evento.voceLibreriaId},
          fetchFn: (percorso, init) => fetchFn(API(percorso), init)});
        pagina = await fonte.creaPagina();
        if (!paginaValida(pagina)) throw new Error(t('chat.artifact.pageReferenceInvalid'));
        if (!viva()) return;
        stato.hidden = true;
      } else {
        if (typeof evento.id !== 'string' || !evento.id) throw new Error(t('chat.artifact.previewReferenceInvalid'));
        pagina = `/api/v1/artifacts/${encodeURIComponent(evento.id)}`;
        // Old journals have no exact durable association. Do not guess by title.
        stato.textContent = t('chat.artifact.temporary');
      }
      if (!viva()) return;
      indirizzo = API(pagina);
      frame.src = indirizzo;
      frame.hidden = false;
      apri.disabled = false;
    } catch (errore) {
      if (!viva()) return;
      erroreVisibile(errore instanceof Error ? errore.message : t('chat.artifact.loadFailed'));
      // No volatile fallback: it could display an unrelated or no longer saved copy.
    }
  })();
  return {card, frame, apri, stato, pronta, get apertura() { return apertura; }};
}
